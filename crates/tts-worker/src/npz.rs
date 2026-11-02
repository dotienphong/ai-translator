//! Đọc file `.npz` KHÔNG nén (`numpy.savez`) mà không cần crate zip: mỗi mục là một file `.npy` lưu nguyên (method 0).
//! Chỉ hỗ trợ đúng những gì `vieneu_v3_heads.npz` có: mảng `<f4` / `<f8`, C-order, tối đa 3 chiều.

use std::collections::HashMap;
use std::fmt;
use std::path::Path;

/// Mảng số thực 32-bit, dàn phẳng theo thứ tự C.
#[derive(Debug, Clone, PartialEq)]
pub struct Array {
    pub shape: Vec<usize>,
    pub data: Vec<f32>,
}

#[derive(Debug)]
pub struct NpzError(pub String);

impl fmt::Display for NpzError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "npz: {}", self.0)
    }
}

impl std::error::Error for NpzError {}

fn err<T>(msg: impl Into<String>) -> Result<T, NpzError> {
    Err(NpzError(msg.into()))
}

fn u16_at(b: &[u8], o: usize) -> Result<u16, NpzError> {
    b.get(o..o + 2)
        .map(|s| u16::from_le_bytes([s[0], s[1]]))
        .ok_or_else(|| NpzError("cắt cụt".into()))
}

fn u32_at(b: &[u8], o: usize) -> Result<u32, NpzError> {
    b.get(o..o + 4)
        .map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
        .ok_or_else(|| NpzError("cắt cụt".into()))
}

/// Đọc cả file `.npz` thành bản đồ tên (bỏ đuôi `.npy`) → mảng.
pub fn read_npz(path: &Path) -> Result<HashMap<String, Array>, NpzError> {
    let bytes = std::fs::read(path).map_err(|e| NpzError(format!("{}: {e}", path.display())))?;
    parse_npz(&bytes)
}

pub fn parse_npz(b: &[u8]) -> Result<HashMap<String, Array>, NpzError> {
    // End Of Central Directory: tìm ngược từ cuối (có thể kèm chú thích tối đa 64 KiB).
    let min = b.len().saturating_sub(22 + 65_535);
    let eocd = (min..=b.len().saturating_sub(22))
        .rev()
        .find(|&i| b.get(i..i + 4) == Some(&[0x50, 0x4b, 0x05, 0x06]))
        .ok_or_else(|| NpzError("không thấy EOCD".into()))?;
    let count = u16_at(b, eocd + 10)? as usize;
    let mut cd = u32_at(b, eocd + 16)? as usize;
    if count == 0xFFFF || cd == 0xFFFF_FFFF {
        return err("ZIP64 không hỗ trợ");
    }
    let mut out = HashMap::new();
    for _ in 0..count {
        if b.get(cd..cd + 4) != Some(&[0x50, 0x4b, 0x01, 0x02]) {
            return err("mục thư mục trung tâm hỏng");
        }
        let method = u16_at(b, cd + 10)?;
        let comp = u32_at(b, cd + 20)? as usize;
        let size = u32_at(b, cd + 24)? as usize;
        let nlen = u16_at(b, cd + 28)? as usize;
        let elen = u16_at(b, cd + 30)? as usize;
        let clen = u16_at(b, cd + 32)? as usize;
        let local = u32_at(b, cd + 42)? as usize;
        let name = std::str::from_utf8(
            b.get(cd + 46..cd + 46 + nlen)
                .ok_or_else(|| NpzError("cắt cụt".into()))?,
        )
        .map_err(|_| NpzError("tên mục không phải UTF-8".into()))?
        .to_string();
        cd += 46 + nlen + elen + clen;
        if method != 0 || comp != size {
            return err(format!(
                "mục {name} có nén (method {method}); chỉ hỗ trợ file lưu không nén"
            ));
        }
        if b.get(local..local + 4) != Some(&[0x50, 0x4b, 0x03, 0x04]) {
            return err(format!("header cục bộ của {name} hỏng"));
        }
        let start = local + 30 + u16_at(b, local + 26)? as usize + u16_at(b, local + 28)? as usize;
        let body = b
            .get(start..start + size)
            .ok_or_else(|| NpzError(format!("{name}: dữ liệu bị cắt cụt")))?;
        out.insert(name.trim_end_matches(".npy").to_string(), parse_npy(body, &name)?);
    }
    Ok(out)
}

