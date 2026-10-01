//! Chạy và nói chuyện với tiến trình phụ `asr-worker` qua stdin/stdout (spec §6.4).

use anyhow::{Context, Result, bail};
use asr_protocol::{
    Backend, DecodeMode, PROTOCOL_VERSION, Request, Response, TranscribeRequest, TranscribeResult, read_frame,
    write_frame,
};
use std::fs::OpenOptions;
use std::io::{BufReader, BufWriter};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::time::{Duration, Instant};

/// Thời gian chờ `asr-worker` thoát sau `Shutdown` trước khi kill.
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(5);

pub struct ReadyInfo {
    /// Thiết bị worker thật sự dùng (spec §6.4), không phải thiết bị được yêu cầu.
    pub backend: Backend,
    /// Chế độ B (`Shared`) hoặc chế độ A (`Split`), spec §6.4.
    pub decode_mode: DecodeMode,
    pub whisper_version: String,
    pub system_info: String,
}

pub struct AsrWorker {
    child: Child,
    stdin: BufWriter<ChildStdin>,
    stdout: BufReader<ChildStdout>,
    /// Đường dẫn file log của worker, để thông báo lỗi chỉ chỗ xem log.
    log: PathBuf,
}

impl AsrWorker {
    /// `stderr_log`: nơi ghi log của whisper.cpp, để log không lẫn vào kênh giao thức. File được mở ở chế độ append,
    /// nên khởi động lại worker không làm mất log của lần chạy trước (log crash).
    pub fn spawn(
        exe: &Path,
        model: &Path,
        use_gpu: bool,
        n_threads: u32,
        stderr_log: &Path,
    ) -> Result<(Self, ReadyInfo)> {
        let log = OpenOptions::new()
            .create(true)
            .append(true)
            .open(stderr_log)
            .with_context(|| format!("không mở được log {}", stderr_log.display()))?;
        let mut child = Command::new(exe)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::from(log))
            .spawn()
            .with_context(|| format!("không chạy được {}", exe.display()))?;
        let stdin = BufWriter::new(child.stdin.take().context("thiếu stdin")?);
        let stdout = BufReader::new(child.stdout.take().context("thiếu stdout")?);
        let mut worker = Self {
            child,
            stdin,
            stdout,
            log: stderr_log.to_path_buf(),
        };
        let load = Request::Load {
            model_path: model.display().to_string(),
            use_gpu,
            n_threads,
        };
        match worker
            .call(&load)
            .context("asr-worker không trả lời `Load` (có thể lệch phiên bản giao thức)")?
        {
            Response::Ready { protocol_version, .. } if protocol_version != PROTOCOL_VERSION => bail!(
                "asr-worker dùng giao thức phiên bản {protocol_version}, app cần {PROTOCOL_VERSION}: build lại cả hai cùng lúc"
            ),
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
            Response::Error { message, .. } => bail!("asr-worker không nạp được model: {message}"),
            other => bail!("phản hồi không mong đợi: {other:?}"),
        }
    }

    pub fn pid(&self) -> u32 {
        self.child.id()
    }

    pub fn warmup(&mut self) -> Result<f32> {
        match self.call(&Request::Warmup)? {
            Response::WarmupDone { millis } => Ok(millis),
            Response::Error { message, .. } => bail!("làm nóng lỗi: {message}"),
            other => bail!("phản hồi không mong đợi: {other:?}"),
        }
    }

    pub fn transcribe(&mut self, req: TranscribeRequest) -> Result<TranscribeResult> {
        let id = req.segment_id;
        match self.call(&Request::Transcribe(req))? {
            Response::Result(r) if r.segment_id == id => Ok(r),
            Response::Result(r) => bail!("asr-worker trả kết quả đoạn {} khi đang chờ đoạn {id}", r.segment_id),
            Response::Error { message, .. } => bail!("chép lời đoạn {id} lỗi: {message}"),
            other => bail!("phản hồi không mong đợi: {other:?}"),
        }
    }

    fn call(&mut self, req: &Request) -> Result<Response> {
        let res = write_frame(&mut self.stdin, req)
            .context("gửi yêu cầu cho asr-worker")
            .and_then(|()| read_frame(&mut self.stdout).context("đọc phản hồi của asr-worker"))
            .and_then(|r| r.context("asr-worker đóng stdout"));
        if res.is_err() {
            // Lỗi pipe thường là do worker vừa chết: chờ ngắn để lấy mã thoát (tiến trình có thể chưa kịp thành zombie).
            let deadline = Instant::now() + Duration::from_millis(200);
            while Instant::now() < deadline {
                if let Ok(Some(status)) = self.child.try_wait() {
                    return res.with_context(|| format!("asr-worker đã thoát ({status}), xem {}", self.log.display()));
                }
                std::thread::sleep(Duration::from_millis(10));
            }
        }
        res
    }
}

impl Drop for AsrWorker {
    fn drop(&mut self) {
        let _ = write_frame(&mut self.stdin, &Request::Shutdown);
        // Worker treo (ví dụ driver GPU lỗi) thì không chờ mãi: sau SHUTDOWN_TIMEOUT thì kill.
        let deadline = Instant::now() + SHUTDOWN_TIMEOUT;
        while Instant::now() < deadline {
            if let Ok(Some(_)) = self.child.try_wait() {
                return;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
