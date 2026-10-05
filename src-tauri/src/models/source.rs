//! Nguồn manifest model (spec §6.7): URL của `models.json`, tải và kiểm, chống quay lui về bản cũ, kiểm tối đa mỗi ngày
//! một lần.
//!
//! - Mọi bản build, kể cả bản debug, chỉ đọc URL production (spec 2026-10-04, §2.1); không còn biến môi trường nào đổi
//!   URL. Chưa có URL thì app báo "chưa có nguồn model" và không gọi mạng.
//! - URL phải là `https`.
//! - Chống quay lui: manifest có `sequence` nhỏ hơn bản đã nhận bị từ chối, kể cả khi chữ ký đúng (kẻ gian phát lại
//!   manifest cũ có model lỗi). Cùng `sequence` mà khác nội dung cũng bị từ chối.

use std::io::Read;

use reqwest::Url;
use reqwest::blocking::Client;

use super::download::is_loopback;
use super::manifest::FileEntry;
use super::signed::{self, Signed, SignedError, TrustedKey};
use super::store::StoreState;

/// URL `models.json` production: kế hoạch 07 điền khi có tên miền (T7) và manifest ký trong CI (T3).
pub const PRODUCTION_URL: Option<&str> = Some("https://pub-a4be034c8c474a36b893a65e8f0b8365.r2.dev/models/models.json");
/// Kiểm manifest tối đa mỗi ngày một lần (§6.7).
pub const CHECK_EVERY_SECS: u64 = 24 * 3600;

/// URL manifest từ một chuỗi cấu hình (hàm thuần, để test): chỉ `https`.
pub fn manifest_url_from(text: Option<&str>) -> Option<Url> {
    let url = Url::parse(text?).ok()?;
    (url.scheme() == "https").then_some(url)
}

/// URL manifest của mọi bản build: production.
pub fn manifest_url() -> Option<Url> {
    manifest_url_from(PRODUCTION_URL)
}

/// URL tuyệt đối của một file trong manifest. File phải cùng giao thức `https`, trừ khi chính manifest ở server thử
/// trên máy.
pub fn file_url(manifest_url: &Url, entry: &FileEntry) -> Option<Url> {
    let url = manifest_url.join(&entry.url).ok()?;
    let ok = url.scheme() == "https" || (url.scheme() == "http" && is_loopback(manifest_url) && is_loopback(&url));
    ok.then_some(url)
}

/// Đã tới lúc kiểm manifest chưa: chưa kiểm lần nào, đã qua một ngày, hay giờ máy lùi về trước lần kiểm.
pub fn due(state: &StoreState, now: u64) -> bool {
    state
        .last_check
        .is_none_or(|last| now < last || now - last >= CHECK_EVERY_SECS)
}

#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum FetchError {
    #[error("lỗi mạng: {0}")]
    Network(String),
    #[error("server trả HTTP {0}")]
    Http(u16),
    #[error(transparent)]
    Signed(#[from] SignedError),
    #[error("manifest cũ hơn bản đã có ({got} < {have})")]
    Rollback { have: u64, got: u64 },
    #[error("manifest cùng số {0} nhưng khác nội dung")]
    Conflict(u64),
}

/// Tải và kiểm `models.json`. Trả nguyên văn (để lưu) cùng manifest đã kiểm.
pub fn fetch(client: &Client, url: &Url, keys: &[TrustedKey]) -> Result<(Vec<u8>, Signed), FetchError> {
    let response = client
        .get(url.clone())
        .send()
        .map_err(|e| FetchError::Network(e.to_string()))?;
    if !response.status().is_success() {
        return Err(FetchError::Http(response.status().as_u16()));
    }
    let mut raw = Vec::new();
    response
        .take(signed::MAX_BYTES as u64 + 1)
        .read_to_end(&mut raw)
        .map_err(|e| FetchError::Network(e.to_string()))?;
    let checked = signed::verify(&raw, keys)?;
    Ok((raw, checked))
}

