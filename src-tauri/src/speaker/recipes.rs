//! Công thức đọc tên tải từ xa có ký số (spec 2026-10-26-phan-biet-nguoi-noi §7.1; kế hoạch 06). Bản mới đăng ở [`RECIPES_URL`] mà không cần
//! phát hành app; chỉ là **dữ liệu** (mô tả, không mã), nên khóa ký có bị lộ cũng không thêm được app hay mở đường gửi dữ liệu đi.
//!
//! - App tải lúc mở (sau [`FIRST_CHECK_DELAY`]) rồi mỗi [`CHECK_EVERY`], **chỉ khi** tính năng đang bật cho người dùng này ([`wanted`]:
//!   công tắc nội bộ, "Phân biệt người nói" và "Lấy tên") **và** manifest có mục `speaker` cho bản này
//!   ([`crate::models::service::ModelService::speaker_offered`]; chưa có thì "ngủ", không tải gì). Một lệnh GET không kèm mã máy hay thông tin gì của người dùng.
//! - Kiểm bằng `speaker_ops`: phong bì ký riêng (`envelope`), rồi luật nhận (`recipes::judge`: đọc được, `min_app_version`, không nhận số
//!   cũ hơn bản đang có). Lỗi gì cũng giữ bản đang có. Bản nhận được lưu nguyên văn trên máy và kiểm lại chữ ký mỗi lần nạp.
//! - Bản đang có là bản lớn hơn trong bản build sẵn và bản đã lưu. [`body`] đưa phần thân đó vào `Load.names.recipe_json` ở đầu mỗi phiên;
//!   worker kiểm lại cấu trúc. Công thức mới áp dụng từ **phiên dịch sau** (worker của phiên đang chạy giữ bản cũ).
//! - Log chỉ có số phiên bản và loại kết quả; không có nội dung công thức, URL hay khóa.

use std::io::Read;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use reqwest::Url;
use reqwest::blocking::Client;
use speaker_ops::envelope::{MAX_ENVELOPE_BYTES, TrustedKey};
use speaker_ops::recipes::{Active, RecipeStore, choose};
use tauri::{AppHandle, Manager, Runtime};

use crate::models::service::ModelService;
use crate::models::{download, signed};
use crate::settings::Settings;
use crate::state::AppState;

/// URL công thức đang phát hành: cùng bucket và tên miền với `models.json` (spec 2026-10-23-ten-mien-aitranslator-vn). Trùng `RECIPES_URL`
/// của `scripts/speaker-recipes/update-lib.mjs` (có test).
pub const RECIPES_URL: &str = "https://releases.aitranslator.vn/speaker/recipes.json";
/// File công thức đã tải, trong thư mục dữ liệu của app.
pub const FILE_NAME: &str = "speaker-recipes.json";
/// Kiểm lại mỗi chừng này (spec §7.1: "lúc mở và mỗi 6 giờ").
pub const CHECK_EVERY: Duration = Duration::from_secs(6 * 3600);
/// Lần kiểm đầu sau khi mở app: để không tranh việc khởi động.
pub const FIRST_CHECK_DELAY: Duration = Duration::from_secs(20);

/// Kết quả một lần kiểm; không mang nội dung công thức.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Outcome {
    /// Nhận bản mới (số phiên bản).
    Updated(u32),
    /// Đúng bản đang có.
    Unchanged,
    /// Bản tải về bị từ chối (chữ ký, quay lui, cần app mới hơn…); giữ bản đang có.
    Refused(String),
    /// Không tải được (mạng, HTTP, chưa có nguồn).
    Failed(String),
}

pub struct RecipeService {
    store: RecipeStore,
    keys: Vec<TrustedKey>,
    app_version: String,
    url: Option<Url>,
    client: OnceLock<Option<Client>>,
    active: Mutex<Active>,
}

