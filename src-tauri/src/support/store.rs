//! File `support.json` trong thư mục dữ liệu của app (spec 2026-10-22-chat-ho-tro-zalo-design.md §4): token của cuộc chat, con
//! trỏ `lastId` và `waitingSince` như hợp đồng phía khách, thêm `unread` để chấm đỏ còn sau khi mở lại app. Không dùng kho khóa:
//! token chỉ mở được cuộc chat, và kho khóa của macOS ký ad-hoc hỏi quyền. Chưa có cuộc chat thì không có file.

use std::io;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// Nội dung của `support.json`.
#[derive(Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Saved {
    /// Token của cuộc chat (43 ký tự base64url); `None` là chưa có cuộc chat.
    pub token: Option<String>,
    /// `id` lớn nhất đã nhận qua lần hỏi tin (con trỏ `after`).
    #[serde(default)]
    pub last_id: i64,
    /// Giây Unix của tin khách cuối chưa có trả lời; `None` khi không chờ.
    #[serde(default)]
    pub waiting_since: Option<i64>,
    /// Có câu trả lời mới chưa xem (chấm đỏ ở mục Hỗ trợ).
    #[serde(default)]
    pub unread: bool,
}

// Token mở được cả cuộc chat: `Debug` (log, `assert!`) không bao giờ in nó.
impl std::fmt::Debug for Saved {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Saved")
            .field("token", &self.token.as_ref().map(|_| "<ẩn>"))
            .field("last_id", &self.last_id)
            .field("waiting_since", &self.waiting_since)
            .field("unread", &self.unread)
            .finish()
    }
}

/// Token đúng dạng của hợp đồng: 43 ký tự base64url (32 byte ngẫu nhiên).
pub fn token_ok(token: &str) -> bool {
    token.len() == 43
        && token
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

pub struct Store {
    path: PathBuf,
}

impl Store {
    /// `path`: đường dẫn đầy đủ của `support.json` (thư mục được tạo khi ghi).
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    /// Đọc file. Không có, hỏng, hay token sai dạng thì như chưa có cuộc chat.
    pub fn load(&self) -> Saved {
        let saved: Saved = std::fs::read(&self.path)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        match saved.token.as_deref() {
            Some(token) if token_ok(token) => Saved {
                last_id: saved.last_id.max(0),
                ..saved
            },
            _ => Saved::default(),
        }
    }

    /// Ghi file (ghi file tạm rồi đổi tên, để không bao giờ còn nửa file). Không có token thì xóa file.
    pub fn save(&self, saved: &Saved) -> io::Result<()> {
        if saved.token.is_none() {
            return match std::fs::remove_file(&self.path) {
                Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e),
                _ => Ok(()),
            };
        }
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let bytes = serde_json::to_vec(saved).map_err(io::Error::other)?;
        let tmp = self.path.with_extension("json.tmp");
        std::fs::write(&tmp, bytes)?;
        std::fs::rename(&tmp, &self.path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOKEN: &str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-_6";

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mt-support-store-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir.join("support.json")
    }

    /// Dọn thư mục tạm của test.
    fn done(path: &std::path::Path) {
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn a_conversation_survives_a_restart_with_the_contract_keys() {
        let path = temp("roundtrip");
        let store = Store::new(path.clone());
        let saved = Saved {
            token: Some(TOKEN.into()),
            last_id: 42,
            waiting_since: Some(1_800_000_000),
            unread: true,
        };
        store.save(&saved).unwrap();
        assert_eq!(Store::new(path.clone()).load(), saved);
        let raw: serde_json::Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(
            raw,
            serde_json::json!({ "token": TOKEN, "lastId": 42, "waitingSince": 1_800_000_000, "unread": true })
        );
        assert!(!path.with_extension("json.tmp").exists(), "không còn file tạm");
        done(&path);
    }

    #[test]
    fn debug_output_never_shows_the_token() {
        let saved = Saved {
            token: Some(TOKEN.into()),
            last_id: 3,
            ..Saved::default()
        };
        let shown = format!("{saved:?}");
        assert!(!shown.contains(TOKEN) && !shown.contains("abcdefgh"), "{shown}");
        assert!(shown.contains("last_id: 3"), "{shown}");
        assert!(
            !format!("{:?}", Saved::default()).contains("ẩn"),
            "không token thì không có gì để che"
        );
    }

    #[test]
    fn no_conversation_means_no_file() {
        let path = temp("forget");
        let store = Store::new(path.clone());
        assert_eq!(store.load(), Saved::default(), "chưa có file");
        store.save(&Saved::default()).unwrap();
        assert!(!path.exists());
        store
            .save(&Saved {
                token: Some(TOKEN.into()),
                ..Saved::default()
            })
            .unwrap();
        assert!(path.exists());
        store.save(&Saved::default()).unwrap();
        assert!(!path.exists(), "xóa cuộc chat thì xóa file");
        done(&path);
    }

    #[test]
    fn a_broken_file_or_a_bad_token_is_ignored() {
        let path = temp("broken");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, b"{ not json").unwrap();
        assert_eq!(Store::new(path.clone()).load(), Saved::default());
        std::fs::write(&path, br#"{"token":"short","lastId":3}"#).unwrap();
        assert_eq!(Store::new(path.clone()).load(), Saved::default());
        std::fs::write(&path, format!(r#"{{"token":"{TOKEN}","lastId":-5}}"#)).unwrap();
        assert_eq!(
            Store::new(path.clone()).load(),
            Saved {
                token: Some(TOKEN.into()),
                ..Saved::default()
            },
            "thiếu khóa thì lấy mặc định, con trỏ âm thành 0"
        );
        done(&path);
    }

    #[test]
    fn only_base64url_tokens_of_43_chars_are_accepted() {
        assert!(token_ok(TOKEN));
        assert!(!token_ok(&TOKEN[..42]));
        assert!(!token_ok(&format!("{}=", &TOKEN[..42])));
        assert!(!token_ok(&format!("{}/", &TOKEN[..42])));
    }
}
