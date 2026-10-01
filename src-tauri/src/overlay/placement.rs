//! Nhớ vị trí thanh phụ đề theo từng màn hình (spec §4.4, khóa `overlay.positions` ở §6.9).
//!
//! Vị trí lưu bằng điểm logic, so với góc trên bên trái vùng làm việc (work area) của màn hình, để
//! đúng cả khi màn hình có tỉ lệ (scale) khác nhau hay đổi vị trí trong cách sắp xếp màn hình.
//! File này chỉ có phép tính, không gọi Tauri; phần đọc màn hình và đặt cửa sổ nằm ở `overlay/mod.rs`.

use std::collections::BTreeMap;

use crate::settings::OverlayRect;

/// Một màn hình đang cắm, tọa độ vật lý (pixel) như Tauri trả về.
#[derive(Clone, Debug, PartialEq)]
pub struct Screen {
    pub key: String,
    /// Vùng làm việc: trừ menu bar, Dock, taskbar.
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale: f64,
}

/// Chỗ đặt thanh phụ đề, tọa độ vật lý.
#[derive(Clone, Debug, PartialEq)]
pub struct Placement {
    pub screen_key: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

pub const DEFAULT_WIDTH: f64 = 900.0;
pub const DEFAULT_HEIGHT: f64 = 160.0;
/// Khoảng cách tối thiểu tới mép trái và phải, và khoảng cách tới mép dưới khi đặt mặc định.
const MARGIN: f64 = 24.0;
const BOTTOM_GAP: f64 = 72.0;

/// Khóa của một màn hình: tên và độ phân giải đầy đủ. Hai màn hình cùng model và cùng độ phân giải
/// dùng chung một vị trí; chấp nhận được, vì vị trí vẫn nằm trong màn hình.
pub fn screen_key(name: Option<&str>, width: u32, height: u32) -> String {
    let name = name.map(str::trim).filter(|n| !n.is_empty()).unwrap_or("unknown");
    format!("{name} {width}x{height}")
}

/// Vị trí mặc định: giữa màn hình theo chiều ngang, cách mép dưới một khoảng.
pub fn default_rect(screen: &Screen) -> OverlayRect {
    let (w, h) = logical_size(screen);
    let width = DEFAULT_WIDTH.min(w - 2.0 * MARGIN).max(1.0);
    let height = DEFAULT_HEIGHT.min(h).max(1.0);
    OverlayRect {
        x: ((w - width) / 2.0).max(0.0),
        y: (h - height - BOTTOM_GAP).max(0.0),
        width,
        height,
        last_used: 0,
    }
}

/// Đổi vị trí vật lý của cửa sổ sang vị trí logic so với màn hình, để lưu.
pub fn to_relative(screen: &Screen, x: i32, y: i32, width: u32, height: u32) -> OverlayRect {
    OverlayRect {
        x: f64::from(x - screen.x) / screen.scale,
        y: f64::from(y - screen.y) / screen.scale,
        width: f64::from(width) / screen.scale,
        height: f64::from(height) / screen.scale,
        last_used: 0,
    }
}

/// Nhớ vị trí trên màn hình `key` lúc `now` (giây Unix). Nhớ quá `max` màn hình thì bỏ màn hình lâu
/// không dùng nhất (trừ màn hình vừa nhớ), để file cài đặt không phình ra.
pub fn remember(positions: &mut BTreeMap<String, OverlayRect>, key: &str, rect: OverlayRect, now: u64, max: usize) {
    positions.insert(key.to_string(), OverlayRect { last_used: now, ..rect });
    while positions.len() > max {
        let oldest = positions
            .iter()
            .filter(|(k, _)| k.as_str() != key)
            .min_by_key(|(_, r)| r.last_used)
            .map(|(k, _)| k.clone());
        match oldest {
            Some(k) => positions.remove(&k),
            None => break,
        };
    }
}

/// Hai vị trí cùng chỗ và cùng kích thước (bỏ qua thời điểm dùng).
pub fn same_geometry(a: &OverlayRect, b: &OverlayRect) -> bool {
    (a.x, a.y, a.width, a.height) == (b.x, b.y, b.width, b.height)
}

/// Chọn màn hình và vị trí cho thanh phụ đề:
/// 1. màn hình của lần đặt gần nhất, nếu còn cắm;
/// 2. không thì màn hình đầu tiên có vị trí đã nhớ;
/// 3. không thì màn hình chính (hoặc màn hình đầu tiên), ở vị trí mặc định.
///
/// Vị trí luôn được kéo vào trong vùng làm việc, để thanh không nằm ngoài màn hình.
pub fn place(
    positions: &BTreeMap<String, OverlayRect>,
    last_screen: Option<&str>,
    screens: &[Screen],
    primary: Option<&str>,
) -> Option<Placement> {
    let saved = |key: &str| positions.get(key).copied();
    let by_key = |key: &str| screens.iter().find(|s| s.key == key);
    let screen = last_screen
        .and_then(by_key)
        .filter(|s| saved(&s.key).is_some())
        .or_else(|| screens.iter().find(|s| saved(&s.key).is_some()))
        .or_else(|| primary.and_then(by_key))
        .or_else(|| screens.first())?;
    let rect = clamp(screen, saved(&screen.key).unwrap_or_else(|| default_rect(screen)));
    Some(Placement {
        screen_key: screen.key.clone(),
        x: screen.x + (rect.x * screen.scale).round() as i32,
        y: screen.y + (rect.y * screen.scale).round() as i32,
        width: (rect.width * screen.scale).round() as u32,
        height: (rect.height * screen.scale).round() as u32,
    })
}

fn logical_size(screen: &Screen) -> (f64, f64) {
    (
        f64::from(screen.width) / screen.scale,
        f64::from(screen.height) / screen.scale,
    )
}

fn clamp(screen: &Screen, rect: OverlayRect) -> OverlayRect {
    let (w, h) = logical_size(screen);
    let width = rect.width.min(w);
    let height = rect.height.min(h);
    OverlayRect {
        x: rect.x.clamp(0.0, w - width),
        y: rect.y.clamp(0.0, h - height),
        width,
        height,
        ..rect
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn laptop() -> Screen {
        // MacBook Pro 14": 3024×1964 vật lý, scale 2, vùng làm việc trừ menu bar 37 px.
        Screen {
            key: screen_key(Some("Built-in Retina Display"), 3024, 1964),
            x: 0,
            y: 74,
            width: 3024,
            height: 1890,
            scale: 2.0,
        }
    }

    fn external() -> Screen {
        Screen {
            key: screen_key(Some("DELL U2723QE"), 2560, 1440),
            x: 3024,
            y: 0,
            width: 2560,
            height: 1400,
            scale: 1.0,
        }
    }

    #[test]
    fn screen_key_uses_name_and_resolution() {
        assert_eq!(screen_key(Some("DELL U2723QE"), 2560, 1440), "DELL U2723QE 2560x1440");
        assert_eq!(screen_key(None, 1920, 1080), "unknown 1920x1080");
        assert_eq!(screen_key(Some("  "), 1920, 1080), "unknown 1920x1080");
    }

    #[test]
    fn first_launch_goes_bottom_center_of_primary() {
        let screens = [external(), laptop()];
        let p = place(&BTreeMap::new(), None, &screens, Some(&laptop().key)).unwrap();
        // Màn hình logic 1512×945: rộng 900, x = (1512 − 900) / 2 = 306, y = 945 − 160 − 72 = 713.
        assert_eq!(
            p,
            Placement {
                screen_key: laptop().key,
                x: 612,
                y: 74 + 1426,
                width: 1800,
                height: 320
            }
        );
    }

    #[test]
    fn saved_position_is_restored_on_its_screen() {
        let rect = OverlayRect {
            x: 100.0,
            y: 50.0,
            width: 800.0,
            height: 120.0,
            last_used: 0,
        };
        let positions = BTreeMap::from([(external().key, rect)]);
        let screens = [laptop(), external()];
        let p = place(&positions, Some(&external().key), &screens, Some(&laptop().key)).unwrap();
        assert_eq!(
            p,
            Placement {
                screen_key: external().key,
                x: 3124,
                y: 50,
                width: 800,
                height: 120
            }
        );
    }

    #[test]
    fn relative_position_roundtrips_through_scale() {
        let screen = laptop();
        let rect = to_relative(&screen, 612, 1500, 1800, 320);
        assert_eq!(
            rect,
            OverlayRect {
                x: 306.0,
                y: 713.0,
                width: 900.0,
                height: 160.0,
                last_used: 0,
            }
        );
        let positions = BTreeMap::from([(screen.key.clone(), rect)]);
        let p = place(&positions, Some(&screen.key), std::slice::from_ref(&screen), None).unwrap();
        assert_eq!((p.x, p.y, p.width, p.height), (612, 1500, 1800, 320));
    }

    #[test]
    fn unplugged_screen_falls_back_to_another_saved_screen_then_default() {
        let on_laptop = OverlayRect {
            x: 10.0,
            y: 20.0,
            width: 700.0,
            height: 100.0,
            last_used: 0,
        };
        let on_external = OverlayRect {
            x: 0.0,
            y: 0.0,
            width: 900.0,
            height: 160.0,
            last_used: 0,
        };
        let positions = BTreeMap::from([(laptop().key, on_laptop), (external().key, on_external)]);
        // Màn hình ngoài đã rút: về vị trí đã nhớ trên laptop.
        let p = place(&positions, Some(&external().key), &[laptop()], None).unwrap();
        assert_eq!((p.screen_key.as_str(), p.x, p.y), (laptop().key.as_str(), 20, 74 + 40));
        // Không màn hình nào có vị trí đã nhớ: vị trí mặc định trên màn hình chính.
        let only_external = BTreeMap::from([(external().key, on_external)]);
        let p = place(&only_external, Some(&external().key), &[laptop()], Some(&laptop().key)).unwrap();
        assert_eq!((p.x, p.y), (612, 74 + 1426));
    }

    #[test]
    fn off_screen_position_is_pulled_back_inside() {
        let far = OverlayRect {
            x: 5000.0,
            y: -300.0,
            width: 3000.0,
            height: 160.0,
            last_used: 0,
        };
        let positions = BTreeMap::from([(external().key, far)]);
        let p = place(&positions, Some(&external().key), &[external()], None).unwrap();
        assert_eq!(
            p,
            Placement {
                screen_key: external().key,
                x: 3024,
                y: 0,
                width: 2560,
                height: 160
            }
        );
    }

    #[test]
    fn no_screen_means_no_placement() {
        assert_eq!(place(&BTreeMap::new(), None, &[], None), None);
    }

    #[test]
    fn narrow_screen_keeps_margins_in_default_rect() {
        let small = Screen {
            key: "small 800x600".into(),
            x: 0,
            y: 0,
            width: 800,
            height: 600,
            scale: 1.0,
        };
        assert_eq!(
            default_rect(&small),
            OverlayRect {
                x: 24.0,
                y: 368.0,
                width: 752.0,
                height: 160.0,
                last_used: 0,
            }
        );
    }

    fn rect_at(x: f64) -> OverlayRect {
        OverlayRect {
            x,
            y: 0.0,
            width: 900.0,
            height: 160.0,
            last_used: 0,
        }
    }

    #[test]
    fn remember_stamps_time_and_updates_in_place() {
        let mut positions = BTreeMap::new();
        remember(&mut positions, "a", rect_at(1.0), 100, 3);
        remember(&mut positions, "a", rect_at(2.0), 200, 3);
        assert_eq!(positions.len(), 1);
        assert_eq!(
            positions["a"],
            OverlayRect {
                last_used: 200,
                ..rect_at(2.0)
            }
        );
        assert!(same_geometry(&positions["a"], &rect_at(2.0)));
        assert!(!same_geometry(&positions["a"], &rect_at(3.0)));
    }

    #[test]
    fn remember_drops_the_least_recently_used_screen() {
        let mut positions = BTreeMap::new();
        remember(&mut positions, "b", rect_at(0.0), 300, 3);
        remember(&mut positions, "a", rect_at(0.0), 100, 3);
        remember(&mut positions, "c", rect_at(0.0), 200, 3);
        // Màn hình thứ tư: bỏ "a" (dùng lâu nhất), không phải "b" (đứng đầu theo thứ tự tên).
        remember(&mut positions, "d", rect_at(0.0), 400, 3);
        assert_eq!(positions.keys().collect::<Vec<_>>(), ["b", "c", "d"]);
        // Màn hình vừa nhớ không bao giờ bị bỏ, kể cả khi đồng hồ lùi.
        remember(&mut positions, "e", rect_at(0.0), 50, 3);
        assert_eq!(positions.keys().collect::<Vec<_>>(), ["b", "d", "e"]);
    }
}
