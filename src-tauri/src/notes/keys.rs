//! Đọc API key cho ghi chú: cùng mục kho khóa với dịch Cloud (`cloud_mt`), nên người dùng chỉ nhập key một lần.

use std::sync::Arc;

use tauri::{AppHandle, Manager, Runtime};

use crate::cloud_mt::{DEEPSEEK_KEY_ENTRY, GEMINI_KEY_ENTRY, OPENAI_KEY_ENTRY};
use crate::security::keystore::Keystore;
use crate::settings::NotesProvider;

/// Chạy `f` với kho khóa của app: dùng `Arc<Keystore>` đã `manage`, không có thì mở kho thật của hệ điều hành.
/// `None` khi không mở được kho.
pub fn with_keystore<R: Runtime, T>(app: &AppHandle<R>, f: impl FnOnce(&Keystore) -> T) -> Option<T> {
    if let Some(ks) = app.try_state::<Arc<Keystore>>() {
        return Some(f(ks.inner()));
    }
    let ks = Keystore::os(&app.config().identifier).ok()?;
    Some(f(&ks))
}

/// API key của nguồn đã chọn, cùng mục với dịch Cloud. Đã cắt khoảng trắng đầu cuối (key dán dư dòng mới không lọt vào header
/// HTTP); mục rỗng, không phải UTF-8 hay không đọc được là `None`; `Local` không có key.
pub fn api_key<R: Runtime>(app: &AppHandle<R>, provider: NotesProvider) -> Option<String> {
    let entry = match provider {
        NotesProvider::Local => return None,
        NotesProvider::Openai => OPENAI_KEY_ENTRY,
        NotesProvider::Gemini => GEMINI_KEY_ENTRY,
        NotesProvider::Deepseek => DEEPSEEK_KEY_ENTRY,
    };
    with_keystore(app, |ks| {
        let bytes = ks.get(entry).ok()??;
        let raw = String::from_utf8(bytes).ok()?;
        let trimmed = raw.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_string())
    })
    .flatten()
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;
    use crate::cloud_mt::{DEEPSEEK_KEY_ENTRY, GEMINI_KEY_ENTRY, OPENAI_KEY_ENTRY};
    use crate::security::keystore::Keystore;
    use crate::settings::NotesProvider;
    use crate::test_support::mock_app;
    use std::sync::Arc;
    use tauri::Manager;

    #[test]
    fn api_key_reads_the_entries_cloud_translation_uses() {
        let app = mock_app();
        let ks = app.state::<Arc<Keystore>>();
        assert_eq!(api_key(app.handle(), NotesProvider::Openai), None);
        ks.set(OPENAI_KEY_ENTRY, b" sk-1 ").unwrap();
        assert_eq!(api_key(app.handle(), NotesProvider::Openai), Some("sk-1".to_string()));
        assert_eq!(api_key(app.handle(), NotesProvider::Gemini), None);
        assert_eq!(api_key(app.handle(), NotesProvider::Local), None);
        // Dù có key ở mục nào thì Local vẫn không có key.
        ks.set(GEMINI_KEY_ENTRY, b"AIza-2\n").unwrap();
        assert_eq!(api_key(app.handle(), NotesProvider::Local), None);
    }

    #[test]
    fn deepseek_key_is_read_from_its_own_entry() {
        let app = mock_app();
        let ks = app.state::<Arc<Keystore>>();
        ks.set(OPENAI_KEY_ENTRY, b"sk-1").unwrap();
        assert_eq!(api_key(app.handle(), NotesProvider::Deepseek), None);
        ks.set(DEEPSEEK_KEY_ENTRY, b" ds-1\n").unwrap();
        assert_eq!(api_key(app.handle(), NotesProvider::Deepseek), Some("ds-1".to_string()));
    }

    #[test]
    fn gemini_key_is_trimmed() {
        let app = mock_app();
        let ks = app.state::<Arc<Keystore>>();
        ks.set(GEMINI_KEY_ENTRY, b"AIza-2\r\n").unwrap();
        assert_eq!(api_key(app.handle(), NotesProvider::Gemini), Some("AIza-2".to_string()));
    }

    #[test]
    fn blank_or_unreadable_entry_is_none() {
        let app = mock_app();
        let ks = app.state::<Arc<Keystore>>();
        for raw in [&b""[..], b"  \n\t ", &[0xff, 0xfe]] {
            ks.set(OPENAI_KEY_ENTRY, raw).unwrap();
            assert_eq!(api_key(app.handle(), NotesProvider::Openai), None, "mục {raw:?}");
        }
    }

    #[test]
    fn with_keystore_uses_the_managed_keystore() {
        let app = mock_app();
        let n = with_keystore(app.handle(), |ks| ks.set("probe", b"1").is_ok());
        assert_eq!(n, Some(true));
        assert_eq!(app.state::<Arc<Keystore>>().get("probe").unwrap(), Some(b"1".to_vec()));
    }
}
