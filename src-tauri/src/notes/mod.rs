#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
//! Ghi chú cuộc họp bằng AI (spec 2026-11-11-ghi-chu-cuoc-hop-design): dựng ghi chú từ bản chép lời.

use std::sync::{Mutex, PoisonError};

use tauri::{AppHandle, Listener, Manager, Runtime};

use crate::data::TranscriptRef;
use crate::events;
use crate::state::AppState;
use service::{EngineFactory, NotesChanged, NotesService};

pub mod chunk;
pub mod cloud;
pub mod engine;
pub mod job;
pub mod keys;
pub mod prompt;
pub mod quota;
pub mod render;
pub mod schema;
pub mod service;
pub mod store;

/// Cài dịch vụ ghi chú với engine thật. Gọi một lần ở `setup`.
pub fn install<R: Runtime>(app: &AppHandle<R>) {
    install_with(app, service::live_factory());
}

/// Như [`install`] với `factory` cho trước (test dùng engine giả): `manage(NotesService)` và nghe `app://status` để tự tạo
/// ghi chú khi phiên dừng (chỉ khi người dùng bật `notes_auto`).
pub(crate) fn install_with<R: Runtime>(app: &AppHandle<R>, factory: EngineFactory) {
    app.manage(NotesService::new(factory));
    let state: Mutex<Auto> = Mutex::new(Auto::default());
    let handle = app.clone();
    app.listen_any(events::STATUS_CHANGED, move |event| {
        let Some(now) = session_of(event.payload()) else {
            return;
        };
        let mut auto = state.lock().unwrap_or_else(PoisonError::into_inner);
        let before = auto.previous.replace(now.clone());
        // Chỉ khi phiên vừa dừng bình thường: `running` → `idle`. Dừng vì lỗi hay chưa chạy xong `starting` thì không.
        if before.as_deref() != Some("running") || now != "idle" {
            return;
        }
        if !handle.try_state::<AppState>().is_some_and(|s| s.settings().notes_auto) {
            return;
        }
        // Mỗi phiên tự tạo một lần, kể cả khi trạng thái nhảy `running` → `idle` lại cho cùng phiên.
        let session = crate::data::current(&handle).session;
        if auto.last_session == Some(session) {
            return;
        }
        auto.last_session = Some(session);
        drop(auto);
        auto_start(&handle);
    });
}

/// Trạng thái của bộ nghe `app://status`: trạng thái phiên lần trước, và số phiên đã tự tạo ghi chú gần nhất.
#[derive(Default)]
struct Auto {
    previous: Option<String>,
    last_session: Option<u64>,
}

/// Trường `session` của nội dung `app://status`.
fn session_of(payload: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(payload).ok()?;
    value.get("session")?.as_str().map(str::to_string)
}

/// Tự tạo ghi chú cho phiên vừa dừng (bộ nghe đã kiểm `notes_auto`). Chạy trên luồng riêng: sự kiện trạng thái có thể phát
/// từ luồng chính, còn bắt đầu việc đọc kho khóa và DB (có thể chờ). Lỗi chỉ ghi mã vào log.
fn auto_start<R: Runtime>(app: &AppHandle<R>) {
    let handle = app.clone();
    let spawned = std::thread::Builder::new().name("notes-auto".into()).spawn(move || {
        let Some(service) = handle.try_state::<NotesService>() else {
            return;
        };
        if let Err(e) = service.start(&handle, TranscriptRef::Current, None) {
            log::info!("không tự tạo ghi chú: {}", e.code);
        }
    });
    if spawned.is_err() {
        log::warn!("không mở được luồng tự tạo ghi chú");
    }
}

/// "Xóa toàn bộ dữ liệu": hủy việc đang chạy và bỏ ghi chú trong bộ nhớ. Chưa cài dịch vụ thì không làm gì.
pub fn forget<R: Runtime>(app: &AppHandle<R>) {
    let Some(service) = app.try_state::<NotesService>() else {
        return;
    };
    service.cancel(app);
    service.forget();
    events::notes_changed(app, &NotesChanged::idle(TranscriptRef::Current));
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    /// Mọi file `.rs` của module (tên file, nội dung). Thêm file mới thì thêm vào đây: test dưới đây so với thư mục.
    const SOURCES: &[(&str, &str)] = &[
        ("chunk.rs", include_str!("chunk.rs")),
        ("cloud.rs", include_str!("cloud.rs")),
        ("engine.rs", include_str!("engine.rs")),
        ("job.rs", include_str!("job.rs")),
        ("keys.rs", include_str!("keys.rs")),
        ("mod.rs", include_str!("mod.rs")),
        ("prompt.rs", include_str!("prompt.rs")),
        ("quota.rs", include_str!("quota.rs")),
        ("render.rs", include_str!("render.rs")),
        ("schema.rs", include_str!("schema.rs")),
        ("service.rs", include_str!("service.rs")),
        ("store.rs", include_str!("store.rs")),
    ];

    /// Phần mã chạy thật của một file: bỏ từ `mod tests` trở đi (test được phép dựng bản chép lời giả và gọi những thứ này).
    fn production(src: &str) -> &str {
        src.find("\nmod tests").map_or(src, |i| &src[..i])
    }

    /// Spec 2026-11-11-ghi-chu-cuoc-hop §2: ghi chú chỉ đọc bản chép lời. Không đi qua đường dịch, không chạm phiên đang chạy hay
    /// luồng bắt tiếng, và không ghi vào `TranscriptStore` (câu, người nói).
    #[test]
    fn the_module_stays_inside_its_boundary() {
        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/src/notes");
        let mut on_disk: Vec<String> = std::fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .filter(|n| n.ends_with(".rs"))
            .collect();
        on_disk.sort();
        let listed: Vec<&str> = SOURCES.iter().map(|(name, _)| *name).collect();
        assert_eq!(on_disk, listed, "SOURCES phải liệt kê mọi file .rs của module");

        for (name, src) in SOURCES {
            for banned in [
                "pipeline::translate",
                "cloud_mt::CloudMt",
                "cloud_mt::FallbackMt",
                "crate::session::",
                "crate::capture::",
                ".upsert(",
                ".begin(",
                ".delta(",
                ".set_speaker(",
                ".rename_speaker(",
                ".merge_speakers(",
            ] {
                assert!(!production(src).contains(banned), "{name} có `{banned}`");
            }
        }
    }

    /// `mod.rs` khai đủ module con: một bản khác từng làm rơi các dòng `pub mod`.
    #[test]
    fn every_submodule_is_declared() {
        let src = production(include_str!("mod.rs"));
        for (name, _) in SOURCES.iter().filter(|(n, _)| *n != "mod.rs") {
            let module = name.trim_end_matches(".rs");
            assert!(
                src.contains(&format!("pub mod {module};")),
                "mod.rs thiếu `pub mod {module};`"
            );
        }
    }
}
