//! Chạy và nói chuyện với tiến trình phụ `asr-worker` qua stdin/stdout (spec §6.4).
//!
//! Lỗi chia hai loại, để bên giám sát (`supervisor`) biết khi nào phải khởi động lại worker:
//! - `AsrError::Worker`: worker trả `Error` cho yêu cầu (vẫn sống), kèm `ErrorKind`;
//! - `AsrError::Crashed`: worker chết, pipe hỏng, khung sai, lệch phiên bản giao thức, hoặc quá thời gian chờ (worker
//!   bị kill). Luồng giao thức không còn dùng được.

use crate::logfile;
use crate::process;
use asr_protocol::{
    Backend, DecodeMode, ErrorKind, PROTOCOL_VERSION, Request, Response, TranscribeRequest, TranscribeResult,
    read_frame, write_frame,
};
use std::io::{BufReader, BufWriter};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum AsrError {
    #[error("asr-worker báo lỗi {kind:?}: {message}")]
    Worker { kind: ErrorKind, message: String },
    #[error("asr-worker không dùng được nữa: {0}")]
    Crashed(String),
}

impl AsrError {
    pub fn is_crash(&self) -> bool {
        matches!(self, Self::Crashed(_))
    }

    pub fn kind(&self) -> Option<ErrorKind> {
        match self {
            Self::Worker { kind, .. } => Some(*kind),
            Self::Crashed(_) => None,
        }
    }
}

/// Cách chạy một `asr-worker`.
#[derive(Clone, Debug)]
pub struct AsrLaunch {
    pub exe: PathBuf,
    pub model: PathBuf,
    /// stderr của worker (log của whisper.cpp); mở nối tiếp và xoay vòng cả khi đang chạy (`logfile`).
    pub log: PathBuf,
    pub use_gpu: bool,
    pub n_threads: u32,
    /// Chờ `Ready` sau `Load` (§6.5: lần đầu chạy binary mới thì chờ lâu hơn).
    pub ready_timeout: Duration,
    /// Chờ kết quả của một `Transcribe` hay `Warmup`; quá thì kill worker (§9).
    pub request_timeout: Duration,
    /// Chờ worker tự thoát sau `Shutdown` trước khi kill.
    pub shutdown_grace: Duration,
    /// Biến môi trường thêm cho worker (test dùng để điều khiển worker giả).
    pub env: Vec<(String, String)>,
}

