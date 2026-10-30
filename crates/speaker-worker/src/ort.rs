//! Chạy model nhúng giọng bằng ONNX Runtime trên Windows (nhanh hơn candle khoảng 3 lần trên lõi P và 2,2 lần trên lõi E của
//! i5-1345U, `bench/2026-10-26-nguoi-noi/results/02-windows.md`). macOS giữ candle, không biên dịch module này.
//!
//! - Gọi thẳng C API ổn định của ONNX Runtime (bảng con trỏ hàm `OrtApi`, chỉ nối thêm ở cuối giữa các bản), không qua crate
//!   binding: crate `ort` chưa có bản ổn định (spec §6.12). Chỉ số trong bảng lấy từ `onnxruntime_c_api.h` của 1.31.1.
//! - `onnxruntime.dll` nằm cạnh `speaker-worker.exe`, nạp bằng đường dẫn tuyệt đối, chỉ tìm DLL phụ thuộc ở thư mục của nó và
//!   System32 (binary vẫn link `/DEPENDENTLOADFLAG:0x800`). App đã kiểm SHA-256 mọi file của thư mục tiến trình phụ trước khi chạy
//!   worker (`sidecar::integrity`), kể cả DLL này.
//! - DLL phải là bản dựng từ mã nguồn với `--no_telemetry`: bản chính thức của Microsoft có bộ gửi telemetry qua HTTPS. Worker vẫn
//!   đặt `ORT_DISABLE_TELEMETRY` (`main.rs`, trước khi có luồng nào) và gọi `DisableTelemetryEvents` để phòng xa.
//! - Tắt spinning của bộ luồng (mặc định ONNX Runtime quay vòng chờ việc, đốt CPU giữa các lần nhúng) và arena bộ nhớ (giữ RSS
//!   thấp giữa các đoạn dài ngắn khác nhau).

use std::ffi::{CStr, CString, c_char, c_void};
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::ptr::{null, null_mut};
use std::sync::OnceLock;

use anyhow::{Context, Result, anyhow, bail, ensure};
use windows::Win32::Foundation::HMODULE;
use windows::Win32::System::LibraryLoader::{
    GetProcAddress, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR, LOAD_LIBRARY_SEARCH_SYSTEM32, LoadLibraryExW,
};
use windows::core::{PCSTR, PCWSTR};

/// Tên DLL nằm cạnh `speaker-worker.exe`.
pub const DLL_NAME: &str = "onnxruntime.dll";
/// Bản C API yêu cầu: bản của header đã lấy chỉ số (ONNX Runtime 1.31.1). DLL cũ hơn trả `NULL` và worker dùng candle.
const API_VERSION: u32 = 31;

// Chỉ số trong `struct OrtApi` (onnxruntime_c_api.h 1.31.1).
const GET_ERROR_MESSAGE: usize = 2;
const CREATE_ENV: usize = 3;
const DISABLE_TELEMETRY_EVENTS: usize = 6;
const CREATE_SESSION_FROM_ARRAY: usize = 8;
const RUN: usize = 9;
const CREATE_SESSION_OPTIONS: usize = 10;
const DISABLE_CPU_MEM_ARENA: usize = 19;
const SET_SESSION_GRAPH_OPTIMIZATION_LEVEL: usize = 23;
const SET_INTRA_OP_NUM_THREADS: usize = 24;
const SET_INTER_OP_NUM_THREADS: usize = 25;
const CREATE_TENSOR_WITH_DATA_AS_ORT_VALUE: usize = 49;
const GET_TENSOR_MUTABLE_DATA: usize = 51;
const GET_TENSOR_ELEMENT_TYPE: usize = 60;
const GET_DIMENSIONS_COUNT: usize = 61;
const GET_DIMENSIONS: usize = 62;
const GET_TENSOR_TYPE_AND_SHAPE: usize = 65;
const CREATE_CPU_MEMORY_INFO: usize = 69;
const RELEASE_ENV: usize = 92;
const RELEASE_STATUS: usize = 93;
const RELEASE_MEMORY_INFO: usize = 94;
const RELEASE_SESSION: usize = 95;
const RELEASE_VALUE: usize = 96;
const RELEASE_TENSOR_TYPE_AND_SHAPE_INFO: usize = 99;
const RELEASE_SESSION_OPTIONS: usize = 100;
const ADD_SESSION_CONFIG_ENTRY: usize = 130;

