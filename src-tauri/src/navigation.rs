//! Điều hướng của webview (spec §10.2: "Link ngoài mở bằng trình duyệt của hệ thống").
//! - URL của chính app: cho đi. Bản phát hành chỉ nhận origin của giao diện đóng gói trên đúng hệ điều
//!   hành đang chạy (macOS `tauri://localhost`, Windows `http(s)://tauri.localhost`); bản dev chỉ nhận
//!   origin của dev server.
//! - URL `https` (cổng mặc định) có tên miền nằm trong `EXTERNAL_HOSTS`: không mở trong webview, mà
//!   mở bằng trình duyệt của hệ thống qua `system::open_external_url` (`SystemOpener`, QĐ28).
//! - Mọi URL khác: chặn và ghi log (chỉ ghi origin, không ghi đường dẫn hay tham số).
//!
//! Áp cho cả điều hướng trong trang (`on_navigation` của plugin, cho mọi webview) và yêu cầu mở cửa sổ
//! mới (`target="_blank"`, `window.open`), qua `new_window_handler` gắn vào từng cửa sổ.
//!
//! Lưu ý cho kế hoạch 03: URL `blob:` bị chặn, kể cả `blob:` của chính app. Nếu xuất file bằng cách
//! điều hướng tới `blob:` (thẻ `<a download>`) thì phải làm cách khác, ví dụ ghi file phía Rust.

use tauri::plugin::TauriPlugin;
use tauri::webview::{NewWindowFeatures, NewWindowResponse};
use tauri::{AppHandle, Manager, Runtime, Url};

use crate::system;

/// Tên miền được mở bằng trình duyệt. Kế hoạch 06 thêm trang thanh toán của PayOS, kế hoạch 07 thêm
/// website của sản phẩm (tên miền chờ Q1). Chỉ so khớp đúng cả tên miền, không nhận tên miền con.
pub const EXTERNAL_HOSTS: &[&str] = &[];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Decision {
    Allow,
    OpenExternal,
    Block,
}

/// Hệ điều hành, để biết origin của giao diện đóng gói.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Os {
    MacOs,
    Windows,
}

pub const CURRENT_OS: Os = if cfg!(target_os = "macos") {
    Os::MacOs
} else {
    Os::Windows
};

/// Quyết định cho một URL. `dev_url` chỉ có ở bản dev (`devUrl` của `tauri.conf.json`).
pub fn decide(url: &Url, os: Os, dev_url: Option<&Url>, external_hosts: &[&str]) -> Decision {
    if is_app_url(url, os, dev_url) {
        return Decision::Allow;
    }
    let external = url.scheme() == "https"
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && url
            .host_str()
            .is_some_and(|host| external_hosts.iter().any(|h| h.eq_ignore_ascii_case(host)));
    if external {
        Decision::OpenExternal
    } else {
        Decision::Block
    }
}

fn is_app_url(url: &Url, os: Os, dev_url: Option<&Url>) -> bool {
    if url.as_str() == "about:blank" {
        return true;
    }
    if let Some(dev) = dev_url {
        // Bản dev: giao diện chỉ đến từ dev server. So cả scheme để `blob:` của dev server không lọt.
        return url.scheme() == dev.scheme()
            && url.origin() == dev.origin()
            && url.username().is_empty()
            && url.password().is_none();
    }
    let plain = url.port().is_none() && url.username().is_empty() && url.password().is_none();
    let host = url.host_str();
    match os {
        Os::MacOs => url.scheme() == "tauri" && host == Some("localhost") && plain,
        // `https` khi bật `useHttpsScheme`.
        Os::Windows => matches!(url.scheme(), "http" | "https") && host == Some("tauri.localhost") && plain,
    }
}

/// URL của dev server, chỉ khi app nạp giao diện từ đó. `tauri::is_dev()` (chưa bật feature
/// `custom-protocol`) là đúng cách Tauri chọn nguồn giao diện; `cfg!(debug_assertions)` thì sai với
/// `pnpm tauri build --debug`, bản debug mà vẫn nạp giao diện đóng gói từ `tauri://localhost`.
pub fn dev_url_for(is_dev: bool, configured: Option<&Url>) -> Option<Url> {
    if is_dev { configured.cloned() } else { None }
}

fn dev_url<R: Runtime>(app: &AppHandle<R>) -> Option<Url> {
    dev_url_for(tauri::is_dev(), app.config().build.dev_url.as_ref())
}

/// Áp quyết định; trả về `true` nếu webview được đi tới URL này.
fn apply<R: Runtime>(app: &AppHandle<R>, url: &Url) -> bool {
    match decide(url, CURRENT_OS, dev_url(app).as_ref(), EXTERNAL_HOSTS) {
        Decision::Allow => true,
        Decision::OpenExternal => {
            if let Err(e) = system::open_external_url(app, url.as_str()) {
                log::warn!(
                    "không mở được {} bằng trình duyệt: {e}",
                    url.origin().ascii_serialization()
                );
            }
            false
        }
        Decision::Block => {
            log::warn!("chặn điều hướng tới {}", url.origin().ascii_serialization());
            false
        }
    }
}

/// Plugin kiểm mọi lần điều hướng của mọi webview.
pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("navigation-guard")
        .on_navigation(|webview, url| apply(webview.app_handle(), url))
        .build()
}

