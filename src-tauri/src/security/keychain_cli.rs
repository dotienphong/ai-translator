//! Kho khóa macOS qua `/usr/bin/security` (spec 2026-10-20-macos-keychain-security-cli-design.md).
//!
//! Vì sao: macOS gắn quyền đọc mục Keychain với chữ ký của chương trình đang đọc. Bản app ký ad-hoc đổi chữ ký sau mỗi lần
//! build nên mỗi lần cập nhật bị hỏi mật khẩu. `/usr/bin/security` do Apple ký và không đổi theo bản của app, nên mục do nó
//! tạo thì không bị hỏi lại (đã đo: `bench/2026-10-20-keychain-security-cli/`).
//!
//! Quy tắc, mỗi dòng là một bài học đã đo hoặc đã gặp:
//! - Bí mật chỉ đi qua stdin của `security -i`, không bao giờ nằm trên dòng lệnh (`ps`).
//! - stderr bỏ hẳn: khi lỗi `security` in lại nguyên dòng lệnh, kể cả bí mật.
//! - Chỉ mã thoát 44 là "không có mục". Mọi mã khác là lỗi, vì `db.rs` coi "không có khóa" là cớ tạo khóa mới và đổi tên DB cũ.
//! - Dòng của `-i` bị cắt âm thầm ở khoảng 4096 byte: giữ dưới [`MAX_LINE`], và ghi xong thì đọc lại so từng byte.
//! - Tên và service chỉ gồm ký tự an toàn, không thể chèn lệnh vào dòng stdin.
//! - Mục mới nằm ở service `<service>.security`, khác mục cũ do API tạo: `-U` không bao giờ nhắm vào mục cũ (sẽ bị hỏi).

use std::any::Any;
use std::collections::HashMap;
use std::io::{self, Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, mpsc};
use std::thread;
use std::time::{Duration, Instant};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use keyring_core::api::{Credential, CredentialApi, CredentialStoreApi};
use keyring_core::{Entry, Error, Result};

/// Đường dẫn tuyệt đối: không qua `PATH`, không qua shell. Tệp do Apple ký, SIP bảo vệ.
pub const SECURITY_BIN: &str = "/usr/bin/security";
/// Hậu tố service của mục do `security` tạo (mục cũ do API tạo ở service gốc).
pub const SERVICE_SUFFIX: &str = ".security";
/// Tiền tố giá trị: cho phép giá trị rỗng, đổi định dạng sau này, và nhận ra mục lạ.
const VALUE_PREFIX: &str = "v1:";
/// Giới hạn thật của một dòng `security -i` là khoảng 4096 byte; giá trị lớn nhất của app (2048 byte) chỉ cần khoảng 2900.
pub const MAX_LINE: usize = 3900;
/// Độ dài tối đa của service và tên mục.
const MAX_TOKEN: usize = 128;
/// Hết giờ thì dừng `security` (đang chờ hộp thoại): không treo mãi khóa của bản quyền.
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(120);

/// Các lần ghi chạy lần lượt trong tiến trình. Hai lần ghi cùng một mục mà chạy chồng nhau thì lần đọc lại của bên này thấy giá
/// trị của bên kia và báo lỗi giả (đã đo trên `security` thật: 55 trên 100 lần khi 4 luồng tranh một mục), và `License::accept`
/// ghi `LICENSE` trước khi lấy khóa của nó nên chồng nhau là có thể. Một khóa chung thay vì khóa từng tên: bản quyền ghi hai mục
/// mỗi phút và bộ đếm hạn mức ghi sau mỗi phụ đề (khoảng 43 ms mỗi lần ghi), nên tranh chấp hiếm và ngắn.
static WRITE_LOCK: Mutex<()> = Mutex::new(());

/// Sau khi tiến trình con đã thoát, chờ thêm chừng này để lấy nốt đầu ra còn trong ống. Ống thường đóng ngay (EOF) nên không phải
/// chờ; nhưng `std` tạo ống rồi mới đặt CLOEXEC (không nguyên tử), nên một tiến trình khác của app (ví dụ tiến trình phụ vừa được
/// chạy ở luồng khác) có thể thừa hưởng đầu ghi và giữ ống mở hàng giờ: khi đó không bao giờ có EOF và ta không được chờ nó, vì
/// khóa ghi và khóa của `License` đang bị giữ.
const DRAIN_GRACE: Duration = Duration::from_millis(500);

/// Nghỉ trước lần thử lại (ngắn trong test).
const RETRY_DELAY: Duration = if cfg!(test) {
    Duration::from_millis(1)
} else {
    Duration::from_millis(50)
};

/// Thử lại đúng một lần khi lỗi là lỗi nền tảng (không chạy được tiến trình con, mã thoát lạ, đầu ra sai): thường chỉ thoáng qua,
/// mà một lần ghi lỗi làm `License::add_usage` dừng phiên đang dịch với "hết hạn mức" giả (`free_error`/`paid_error`). KHÔNG thử
/// lại "không có mục" (là câu trả lời) hay lỗi truy cập (từ chối, hết giờ chờ hộp thoại: thử lại sẽ bật hộp thoại lần nữa hay
/// chờ gấp đôi). Mọi thao tác đều lũy đẳng (`-U`; xóa mục đã xóa trả mã 44).
fn retrying<T>(mut op: impl FnMut() -> Result<T>) -> Result<T> {
    match op() {
        Err(Error::PlatformFailure(_)) => {
            thread::sleep(RETRY_DELAY);
            op()
        }
        other => other,
    }
}

fn kill_and_reap(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

/// Kết quả một lần chạy `security`. Không có stderr: xem đầu file.
pub struct Outcome {
    pub code: i32,
    pub stdout: Vec<u8>,
}

/// Đầu ra của lệnh đọc chính là bí mật: `Debug` chỉ in độ dài, để ghi log nhầm một `Outcome` không làm lộ nó.
impl std::fmt::Debug for Outcome {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Outcome")
            .field("code", &self.code)
            .field("stdout_len", &self.stdout.len())
            .finish()
    }
}

/// Chạy `security`. Bản thật là [`SystemRunner`]; test dùng bản giả mô phỏng `security`.
pub trait Runner: Send + Sync {
    fn run(&self, args: &[&str], stdin: Option<&[u8]>) -> io::Result<Outcome>;
}