const ORT_LOGGING_LEVEL_ERROR: i32 = 3;
const ORT_ENABLE_ALL: i32 = 99;
const ORT_DEVICE_ALLOCATOR: i32 = 0;
const ORT_MEM_TYPE_DEFAULT: i32 = 0;
const ELEMENT_FLOAT: i32 = 1;

type Status = *mut c_void;

#[repr(C)]
struct OrtApiBase {
    get_api: unsafe extern "system" fn(u32) -> *const *const c_void,
    get_version_string: unsafe extern "system" fn() -> *const c_char,
}

/// Bảng hàm của DLL đã nạp; sống tới hết tiến trình (DLL không bao giờ gỡ).
struct Api {
    table: *const *const c_void,
    version: String,
}

// SAFETY: bảng con trỏ hàm của ONNX Runtime là dữ liệu chỉ đọc, các hàm dùng ở đây an toàn khi gọi từ nhiều luồng.
unsafe impl Send for Api {}
unsafe impl Sync for Api {}

impl Api {
    /// Con trỏ hàm thứ `i` của bảng, ép về kiểu `F` (một `unsafe extern "system" fn`).
    unsafe fn f<F: Copy>(&self, i: usize) -> F {
        debug_assert_eq!(size_of::<F>(), size_of::<*const c_void>());
        // SAFETY: `i` là chỉ số có trong bảng của bản API đã yêu cầu; `F` khớp chữ ký trong header.
        unsafe { std::mem::transmute_copy(&*self.table.add(i)) }
    }

    /// `Ok` khi `status` rỗng; không thì lấy thông điệp, giải phóng status và trả lỗi.
    fn check(&self, status: Status, what: &str) -> Result<()> {
        if status.is_null() {
            return Ok(());
        }
        // SAFETY: `status` khác NULL do chính ONNX Runtime trả; đọc thông điệp rồi giải phóng đúng một lần.
        let msg = unsafe {
            let get: unsafe extern "system" fn(Status) -> *const c_char = self.f(GET_ERROR_MESSAGE);
            let m = CStr::from_ptr(get(status)).to_string_lossy().into_owned();
            let release: unsafe extern "system" fn(Status) = self.f(RELEASE_STATUS);
            release(status);
            m
        };
        bail!("onnxruntime {what}: {msg}")
    }
}

static API: OnceLock<Option<Api>> = OnceLock::new();

/// Thư mục chứa DLL: thư mục của file chạy hiện tại (worker, hay công cụ đo dùng `Embedder` trong tiến trình).
fn dll_path() -> Option<PathBuf> {
    Some(std::env::current_exe().ok()?.parent()?.join(DLL_NAME))
}

/// Nạp DLL một lần. `None` khi không có DLL cạnh file chạy, DLL không nạp được hay quá cũ; lý do ghi ra stderr của worker.
fn api() -> Option<&'static Api> {
    API.get_or_init(|| {
        let path = dll_path()?;
        if !path.is_file() {
            return None;
        }
        match load(&path) {
            Ok(api) => Some(api),
            Err(e) => {
                eprintln!("speaker-worker: không dùng được {DLL_NAME}: {e:#}");
                None
            }
        }
    })
    .as_ref()
}