impl AsrLaunch {
    pub fn new(exe: &Path, model: &Path, log: &Path) -> Self {
        Self {
            exe: exe.to_path_buf(),
            model: model.to_path_buf(),
            log: log.to_path_buf(),
            use_gpu: true,
            n_threads: 4,
            ready_timeout: Duration::from_secs(180),
            request_timeout: Duration::from_secs(30),
            shutdown_grace: Duration::from_secs(5),
            env: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct ReadyInfo {
    /// Thiết bị worker thật sự dùng (spec §6.4), không phải thiết bị được yêu cầu.
    pub backend: Backend,
    /// Chế độ B (`Shared`) hoặc chế độ A (`Split`), spec §6.4.
    pub decode_mode: DecodeMode,
    pub whisper_version: String,
    pub system_info: String,
}

pub struct AsrWorker {
    child: Arc<Mutex<Child>>,
    pid: u32,
    /// Luồng chép stderr vào log; kết thúc khi worker thoát.
    pump: Option<std::thread::JoinHandle<()>>,
    tail: logfile::Tail,
    stdin: BufWriter<ChildStdin>,
    stdout: BufReader<ChildStdout>,
    /// Đường dẫn file log của worker, để thông báo lỗi chỉ chỗ xem log.
    log: PathBuf,
    request_timeout: Duration,
    shutdown_grace: Duration,
}

impl AsrWorker {
    /// Chạy worker, gửi `Load`, chờ `Ready` và kiểm phiên bản giao thức. Worker chết lúc nạp thì lỗi kèm vài dòng cuối
    /// của stderr (log của whisper.cpp, không có âm thanh hay chữ chép lời), để phân loại được lỗi GPU và hết bộ nhớ.
    pub fn spawn(launch: &AsrLaunch) -> Result<(Self, ReadyInfo), AsrError> {
        let crashed = |e: String| AsrError::Crashed(e);
        let log = logfile::RotatingLog::open(&launch.log, logfile::MAX_BYTES, logfile::KEEP)
            .map_err(|e| crashed(format!("không mở được log {}: {e}", launch.log.display())))?;
        let mut cmd = command(launch);
        let mut child = process::spawn(&mut cmd, &launch.exe)
            .map_err(|e| crashed(format!("không chạy được {}: {e}", launch.exe.display())))?;
        let pid = child.id();
        let stdin = BufWriter::new(child.stdin.take().expect("stdin là pipe"));
        let stdout = BufReader::new(child.stdout.take().expect("stdout là pipe"));
        let (pump, tail) = logfile::pump(child.stderr.take().expect("stderr là pipe"), log, Vec::new());
        let mut worker = Self {
            child: Arc::new(Mutex::new(child)),
            pid,
            pump: Some(pump),
            tail: tail.clone(),
            stdin,
            stdout,
            log: launch.log.clone(),
            request_timeout: launch.request_timeout,
            shutdown_grace: launch.shutdown_grace,
        };
        let load = Request::Load {
            model_path: launch.model.display().to_string(),
            use_gpu: launch.use_gpu,
            n_threads: launch.n_threads,
        };
        let ready = match worker.call(&load, launch.ready_timeout) {
            Ok(r) => r,
            Err(AsrError::Crashed(e)) => {
                drop(worker); // chờ worker thoát và luồng chép log đọc hết stderr
                return Err(crashed(with_tail(e, &tail.lines())));
            }
            Err(e) => return Err(e),
        };
        match ready {
            Response::Ready { protocol_version, .. } if protocol_version != PROTOCOL_VERSION => Err(crashed(format!(
                "asr-worker dùng giao thức phiên bản {protocol_version}, app cần {PROTOCOL_VERSION}: build lại cả hai cùng lúc"
            ))),
            Response::Ready {
                backend,
                decode_mode,
                whisper_version,
                system_info,
                ..
            } => Ok((
                worker,
                ReadyInfo {
                    backend,
                    decode_mode,
                    whisper_version,
                    system_info,
                },
            )),
            Response::Error { kind, message, .. } => Err(AsrError::Worker { kind, message }),
            other => Err(crashed(format!("phản hồi không mong đợi cho `Load`: {other:?}"))),
        }
    }

    pub fn pid(&self) -> u32 {
        self.pid
    }

    /// Vài dòng cuối của stderr.
    pub fn log_tail(&self) -> Vec<String> {
        self.tail.lines()
    }

    pub fn warmup(&mut self) -> Result<f32, AsrError> {
        match self.call(&Request::Warmup, self.request_timeout)? {
            Response::WarmupDone { millis } => Ok(millis),
            Response::Error { kind, message, .. } => Err(AsrError::Worker { kind, message }),
            other => Err(AsrError::Crashed(format!(
                "phản hồi không mong đợi cho `Warmup`: {other:?}"
            ))),
        }
    }

    pub fn transcribe(&mut self, req: TranscribeRequest) -> Result<TranscribeResult, AsrError> {
        let id = req.segment_id;
        match self.call(&Request::Transcribe(req), self.request_timeout)? {
            Response::Result(r) if r.segment_id == id => Ok(r),
            Response::Result(r) => Err(AsrError::Crashed(format!(
                "asr-worker trả kết quả đoạn {} khi đang chờ đoạn {id}",
                r.segment_id
            ))),
            Response::Error { kind, message, .. } => Err(AsrError::Worker { kind, message }),
            other => Err(AsrError::Crashed(format!("phản hồi không mong đợi: {other:?}"))),
        }
    }

    /// Gửi một yêu cầu và chờ phản hồi, tối đa `timeout`. Quá thời gian thì kill worker: lệnh đọc đang chặn nhận EOF
    /// ngay, và lỗi trả về là `Crashed`.
    fn call(&mut self, req: &Request, timeout: Duration) -> Result<Response, AsrError> {
        let (done_tx, done_rx) = mpsc::channel::<()>();
        let timed_out = Arc::new(AtomicBool::new(false));
        let watchdog = {
            let child = self.child.clone();
            let timed_out = timed_out.clone();
            std::thread::spawn(move || {
                if let Err(RecvTimeoutError::Timeout) = done_rx.recv_timeout(timeout) {
                    timed_out.store(true, Ordering::SeqCst);
                    let _ = child.lock().unwrap_or_else(|e| e.into_inner()).kill();
                }
            })
        };
        let res = write_frame(&mut self.stdin, req)
            .map_err(|e| format!("gửi yêu cầu cho asr-worker: {e}"))
            .and_then(|()| read_frame(&mut self.stdout).map_err(|e| format!("đọc phản hồi của asr-worker: {e}")))
            .and_then(|r| r.ok_or_else(|| "asr-worker đóng stdout".to_string()));
        let _ = done_tx.send(());
        let _ = watchdog.join();
        res.map_err(|e| {
            if timed_out.load(Ordering::SeqCst) {
                return AsrError::Crashed(format!("asr-worker không trả lời sau {timeout:?}, đã kill"));
            }
            // Lỗi pipe thường là do worker vừa chết: chờ ngắn để lấy mã thoát (tiến trình có thể chưa kịp thành zombie).
            let deadline = Instant::now() + Duration::from_millis(200);
            while Instant::now() < deadline {
                if let Ok(Some(status)) = self.child.lock().unwrap_or_else(|e| e.into_inner()).try_wait() {
                    return AsrError::Crashed(format!(
                        "{e}; asr-worker đã thoát ({status}), xem {}",
                        self.log.display()
                    ));
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            AsrError::Crashed(e)
        })
    }
}

/// Lệnh chạy worker. Thư mục làm việc là thư mục chứa binary, để không thư viện nào được tìm ở thư mục làm việc của app.
pub fn command(launch: &AsrLaunch) -> Command {
    let mut cmd = Command::new(&launch.exe);
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .envs(launch.env.iter().map(|(k, v)| (k, v)));
    if let Some(dir) = launch.exe.parent().filter(|d| !d.as_os_str().is_empty()) {
        cmd.current_dir(dir);
    }
    process::configure(&mut cmd);
    cmd
}

/// Thêm tối đa 5 dòng cuối của stderr vào thông báo lỗi.
pub fn with_tail(message: String, tail: &[String]) -> String {
    let last: Vec<&str> = tail
        .iter()
        .rev()
        .filter(|l| !l.trim().is_empty())
        .take(5)
        .map(String::as_str)
        .collect();
    if last.is_empty() {
        return message;
    }
    let joined: Vec<&str> = last.into_iter().rev().collect();
    format!("{message}; stderr cuối: {}", joined.join(" | "))
}

impl Drop for AsrWorker {
    fn drop(&mut self) {
        let _ = write_frame(&mut self.stdin, &Request::Shutdown);
        let mut child = self.child.lock().unwrap_or_else(|e| e.into_inner());
        // Worker treo (ví dụ driver GPU lỗi) thì không chờ mãi: sau `shutdown_grace` thì kill.
        let deadline = Instant::now() + self.shutdown_grace;
        while Instant::now() < deadline {
            if let Ok(Some(_)) = child.try_wait() {
                process::release(self.pid);
                drop(child);
                self.join_pump();
                return;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        let _ = child.kill();
        let _ = child.wait();
        process::release(self.pid);
        drop(child);
        self.join_pump();
    }
}

impl AsrWorker {
    /// Worker đã thoát nên stderr đã đóng: luồng chép log kết thúc ngay sau khi đọc hết.
    fn join_pump(&mut self) {
        if let Some(pump) = self.pump.take() {
            let _ = pump.join();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_worker_runs_in_the_folder_of_its_binary() {
        let launch = AsrLaunch::new(
            Path::new("/app/binaries/asr-worker"),
            Path::new("/m.bin"),
            Path::new("/l.log"),
        );
        let cmd = command(&launch);
        assert_eq!(cmd.get_current_dir(), Some(Path::new("/app/binaries")));
        assert_eq!(cmd.get_args().count(), 0, "mọi tham số đi qua `Load`");
    }

    #[test]
    fn errors_carry_the_last_non_empty_stderr_lines() {
        let tail: Vec<String> = (1..=7).map(|i| format!("l{i}")).chain([String::new()]).collect();
        assert_eq!(
            with_tail("worker chết".into(), &tail),
            "worker chết; stderr cuối: l3 | l4 | l5 | l6 | l7"
        );
        assert_eq!(with_tail("x".into(), &[]), "x");
    }
}