fn parse_npy(b: &[u8], name: &str) -> Result<Array, NpzError> {
    if b.get(..6) != Some(b"\x93NUMPY") {
        return err(format!("{name}: sai magic"));
    }
    let (hlen, hstart) = match b.get(6) {
        Some(1) => (u16_at(b, 8)? as usize, 10),
        Some(2) | Some(3) => (u32_at(b, 8)? as usize, 12),
        v => return err(format!("{name}: phiên bản npy {v:?} không hỗ trợ")),
    };
    let header = std::str::from_utf8(b.get(hstart..hstart + hlen).ok_or_else(|| NpzError("cắt cụt".into()))?)
        .map_err(|_| NpzError(format!("{name}: header không phải UTF-8")))?;
    let descr = field(header, "'descr':").ok_or_else(|| NpzError(format!("{name}: thiếu descr")))?;
    let descr = descr.trim().trim_matches(|c| c == '\'' || c == ',').to_string();
    if header.contains("'fortran_order': True") {
        return err(format!("{name}: Fortran order không hỗ trợ"));
    }
    let shape_txt = header
        .split("'shape':")
        .nth(1)
        .and_then(|s| s.split('(').nth(1))
        .and_then(|s| s.split(')').next())
        .ok_or_else(|| NpzError(format!("{name}: thiếu shape")))?;
    let shape: Vec<usize> = shape_txt
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| {
            s.parse::<usize>()
                .map_err(|_| NpzError(format!("{name}: shape lạ {shape_txt}")))
        })
        .collect::<Result<_, _>>()?;
    let n: usize = shape.iter().product();
    let body = &b[hstart + hlen..];
    let data: Vec<f32> = match descr.as_str() {
        "<f4" => {
            if body.len() < n * 4 {
                return err(format!("{name}: thiếu dữ liệu"));
            }
            body.as_chunks::<4>()
                .0
                .iter()
                .take(n)
                .map(|c| f32::from_le_bytes(*c))
                .collect()
        }
        "<f8" => {
            if body.len() < n * 8 {
                return err(format!("{name}: thiếu dữ liệu"));
            }
            body.as_chunks::<8>()
                .0
                .iter()
                .take(n)
                .map(|c| f64::from_le_bytes(*c) as f32)
                .collect()
        }
        other => return err(format!("{name}: dtype {other} không hỗ trợ")),
    };
    Ok(Array { shape, data })
}

fn field<'a>(header: &'a str, key: &str) -> Option<&'a str> {
    let rest = header.split(key).nth(1)?;
    Some(rest.split(',').next()?.trim())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Dựng tay một zip lưu không nén chứa một mảng `<f4` (2, 3).
    fn tiny_npz() -> Vec<u8> {
        let mut header = String::from("{'descr': '<f4', 'fortran_order': False, 'shape': (2, 3), }");
        while (10 + header.len() + 1) % 64 != 0 {
            header.push(' ');
        }
        header.push('\n');
        let mut npy = b"\x93NUMPY\x01\x00".to_vec();
        npy.extend((header.len() as u16).to_le_bytes());
        npy.extend(header.as_bytes());
        for v in [1.0f32, 2.0, 3.0, 4.0, 5.0, 6.5] {
            npy.extend(v.to_le_bytes());
        }
        let name = b"a.npy";
        let mut z = Vec::new();
        z.extend([0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        z.extend((npy.len() as u32).to_le_bytes());
        z.extend((npy.len() as u32).to_le_bytes());
        z.extend((name.len() as u16).to_le_bytes());
        z.extend([0, 0]);
        z.extend(name);
        z.extend(&npy);
        let cd_off = z.len() as u32;
        z.extend([0x50, 0x4b, 0x01, 0x02, 20, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        z.extend((npy.len() as u32).to_le_bytes());
        z.extend((npy.len() as u32).to_le_bytes());
        z.extend((name.len() as u16).to_le_bytes());
        z.extend([0u8; 16]); // extra, comment, disk, attrs ngoài, attrs, offset cục bộ = 0
        z.extend(name);
        let cd_len = z.len() as u32 - cd_off;
        z.extend([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 1, 0, 1, 0]);
        z.extend(cd_len.to_le_bytes());
        z.extend(cd_off.to_le_bytes());
        z.extend([0, 0]);
        z
    }

    #[test]
    fn reads_a_stored_npz() {
        let m = parse_npz(&tiny_npz()).unwrap();
        let a = &m["a"];
        assert_eq!(a.shape, vec![2, 3]);
        assert_eq!(a.data, vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.5]);
    }

    #[test]
    fn rejects_garbage_and_truncation() {
        assert!(parse_npz(b"not a zip").is_err());
        let z = tiny_npz();
        assert!(parse_npz(&z[..z.len() - 5]).is_err());
    }
}