/// Có nhận manifest `new` thay cho `current` không. `Ok(true)`: bản mới hơn; `Ok(false)`: đúng bản đang có.
pub fn accept(current: Option<&Signed>, new: &Signed) -> Result<bool, FetchError> {
    let Some(current) = current else {
        return Ok(true);
    };
    let (have, got) = (current.manifest.sequence, new.manifest.sequence);
    if got > have {
        Ok(true)
    } else if got < have {
        Err(FetchError::Rollback { have, got })
    } else if current.manifest == new.manifest {
        Ok(false)
    } else {
        Err(FetchError::Conflict(got))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::manifest::tests::sample;
    use crate::models::signed::tests::{signed_with_test_key, test_keys};
    use crate::models::test_http::{FakeServer, Fault};

    #[test]
    fn every_build_reads_the_production_url_and_only_https() {
        assert_eq!(
            manifest_url_from(Some("https://cdn.example/models.json")).map(String::from),
            Some("https://cdn.example/models.json".into())
        );
        assert!(manifest_url_from(Some("http://cdn.example/models.json")).is_none());
        assert!(
            manifest_url_from(Some("http://127.0.0.1:9000/models.json")).is_none(),
            "không còn ngoại lệ cho máy này"
        );
        assert!(manifest_url_from(Some("không phải url")).is_none());
        assert!(manifest_url_from(None).is_none());
        assert_eq!(manifest_url().is_some(), PRODUCTION_URL.is_some());
    }

    #[test]
    fn file_urls_resolve_against_the_manifest() {
        let m = crate::models::manifest::Manifest::parse(&serde_json::to_vec(&sample()).unwrap()).unwrap();
        let base = Url::parse("https://cdn.example/models/models.json").unwrap();
        assert_eq!(
            file_url(&base, &m.files[0]).unwrap().as_str(),
            "https://cdn.example/models/files/ggml-large-v3-turbo-q5_0.bin"
        );
        let mut absolute = m.files[0].clone();
        absolute.url = "https://other.example/x.bin".into();
        assert_eq!(
            file_url(&base, &absolute).unwrap().as_str(),
            "https://other.example/x.bin"
        );
        let local = Url::parse("http://127.0.0.1:9000/models.json").unwrap();
        assert_eq!(
            file_url(&local, &m.files[0]).unwrap().as_str(),
            "http://127.0.0.1:9000/files/ggml-large-v3-turbo-q5_0.bin"
        );
        absolute.url = "http://127.0.0.1:9000/x.bin".into();
        assert!(
            file_url(&base, &absolute).is_none(),
            "manifest https không trỏ sang http"
        );
        absolute.url = "http://cdn.example/x.bin".into();
        assert!(
            file_url(&local, &absolute).is_none(),
            "manifest ở máy này cũng không trỏ sang http máy khác"
        );
    }

    #[test]
    fn checks_at_most_once_a_day() {
        let day = CHECK_EVERY_SECS;
        let never = StoreState::default();
        assert!(due(&never, 1_000));
        let checked = StoreState {
            last_check: Some(10 * day),
            ..StoreState::default()
        };
        assert!(!due(&checked, 10 * day + 1));
        assert!(!due(&checked, 11 * day - 1));
        assert!(due(&checked, 11 * day));
        assert!(due(&checked, 10 * day - 1), "giờ máy lùi");
    }

    #[test]
    fn fetch_verifies_the_signature() {
        let server = FakeServer::start();
        server.put("models.json", &signed_with_test_key(&sample()));
        let client = crate::models::download::client().unwrap();
        let (raw, checked) = fetch(&client, &server.url("models.json"), &test_keys()).unwrap();
        assert_eq!(checked.manifest.sequence, 3);
        assert_eq!(raw, signed_with_test_key(&sample()));
        assert!(
            server.requests()[0]
                .user_agent
                .as_deref()
                .unwrap()
                .starts_with("AI-Translator/")
        );
        assert!(matches!(
            fetch(&client, &server.url("models.json"), &[]),
            Err(FetchError::Signed(SignedError::UnknownKey(_)))
        ));
        let mut tampered = signed_with_test_key(&sample());
        let at = tampered.len() / 2;
        tampered[at] ^= 1;
        server.put("models.json", &tampered);
        assert!(matches!(
            fetch(&client, &server.url("models.json"), &test_keys()),
            Err(FetchError::Signed(_))
        ));
        assert_eq!(
            fetch(&client, &server.url("khong-co.json"), &test_keys()),
            Err(FetchError::Http(404))
        );
        server.fault(Fault::Status(503));
        assert_eq!(
            fetch(&client, &server.url("models.json"), &test_keys()),
            Err(FetchError::Http(503))
        );
        server.put("big.json", &vec![b' '; signed::MAX_BYTES + 10]);
        assert!(matches!(
            fetch(&client, &server.url("big.json"), &test_keys()),
            Err(FetchError::Signed(SignedError::Malformed(_)))
        ));
    }

    /// N-1 của review 04 lần 2: server (hay proxy) gửi thân dài mãi thì chỉ đọc tới 1 MiB rồi bỏ, không treo việc kiểm
    /// manifest và không ăn bộ nhớ.
    #[test]
    fn an_endless_manifest_is_cut_after_one_mebibyte() {
        let server = FakeServer::start();
        server.put("models.json", &signed_with_test_key(&sample()));
        server.fault(Fault::Endless);
        let client = crate::models::download::client().unwrap();
        assert!(matches!(
            fetch(&client, &server.url("models.json"), &test_keys()),
            Err(FetchError::Signed(SignedError::Malformed(_)))
        ));
        let since = std::time::Instant::now();
        while server.endless_sent() == 0 {
            assert!(
                since.elapsed() < std::time::Duration::from_secs(10),
                "server giả chưa xong"
            );
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        assert!(
            server.endless_sent() < 16 << 20,
            "client đọc tới {} byte",
            server.endless_sent()
        );
    }

    #[test]
    fn older_or_conflicting_manifests_are_refused() {
        let keys = test_keys();
        let signed_seq = |seq: u64, note: &str| {
            let mut body = sample();
            body["sequence"] = seq.into();
            body["packs"][0]["note"]["en"] = note.into();
            signed::verify(&signed_with_test_key(&body), &keys).unwrap()
        };
        let three = signed_seq(3, "a");
        assert_eq!(accept(None, &three), Ok(true));
        assert_eq!(accept(Some(&three), &signed_seq(4, "a")), Ok(true));
        assert_eq!(accept(Some(&three), &signed_seq(3, "a")), Ok(false));
        assert_eq!(
            accept(Some(&three), &signed_seq(2, "a")),
            Err(FetchError::Rollback { have: 3, got: 2 })
        );
        assert_eq!(accept(Some(&three), &signed_seq(3, "b")), Err(FetchError::Conflict(3)));
    }
}
