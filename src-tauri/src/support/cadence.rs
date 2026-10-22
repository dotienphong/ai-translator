//! Nhịp hỏi tin mới của app (spec 2026-10-22-chat-ho-tro-zalo-design.md §4, hợp đồng phía khách). Hàm thuần: không giờ thật,
//! không mạng; lõi (`chat.rs`) gọi mỗi nhịp với trạng thái hiện tại.
//!
//! | Lúc nào | Nhịp |
//! |---|---|
//! | Màn hình Hỗ trợ đang mở và cửa sổ chính đang hiện | 3 giây; 2 phút liền không có tin mới thì 15 giây |
//! | Đang chờ trả lời (tin cuối của khách, trong 24 giờ qua), cửa sổ chính đang hiện và không đang dịch | 60 giây |
//! | Còn lại, kể cả khi chưa từng dùng chat hay khi cửa sổ ẩn xuống khay | không gọi mạng |
//!
//! Cửa sổ ẩn thì không hỏi nền: app hay chạy ẩn dưới khay, mà lần hỏi nền trả về câu trả lời làm server coi khách đã nhận (nên
//! không gửi email cho câu đó), trong khi khách không thấy chấm đỏ vì không nhìn thấy cửa sổ.

/// Nhịp khi màn hình Hỗ trợ đang mở.
pub const FAST_SECS: i64 = 3;
/// Nhịp khi màn hình đang mở mà đã 2 phút không có tin mới.
pub const SLOW_SECS: i64 = 15;
/// Bao lâu không có tin mới thì chuyển từ 3 sang 15 giây.
pub const QUIET_AFTER_SECS: i64 = 120;
/// Nhịp khi đang chờ trả lời mà màn hình đóng.
pub const WAITING_SECS: i64 = 60;
/// Tin cuối của khách cũ hơn chừng này thì thôi chờ trả lời.
pub const WAITING_FOR_SECS: i64 = 24 * 3600;
/// Chờ sau lỗi mạng liền: lần 1, lần 2, từ lần 3.
const BACKOFF_SECS: [i64; 3] = [3, 15, 60];

/// Trạng thái để quyết nhịp.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Inputs {
    /// Đã có cuộc chat (có token).
    pub has_conversation: bool,
    /// Màn hình Hỗ trợ đang mở (giao diện báo).
    pub screen_open: bool,
    /// Cửa sổ chính đang hiện.
    pub window_visible: bool,
    /// Có phiên dịch đang bắt đầu hay chạy.
    pub translating: bool,
    /// Giây Unix của tin khách cuối chưa có trả lời.
    pub waiting_since: Option<i64>,
    /// Lần cuối có tin mới, khách gửi tin hay mở màn hình (giây Unix).
    pub active_at: i64,
    pub now: i64,
}

/// Việc của nhịp kế tiếp.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Next {
    /// Hỏi server, cách lần hỏi trước chừng này giây.
    Poll(i64),
    /// Không hỏi; xét lại sau chừng này giây (cửa sổ có thể hiện lại, phiên dịch có thể dừng). Không gọi mạng.
    Recheck(i64),
    /// Không hỏi, không cần xét lại cho tới khi một lệnh của giao diện đánh thức.
    Idle,
}

/// Đang chờ trả lời: tin cuối của khách chưa có trả lời và gửi trong 24 giờ qua.
pub fn waiting(waiting_since: Option<i64>, now: i64) -> bool {
    // `abs_diff` không tràn số dù `support.json` bị sửa tay thành giá trị lạ; lệch quá 24 giờ (cả hai phía) thì thôi chờ.
    waiting_since.is_some_and(|since| now.abs_diff(since) < WAITING_FOR_SECS.unsigned_abs())
}

pub fn next(i: &Inputs) -> Next {
    if !i.has_conversation {
        return Next::Idle;
    }
    let waiting = waiting(i.waiting_since, i.now);
    if i.screen_open && i.window_visible {
        let quiet = i.now - i.active_at >= QUIET_AFTER_SECS;
        return Next::Poll(if quiet { SLOW_SECS } else { FAST_SECS });
    }
    if waiting && !i.translating && i.window_visible {
        return Next::Poll(WAITING_SECS);
    }
    if i.screen_open {
        return Next::Recheck(FAST_SECS);
    }
    if waiting {
        return Next::Recheck(SLOW_SECS);
    }
    Next::Idle
}

/// Chờ bao lâu sau `failures` lần lỗi mạng liền (tính từ 1): 3, 15, rồi 60 giây.
pub fn network_backoff(failures: u32) -> i64 {
    let index = usize::try_from(failures.saturating_sub(1)).unwrap_or(usize::MAX);
    BACKOFF_SECS[index.min(BACKOFF_SECS.len() - 1)]
}

