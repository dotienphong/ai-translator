//! Dấu chấm trên icon khay khi có bản cập nhật (spec 2026-10-23-cap-nhat-model-tu-dong §6.2). Vẽ lên ảnh RGBA của icon gốc
//! lúc chạy, không thêm file ảnh.

/// Kiểu dấu chấm theo loại icon.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BadgeStyle {
    /// macOS: icon template đơn sắc (hệ thống chỉ dùng kênh alpha). Chấm đặc, khoét viền trong suốt quanh chấm để tách khỏi
    /// hình khung phụ đề; hệ thống tự tô màu theo menu bar sáng, tối.
    Template,
    /// Windows: icon màu của app. Chấm đỏ có viền trắng.
    Color,
}

const INK: [u8; 4] = [0, 0, 0, 0xFF];
const CLEAR: [u8; 4] = [0, 0, 0, 0];
const RED: [u8; 4] = [0xE5, 0x48, 0x4D, 0xFF];
const WHITE: [u8; 4] = [0xFF, 0xFF, 0xFF, 0xFF];

/// Bán kính chấm và độ dày viền theo cạnh ngắn của icon. Template 44 px: chấm bán kính 5, viền 2. Color: đường kính khoảng
/// 35% cạnh.
fn geometry(style: BadgeStyle, size: f32) -> (f32, f32) {
    match style {
        BadgeStyle::Template => (size * 5.0 / 44.0, size * 2.0 / 44.0),
        BadgeStyle::Color => (size * 0.175, size * 0.06),
    }
}

/// Ảnh RGBA mới có dấu chấm ở góc trên phải (chấm và viền nằm gọn trong ảnh). `rgba` dài đúng `width * height * 4`.
pub fn with_badge(rgba: &[u8], width: u32, height: u32, style: BadgeStyle) -> Vec<u8> {
    assert_eq!(rgba.len(), (width * height * 4) as usize, "ảnh RGBA sai kích thước");
    let (radius, ring) = geometry(style, width.min(height) as f32);
    let (cx, cy) = (width as f32 - radius - ring, radius + ring);
    let (dot, edge) = match style {
        BadgeStyle::Template => (INK, CLEAR),
        BadgeStyle::Color => (RED, WHITE),
    };
    let mut out = rgba.to_vec();
    for y in 0..height {
        for x in 0..width {
            let d = ((x as f32 + 0.5 - cx).powi(2) + (y as f32 + 0.5 - cy).powi(2)).sqrt();
            let color = if d <= radius {
                dot
            } else if d <= radius + ring {
                edge
            } else {
                continue;
            };
            let i = ((y * width + x) * 4) as usize;
            out[i..i + 4].copy_from_slice(&color);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn px(img: &[u8], width: u32, x: u32, y: u32) -> [u8; 4] {
        let i = ((y * width + x) * 4) as usize;
        img[i..i + 4].try_into().unwrap()
    }

    /// Template 44 px: tâm chấm ở (37, 7), bán kính 5, viền tới 7.
    #[test]
    fn template_dot_is_ink_with_a_clear_ring() {
        let (w, h) = (44, 44);
        let base = vec![0x11; (w * h * 4) as usize];
        let out = with_badge(&base, w, h, BadgeStyle::Template);
        assert_eq!(out.len(), base.len());
        assert_eq!(px(&out, w, 36, 6), INK, "tâm chấm");
        assert_eq!(px(&out, w, 30, 6), CLEAR, "viền (cách tâm 6,5)");
        assert_eq!(px(&out, w, 29, 6), [0x11; 4], "ngoài viền (cách tâm 7,5)");
        assert_eq!(px(&out, w, 0, 43), [0x11; 4], "góc dưới trái không đổi");
    }

    /// Color 32 px: bán kính 5,6, viền 1,92, tâm khoảng (24,48; 7,52).
    #[test]
    fn color_dot_is_red_with_a_white_ring() {
        let (w, h) = (32, 32);
        let base = vec![0x22; (w * h * 4) as usize];
        let out = with_badge(&base, w, h, BadgeStyle::Color);
        assert_eq!(px(&out, w, 24, 7), RED, "tâm chấm");
        assert_eq!(px(&out, w, 17, 7), WHITE, "viền (cách tâm khoảng 6,98)");
        assert_eq!(px(&out, w, 16, 7), [0x22; 4], "ngoài viền (cách tâm khoảng 7,98)");
        assert_eq!(px(&out, w, 0, 31), [0x22; 4], "góc dưới trái không đổi");
    }

    /// Mọi cỡ icon thường gặp: chấm và viền nằm gọn trong ảnh (không tràn mép), góc trên phải có chấm.
    #[test]
    fn the_badge_fits_common_icon_sizes() {
        for size in [16u32, 22, 32, 44, 64, 128, 256] {
            for style in [BadgeStyle::Template, BadgeStyle::Color] {
                let base = vec![0x33; (size * size * 4) as usize];
                let out = with_badge(&base, size, size, style);
                let (radius, ring) = geometry(style, size as f32);
                let cx = size as f32 - radius - ring;
                let cy = radius + ring;
                assert!(cx + radius + ring <= size as f32 + 1e-3 && cy - radius - ring >= -1e-3, "{size} {style:?}");
                let dot = if style == BadgeStyle::Template { INK } else { RED };
                assert_eq!(px(&out, size, cx as u32, cy as u32), dot, "{size} {style:?}");
            }
        }
    }

    #[test]
    #[should_panic(expected = "ảnh RGBA sai kích thước")]
    fn a_buffer_of_the_wrong_size_is_a_bug() {
        with_badge(&[0; 12], 2, 2, BadgeStyle::Color);
    }
}