/// Chạy chương trình thật.
pub struct SystemRunner {
    program: String,
    timeout: Duration,
}

impl SystemRunner {
    pub fn new() -> Self {
        Self {
            program: SECURITY_BIN.to_string(),
            timeout: DEFAULT_TIMEOUT,
        }
    }

    /// Chương trình và hạn tùy ý, để test `SystemRunner` bằng `/bin/sh` (chỉ có ở unix).
    #[cfg(all(test, unix))]
    fn with(program: &str, timeout: Duration) -> Self {
        Self {
            program: program.to_string(),
            timeout,
        }
    }
}

impl Default for SystemRunner {
    fn default() -> Self {
        Self::new()
    }
}

impl Runner for SystemRunner {
    fn run(&self, args: &[&str], stdin: Option<&[u8]>) -> io::Result<Outcome> {
        let mut child = Command::new(&self.program)
            .args(args)
            .stdin(if stdin.is_some() { Stdio::piped() } else { Stdio::null() })
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()?;
        // Đọc stdout và ghi stdin ở luồng riêng: đầu ra lớn không làm tiến trình con kẹt, chương trình bỏ qua stdin không làm
        // ta kẹt khi ống đầy, và vòng chờ bên dưới luôn tới được hạn. Luồng không chạy được (hết tài nguyên) là lỗi, không phải
        // panic khi đang giữ khóa; mọi lối ra sớm đều dừng và thu dọn tiến trình con (không để lại tiến trình zombie).
        let mut stdout_pipe = child.stdout.take().expect("stdout đã mở ống");
        let (chunks, received) = mpsc::channel::<io::Result<Vec<u8>>>();
        let reader = thread::Builder::new().name("security-stdout".into()).spawn(move || {
            let mut chunk = [0u8; 4096];
            loop {
                match stdout_pipe.read(&mut chunk) {
                    Ok(0) => break,
                    Ok(n) => {
                        if chunks.send(Ok(chunk[..n].to_vec())).is_err() {
                            break; // người nhận đã bỏ đi (hết giờ)
                        }
                    }
                    Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
                    Err(e) => {
                        let _ = chunks.send(Err(e));
                        break;
                    }
                }
            }
        });
        if let Err(e) = reader {
            kill_and_reap(&mut child);
            return Err(e);
        }
        if let Some(data) = stdin {
            let mut pipe = child.stdin.take().expect("stdin đã mở ống");
            let data = data.to_vec();
            let writer = thread::Builder::new().name("security-stdin".into()).spawn(move || {
                // Tiến trình con thoát sớm thì ghi lỗi (ống đã đóng): mã thoát mới là câu trả lời. Hết hàm thì ống đóng (EOF).
                let _ = pipe.write_all(&data);
            });
            if let Err(e) = writer {
                kill_and_reap(&mut child);
                return Err(e);
            }
        }
        let deadline = Instant::now() + self.timeout;
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) => {}
                Err(e) => {
                    kill_and_reap(&mut child);
                    return Err(e);
                }
            }
            if Instant::now() >= deadline {
                // Không chờ hai luồng: nếu có tiến trình cháu giữ ống thì chúng tự kết thúc khi ống đóng.
                kill_and_reap(&mut child);
                return Err(io::Error::new(io::ErrorKind::TimedOut, "security không trả lời kịp"));
            }
            thread::sleep(Duration::from_millis(5));
        };
        // Tiến trình con đã thoát: lấy nốt đầu ra. EOF (kênh đóng) là bình thường và tức thì; ống còn bị tiến trình khác giữ mở
        // thì ngừng chờ sau `DRAIN_GRACE` không có thêm gì. Lỗi đọc là lỗi: không bao giờ trả đầu ra thiếu như thể đủ.
        let mut stdout = Vec::new();
        loop {
            match received.recv_timeout(DRAIN_GRACE) {
                Ok(Ok(chunk)) => stdout.extend_from_slice(&chunk),
                Ok(Err(e)) => return Err(e),
                Err(_) => break,
            }
        }
        match status.code() {
            Some(code) => Ok(Outcome { code, stdout }),
            None => Err(io::Error::other("security bị dừng bởi tín hiệu")),
        }
    }
}

/// Kho khóa của `keyring-core` chạy qua `security`.
pub struct SecurityCliStore {
    runner: Arc<dyn Runner>,
}

impl std::fmt::Debug for SecurityCliStore {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SecurityCliStore").finish_non_exhaustive()
    }
}

impl SecurityCliStore {
    /// Kho thật: chạy `/usr/bin/security`.
    pub fn new() -> Arc<Self> {
        Self::with_runner(Arc::new(SystemRunner::new()))
    }

    pub fn with_runner(runner: Arc<dyn Runner>) -> Arc<Self> {
        Arc::new(Self { runner })
    }
}

impl CredentialStoreApi for SecurityCliStore {
    fn vendor(&self) -> String {
        "macOS security(1) store, /usr/bin/security".to_string()
    }

    fn id(&self) -> String {
        "security-cli-v1".to_string()
    }

    fn build(&self, service: &str, user: &str, _modifiers: Option<&HashMap<&str, &str>>) -> Result<Entry> {
        for (attr, value) in [("service", service), ("user", user)] {
            if !valid_token(value) {
                // Không đưa giá trị vào thông báo.
                return Err(Error::Invalid(
                    attr.to_string(),
                    format!("chỉ nhận A-Z a-z 0-9 . _ @ -, tối đa {MAX_TOKEN} ký tự, không bắt đầu bằng -"),
                ));
            }
        }
        Ok(Entry::new_with_credential(Arc::new(Cred {
            runner: self.runner.clone(),
            service: service.to_string(),
            store_service: format!("{service}{SERVICE_SUFFIX}"),
            account: user.to_string(),
        })))
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}

/// Tên đủ an toàn để đặt vào dòng stdin của `security -i` giữa hai dấu nháy mà không thể chèn lệnh.
fn valid_token(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= MAX_TOKEN
        && !s.starts_with('-')
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'@' | b'-'))
}

/// `security` thoát với OSStatus theo modulo 256: -25300 (không có mục) thành 44.
const EXIT_NOT_FOUND: i32 = 44;

fn platform(message: &str) -> Error {
    Error::PlatformFailure(Box::new(io::Error::other(message.to_string())))
}

