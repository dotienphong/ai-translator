//! Kiểm và tải bản cập nhật qua `tauri-plugin-updater` (kế hoạch 07b). Phần điều phối (`super`) chỉ thấy ba trait ở
//! đây, để test dùng bản giả; bản thật bọc plugin.
//!
//! Plugin lo phần an ninh: kiểm chữ ký minisign của file tải về bằng khóa công khai build sẵn, và vì `requireSignedVersion`
//! bật, phiên bản ghi trong chữ ký phải đúng phiên bản mà manifest báo. Chữ ký sai thì `download` lỗi và không file nào
//! được ghi. App đặt bộ so phiên bản ([`accepts`]): chỉ nhận bản mới hơn bản đang chạy, và kênh stable không nhận bản
//! pre-release, vì manifest không ký nên ai ghi được CDN có thể đặt một bản beta (chữ ký vẫn đúng) vào kênh stable.

use std::path::Path;
use std::time::Duration;

use reqwest::Url;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Runtime};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::settings::UpdateChannel;

/// Chờ manifest tối đa chừng này. Tải bộ cài không giới hạn thời gian (file vài chục MB, mạng chậm).
pub const CHECK_TIMEOUT: Duration = Duration::from_secs(30);

/// Có nhận một bản ở kênh `channel` không: phải mới hơn bản đang chạy theo semver (`newer`; không hạ cấp, không cài lại),
/// và kênh stable không nhận bản pre-release (`X.Y.Z-beta.N`).
pub fn accepts(newer: bool, pre_release: bool, channel: UpdateChannel) -> bool {
    newer && (channel == UpdateChannel::Beta || !pre_release)
}

/// Hỏi manifest của một kênh.
pub trait Backend: Send + Sync + 'static {
    /// `Ok(None)`: không có bản nào mà kênh này nhận ([`accepts`]).
    fn check(&self, endpoint: &Url, channel: UpdateChannel) -> Result<Option<Box<dyn Found>>, String>;
}

/// Một bản mới hơn mà manifest báo, chưa tải.
pub trait Found: Send {
    fn version(&self) -> &str;
    /// Tải, kiểm chữ ký, rồi mới ghi vào `dest` (ghi file tạm rồi đổi tên). Lỗi thì `dest` không đổi.
    fn download(self: Box<Self>, dest: &Path) -> Result<Downloaded, String>;
}

/// Bản đã tải: cách cài, và SHA-256 của đúng các byte đã kiểm chữ ký, để lúc cài so lại file trên đĩa.
pub struct Downloaded {
    pub installer: Box<dyn Install>,
    pub sha256: [u8; 32],
}

/// Cài một bản đã tải. macOS: thay gói `.app` tại chỗ. Windows: chạy bộ cài NSIS (`/UPDATE`, chế độ passive) rồi
/// thoát tiến trình ngay (`std::process::exit(0)` trong plugin); `restart` thì bộ cài mở lại app sau khi cài.
pub trait Install: Send + Sync {
    fn install(&self, bytes: &[u8], restart: bool) -> Result<(), String>;
}

/// Bản thật: plugin của app (khóa công khai nạp lúc đăng ký plugin, `super::plugin`).
pub struct PluginBackend<R: Runtime>(pub AppHandle<R>);

impl<R: Runtime> Backend for PluginBackend<R> {
    fn check(&self, endpoint: &Url, channel: UpdateChannel) -> Result<Option<Box<dyn Found>>, String> {
        let updater = self
            .0
            .updater_builder()
            .endpoints(vec![endpoint.clone()])
            .map_err(|e| e.to_string())?
            .version_comparator(move |current, release| {
                accepts(release.version > current, !release.version.pre.is_empty(), channel)
            })
            .timeout(CHECK_TIMEOUT)
            .build()
            .map_err(|e| e.to_string())?;
        let update = tauri::async_runtime::block_on(updater.check()).map_err(|e| e.to_string())?;
        Ok(update.map(|u| Box::new(PluginFound(u)) as Box<dyn Found>))
    }
}

struct PluginFound(Update);

impl Found for PluginFound {
    fn version(&self) -> &str {
        &self.0.version
    }

    fn download(self: Box<Self>, dest: &Path) -> Result<Downloaded, String> {
        let bytes = tauri::async_runtime::block_on(self.0.download(|_, _| {}, || {})).map_err(|e| e.to_string())?;
        write_atomically(dest, &bytes)?;
        Ok(Downloaded {
            installer: Box::new(PluginInstall(self.0)),
            sha256: Sha256::digest(&bytes).into(),
        })
    }
}

struct PluginInstall(Update);

impl Install for PluginInstall {
    fn install(&self, bytes: &[u8], restart: bool) -> Result<(), String> {
        self.0
            .clone()
            .restart_after_install(restart)
            .install(bytes)
            .map_err(|e| e.to_string())
    }
}

