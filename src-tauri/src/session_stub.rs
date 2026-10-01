//! Phiên dịch tạm của kế hoạch 01: Bắt đầu/Dừng chỉ đổi trạng thái, và trong lúc "đang dịch" thì
//! phát phụ đề mẫu mỗi 1,5 giây (như spike S5) để thử thanh phụ đề bằng tay.
//! Kế hoạch 02 thay file này bằng `session.rs`, nối `audio-capture` và `pipeline` (§12).

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::events::SUBTITLE_UPSERT;
use crate::overlay;
use crate::state::{AppState, SessionStatus};

const SAMPLES: &[(&str, &str, &str)] = &[
    (
        "en",
        "Good morning everyone, thanks for joining.",
        "Chào buổi sáng mọi người, cảm ơn đã tham gia.",
    ),
    (
        "en",
        "Let's review the quarterly numbers first.",
        "Trước hết hãy xem lại số liệu quý.",
    ),
    (
        "zh",
        "我们下周需要完成测试。",
        "Tuần sau chúng ta cần hoàn thành việc kiểm thử.",
    ),
    (
        "ja",
        "来月の予算を確認させてください。",
        "Cho tôi xác nhận lại ngân sách tháng tới.",
    ),
];

/// Tăng mỗi lần bắt đầu hay dừng; luồng phát mẫu tự dừng khi thấy số này đổi.
static GENERATION: AtomicU64 = AtomicU64::new(0);

/// Bắt đầu phiên tạm: hiện thanh phụ đề (§4.2; `session.rs` của 02 làm y như vậy), rồi phát phụ đề mẫu.
pub fn start<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    overlay::set_visible(app, true)?;
    app.state::<AppState>().update_status(|s| {
        s.session = SessionStatus::Running;
        s.overlay_visible = true;
    });
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    std::thread::spawn(move || {
        for n in 0u64.. {
            std::thread::sleep(Duration::from_millis(1500));
            if GENERATION.load(Ordering::SeqCst) != generation {
                break;
            }
            let (lang, src, tgt) = SAMPLES[n as usize % SAMPLES.len()];
            let start_ms = n * 1500;
            let payload = json!({
                "id": n,
                "start_ms": start_ms,
                "end_ms": start_ms + 1200,
                "src_lang": lang,
                "src_text": src,
                "tgt_text": tgt,
                "status": "done",
                "provisional": n % 4 == 3,
            });
            let _ = app.emit(SUBTITLE_UPSERT, payload);
        }
    });
    Ok(())
}

pub fn stop<R: Runtime>(app: &AppHandle<R>) {
    GENERATION.fetch_add(1, Ordering::SeqCst);
    app.state::<AppState>()
        .update_status(|s| s.session = SessionStatus::Idle);
}
