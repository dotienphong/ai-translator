//! Dòng thông tin máy gửi kèm tin đầu tiên khi khách để tích "Gửi kèm thông tin máy" (spec 2026-10-22-chat-ho-tro-zalo-design.md
//! §4), ví dụ `AI Translator 0.2.4 · macOS 15.6 · Apple M4 Pro · 24 GB · Monthly · Chuẩn · UI vi`. Giao diện hiện nguyên văn
//! dòng này trước khi gửi.
//!
//! Dòng chỉ dựng từ [`MachineFacts`]: kiểu này không có trường nào cho key, email của license, mã máy, tên máy hay tên người dùng,
//! nên muốn thêm phải sửa kiểu (và test chặn ở `support::tests`). Phần đọc máy thật ở `support/mod.rs`.

use crate::sidecar::probe::ProbeOutcome;

/// Số ký tự tối đa (server cũng cắt ở 300).
pub const MAX_CHARS: usize = 300;

/// Mọi thứ dòng thông tin máy được phép chứa.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MachineFacts {
    /// Tên sản phẩm (`productName`) và phiên bản.
    pub app_name: String,
    pub app_version: String,
    /// `macos` hay `windows` (`diagnostics::machine::SystemInfo::os_name`).
    pub os_name: &'static str,
    /// `15.6`; Windows là `10.0.<bản dựng>`.
    pub os_version: String,
    pub chip: Option<String>,
    pub ram_bytes: Option<u64>,
    /// Tên card đồ họa (Windows, theo lần dò GPU lúc mở app); macOS rỗng.
    pub gpus: Vec<String>,
    /// Mã gói bản quyền (`free`, `monthly`, `six_months`, `yearly`); mã khác bị bỏ.
    pub plan: Option<String>,
    /// Tên gói model theo ngôn ngữ giao diện (`Chuẩn`, `Standard`…), hay mã gói khi manifest không có.
    pub model_pack: Option<String>,
    /// Ngôn ngữ giao diện: `vi`, `en`, `ja`, `zh`, `ko`.
    pub ui_lang: &'static str,
}

/// Tên gói hiện cho người dùng (như `plan.*` của giao diện, giống nhau ở mọi ngôn ngữ).
pub fn plan_name(code: &str) -> Option<&'static str> {
    match code {
        "free" => Some("Free"),
        "monthly" => Some("Monthly"),
        "six_months" => Some("6 Months"),
        "yearly" => Some("Yearly"),
        _ => None,
    }
}

/// Tên hệ điều hành kèm phiên bản. Windows báo `10.0` cho cả Windows 10 và 11: bản dựng từ 22000 trở lên là Windows 11.
pub fn os_label(os_name: &str, version: &str) -> String {
    match os_name {
        "macos" => format!("macOS {version}"),
        "windows" => match version.rsplit('.').next().and_then(|b| b.parse::<u32>().ok()) {
            Some(build) if build >= 22_000 => format!("Windows 11 ({build})"),
            Some(build) => format!("Windows 10 ({build})"),
            None => format!("Windows {version}"),
        },
        other => format!("{other} {version}"),
    }
}

/// RAM làm tròn tới GB gần nhất (Windows báo phần dùng được, hơi dưới số ghi trên máy).
fn ram_label(bytes: u64) -> String {
    format!("{} GB", (bytes + (1 << 29)) >> 30)
}

/// Tên các card đồ họa dùng được (card rời, GPU tích hợp) trong kết quả dò GPU.
pub fn gpu_names(probe: Option<&ProbeOutcome>) -> Vec<String> {
    probe
        .map(|o| {
            o.gpus
                .iter()
                .filter(|g| matches!(g.device_type.as_str(), "discrete" | "integrated"))
                .map(|g| g.name.clone())
                .collect()
        })
        .unwrap_or_default()
}

/// Bỏ ký tự điều khiển và khoảng trắng hai đầu; rỗng thì `None`.
fn clean(part: &str) -> Option<String> {
    let kept: String = part.chars().filter(|c| !c.is_control()).collect();
    let kept = kept.trim();
    (!kept.is_empty()).then(|| kept.to_string())
}