/// Ghi `bytes` vào `dest` qua một file tạm cùng thư mục, để không bao giờ có `dest` ghi dở.
pub fn write_atomically(dest: &Path, bytes: &[u8]) -> Result<(), String> {
    let dir = dest.parent().ok_or("đường dẫn không có thư mục cha")?;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = dest.with_extension("part");
    std::fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dest).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e.to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::test_http::{FakeServer, Fault};
    use crate::settings::UpdateChannel;
    use crate::updater::source::tests::TEST_PUBKEY;
    use tauri::test::{MockRuntime, mock_builder};

    const PAYLOAD: &[u8] = include_bytes!("testdata/update-0.9.0.bin");
    const SIG: &str = include_str!("testdata/update-0.9.0.sig");
    /// `latest.json` mà `scripts/release/update-manifest.mjs` sinh cho bản 0.9.0 (test của script so đúng file này).
    const LATEST: &str = include_str!("testdata/latest.json");
    const FIXTURE_BASE: &str = "https://releases.example.com/desktop";

    /// App giả có plugin cập nhật với khóa thử; phiên bản app là 0.1.0 (`tauri.conf.json`).
    fn app() -> tauri::App<MockRuntime> {
        mock_builder()
            .plugin(tauri_plugin_updater::Builder::new().pubkey(TEST_PUBKEY.trim()).build())
            .build(tauri::generate_context!(test = true))
            .expect("dựng được app giả")
    }

    /// Server giả phục vụ `latest.json` (đổi URL gốc sang server) và hai bộ cài, với chữ ký `sig`.
    fn serve(version: &str, sig: &str) -> FakeServer {
        let server = FakeServer::start();
        let base = server.url("/desktop").to_string();
        let manifest = LATEST
            .replace(FIXTURE_BASE, base.trim_end_matches('/'))
            .replace("\"version\": \"0.9.0\"", &format!("\"version\": \"{version}\""))
            .replace(SIG.trim(), sig.trim());
        server.put("desktop/stable/latest.json", manifest.as_bytes());
        server.put("desktop/0.9.0/AI%20Translator.app.tar.gz", PAYLOAD);
        server.put("desktop/0.9.0/AI%20Translator_0.9.0_x64-setup.exe", PAYLOAD);
        server
    }

    fn dest() -> std::path::PathBuf {
        static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let n = NEXT.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("mt-updater-{}-{n}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir.join("update.bin")
    }

    fn check(server: &FakeServer, app: &tauri::App<MockRuntime>) -> Result<Option<Box<dyn Found>>, String> {
        check_on(server, app, UpdateChannel::Stable)
    }

    fn check_on(
        server: &FakeServer,
        app: &tauri::App<MockRuntime>,
        channel: UpdateChannel,
    ) -> Result<Option<Box<dyn Found>>, String> {
        PluginBackend(app.handle().clone()).check(&server.url("/desktop/stable/latest.json"), channel)
    }

    #[test]
    fn finds_downloads_and_verifies_the_manifest_the_release_script_writes() {
        let app = app();
        let server = serve("0.9.0", SIG);
        let found = check(&server, &app).unwrap().expect("0.9.0 mới hơn 0.1.0");
        assert_eq!(found.version(), "0.9.0");
        let dest = dest();
        let downloaded = found.download(&dest).unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), PAYLOAD);
        assert_eq!(downloaded.sha256, <[u8; 32]>::from(Sha256::digest(PAYLOAD)), "SHA-256 của đúng các byte đã kiểm");
        assert!(!dest.with_extension("part").exists());
        let installer = if cfg!(windows) { "x64-setup.exe" } else { "app.tar.gz" };
        assert!(
            server.requests().iter().any(|r| r.path.ends_with(installer)),
            "{:?}",
            server.requests()
        );
    }

    #[test]
    fn no_update_when_the_manifest_is_not_newer() {
        let app = app();
        for version in ["0.1.0", "0.0.9", "0.1.0-beta.1"] {
            let server = serve(version, SIG);
            assert!(check(&server, &app).unwrap().is_none(), "{version}");
        }
    }

    /// Manifest không ký: ai ghi được CDN có thể đặt bản beta (chữ ký vẫn đúng) vào `stable/latest.json`.
    #[test]
    fn the_stable_channel_never_takes_a_pre_release() {
        let app = app();
        let server = serve("0.9.0-beta.1", SIG);
        assert!(check_on(&server, &app, UpdateChannel::Stable).unwrap().is_none());
        let found = check_on(&server, &app, UpdateChannel::Beta).unwrap().expect("kênh beta nhận bản beta");
        assert_eq!(found.version(), "0.9.0-beta.1");
    }

    #[test]
    fn accepts_only_newer_and_no_pre_release_on_stable() {
        use UpdateChannel::{Beta, Stable};
        assert!(accepts(true, false, Stable) && accepts(true, false, Beta));
        assert!(accepts(true, true, Beta));
        assert!(!accepts(true, true, Stable), "beta vào stable");
        assert!(!accepts(false, false, Stable) && !accepts(false, true, Beta), "không mới hơn");
    }

    #[test]
    fn bad_signatures_never_reach_the_disk() {
        let app = app();
        for (name, sig) in [
            ("ký cho bản 0.8.0", include_str!("testdata/signed-as-0.8.0.sig")),
            ("chữ ký không gắn phiên bản", include_str!("testdata/no-version.sig")),
            ("khóa khác", include_str!("testdata/other-key.sig")),
        ] {
            let server = serve("0.9.0", sig);
            let found = check(&server, &app).unwrap().expect("manifest báo bản mới");
            let dest = dest();
            assert!(found.download(&dest).is_err(), "{name}");
            assert!(!dest.exists() && !dest.with_extension("part").exists(), "{name}");
        }
        // File bị đổi trên đường đi.
        let server = serve("0.9.0", SIG);
        let found = check(&server, &app).unwrap().unwrap();
        server.fault(Fault::Corrupt);
        let dest = dest();
        assert!(found.download(&dest).is_err());
        assert!(!dest.exists());
    }

    #[test]
    fn server_errors_are_errors_not_no_update() {
        let app = app();
        let server = serve("0.9.0", SIG);
        server.fault(Fault::Status(500));
        assert!(check(&server, &app).is_err());
        let empty = FakeServer::start();
        assert!(check(&empty, &app).is_err(), "404");
        let broken = FakeServer::start();
        broken.put("desktop/stable/latest.json", b"{\"version\": 1}");
        assert!(check(&broken, &app).is_err());
    }
}
