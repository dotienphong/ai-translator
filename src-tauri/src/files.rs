//! Chọn file để lưu hay mở bằng hộp thoại của hệ điều hành (xuất bản chép lời, nhập và xuất từ điển CSV). Webview chặn
//! `blob:` và không được gọi lệnh của plugin nào (§10.2), nên phía Rust tự mở hộp thoại (`tauri-plugin-dialog`, chỉ dùng
//! từ Rust: không cửa sổ nào được cấp quyền `dialog:*`), rồi tự đọc ghi file.
//!
//! Đi qua trait [`FilePicker`]: app thật dùng hộp thoại, test dùng bản giả trả đường dẫn trong thư mục tạm. Hộp thoại chặn
//! tới khi người dùng chọn xong, nên chỉ gọi từ luồng nền (lệnh `async` + `spawn_blocking`), không từ luồng chính.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder};

use crate::errors::{self, CommandError};
use crate::window;

/// Một loại file cho hộp thoại: tên hiển thị và đuôi file.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FileType {
    pub name: &'static str,
    pub extension: &'static str,
}

pub const TXT: FileType = FileType {
    name: "Text",
    extension: "txt",
};
pub const SRT: FileType = FileType {
    name: "SubRip",
    extension: "srt",
};
pub const MARKDOWN: FileType = FileType {
    name: "Markdown",
    extension: "md",
};
pub const CSV: FileType = FileType {
    name: "CSV",
    extension: "csv",
};

/// File CSV nhập vào lớn hơn chừng này thì từ chối: 500 cặp, mỗi ô 200 ký tự, chưa tới 1 MiB.
pub const MAX_IMPORT_BYTES: u64 = 1 << 20;

pub trait FilePicker: Send + Sync + 'static {
    /// Hỏi chỗ lưu, gợi ý tên `file_name`. `None`: người dùng bấm Hủy.
    fn save(&self, file_name: &str, kind: FileType) -> Option<PathBuf>;
    /// Hỏi một file để mở. `None`: người dùng bấm Hủy.
    fn open(&self, kind: FileType) -> Option<PathBuf>;
}

/// `FilePicker` đang dùng, quản lý bằng `app.manage`.
pub struct Picker(pub Box<dyn FilePicker>);

struct Dialogs<R: Runtime>(AppHandle<R>);

impl<R: Runtime> Dialogs<R> {
    /// Hộp thoại gắn vào cửa sổ chính (N12 của review 03): trên macOS nó hiện như sheet của cửa sổ chính, không mở thành
    /// cửa sổ riêng có thể nằm sau cửa sổ chính.
    fn builder(&self) -> FileDialogBuilder<R> {
        let builder = self.0.dialog().file();
        match self.0.get_webview_window(window::MAIN) {
            Some(main) => builder.set_parent(&main),
            None => builder,
        }
    }
}

impl<R: Runtime> FilePicker for Dialogs<R> {
    fn save(&self, file_name: &str, kind: FileType) -> Option<PathBuf> {
        self.builder()
            .set_file_name(file_name)
            .add_filter(kind.name, &[kind.extension])
            .blocking_save_file()
            .and_then(|p| p.into_path().ok())
    }

    fn open(&self, kind: FileType) -> Option<PathBuf> {
        self.builder()
            .add_filter(kind.name, &[kind.extension])
            .blocking_pick_file()
            .and_then(|p| p.into_path().ok())
    }
}

/// Cài hộp thoại thật. Gọi ở `setup`, sau khi đã đăng ký `tauri_plugin_dialog`.
pub fn install<R: Runtime>(app: &AppHandle<R>) {
    app.manage(Picker(Box::new(Dialogs(app.clone()))));
}

fn picker<R: Runtime>(app: &AppHandle<R>) -> Result<tauri::State<'_, Picker>, CommandError> {
    app.try_state::<Picker>()
        .ok_or_else(|| CommandError::new(errors::FILE_FAILED, None, "chưa cài FilePicker"))
}

/// Hỏi chỗ lưu rồi ghi `content`. Trả đường dẫn đã ghi, hoặc `None` nếu người dùng hủy.
pub fn save_as<R: Runtime>(
    app: &AppHandle<R>,
    file_name: &str,
    kind: FileType,
    content: &str,
) -> Result<Option<String>, CommandError> {
    let Some(path) = picker(app)?.0.save(file_name, kind) else {
        return Ok(None);
    };
    std::fs::write(&path, content).map_err(|e| file_error(&path, e))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Hỏi một file rồi đọc nó (tối đa [`MAX_IMPORT_BYTES`]). `None` nếu người dùng hủy.
pub fn open_bytes<R: Runtime>(app: &AppHandle<R>, kind: FileType) -> Result<Option<Vec<u8>>, CommandError> {
    let Some(path) = picker(app)?.0.open(kind) else {
        return Ok(None);
    };
    let size = std::fs::metadata(&path).map_err(|e| file_error(&path, e))?.len();
    if size > MAX_IMPORT_BYTES {
        return Err(CommandError::new(errors::FILE_TOO_LARGE, None, format!("{size} byte")));
    }
    std::fs::read(&path).map(Some).map_err(|e| file_error(&path, e))
}

fn file_error(path: &Path, e: std::io::Error) -> CommandError {
    // Đường dẫn có thể chứa tên người dùng: chỉ ghi vào `message` (log, hỗ trợ), giao diện hiện câu chung.
    CommandError::new(errors::FILE_FAILED, None, format!("{}: {e}", path.display()))
}