/// Khóa công khai của manifest model, dùng cho công thức (cùng khóa ký trong CI, tiền tố ký riêng).
pub fn trusted_keys() -> Vec<TrustedKey> {
    signed::trusted_keys()
        .into_iter()
        .map(|k| TrustedKey { kid: k.kid, key: k.key })
        .collect()
}

/// URL của mọi bản build: production, chỉ `https`.
pub fn production_url() -> Option<Url> {
    Url::parse(RECIPES_URL).ok().filter(|u| u.scheme() == "https")
}

/// Có tải công thức không: công tắc nội bộ (`enabled`) bật và người dùng bật cả "Phân biệt người nói" lẫn "Lấy tên". Không bật thì không
/// có lệnh gọi mạng nào.
pub fn wanted(enabled: bool, settings: &Settings) -> bool {
    enabled && settings.speaker_diarization && settings.speaker_names
}

fn fetch(client: &Client, url: &Url) -> Result<Vec<u8>, String> {
    let response = client
        .get(url.clone())
        .send()
        .map_err(|e| format!("mạng: {}", e.without_url()))?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status().as_u16()));
    }
    let mut raw = Vec::new();
    response
        .take(MAX_ENVELOPE_BYTES as u64 + 1)
        .read_to_end(&mut raw)
        .map_err(|e| format!("mạng: {e}"))?;
    Ok(raw)
}

impl RecipeService {
    /// Nạp công thức đã lưu (nếu còn hợp lệ so với bản build sẵn) và chọn bản đang có.
    pub fn new(path: PathBuf, keys: Vec<TrustedKey>, app_version: String, url: Option<Url>) -> Self {
        let builtin = Active::builtin();
        let store = RecipeStore::new(path);
        let active = choose(builtin.clone(), store.load(&keys, &app_version, &builtin));
        Self {
            store,
            keys,
            app_version,
            url,
            client: OnceLock::new(),
            active: Mutex::new(active),
        }
    }

