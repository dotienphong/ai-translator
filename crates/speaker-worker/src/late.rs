//! Hàng đợi chốt nhãn muộn (spec 2026-10-26-phan-biet-nguoi-noi §5.3): phân cụm nhân quả gán đoạn đầu phiên và đoạn ngắn khi
//! các tâm giọng chưa ổn định nên hay sai. Mỗi đoạn có nhúng được nhớ lại; khi thời gian âm thanh đã qua `end_ms` của nó
//! `late_relabel_ms`, đoạn được so lại với các tâm hiện có và, nếu giọng gần nhất khác giọng cũ, báo đổi. Tâm giọng do phân cụm
//! nhân quả dựng, chốt muộn không sửa tâm. Tất định: cùng chuỗi đầu vào cho cùng chuỗi thay đổi.

use std::collections::VecDeque;

/// Số đoạn chờ chốt tối đa; đầy thì đoạn cũ nhất bị bỏ (giữ nhãn gốc) để RAM không phình (512 × 192 chiều × 4 byte ≈ 400 KB).
pub const MAX_PENDING: usize = 512;

/// Số đoạn đổi giọng tối đa mỗi lần `take_due`: một lần phát quá nhiều `Assign` làm đầy kênh cập nhật của app (256), và app coi
/// đó là worker hỏng. Phần còn lại giữ trong hàng đợi (đã tới hạn nên lần sau lấy tiếp).
pub const MAX_CHANGES_PER_CALL: usize = 32;

/// Một đoạn cần đổi giọng.
#[derive(Clone, Debug, PartialEq)]
pub struct LateChange {
    pub segment_id: u64,
    /// `None`: đoạn chưa có giọng nào lúc được gán (còn trước giọng đầu tiên); giờ có.
    pub from: Option<u32>,
    pub to: u32,
    /// Thời lượng thật của đoạn (cho bộ đếm thời gian nói của từng giọng).
    pub duration_ms: u64,
    pub mic: bool,
}

struct Pending {
    id: u64,
    end_ms: u64,
    /// Nhúng đã chuẩn hóa.
    emb: Vec<f32>,
    voice: Option<u32>,
    duration_ms: u64,
    mic: bool,
}

pub(crate) struct LateQueue {
    delay_ms: u64,
    items: VecDeque<Pending>,
}

impl LateQueue {
    pub fn new(delay_ms: u64) -> Self {
        Self {
            delay_ms,
            items: VecDeque::new(),
        }
    }

    pub fn enabled(&self) -> bool {
        self.delay_ms > 0
    }

    #[allow(clippy::too_many_arguments)]
    pub fn push(&mut self, id: u64, end_ms: u64, emb: Vec<f32>, voice: Option<u32>, duration_ms: u64, mic: bool) {
        if !self.enabled() {
            return;
        }
        if self.items.len() >= MAX_PENDING {
            self.items.pop_front();
        }
        self.items.push_back(Pending {
            id,
            end_ms,
            emb,
            voice,
            duration_ms,
            mic,
        });
    }

    /// Bỏ đoạn `id` khỏi hàng đợi (nó đã được tách giọng theo tên: quyết định đó mạnh hơn, không để chốt muộn kéo về giọng cũ).
    pub fn forget(&mut self, id: u64) {
        self.items.retain(|p| p.id != id);
    }

    pub fn merged(&mut self, from: u32, into: u32) {
        for p in self.items.iter_mut().filter(|p| p.voice == Some(from)) {
            p.voice = Some(into);
        }
    }

    /// Lấy các đoạn đã tới hạn (`end_ms + delay ≤ now_ms`) ra khỏi hàng đợi, giữ thứ tự đăng ký; `nearest` trả giọng gần nhất
    /// với một nhúng (hay `None` khi chưa có giọng nào). Chỉ trả đoạn có giọng đổi.
    pub fn take_due(&mut self, now_ms: u64, mut nearest: impl FnMut(&[f32]) -> Option<u32>) -> Vec<LateChange> {
        let mut out = Vec::new();
        let delay = self.delay_ms;
        self.items.retain(|p| {
            if p.end_ms.saturating_add(delay) > now_ms || out.len() >= MAX_CHANGES_PER_CALL {
                return true;
            }
            if let Some(to) = nearest(&p.emb)
                && Some(to) != p.voice
            {
                out.push(LateChange {
                    segment_id: p.id,
                    from: p.voice,
                    to,
                    duration_ms: p.duration_ms,
                    mic: p.mic,
                });
            }
            false
        });
        out
    }

    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.items.len()
    }
}