/// Gắn vào từng cửa sổ (`on_new_window`): không bao giờ mở cửa sổ webview mới; link ngoài được phép
/// thì mở bằng trình duyệt.
pub fn new_window_handler<R: Runtime>(
    app: AppHandle<R>,
) -> impl Fn(Url, NewWindowFeatures) -> NewWindowResponse<R> + Send + 'static {
    move |url, _features| {
        apply(&app, &url);
        NewWindowResponse::Deny
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(url: &str, os: Os, dev: Option<&str>, hosts: &[&str]) -> Decision {
        let dev = dev.map(|u| Url::parse(u).unwrap());
        decide(&Url::parse(url).unwrap(), os, dev.as_ref(), hosts)
    }

    const PAYOS: &[&str] = &["pay.payos.vn"];
    const DEV: Option<&str> = Some("http://localhost:1420");

    #[test]
    fn app_urls_depend_on_the_os() {
        assert_eq!(d("tauri://localhost/index.html", Os::MacOs, None, &[]), Decision::Allow);
        assert_eq!(
            d("http://tauri.localhost/overlay.html", Os::MacOs, None, &[]),
            Decision::Block
        );
        assert_eq!(
            d("http://tauri.localhost/overlay.html", Os::Windows, None, &[]),
            Decision::Allow
        );
        assert_eq!(d("https://tauri.localhost/", Os::Windows, None, &[]), Decision::Allow);
        assert_eq!(
            d("tauri://localhost/index.html", Os::Windows, None, &[]),
            Decision::Block
        );
        for os in [Os::MacOs, Os::Windows] {
            assert_eq!(d("about:blank", os, None, &[]), Decision::Allow);
        }
    }

    #[test]
    fn dev_build_only_allows_the_dev_server() {
        for os in [Os::MacOs, Os::Windows] {
            assert_eq!(d("http://localhost:1420/index.html", os, DEV, &[]), Decision::Allow);
            assert_eq!(d("http://localhost:1420/index.html", os, None, &[]), Decision::Block);
            assert_eq!(d("http://localhost:1421/", os, DEV, &[]), Decision::Block);
            assert_eq!(d("tauri://localhost/index.html", os, DEV, &[]), Decision::Block);
            assert_eq!(d("http://tauri.localhost/", os, DEV, &[]), Decision::Block);
            assert_eq!(d("http://user@localhost:1420/", os, DEV, &[]), Decision::Block);
        }
    }

    #[test]
    fn packaged_ui_ignores_dev_url_even_in_debug_builds() {
        let dev = Url::parse("http://localhost:1420").unwrap();
        assert_eq!(dev_url_for(true, Some(&dev)), Some(dev.clone()));
        assert_eq!(dev_url_for(true, None), None);
        assert_eq!(dev_url_for(false, Some(&dev)), None, "`tauri build --debug`");
        let packaged = dev_url_for(false, Some(&dev));
        let url = Url::parse("tauri://localhost/index.html").unwrap();
        assert_eq!(decide(&url, Os::MacOs, packaged.as_ref(), &[]), Decision::Allow);
    }

    #[test]
    fn blob_urls_are_blocked_even_from_the_app() {
        assert_eq!(d("blob:tauri://localhost/1b2c", Os::MacOs, None, &[]), Decision::Block);
        assert_eq!(
            d("blob:http://tauri.localhost/1b2c", Os::Windows, None, &[]),
            Decision::Block
        );
        assert_eq!(
            d("blob:http://localhost:1420/1b2c", Os::MacOs, DEV, &[]),
            Decision::Block
        );
    }

    #[test]
    fn allowed_https_hosts_open_in_the_browser() {
        for os in [Os::MacOs, Os::Windows] {
            assert_eq!(
                d("https://pay.payos.vn/web/abc?x=1", os, None, PAYOS),
                Decision::OpenExternal
            );
            assert_eq!(
                d("https://PAY.payos.vn/web/abc", os, DEV, PAYOS),
                Decision::OpenExternal
            );
        }
    }

    #[test]
    fn everything_else_is_blocked() {
        for os in [Os::MacOs, Os::Windows] {
            for url in [
                "http://pay.payos.vn/web/abc",
                "https://evil.pay.payos.vn/",
                "https://pay.payos.vn.evil.com/",
                "https://user@pay.payos.vn/",
                "https://:pw@pay.payos.vn/",
                "https://pay.payos.vn:8443/",
                "https://example.com/",
                "tauri://evil/",
                "tauri://localhost:8080/",
                "http://tauri.localhost:8080/",
                "http://user@tauri.localhost/",
                "http://:pw@tauri.localhost/",
                "http://:pw@localhost:1420/",
                "about:srcdoc",
                "about:blank#x",
                "file:///etc/passwd",
                "javascript:alert(1)",
                "data:text/html,<b>x</b>",
            ] {
                assert_eq!(d(url, os, DEV, PAYOS), Decision::Block, "{os:?} {url}");
                assert_eq!(d(url, os, None, PAYOS), Decision::Block, "{os:?} {url}");
            }
            assert_eq!(
                d("https://pay.payos.vn/", os, None, &[]),
                Decision::Block,
                "danh sách rỗng thì chặn hết"
            );
        }
    }
}