fn load(path: &Path) -> Result<Api> {
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    // SAFETY: `wide` là đường dẫn tuyệt đối kết thúc bằng 0, sống tới hết lệnh gọi.
    let module: HMODULE = unsafe {
        LoadLibraryExW(
            PCWSTR(wide.as_ptr()),
            None,
            LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32,
        )
    }
    .context("LoadLibraryExW")?;
    // SAFETY: tên hàm xuất là chuỗi hằng kết thúc bằng 0.
    let base = unsafe { GetProcAddress(module, PCSTR(c"OrtGetApiBase".as_ptr().cast())) }
        .ok_or_else(|| anyhow!("DLL không có OrtGetApiBase"))?;
    // SAFETY: `OrtGetApiBase` có chữ ký `const OrtApiBase* ORT_API_CALL OrtGetApiBase(void)`.
    let base: unsafe extern "system" fn() -> *const OrtApiBase = unsafe { std::mem::transmute(base) };
    // SAFETY: con trỏ do DLL trả, trỏ tới struct tĩnh của nó.
    let base = unsafe { base().as_ref() }.ok_or_else(|| anyhow!("OrtGetApiBase trả NULL"))?;
    // SAFETY: hai hàm của `OrtApiBase` không có điều kiện trước.
    let (table, version) = unsafe {
        let v = CStr::from_ptr((base.get_version_string)())
            .to_string_lossy()
            .into_owned();
        ((base.get_api)(API_VERSION), v)
    };
    ensure!(
        !table.is_null(),
        "onnxruntime {version} không có C API bản {API_VERSION}"
    );
    Ok(Api { table, version })
}

/// Có dùng được ONNX Runtime không (DLL cạnh file chạy, nạp được, đủ mới), kèm bản của nó.
pub fn available() -> Option<&'static str> {
    api().map(|a| a.version.as_str())
}

/// Một phiên ONNX Runtime của model nhúng: đầu vào `x` f32 `[1, T, 80]`, đầu ra `embedding`.
pub struct Session {
    api: &'static Api,
    env: *mut c_void,
    session: *mut c_void,
    memory: *mut c_void,
    input: CString,
    output: CString,
}

// SAFETY: `OrtSession::Run` an toàn khi gọi từ nhiều luồng; `Embedder` còn chỉ dùng từ một luồng.
unsafe impl Send for Session {}

impl Session {
    /// Dựng phiên từ các byte model đã băm (không đọc lại file), `threads` luồng tính toán.
    pub fn new(model: &[u8], threads: usize, input: &str, output: &str) -> Result<Self> {
        let api = api().ok_or_else(|| anyhow!("không có {DLL_NAME} dùng được"))?;
        let mut s = Self {
            api,
            env: null_mut(),
            session: null_mut(),
            memory: null_mut(),
            input: CString::new(input)?,
            output: CString::new(output)?,
        };
        let mut options: *mut c_void = null_mut();
        // SAFETY: mỗi lệnh gọi theo đúng chữ ký trong header; con trỏ ra là biến cục bộ hay trường của `s`, được giải phóng ở
        // `Drop` (hay ngay dưới, với `options`).
        let built = unsafe {
            let create_env: unsafe extern "system" fn(i32, *const c_char, *mut *mut c_void) -> Status =
                api.f(CREATE_ENV);
            api.check(
                create_env(ORT_LOGGING_LEVEL_ERROR, c"speaker-worker".as_ptr(), &mut s.env),
                "CreateEnv",
            )?;
            let no_telemetry: unsafe extern "system" fn(*const c_void) -> Status = api.f(DISABLE_TELEMETRY_EVENTS);
            api.check(no_telemetry(s.env), "DisableTelemetryEvents")?;
            let create_options: unsafe extern "system" fn(*mut *mut c_void) -> Status = api.f(CREATE_SESSION_OPTIONS);
            api.check(create_options(&mut options), "CreateSessionOptions")?;
            s.configure(options, threads)
                .and_then(|()| {
                    let create: unsafe extern "system" fn(
                        *const c_void,
                        *const c_void,
                        usize,
                        *const c_void,
                        *mut *mut c_void,
                    ) -> Status = api.f(CREATE_SESSION_FROM_ARRAY);
                    api.check(
                        create(s.env, model.as_ptr().cast(), model.len(), options, &mut s.session),
                        "CreateSessionFromArray",
                    )
                })
                .and_then(|()| {
                    let info: unsafe extern "system" fn(i32, i32, *mut *mut c_void) -> Status =
                        api.f(CREATE_CPU_MEMORY_INFO);
                    api.check(
                        info(ORT_DEVICE_ALLOCATOR, ORT_MEM_TYPE_DEFAULT, &mut s.memory),
                        "CreateCpuMemoryInfo",
                    )
                })
        };
        if !options.is_null() {
            // SAFETY: `options` do `CreateSessionOptions` tạo, phiên không giữ tham chiếu tới nó sau khi tạo.
            unsafe {
                let release: unsafe extern "system" fn(*mut c_void) = api.f(RELEASE_SESSION_OPTIONS);
                release(options);
            }
        }
        built?;
        Ok(s)
    }

