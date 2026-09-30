//! Chạy và nói chuyện với tiến trình phụ `asr-worker` qua stdin/stdout (spec §6.4).

use anyhow::{Context, Result, bail};
use asr_protocol::{Request, Response, TranscribeRequest, TranscribeResult, read_frame, write_frame};
use std::fs::File;
use std::io::{BufReader, BufWriter};
use std::path::Path;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::time::{Duration, Instant};

/// Thời gian chờ `asr-worker` thoát sau `Shutdown` trước khi kill.
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(5);

pub struct ReadyInfo {
    pub backend: String,
    /// `shared` (chế độ B) hoặc `split` (chế độ A), spec §6.4.
    pub decode_mode: String,
    pub whisper_version: String,
    pub system_info: String,
}

pub struct AsrWorker {
    child: Child,
    stdin: BufWriter<ChildStdin>,
    stdout: BufReader<ChildStdout>,
}

impl AsrWorker {
    /// `stderr_log`: nơi ghi log của whisper.cpp, để log không lẫn vào kênh giao thức.
    pub fn spawn(
        exe: &Path,
        model: &Path,
        use_gpu: bool,
        n_threads: u32,
        stderr_log: &Path,
    ) -> Result<(Self, ReadyInfo)> {
        let mut child = Command::new(exe)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::from(File::create(stderr_log)?))
            .spawn()
            .with_context(|| format!("không chạy được {}", exe.display()))?;
        let stdin = BufWriter::new(child.stdin.take().context("thiếu stdin")?);
        let stdout = BufReader::new(child.stdout.take().context("thiếu stdout")?);
        let mut worker = Self { child, stdin, stdout };
        let load = Request::Load {
            model_path: model.display().to_string(),
            use_gpu,
            n_threads,
        };
        match worker.call(&load)? {
            Response::Ready {
                backend,
                decode_mode,
                whisper_version,
                system_info,
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
        match self.call(&Request::Transcribe(req))? {
            Response::Result(r) => Ok(r),
            Response::Error { message, .. } => bail!("chép lời lỗi: {message}"),
            other => bail!("phản hồi không mong đợi: {other:?}"),
        }
    }

    fn call(&mut self, req: &Request) -> Result<Response> {
        write_frame(&mut self.stdin, req)?;
        read_frame(&mut self.stdout)?.context("asr-worker đã thoát")
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