/// Dòng thông tin máy, tối đa [`MAX_CHARS`] ký tự.
pub fn line(f: &MachineFacts) -> String {
    let mut parts = vec![
        format!("{} {}", f.app_name, f.app_version),
        os_label(f.os_name, &f.os_version),
    ];
    parts.extend(f.chip.clone());
    parts.extend(f.ram_bytes.map(ram_label));
    if !f.gpus.is_empty() {
        parts.push(format!("GPU {}", f.gpus.join(" + ")));
    }
    parts.extend(f.plan.as_deref().and_then(plan_name).map(String::from));
    parts.extend(f.model_pack.clone());
    parts.push(format!("UI {}", f.ui_lang));
    let joined = parts.iter().filter_map(|p| clean(p)).collect::<Vec<_>>().join(" · ");
    joined.chars().take(MAX_CHARS).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sidecar::probe::GpuInfo;

    const GB: u64 = 1 << 30;

    fn mac() -> MachineFacts {
        MachineFacts {
            app_name: "AI Translator".into(),
            app_version: "0.2.4".into(),
            os_name: "macos",
            os_version: "15.6".into(),
            chip: Some("Apple M4 Pro".into()),
            ram_bytes: Some(24 * GB),
            gpus: Vec::new(),
            plan: Some("monthly".into()),
            model_pack: Some("Chuẩn".into()),
            ui_lang: "vi",
        }
    }

    #[test]
    fn a_mac_line_reads_like_the_spec_example() {
        assert_eq!(
            line(&mac()),
            "AI Translator 0.2.4 · macOS 15.6 · Apple M4 Pro · 24 GB · Monthly · Chuẩn · UI vi"
        );
    }

    #[test]
    fn a_windows_line_names_the_release_and_the_graphics_cards() {
        let facts = MachineFacts {
            os_name: "windows",
            os_version: "10.0.26100".into(),
            chip: Some("Intel(R) Core(TM) i5-1345U".into()),
            ram_bytes: Some(16 * GB - 300 * (1 << 20)),
            gpus: vec![
                "Intel(R) Iris(R) Xe Graphics".into(),
                "NVIDIA GeForce RTX 3050 Laptop GPU".into(),
            ],
            plan: Some("six_months".into()),
            model_pack: None,
            ui_lang: "en",
            ..mac()
        };
        assert_eq!(
            line(&facts),
            "AI Translator 0.2.4 · Windows 11 (26100) · Intel(R) Core(TM) i5-1345U · 16 GB · GPU Intel(R) Iris(R) Xe Graphics + NVIDIA GeForce RTX 3050 Laptop GPU · 6 Months · UI en"
        );
        assert_eq!(os_label("windows", "10.0.19045"), "Windows 10 (19045)");
        assert_eq!(os_label("windows", "unknown"), "Windows unknown");
    }

    #[test]
    fn only_the_four_plan_names_and_clean_text_get_through() {
        let facts = MachineFacts {
            // Mã gói lạ (kể cả thứ trông như một key) bị bỏ.
            plan: Some("7Q2M-4K9D-XXXX".into()),
            chip: Some("Apple\u{0} M4\n".into()),
            model_pack: Some("   ".into()),
            ram_bytes: None,
            ..mac()
        };
        assert_eq!(line(&facts), "AI Translator 0.2.4 · macOS 15.6 · Apple M4 · UI vi");
        for (code, name) in [
            ("free", "Free"),
            ("monthly", "Monthly"),
            ("six_months", "6 Months"),
            ("yearly", "Yearly"),
        ] {
            assert_eq!(plan_name(code), Some(name));
        }
    }

    #[test]
    fn the_line_is_capped_at_300_characters() {
        let facts = MachineFacts {
            chip: Some("ế".repeat(400)),
            ..mac()
        };
        assert_eq!(line(&facts).chars().count(), MAX_CHARS);
    }

    #[test]
    fn graphics_cards_come_from_the_gpu_probe() {
        let gpu = |name: &str, kind: &str| GpuInfo {
            name: name.into(),
            device_type: kind.into(),
            device_local_bytes: 0,
            vendor_id: 0,
        };
        let probe = ProbeOutcome {
            usable: true,
            gpus: vec![
                gpu("Intel(R) UHD Graphics", "integrated"),
                gpu("Microsoft Basic Render Driver", "cpu"),
                gpu("RTX 4060", "discrete"),
            ],
        };
        assert_eq!(gpu_names(Some(&probe)), ["Intel(R) UHD Graphics", "RTX 4060"]);
        assert!(gpu_names(None).is_empty(), "chưa dò (macOS, hay Windows chưa dò xong)");
    }
}