fn bad_format() -> Error {
    platform("giá trị trong Keychain không đúng định dạng")
}

/// Mã thoát lạ. 36 (không được hiện hộp thoại), 51 (từ chối) và 128 (người dùng hủy) là lỗi truy cập; còn lại là lỗi nền tảng.
fn exit_error(code: i32) -> Error {
    let reason = Box::new(io::Error::other(format!("security thoát với mã {code}")));
    match code {
        36 | 51 | 128 => Error::NoStorageAccess(reason),
        _ => Error::PlatformFailure(reason),
    }
}

/// Hết giờ nghĩa là đang chờ hộp thoại: lỗi truy cập. Còn lại (không chạy được, bị tín hiệu dừng) là lỗi nền tảng.
fn io_error(e: io::Error) -> Error {
    if e.kind() == io::ErrorKind::TimedOut {
        Error::NoStorageAccess(Box::new(e))
    } else {
        Error::PlatformFailure(Box::new(e))
    }
}

/// `v1:` + base64, theo sau BẮT BUỘC là một dấu xuống dòng do `security -w` thêm: thiếu nghĩa là đầu ra bị cắt, và đầu ra cụt ở
/// ranh giới 4 ký tự base64 vẫn giải mã được thành một giá trị ngắn hơn. Mọi thứ khác là lỗi định dạng, không bao giờ là "không có".
fn decode_value(stdout: &[u8]) -> Result<Vec<u8>> {
    let text = std::str::from_utf8(stdout).map_err(|_| bad_format())?;
    let text = text.strip_suffix('\n').ok_or_else(bad_format)?;
    let body = text.strip_prefix(VALUE_PREFIX).ok_or_else(bad_format)?;
    STANDARD.decode(body).map_err(|_| bad_format())
}

struct Cred {
    runner: Arc<dyn Runner>,
    /// Service của app (khớp `Keystore`); `store_service` là service thật trong Keychain.
    service: String,
    store_service: String,
    account: String,
}

impl Cred {
    fn run(&self, args: &[&str], stdin: Option<&[u8]>) -> Result<Outcome> {
        self.runner.run(args, stdin).map_err(io_error)
    }
}

impl std::fmt::Debug for Cred {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Cred")
            .field("service", &self.service)
            .field("account", &self.account)
            .finish()
    }
}

impl CredentialApi for Cred {
    fn set_secret(&self, secret: &[u8]) -> Result<()> {
        // Một lần chạy `security -i` với hai lệnh: ghi, rồi đọc lại. Mã thoát là của lệnh cuối (đọc lại), đầu ra là giá trị đọc
        // được. Gộp vào một lần chạy vì mỗi lần chạy tốn khoảng 20 ms và bộ đếm hạn mức ghi sau mỗi phụ đề dịch xong, trên luồng
        // engine (đã đo: khoảng 43 ms thay vì 67 ms khi chạy hai lần).
        let add = format!(
            "add-generic-password -U -s \"{}\" -a \"{}\" -w \"{VALUE_PREFIX}{}\"\n",
            self.store_service,
            self.account,
            STANDARD.encode(secret)
        );
        if add.len() > MAX_LINE {
            return Err(Error::TooLong("secret".to_string(), MAX_LINE as u32));
        }
        let input = format!(
            "{add}find-generic-password -s \"{}\" -a \"{}\" -w\n",
            self.store_service, self.account
        );
        // Giữ khóa suốt cả lần thử lại: không ai chen vào giữa hai lần thử.
        let _write = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        retrying(|| {
            let out = self.run(&["-i"], Some(input.as_bytes()))?;
            match out.code {
                // Đọc lại và so từng byte: lệnh ghi lỗi thì lệnh đọc trả giá trị CŨ, ghi cụt thì trả giá trị cụt (giới hạn
                // dòng của `-i`), và cả hai bị bắt ở đây.
                0 if decode_value(&out.stdout).is_ok_and(|read| read == secret) => Ok(()),
                0 => Err(platform("ghi xong nhưng đọc lại không khớp")),
                // Ghi mà đọc lại không thấy mục: lỗi, không phải "không có mục" của một lần đọc bình thường.
                EXIT_NOT_FOUND => Err(platform("ghi xong nhưng không thấy mục")),
                code => Err(exit_error(code)),
            }
        })
    }

    fn get_secret(&self) -> Result<Vec<u8>> {
        retrying(|| {
            let out = self.run(
                &[
                    "find-generic-password",
                    "-s",
                    &self.store_service,
                    "-a",
                    &self.account,
                    "-w",
                ],
                None,
            )?;
            match out.code {
                0 => decode_value(&out.stdout),
                EXIT_NOT_FOUND => Err(Error::NoEntry),
                code => Err(exit_error(code)),
            }
        })
    }

    fn delete_credential(&self) -> Result<()> {
        // Cùng khóa với ghi: `deactivate` xóa `LICENSE` ngoài khóa của `License` trong lúc ticker ghi nó (`accept`), và một lần
        // xóa chen vào giữa lệnh ghi và lệnh đọc lại làm lần ghi báo "không thấy mục" giả.
        let _write = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        retrying(|| {
            let out = self.run(
                &[
                    "delete-generic-password",
                    "-s",
                    &self.store_service,
                    "-a",
                    &self.account,
                ],
                None,
            )?;
            match out.code {
                0 => Ok(()),
                EXIT_NOT_FOUND => Err(Error::NoEntry),
                code => Err(exit_error(code)),
            }
        })
    }

    fn get_credential(&self) -> Result<Option<Arc<Credential>>> {
        Ok(None)
    }

    fn get_specifiers(&self) -> Option<(String, String)> {
        Some((self.service.clone(), self.account.clone()))
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}

#[cfg(test)]
pub(crate) mod fake {
    //! `security` giả: mô phỏng đúng những hành vi đã đo (mã thoát 44 khi không có mục, giới hạn dòng của `-i`, mục cụt khi
    //! dòng quá dài) và cho phép gây lỗi một lần để thử đường lỗi.

    use std::collections::{HashMap, VecDeque};
    use std::io;
    use std::sync::Mutex;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::{Outcome, Runner};

    #[derive(Clone, Debug)]
    pub struct Call {
        pub args: Vec<String>,
        pub stdin: Option<String>,
    }