    /// Luồng, tối ưu đồ thị, tắt spinning và arena.
    unsafe fn configure(&self, options: *mut c_void, threads: usize) -> Result<()> {
        let api = self.api;
        // SAFETY: `options` hợp lệ (bên gọi vừa tạo); chuỗi khóa và giá trị là hằng kết thúc bằng 0.
        unsafe {
            let intra: unsafe extern "system" fn(*mut c_void, i32) -> Status = api.f(SET_INTRA_OP_NUM_THREADS);
            api.check(intra(options, threads.clamp(1, 16) as i32), "SetIntraOpNumThreads")?;
            let inter: unsafe extern "system" fn(*mut c_void, i32) -> Status = api.f(SET_INTER_OP_NUM_THREADS);
            api.check(inter(options, 1), "SetInterOpNumThreads")?;
            let level: unsafe extern "system" fn(*mut c_void, i32) -> Status =
                api.f(SET_SESSION_GRAPH_OPTIMIZATION_LEVEL);
            api.check(level(options, ORT_ENABLE_ALL), "SetSessionGraphOptimizationLevel")?;
            let arena: unsafe extern "system" fn(*mut c_void) -> Status = api.f(DISABLE_CPU_MEM_ARENA);
            api.check(arena(options), "DisableCpuMemArena")?;
            let entry: unsafe extern "system" fn(*mut c_void, *const c_char, *const c_char) -> Status =
                api.f(ADD_SESSION_CONFIG_ENTRY);
            for key in [c"session.intra_op.allow_spinning", c"session.inter_op.allow_spinning"] {
                api.check(entry(options, key.as_ptr(), c"0".as_ptr()), "AddSessionConfigEntry")?;
            }
        }
        Ok(())
    }

    /// Chạy model trên `feats` (`frames × bins` f32, hàng theo khung); trả đầu ra phẳng.
    pub fn run(&self, feats: &mut [f32], frames: usize, bins: usize) -> Result<Vec<f32>> {
        ensure!(
            feats.len() == frames * bins,
            "đặc trưng {} giá trị, cần {frames}×{bins}",
            feats.len()
        );
        let api = self.api;
        let shape = [1i64, frames as i64, bins as i64];
        let mut input: *mut c_void = null_mut();
        let mut output: *mut c_void = null_mut();
        // SAFETY: tensor đầu vào mượn `feats` (sống tới hết hàm, ONNX Runtime không giữ sau `Run`); tên đầu vào/ra là `CString`
        // của `self`; đầu ra do `Run` cấp phát, được đọc và giải phóng trước khi trả.
        let result = unsafe {
            let create: unsafe extern "system" fn(
                *const c_void,
                *mut c_void,
                usize,
                *const i64,
                usize,
                i32,
                *mut *mut c_void,
            ) -> Status = api.f(CREATE_TENSOR_WITH_DATA_AS_ORT_VALUE);
            api.check(
                create(
                    self.memory,
                    feats.as_mut_ptr().cast(),
                    size_of_val(feats),
                    shape.as_ptr(),
                    shape.len(),
                    ELEMENT_FLOAT,
                    &mut input,
                ),
                "CreateTensorWithDataAsOrtValue",
            )
            .and_then(|()| {
                let run: unsafe extern "system" fn(
                    *mut c_void,
                    *const c_void,
                    *const *const c_char,
                    *const *const c_void,
                    usize,
                    *const *const c_char,
                    usize,
                    *mut *mut c_void,
                ) -> Status = api.f(RUN);
                let in_names = [self.input.as_ptr()];
                let inputs = [input as *const c_void];
                let out_names = [self.output.as_ptr()];
                api.check(
                    run(
                        self.session,
                        null(),
                        in_names.as_ptr(),
                        inputs.as_ptr(),
                        1,
                        out_names.as_ptr(),
                        1,
                        &mut output,
                    ),
                    "Run",
                )
            })
            .and_then(|()| self.read_f32(output))
        };
        // SAFETY: hai giá trị (nếu đã tạo) do ONNX Runtime cấp phát, giải phóng đúng một lần.
        unsafe {
            let release: unsafe extern "system" fn(*mut c_void) = api.f(RELEASE_VALUE);
            for v in [input, output] {
                if !v.is_null() {
                    release(v);
                }
            }
        }
        result
    }