    pub fn active(&self) -> Active {
        self.active.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    /// Phần thân công thức đang có (chuỗi JSON), cho `Load.names.recipe_json`.
    pub fn body(&self) -> String {
        self.active().body
    }

    fn client(&self) -> Option<&Client> {
        self.client
            .get_or_init(|| {
                download::client()
                    .map_err(|e| log::error!("không tạo được client HTTP cho công thức đọc tên: {e}"))
                    .ok()
            })
            .as_ref()
    }

    /// Tải và xét một lần. Chặn trong lúc gọi mạng: gọi từ luồng nền.
    pub fn check(&self) -> Outcome {
        let (Some(url), Some(client)) = (self.url.as_ref(), self.client()) else {
            return Outcome::Failed("chưa có nguồn".into());
        };
        let raw = match fetch(client, url) {
            Ok(raw) => raw,
            Err(e) => return Outcome::Failed(e),
        };
        let current = self.active();
        match self.store.consider(&raw, &self.keys, &self.app_version, &current) {
            Ok(Some(new)) => {
                let version = new.version;
                *self.active.lock().unwrap_or_else(|e| e.into_inner()) = new;
                Outcome::Updated(version)
            }
            Ok(None) => Outcome::Unchanged,
            Err(e) => Outcome::Refused(e.to_string()),
        }
    }
}

/// Phần thân công thức cho `Load` của phiên này: bản đang có của dịch vụ, hay bản build sẵn khi chưa có dịch vụ (test, công cụ).
pub fn body<R: Runtime>(app: &AppHandle<R>) -> String {
    app.try_state::<Arc<RecipeService>>()
        .map_or_else(|| speaker_recipe::BUILTIN_JSON.to_string(), |s| s.body())
}

/// Cài dịch vụ lúc khởi động (`setup`, sau `AppState`): nạp bản đã lưu và chạy luồng kiểm nền. Luồng nền chỉ gọi mạng khi [`wanted`].
pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let path = app.path().app_local_data_dir()?.join(FILE_NAME);
    let service = Arc::new(RecipeService::new(
        path,
        trusted_keys(),
        app.package_info().version.to_string(),
        production_url(),
    ));
    log::info!("công thức đọc tên: dùng số {}", service.active().version);
    app.manage(Arc::clone(&service));
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_CHECK_DELAY);
        loop {
            let on = app
                .try_state::<AppState>()
                .is_some_and(|s| wanted(super::enabled(), &s.settings()))
                && app
                    .try_state::<Arc<ModelService>>()
                    .is_some_and(|m| m.speaker_offered());
            if on {
                match service.check() {
                    Outcome::Updated(v) => log::info!("công thức đọc tên: nhận số {v}, áp dụng từ phiên dịch sau"),
                    Outcome::Unchanged => log::info!("công thức đọc tên: không có bản mới"),
                    Outcome::Refused(why) => log::warn!("công thức đọc tên: từ chối bản tải về ({why})"),
                    Outcome::Failed(why) => log::info!("công thức đọc tên: chưa tải được ({why})"),
                }
            }
            std::thread::sleep(CHECK_EVERY);
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    use crate::models::test_http::{FakeServer, Fault};
    use crate::settings::UiLanguage;
    use speaker_ops::envelope::testing::{sign, test_keys};

    const APP: &str = "0.3.2";
    const PATH: &str = "speaker/recipes.json";

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mt-recipes-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Bản build sẵn với `version` và `min_app_version` đổi.
    fn body_with(version: u32, min: &str) -> String {
        let mut v: serde_json::Value = serde_json::from_str(speaker_recipe::BUILTIN_JSON).unwrap();
        v["version"] = version.into();
        v["min_app_version"] = min.into();
        v.to_string()
    }

    fn service(dir: &Path, server: &FakeServer) -> RecipeService {
        RecipeService::new(dir.join(FILE_NAME), test_keys(), APP.into(), Some(server.url(PATH)))
    }

    #[test]
    fn the_url_matches_the_production_https_url() {
        assert_eq!(production_url().unwrap().as_str(), RECIPES_URL);
        assert!(RECIPES_URL.starts_with("https://releases.aitranslator.vn/"));
    }

    #[test]
    fn it_starts_with_the_builtin_recipe_and_uses_the_real_keys_in_the_app() {
        let server = FakeServer::start();
        let s = service(&temp("start"), &server);
        assert_eq!(s.active(), Active::builtin());
        assert_eq!(s.body(), speaker_recipe::BUILTIN_JSON);
        assert!(server.requests().is_empty(), "tạo dịch vụ không gọi mạng");
        assert!(trusted_keys().iter().all(|k| !k.kid.starts_with("test-")));
    }

    #[test]
    fn a_newer_signed_recipe_is_taken_saved_and_survives_a_restart() {
        let dir = temp("newer");
        let server = FakeServer::start();
        let next = body_with(Active::builtin().version + 1, "0.3.2");
        server.put(PATH, &sign(0, &next));
        let s = service(&dir, &server);
        assert_eq!(s.check(), Outcome::Updated(Active::builtin().version + 1));
        assert_eq!(s.body(), next);
        assert_eq!(s.check(), Outcome::Unchanged, "lần sau đúng bản đang có");
        // App chạy lại: nạp từ file đã lưu, kiểm lại chữ ký.
        assert_eq!(service(&dir, &server).body(), next);
        assert_eq!(server.requests().len(), 2);
        assert!(server.requests()[0].user_agent.is_some());
    }

    #[test]
    fn an_older_one_a_bad_signature_and_a_recipe_for_a_newer_app_are_refused_and_the_current_one_kept() {
        let dir = temp("refused");
        let server = FakeServer::start();
        let s = service(&dir, &server);
        let v = Active::builtin().version;
        server.put(PATH, &sign(0, &body_with(v + 5, "0.3.2")));
        assert_eq!(s.check(), Outcome::Updated(v + 5));
        let kept = s.body();
        // Quay lui: chữ ký đúng nhưng số cũ hơn.
        server.put(PATH, &sign(0, &body_with(v + 1, "0.3.2")));
        assert!(
            matches!(s.check(), Outcome::Refused(w) if w.contains("cũ hơn")),
            "quay lui"
        );
        // Khóa lạ: ký bằng khóa không có trong danh sách của app.
        let keys_for_second_only = RecipeService::new(
            dir.join("other.json"),
            test_keys()[1..].to_vec(),
            APP.into(),
            Some(server.url(PATH)),
        );
        server.put(PATH, &sign(0, &body_with(v + 9, "0.3.2")));
        assert!(matches!(keys_for_second_only.check(), Outcome::Refused(_)));
        // Cần app mới hơn.
        server.put(PATH, &sign(0, &body_with(v + 9, "9.9.9")));
        assert!(matches!(s.check(), Outcome::Refused(w) if w.contains("app bản mới hơn")));
        // Không phải phong bì.
        server.put(PATH, b"{\"hello\":1}");
        assert!(matches!(s.check(), Outcome::Refused(_)));
        assert_eq!(s.body(), kept);
        assert_eq!(
            service(&dir, &server).body(),
            kept,
            "file đã lưu không bị đè bởi bản bị từ chối"
        );
    }

    #[test]
    fn network_and_http_errors_keep_the_current_recipe() {
        let server = FakeServer::start();
        let s = service(&temp("net"), &server);
        assert!(
            matches!(s.check(), Outcome::Failed(w) if w.contains("HTTP 404")),
            "chưa đăng gì"
        );
        server.put(PATH, &sign(0, &body_with(Active::builtin().version + 1, "0.3.2")));
        server.fault(Fault::Status(503));
        assert!(matches!(s.check(), Outcome::Failed(w) if w.contains("HTTP 503")));
        server.fault(Fault::DropAfter(10));
        assert!(matches!(s.check(), Outcome::Failed(_)));
        assert_eq!(s.active(), Active::builtin());
        let no_url = RecipeService::new(temp("nourl").join(FILE_NAME), test_keys(), APP.into(), None);
        assert_eq!(no_url.check(), Outcome::Failed("chưa có nguồn".into()));
    }

    #[test]
    fn a_response_larger_than_the_limit_is_refused() {
        let server = FakeServer::start();
        server.put(PATH, &vec![b' '; MAX_ENVELOPE_BYTES + 5_000]);
        let s = service(&temp("big"), &server);
        assert!(matches!(s.check(), Outcome::Refused(w) if w.contains("quá lớn")));
    }

    /// `Load.names.recipe_json` của phiên lấy đúng bản đang có: bản build sẵn khi chưa có dịch vụ, bản tải về sau khi nhận.
    #[test]
    fn the_recipe_given_to_a_session_is_the_one_in_force() {
        let app = crate::test_support::mock_app();
        assert_eq!(
            body(app.handle()),
            speaker_recipe::BUILTIN_JSON,
            "chưa có dịch vụ: bản build sẵn"
        );
        let server = FakeServer::start();
        let next = body_with(Active::builtin().version + 1, "0.3.2");
        server.put(PATH, &sign(0, &next));
        let s = Arc::new(service(&temp("session"), &server));
        app.manage(Arc::clone(&s));
        assert_eq!(body(app.handle()), speaker_recipe::BUILTIN_JSON);
        s.check();
        assert_eq!(body(app.handle()), next, "phiên sau nhận công thức mới");
    }

    /// Chỉ tải khi tính năng đang bật cho người dùng này (không có lệnh gọi mạng nào khi người dùng tắt).
    #[test]
    fn it_is_wanted_only_when_the_switch_and_both_settings_are_on() {
        let mut s = Settings::defaults(UiLanguage::Vi);
        assert!(s.speaker_diarization && s.speaker_names);
        assert!(wanted(true, &s));
        assert!(!wanted(false, &s), "bản phát hành chưa bật tính năng");
        s.speaker_names = false;
        assert!(!wanted(true, &s));
        s.speaker_names = true;
        s.speaker_diarization = false;
        assert!(!wanted(true, &s));
    }
}