    /// Giảm số lần chạy đang diễn ra khi một lần `run` kết thúc (kể cả return sớm vì lỗi giả).
    struct Active<'a>(&'a AtomicUsize);

    impl Drop for Active<'_> {
        fn drop(&mut self) {
            self.0.fetch_sub(1, Ordering::SeqCst);
        }
    }

    #[derive(Clone)]
    pub enum Fault {
        /// Trả mã thoát này mà không làm gì.
        Exit(i32),
        /// `io::Error` kiểu này (không chạy được, hết giờ…).
        Io(io::ErrorKind),
        /// Lệnh ghi báo thành công (mã 0) nhưng lưu giá trị cụt: lỗi "âm thầm" tệ nhất.
        SilentTruncate,
        /// Lệnh ghi báo thành công (mã 0) nhưng không lưu gì: giá trị cũ còn nguyên.
        IgnoreWrite,
    }

    pub struct FakeSecurity {
        items: Mutex<HashMap<(String, String), String>>,
        calls: Mutex<Vec<Call>>,
        faults: Mutex<VecDeque<(String, Fault)>>,
        line_limit: usize,
        /// Nghỉ giữa hai lệnh của một lần chạy `-i` (ms): cho hai luồng có cơ hội chen vào nhau như `security` thật.
        delay_ms: u64,
        /// Số lần chạy đang diễn ra, và lớn nhất từng thấy: bằng 1 nghĩa là các lần chạy chưa bao giờ chồng nhau.
        active: AtomicUsize,
        max_active: AtomicUsize,
    }

    impl FakeSecurity {
        pub fn new() -> Self {
            Self {
                items: Mutex::new(HashMap::new()),
                calls: Mutex::new(Vec::new()),
                faults: Mutex::new(VecDeque::new()),
                line_limit: 4096,
                delay_ms: 0,
                active: AtomicUsize::new(0),
                max_active: AtomicUsize::new(0),
            }
        }

        /// Số lần chạy chồng nhau lớn nhất từng thấy.
        pub fn max_concurrent(&self) -> usize {
            self.max_active.load(Ordering::SeqCst)
        }

        /// Mỗi lệnh trong một lần chạy `-i` mất chừng này mili giây.
        pub fn slow(mut self, delay_ms: u64) -> Self {
            self.delay_ms = delay_ms;
            self
        }

        /// Lần gọi tiếp theo có chứa `pattern` (trong đối số hay stdin) bị lỗi `fault`, một lần.
        pub fn fail_once(&self, pattern: &str, fault: Fault) {
            self.faults.lock().unwrap().push_back((pattern.to_string(), fault));
        }

        /// `times` lần gọi liên tiếp có chứa `pattern` đều lỗi: lỗi còn nguyên sau cả một lần thử lại.
        pub fn fail_times(&self, pattern: &str, times: usize, fault: Fault) {
            for _ in 0..times {
                self.fail_once(pattern, fault.clone());
            }
        }

        pub fn calls(&self) -> Vec<Call> {
            self.calls.lock().unwrap().clone()
        }

        pub fn call_count(&self) -> usize {
            self.calls.lock().unwrap().len()
        }

        /// Giá trị thô (đã mã hóa `v1:…`) của một mục, như `security find-generic-password -w` thấy.
        pub fn raw(&self, service: &str, account: &str) -> Option<String> {
            self.items
                .lock()
                .unwrap()
                .get(&(service.to_string(), account.to_string()))
                .cloned()
        }

        pub fn put_raw(&self, service: &str, account: &str, value: &str) {
            self.items
                .lock()
                .unwrap()
                .insert((service.to_string(), account.to_string()), value.to_string());
        }

        pub fn keys(&self) -> Vec<(String, String)> {
            let mut keys: Vec<_> = self.items.lock().unwrap().keys().cloned().collect();
            keys.sort();
            keys
        }

        /// `security -i`: chạy lần lượt từng dòng. Mã thoát là của lệnh CUỐI (đã đo), đầu ra là của các lệnh `find` thành công.
        fn interactive(&self, input: &str, fault: Option<&Fault>) -> Outcome {
            let mut outcome = Outcome {
                code: 0,
                stdout: vec![],
            };
            for line in input.lines() {
                let (code, out) = self.command(line, fault);
                outcome.code = code;
                outcome.stdout.extend(out);
                if self.delay_ms > 0 {
                    std::thread::sleep(std::time::Duration::from_millis(self.delay_ms));
                }
            }
            outcome
        }

        fn command(&self, line: &str, fault: Option<&Fault>) -> (i32, Vec<u8>) {
            if line.starts_with("add-generic-password") {
                // add-generic-password -U -s "S" -a "A" -w "V"
                if matches!(fault, Some(Fault::IgnoreWrite)) {
                    return (0, vec![]);
                }
                let overflow = line.len() > self.line_limit;
                let mut kept = if overflow { &line[..self.line_limit] } else { line };
                if matches!(fault, Some(Fault::SilentTruncate)) {
                    kept = &kept[..kept.len().saturating_sub(6)];
                }
                let parts: Vec<&str> = kept.split('"').collect();
                if parts.len() < 6 {
                    return (1, vec![]);
                }
                self.put_raw(parts[1], parts[3], parts[5]);
                (if overflow { 1 } else { 0 }, vec![])
            } else if line.starts_with("find-generic-password") {
                // find-generic-password -s "S" -a "A" -w
                let parts: Vec<&str> = line.split('"').collect();
                if parts.len() < 4 {
                    return (2, vec![]);
                }
                match self.raw(parts[1], parts[3]) {
                    Some(value) => (0, format!("{value}\n").into_bytes()),
                    None => (44, vec![]),
                }
            } else {
                (1, vec![])
            }
        }
    }

    impl Runner for FakeSecurity {
        fn run(&self, args: &[&str], stdin: Option<&[u8]>) -> io::Result<Outcome> {
            let now_active = self.active.fetch_add(1, Ordering::SeqCst) + 1;
            self.max_active.fetch_max(now_active, Ordering::SeqCst);
            let _active = Active(&self.active);
            let stdin_text = stdin.map(|b| String::from_utf8_lossy(b).into_owned());
            self.calls.lock().unwrap().push(Call {
                args: args.iter().map(|a| a.to_string()).collect(),
                stdin: stdin_text.clone(),
            });
            let haystack = format!("{} {}", args.join(" "), stdin_text.as_deref().unwrap_or(""));
            let fault = {
                let mut faults = self.faults.lock().unwrap();
                let pos = faults
                    .iter()
                    .position(|(pattern, _)| haystack.contains(pattern.as_str()));
                pos.and_then(|i| faults.remove(i)).map(|(_, fault)| fault)
            };
            match &fault {
                Some(Fault::Exit(code)) => {
                    return Ok(Outcome {
                        code: *code,
                        stdout: vec![],
                    });
                }
                Some(Fault::Io(kind)) => return Err(io::Error::new(*kind, "lỗi giả")),
                _ => {}
            }
            Ok(match args {
                ["find-generic-password", "-s", service, "-a", account, "-w"] => match self.raw(service, account) {
                    Some(value) => Outcome {
                        code: 0,
                        stdout: format!("{value}\n").into_bytes(),
                    },
                    None => Outcome {
                        code: 44,
                        stdout: vec![],
                    },
                },
                ["delete-generic-password", "-s", service, "-a", account] => {
                    let existed = self
                        .items
                        .lock()
                        .unwrap()
                        .remove(&(service.to_string(), account.to_string()))
                        .is_some();
                    Outcome {
                        code: if existed { 0 } else { 44 },
                        stdout: vec![],
                    }
                }
                ["-i"] => self.interactive(stdin_text.as_deref().unwrap_or(""), fault.as_ref()),
                _ => Outcome {
                    code: 2,
                    stdout: vec![],
                },
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use std::io::ErrorKind;
    use std::sync::Arc;

    use base64::Engine;
    use base64::engine::general_purpose::STANDARD;
    use keyring_core::api::CredentialStoreApi;
    use keyring_core::{Entry, Error};

    use super::fake::{FakeSecurity, Fault};
    use super::*;

    const SERVICE: &str = "com.aitranslator.desktop.test";

    fn setup() -> (Arc<FakeSecurity>, Arc<SecurityCliStore>) {
        let fake = Arc::new(FakeSecurity::new());
        let store = SecurityCliStore::with_runner(fake.clone());
        (fake, store)
    }

    fn entry(store: &SecurityCliStore, name: &str) -> Entry {
        store.build(SERVICE, name, None).unwrap()
    }

    #[test]
    fn roundtrip_keeps_every_byte() {
        let (_, store) = setup();
        let all_bytes: Vec<u8> = (0..2048).map(|i| (i % 256) as u8).collect();
        for secret in [vec![], vec![0, 1, 2, 255], b"gia tri thuong".to_vec(), all_bytes] {
            let e = entry(&store, "db-key");
            e.set_secret(&secret).unwrap();
            assert_eq!(e.get_secret().unwrap(), secret);
        }
    }

    #[test]
    fn a_second_write_replaces_the_first() {
        let (_, store) = setup();
        let e = entry(&store, "license");
        e.set_secret(b"cu").unwrap();
        e.set_secret(b"moi").unwrap();
        assert_eq!(e.get_secret().unwrap(), b"moi".to_vec());
    }

    #[test]
    fn delete_removes_the_item_and_a_second_delete_is_no_entry() {
        let (_, store) = setup();
        let e = entry(&store, "license");
        e.set_secret(b"x").unwrap();
        e.delete_credential().unwrap();
        assert!(matches!(e.get_secret(), Err(Error::NoEntry)));
        assert!(matches!(e.delete_credential(), Err(Error::NoEntry)));
    }

    #[test]
    fn a_missing_item_is_no_entry() {
        let (_, store) = setup();
        assert!(matches!(entry(&store, "nothing").get_secret(), Err(Error::NoEntry)));
    }

    #[test]
    fn only_exit_44_means_missing() {
        let (fake, store) = setup();
        let e = entry(&store, "db-key");
        e.set_secret(b"khoa").unwrap();
        for code in [1, 2, 45, 100, 255] {
            // Hai lần: lỗi còn nguyên sau cả một lần thử lại.
            fake.fail_times("find-generic-password", 2, Fault::Exit(code));
            assert!(
                matches!(e.get_secret(), Err(Error::PlatformFailure(_))),
                "mã {code} phải là lỗi, không phải 'không có mục'"
            );
        }
        // Mã 0 nhưng đầu ra không phải giá trị của ta: lỗi định dạng, không phải "không có".
        fake.put_raw("com.aitranslator.desktop.test.security", "db-key", "khong co tien to");
        assert!(matches!(e.get_secret(), Err(Error::PlatformFailure(_))));
        fake.put_raw(
            "com.aitranslator.desktop.test.security",
            "db-key",
            "v1:***không phải base64***",
        );
        assert!(matches!(e.get_secret(), Err(Error::PlatformFailure(_))));
    }

    #[test]
    fn denied_cancelled_and_timed_out_calls_are_access_errors() {
        let (fake, store) = setup();
        let e = entry(&store, "db-key");
        for code in [36, 51, 128] {
            fake.fail_once("find-generic-password", Fault::Exit(code));
            assert!(matches!(e.get_secret(), Err(Error::NoStorageAccess(_))), "mã {code}");
        }
        fake.fail_once("find-generic-password", Fault::Io(ErrorKind::TimedOut));
        assert!(matches!(e.get_secret(), Err(Error::NoStorageAccess(_))));
        fake.fail_once("-i", Fault::Exit(51));
        assert!(matches!(e.set_secret(b"x"), Err(Error::NoStorageAccess(_))));
        fake.fail_once("delete-generic-password", Fault::Exit(51));
        assert!(matches!(e.delete_credential(), Err(Error::NoStorageAccess(_))));
    }

    #[test]
    fn a_program_that_cannot_run_is_a_platform_error() {
        let (fake, store) = setup();
        let e = entry(&store, "db-key");
        fake.fail_times("find-generic-password", 2, Fault::Io(ErrorKind::NotFound));
        assert!(matches!(e.get_secret(), Err(Error::PlatformFailure(_))));
        fake.fail_times("-i", 2, Fault::Io(ErrorKind::NotFound));
        assert!(matches!(e.set_secret(b"x"), Err(Error::PlatformFailure(_))));
    }

    #[test]
    fn a_failed_write_is_reported() {
        let (fake, store) = setup();
        let e = entry(&store, "license");
        fake.fail_times("-i", 2, Fault::Exit(45));
        assert!(matches!(e.set_secret(b"x"), Err(Error::PlatformFailure(_))));
        assert_eq!(fake.call_count(), 2, "một lần thử và một lần thử lại");
    }

    #[test]
    fn one_transient_failure_is_retried_once_for_every_operation() {
        // Một lần ghi lỗi làm `License::add_usage` dừng phiên đang dịch với "hết hạn mức" giả (`free_error`/`paid_error`), nên lỗi
        // thoáng qua (không chạy được tiến trình con, mã thoát lạ) được thử lại đúng một lần.
        let (fake, store) = setup();
        let e = entry(&store, "license");
        e.set_secret(b"x").unwrap();
        fake.fail_once("find-generic-password", Fault::Exit(1));
        assert_eq!(e.get_secret().unwrap(), b"x".to_vec());
        fake.fail_once("-i", Fault::Io(ErrorKind::Other));
        e.set_secret(b"y").unwrap();
        assert_eq!(e.get_secret().unwrap(), b"y".to_vec());
        fake.fail_once("delete-generic-password", Fault::Exit(1));
        e.delete_credential().unwrap();
        assert!(matches!(e.get_secret(), Err(Error::NoEntry)));
    }

    #[test]
    fn a_failure_that_persists_is_reported_after_exactly_one_retry() {
        let (fake, store) = setup();
        let e = entry(&store, "license");
        fake.fail_times("find-generic-password", 2, Fault::Exit(1));
        assert!(matches!(e.get_secret(), Err(Error::PlatformFailure(_))));
        assert_eq!(fake.call_count(), 2, "một lần thử và một lần thử lại");
        fake.fail_times("-i", 3, Fault::Exit(1));
        assert!(matches!(e.set_secret(b"x"), Err(Error::PlatformFailure(_))));
        assert_eq!(fake.call_count(), 4, "ghi cũng đúng một lần thử lại");
    }

    #[test]
    fn access_errors_and_missing_items_are_never_retried() {
        // Từ chối hay hết giờ (đang chờ hộp thoại) mà thử lại là bật hộp thoại lần nữa hay chờ gấp đôi; "không có mục" là câu trả lời.
        let (fake, store) = setup();
        let e = entry(&store, "license");
        fake.fail_once("find-generic-password", Fault::Exit(51));
        assert!(matches!(e.get_secret(), Err(Error::NoStorageAccess(_))));
        fake.fail_once("find-generic-password", Fault::Io(ErrorKind::TimedOut));
        assert!(matches!(e.get_secret(), Err(Error::NoStorageAccess(_))));
        assert!(matches!(e.get_secret(), Err(Error::NoEntry)));
        assert!(matches!(e.delete_credential(), Err(Error::NoEntry)));
        assert_eq!(fake.call_count(), 4, "mỗi việc đúng một lần gọi");
    }

    #[test]
    fn a_write_is_one_security_call_that_also_reads_the_value_back() {
        // Mỗi lần chạy `security` tốn khoảng 20 ms mà bộ đếm hạn mức ghi sau mỗi phụ đề dịch xong, trên luồng engine: ghi và đọc lại
        // phải nằm trong cùng một lần chạy (đã đo: khoảng 43 ms thay vì 67 ms).
        let (fake, store) = setup();
        entry(&store, "license").set_secret(b"x").unwrap();
        let calls = fake.calls();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].args, ["-i"]);
        let lines: Vec<&str> = calls[0].stdin.as_deref().unwrap().lines().collect();
        assert_eq!(lines.len(), 2, "{lines:?}");
        assert!(lines[0].starts_with("add-generic-password -U "));
        assert!(lines[1].starts_with("find-generic-password ") && lines[1].ends_with(" -w"));
    }

    #[test]
    fn writers_of_the_same_item_do_not_fail_each_other_s_read_back() {
        // `License::accept` ghi `LICENSE` trước khi lấy khóa của nó, nên hai nơi ghi cùng một tên có thể chạy chồng nhau: lần đọc
        // lại của bên này không được thấy giá trị của bên kia và báo lỗi giả (đã đo trên `security` thật: 55 trên 100 lần).
        let fake = Arc::new(FakeSecurity::new().slow(3));
        let store = SecurityCliStore::with_runner(fake.clone());
        let handles: Vec<_> = (0..8)
            .map(|t| {
                let store = store.clone();
                std::thread::spawn(move || {
                    let e = entry(&store, "license");
                    (0..5).all(|i| e.set_secret(format!("{t}:{i}").as_bytes()).is_ok())
                })
            })
            .collect();
        for h in handles {
            assert!(
                h.join().unwrap(),
                "một lần ghi báo lỗi vì lần đọc lại thấy giá trị của luồng khác"
            );
        }
        // Một lần thử lại có thể che lỗi giả: kiểm thẳng rằng các lần ghi không bao giờ chạy chồng nhau.
        assert_eq!(fake.max_concurrent(), 1, "các lần ghi phải chạy lần lượt");
    }

    #[test]
    fn a_delete_never_lands_between_a_write_and_its_read_back() {
        // `deactivate` xóa `LICENSE` ngoài khóa của `License` trong lúc ticker ghi nó (`accept`): một lần xóa chen vào giữa lệnh ghi
        // và lệnh đọc lại làm lần ghi báo "không thấy mục" giả.
        let fake = Arc::new(FakeSecurity::new().slow(3));
        let store = SecurityCliStore::with_runner(fake.clone());
        let writer = {
            let store = store.clone();
            std::thread::spawn(move || {
                let e = entry(&store, "license");
                (0..10).all(|i| e.set_secret(format!("v{i}").as_bytes()).is_ok())
            })
        };
        let deleter = {
            let store = store.clone();
            std::thread::spawn(move || {
                let e = entry(&store, "license");
                for _ in 0..10 {
                    let _ = e.delete_credential();
                    // Rải đều theo thời gian để chắc chắn có lần rơi vào giữa một lần ghi (mỗi lần ghi giả mất khoảng 6 ms).
                    std::thread::sleep(std::time::Duration::from_millis(2));
                }
            })
        };
        deleter.join().unwrap();
        assert!(
            writer.join().unwrap(),
            "một lần ghi báo lỗi vì lần xóa chen vào giữa ghi và đọc lại"
        );
        assert_eq!(fake.max_concurrent(), 1, "ghi và xóa phải chạy lần lượt");
    }

    #[test]
    fn the_input_of_a_write_has_no_blank_line_and_ends_with_exactly_one_newline() {
        // Hai điểm lạ của `security -i` (đã đo): một dòng trống ở cuối đặt lại mã thoát về 0, và thiếu dấu xuống dòng cuối thì lệnh
        // cuối không chạy (mã 0, không có đầu ra). Phép so đầu ra vẫn bắt được cả hai, nhưng đầu vào phải giữ đúng dạng.
        let (fake, store) = setup();
        entry(&store, "license").set_secret(b"x").unwrap();
        let input = fake.calls()[0].stdin.clone().unwrap();
        assert!(input.ends_with('\n') && !input.ends_with("\n\n"), "{input:?}");
        assert!(!input.contains("\n\n"), "{input:?}");
        assert!(input.lines().all(|l| !l.trim().is_empty()));
    }

    #[test]
    fn a_write_that_did_not_stick_is_caught_by_the_read_back() {
        let (fake, store) = setup();
        let e = entry(&store, "license");
        e.set_secret(b"cu").unwrap();
        fake.fail_times("-i", 2, Fault::IgnoreWrite);
        assert!(matches!(e.set_secret(b"moi"), Err(Error::PlatformFailure(_))));
        assert_eq!(e.get_secret().unwrap(), b"cu".to_vec());
    }

    #[test]
    fn a_write_that_finds_nothing_afterwards_is_an_error_not_no_entry() {
        let (fake, store) = setup();
        let e = entry(&store, "license");
        fake.fail_times("-i", 2, Fault::IgnoreWrite);
        assert!(matches!(e.set_secret(b"x"), Err(Error::PlatformFailure(_))));
    }

    #[test]
    fn a_value_without_the_final_newline_is_a_format_error() {
        // `security -w` luôn thêm dấu xuống dòng: thiếu nghĩa là đầu ra bị cắt, và đầu ra cụt ở ranh giới 4 ký tự base64 vẫn giải mã
        // được thành một giá trị ngắn hơn (câu trả lời sai mà không báo lỗi).
        assert_eq!(decode_value(b"v1:AAEC\n").unwrap(), vec![0, 1, 2]);
        assert!(matches!(decode_value(b"v1:AAEC"), Err(Error::PlatformFailure(_))));
        assert!(
            matches!(decode_value(b"v1:\n"), Ok(v) if v.is_empty()),
            "giá trị rỗng vẫn hợp lệ"
        );
        assert!(matches!(decode_value(b""), Err(Error::PlatformFailure(_))));
    }

    #[test]
    fn the_secret_never_appears_in_arguments() {
        let (fake, store) = setup();
        let secret = b"BI-MAT-KHONG-DUOC-LO";
        let encoded = STANDARD.encode(secret);
        let e = entry(&store, "license");
        e.set_secret(secret).unwrap();
        assert_eq!(e.get_secret().unwrap(), secret.to_vec());
        e.delete_credential().unwrap();
        let calls = fake.calls();
        assert_eq!(calls.len(), 3, "ghi, đọc, xóa");
        for call in &calls {
            for arg in &call.args {
                assert!(
                    !arg.contains(&encoded) && !arg.contains("BI-MAT"),
                    "bí mật lọt vào đối số: {arg}"
                );
            }
        }
        let write = calls.iter().find(|c| c.args == ["-i"]).expect("lệnh ghi");
        assert!(
            write.stdin.as_deref().unwrap().contains(&encoded),
            "bí mật đi qua stdin"
        );
    }

    #[test]
    fn an_oversized_secret_is_rejected_before_running_anything() {
        let (fake, store) = setup();
        let e = entry(&store, "license");
        assert!(matches!(e.set_secret(&[7u8; 4000]), Err(Error::TooLong(..))));
        assert_eq!(fake.call_count(), 0);
    }

    #[test]
    fn the_largest_value_the_app_stores_fits_with_the_longest_names() {
        let (fake, store) = setup();
        let service = "a".repeat(100);
        let name = "n".repeat(64);
        let e = store.build(&service, &name, None).unwrap();
        let secret = vec![0xA5u8; crate::security::keystore::MAX_SECRET_BYTES];
        e.set_secret(&secret).unwrap();
        assert_eq!(e.get_secret().unwrap(), secret);
        let input = fake.calls()[0].stdin.clone().unwrap();
        for line in input.lines() {
            // `lines()` bỏ dấu xuống dòng mà giới hạn của `security -i` tính cả nó: `len < MAX_LINE` nghĩa là `len + 1 <= MAX_LINE`.
            assert!(
                line.len() < MAX_LINE,
                "dòng {} byte (chưa kể xuống dòng) vượt {MAX_LINE}",
                line.len()
            );
        }
    }

    #[test]
    fn a_silently_truncated_write_is_caught_by_the_read_back() {
        let (fake, store) = setup();
        let e = entry(&store, "db-key");
        fake.fail_times("-i", 2, Fault::SilentTruncate);
        assert!(matches!(e.set_secret(b"khoa-day-du"), Err(Error::PlatformFailure(_))));
    }

    #[test]
    fn items_live_under_a_separate_service() {
        let (fake, store) = setup();
        entry(&store, "db-key").set_secret(b"k").unwrap();
        assert_eq!(
            fake.keys(),
            vec![(
                "com.aitranslator.desktop.test.security".to_string(),
                "db-key".to_string()
            )],
            "không được đụng service gốc của mục cũ"
        );
    }

    #[test]
    fn the_internal_marker_name_is_allowed_but_unsafe_characters_are_not() {
        let (fake, store) = setup();
        entry(&store, "@migrated").set_secret(b"1").unwrap();
        for bad in [
            "",
            "a b",
            "a\"b",
            "a\nb",
            "a;b",
            "a'b",
            "khóa",
            "-x",
            "a\\b",
            &"a".repeat(129),
        ] {
            assert!(
                matches!(store.build(SERVICE, bad, None), Err(Error::Invalid(..))),
                "tên {bad:?}"
            );
            assert!(
                matches!(store.build(bad, "name", None), Err(Error::Invalid(..))),
                "service {bad:?}"
            );
        }
        assert_eq!(
            fake.call_count(),
            1,
            "chỉ lần ghi (kèm đọc lại) của dấu, không lệnh nào cho tên xấu"
        );
    }

    #[test]
    fn the_credential_reports_the_logical_service_and_account() {
        let (_, store) = setup();
        let e = entry(&store, "db-key");
        assert_eq!(e.get_specifiers(), Some((SERVICE.to_string(), "db-key".to_string())));
    }

    #[test]
    fn an_outcome_never_prints_its_stdout() {
        // Đầu ra của lệnh đọc CHÍNH LÀ bí mật: ghi log nhầm một `Outcome` không được làm lộ nó.
        let out = Outcome {
            code: 0,
            stdout: b"v1:BI-MAT".to_vec(),
        };
        let debug = format!("{out:?}");
        assert!(!debug.contains("BI-MAT") && !debug.contains("66, 73"), "{debug}");
        assert!(debug.contains("code: 0"));
    }

    #[test]
    fn the_secret_text_is_not_in_the_debug_output() {
        let (_, store) = setup();
        let e = entry(&store, "license");
        e.set_secret(b"BI-MAT").unwrap();
        let debug = format!("{store:?} {e:?}");
        assert!(!debug.contains("BI-MAT") && !debug.contains(&STANDARD.encode(b"BI-MAT")));
    }

    /// Chạy tay (người), chỉ macOS: `cargo test -p meeting-translator --lib security_exit_44_contract -- --ignored`.
    /// Hợp đồng mà cả phép phân biệt "không có mục" dựa vào: `security` thật thoát 44 khi mục không có, ở cả chế độ thường lẫn
    /// `-i` (mã của lệnh cuối). Chỉ đọc một service ngẫu nhiên, không tạo gì. Nếu một bản macOS đổi mã này, test đỏ ở đây thay vì
    /// app coi mọi lần đọc là lỗi (hay tệ hơn).
    #[test]
    #[ignore = "chạy /usr/bin/security thật; chỉ macOS"]
    fn security_exit_44_contract() {
        if !cfg!(target_os = "macos") {
            return;
        }
        let service = format!("at-canary-{}", std::process::id());
        let runner = SystemRunner::new();
        let out = runner
            .run(&["find-generic-password", "-s", &service, "-a", "x", "-w"], None)
            .unwrap();
        assert_eq!(out.code, EXIT_NOT_FOUND);
        assert!(out.stdout.is_empty());
        let input = format!("find-generic-password -s \"{service}\" -a \"x\" -w\n");
        let out = runner.run(&["-i"], Some(input.as_bytes())).unwrap();
        assert_eq!(out.code, EXIT_NOT_FOUND, "-i trả mã của lệnh cuối");
        let store = SecurityCliStore::new();
        assert!(matches!(
            store.build(&service, "x", None).unwrap().get_secret(),
            Err(Error::NoEntry)
        ));
    }

    #[cfg(unix)]
    mod system_runner {
        use std::time::Instant;

        use super::*;

        fn sh(script: &str, stdin: Option<&[u8]>, timeout: Duration) -> io::Result<Outcome> {
            SystemRunner::with("/bin/sh", timeout).run(&["-c", script], stdin)
        }

        #[test]
        fn returns_the_exit_code_and_stdout() {
            let out = sh("printf abc; exit 3", None, Duration::from_secs(10)).unwrap();
            assert_eq!(out.code, 3);
            assert_eq!(out.stdout, b"abc");
        }

        #[test]
        fn feeds_stdin_to_the_program() {
            let out = sh("cat", Some(b"xin chao\n"), Duration::from_secs(10)).unwrap();
            assert_eq!(out.code, 0);
            assert_eq!(out.stdout, b"xin chao\n");
        }

        #[test]
        fn never_returns_stderr() {
            let out = sh("echo BI-MAT >&2; exit 1", None, Duration::from_secs(10)).unwrap();
            assert_eq!(out.code, 1);
            assert!(out.stdout.is_empty());
        }

        #[test]
        fn a_program_that_ignores_stdin_does_not_break_the_writer() {
            let big = vec![b'x'; 200_000];
            let out = sh("exit 0", Some(&big), Duration::from_secs(10)).unwrap();
            assert_eq!(out.code, 0);
        }

        #[test]
        fn large_output_does_not_deadlock() {
            let out = sh("head -c 300000 /dev/zero", None, Duration::from_secs(20)).unwrap();
            assert_eq!(out.code, 0);
            assert_eq!(out.stdout.len(), 300_000);
        }

        #[test]
        fn stops_a_program_that_runs_too_long() {
            let started = Instant::now();
            let err = sh("sleep 30", None, Duration::from_millis(300)).unwrap_err();
            assert_eq!(err.kind(), ErrorKind::TimedOut);
            assert!(started.elapsed() < Duration::from_secs(10), "phải dừng ngay sau hạn");
        }

        #[test]
        fn a_missing_program_is_not_found() {
            let err = SystemRunner::with("/nonexistent/security", Duration::from_secs(5))
                .run(&["x"], None)
                .unwrap_err();
            assert_eq!(err.kind(), ErrorKind::NotFound);
        }

        #[test]
        fn a_program_killed_by_a_signal_is_an_error_not_a_code() {
            let err = sh("kill -9 $$", None, Duration::from_secs(10)).unwrap_err();
            assert_eq!(err.kind(), ErrorKind::Other);
        }

        #[test]
        fn does_not_wait_for_another_process_that_keeps_the_pipe_open() {
            // `std` tạo ống rồi mới đặt CLOEXEC (không nguyên tử): một tiến trình khác của app (ví dụ tiến trình phụ vừa được chạy ở
            // luồng khác) có thể thừa hưởng đầu ghi của ống stdout và giữ nó mở dù `security` đã thoát. Phải trả kết quả ngay thay
            // vì chờ tới lúc nó thoát (có thể hàng giờ), vì lúc này khóa ghi và khóa của `License` đang bị giữ.
            let started = Instant::now();
            let out = sh("printf abc; (sleep 8 &); exit 0", None, Duration::from_secs(30)).unwrap();
            assert_eq!(out.code, 0);
            assert_eq!(out.stdout, b"abc", "đầu ra của chính nó vẫn phải nguyên vẹn");
            assert!(
                started.elapsed() < Duration::from_secs(4),
                "đã chờ {:?}",
                started.elapsed()
            );
        }
    }
}