#[cfg(test)]
mod tests {
    use super::*;

    const T: i64 = 1_800_000_000;

    fn base() -> Inputs {
        Inputs {
            has_conversation: true,
            screen_open: false,
            window_visible: true,
            translating: false,
            waiting_since: None,
            active_at: T,
            now: T,
        }
    }

    #[test]
    fn without_a_conversation_nothing_ever_connects() {
        for (screen_open, translating) in [(false, false), (true, false), (true, true)] {
            let i = Inputs {
                has_conversation: false,
                screen_open,
                translating,
                waiting_since: Some(T),
                ..base()
            };
            assert_eq!(next(&i), Next::Idle, "{i:?}");
        }
    }

    #[test]
    fn an_open_screen_polls_every_3_seconds_then_15_after_two_quiet_minutes() {
        let open = Inputs {
            screen_open: true,
            ..base()
        };
        assert_eq!(next(&open), Next::Poll(3));
        assert_eq!(next(&Inputs { now: T + 119, ..open }), Next::Poll(3));
        assert_eq!(next(&Inputs { now: T + 120, ..open }), Next::Poll(15));
        // Đang dịch không làm màn hình đang mở ngừng hỏi (người dùng đang nhìn cuộc chat).
        assert_eq!(
            next(&Inputs {
                translating: true,
                ..open
            }),
            Next::Poll(3)
        );
    }

    #[test]
    fn waiting_for_a_reply_polls_every_minute_unless_translating() {
        let waiting = Inputs {
            waiting_since: Some(T - 3600),
            ..base()
        };
        assert_eq!(next(&waiting), Next::Poll(60));
        assert_eq!(
            next(&Inputs {
                translating: true,
                ..waiting
            }),
            Next::Recheck(15),
            "đang dịch: không gọi mạng, chỉ xét lại"
        );
        assert_eq!(
            next(&Inputs {
                waiting_since: Some(T - WAITING_FOR_SECS),
                ..waiting
            }),
            Next::Idle,
            "quá 24 giờ thì thôi chờ"
        );
        assert_eq!(next(&base()), Next::Idle, "không chờ, màn hình đóng");
    }

    #[test]
    fn a_hidden_window_is_not_an_open_screen() {
        let hidden = Inputs {
            screen_open: true,
            window_visible: false,
            ..base()
        };
        assert_eq!(
            next(&hidden),
            Next::Recheck(3),
            "không hỏi, xét lại để biết khi cửa sổ hiện lại"
        );
        assert_eq!(
            next(&Inputs {
                waiting_since: Some(T),
                ..hidden
            }),
            Next::Recheck(3),
            "cửa sổ ẩn mà đang chờ trả lời: không hỏi nền (khách không thấy chấm đỏ, server lại coi là đã nhận)"
        );
        assert_eq!(
            next(&Inputs {
                waiting_since: Some(T),
                translating: true,
                ..hidden
            }),
            Next::Recheck(3)
        );
    }

    #[test]
    fn a_window_hidden_in_the_tray_never_polls_and_polling_resumes_when_it_shows() {
        let waiting_hidden = Inputs {
            waiting_since: Some(T - 3600),
            window_visible: false,
            ..base()
        };
        assert_eq!(
            next(&waiting_hidden),
            Next::Recheck(SLOW_SECS),
            "màn hình đóng, cửa sổ ẩn, đang chờ: xét lại, không gọi mạng"
        );
        assert_eq!(
            next(&Inputs {
                window_visible: true,
                ..waiting_hidden
            }),
            Next::Poll(60),
            "cửa sổ hiện lại: hỏi nền như thường"
        );
        assert_eq!(
            next(&Inputs {
                window_visible: false,
                has_conversation: true,
                waiting_since: None,
                ..base()
            }),
            Next::Idle,
            "không chờ, cửa sổ ẩn: không cần xét lại"
        );
    }

    #[test]
    fn a_hand_edited_waiting_time_cannot_overflow() {
        assert!(!waiting(Some(i64::MIN), T), "không tràn số, quá xa nên thôi chờ");
        assert!(!waiting(Some(i64::MAX), T));
        assert!(waiting(Some(T - 60), T));
        assert!(waiting(Some(T + 60), T), "đồng hồ lệch vài phút vẫn là đang chờ");
        assert!(!waiting(Some(T - WAITING_FOR_SECS), T));
        assert!(!waiting(None, T));
    }

    #[test]
    fn network_errors_back_off_3_15_then_60_seconds() {
        assert_eq!([1, 2, 3, 4, 50].map(network_backoff), [3, 15, 60, 60, 60]);
        assert_eq!(network_backoff(0), 3);
    }
}