    /// Chép tensor f32 `value` ra `Vec`.
    unsafe fn read_f32(&self, value: *mut c_void) -> Result<Vec<f32>> {
        let api = self.api;
        let mut info: *mut c_void = null_mut();
        // SAFETY: `value` là tensor đầu ra hợp lệ của `Run`; `info` được giải phóng trước khi trả; dữ liệu chép ra trước khi
        // bên gọi giải phóng `value`.
        unsafe {
            let shape_of: unsafe extern "system" fn(*const c_void, *mut *mut c_void) -> Status =
                api.f(GET_TENSOR_TYPE_AND_SHAPE);
            api.check(shape_of(value, &mut info), "GetTensorTypeAndShape")?;
            let read = (|| -> Result<Vec<f32>> {
                let ty: unsafe extern "system" fn(*const c_void, *mut i32) -> Status = api.f(GET_TENSOR_ELEMENT_TYPE);
                let mut t = 0i32;
                api.check(ty(info, &mut t), "GetTensorElementType")?;
                ensure!(t == ELEMENT_FLOAT, "đầu ra không phải f32 (kiểu {t})");
                let count: unsafe extern "system" fn(*const c_void, *mut usize) -> Status = api.f(GET_DIMENSIONS_COUNT);
                let mut n = 0usize;
                api.check(count(info, &mut n), "GetDimensionsCount")?;
                ensure!(n <= 8, "đầu ra có {n} chiều");
                let dims_of: unsafe extern "system" fn(*const c_void, *mut i64, usize) -> Status =
                    api.f(GET_DIMENSIONS);
                let mut dims = [0i64; 8];
                api.check(dims_of(info, dims.as_mut_ptr(), n), "GetDimensions")?;
                let len = dims[..n]
                    .iter()
                    .try_fold(1usize, |a, &d| usize::try_from(d).ok().and_then(|d| a.checked_mul(d)));
                let len = len.ok_or_else(|| anyhow!("đầu ra có chiều không hợp lệ {:?}", &dims[..n]))?;
                let data: unsafe extern "system" fn(*mut c_void, *mut *mut c_void) -> Status =
                    api.f(GET_TENSOR_MUTABLE_DATA);
                let mut p: *mut c_void = null_mut();
                api.check(data(value, &mut p), "GetTensorMutableData")?;
                ensure!(!p.is_null() || len == 0, "đầu ra rỗng");
                Ok(if len == 0 {
                    Vec::new()
                } else {
                    std::slice::from_raw_parts(p as *const f32, len).to_vec()
                })
            })();
            let release: unsafe extern "system" fn(*mut c_void) = api.f(RELEASE_TENSOR_TYPE_AND_SHAPE_INFO);
            release(info);
            read
        }
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        let api = self.api;
        // SAFETY: mỗi đối tượng (nếu đã tạo) do ONNX Runtime cấp phát và chỉ giải phóng ở đây; phiên trước môi trường.
        unsafe {
            for (i, p) in [
                (RELEASE_MEMORY_INFO, self.memory),
                (RELEASE_SESSION, self.session),
                (RELEASE_ENV, self.env),
            ] {
                if !p.is_null() {
                    let release: unsafe extern "system" fn(*mut c_void) = api.f(i);
                    release(p);
                }
            }
        }
    }
}
