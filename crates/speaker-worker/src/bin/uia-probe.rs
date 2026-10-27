//! Spike kế hoạch 01 (spec 2026-10-26-phan-biet-nguoi-noi §6.2): đọc cây UI Automation của cửa sổ họp trên Windows, ghi JSON
//! như `axtrace` của macOS, để tìm tên người tham dự và chỉ báo "đang nói" của Teams, Chrome, Edge.
//!
//!   uia-probe list
//!   uia-probe dump <exe> <chữ trong tiêu đề> <ra.json>
//!   uia-probe watch <exe> <chữ trong tiêu đề> <ra.jsonl> [giây]
//!
//! Mỗi phần tử một dòng `độ sâu|ControlType|Name|AutomationId|ClassName|HelpText`. Chỉ đọc, không bấm gì.

#[cfg(not(windows))]
fn main() {
    eprintln!("uia-probe chỉ chạy trên Windows");
    std::process::exit(2);
}

#[cfg(windows)]
fn main() -> anyhow::Result<()> {
    win::run()
}

#[cfg(windows)]
mod win {
    use std::io::Write;
    use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

    use anyhow::{Context, Result, bail};
    use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
    use windows::Win32::System::Com::{CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx};
    use windows::Win32::System::Threading::{
        OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
    };
    use windows::Win32::UI::Accessibility::{CUIAutomation, IUIAutomation, IUIAutomationElement};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
    };
    use windows::core::{BOOL, BSTR, PWSTR};

    const MAX_NODES: usize = 40_000;
    const MAX_DEPTH: usize = 60;

    struct Win {
        hwnd: HWND,
        pid: u32,
        exe: String,
        title: String,
    }

    unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let list = unsafe { &mut *(lparam.0 as *mut Vec<HWND>) };
        list.push(hwnd);
        true.into()
    }

    fn exe_name(pid: u32) -> Option<String> {
        unsafe {
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buf = [0u16; 1024];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len).is_ok();
            let _ = CloseHandle(h);
            ok.then(|| {
                String::from_utf16_lossy(&buf[..len as usize])
                    .rsplit('\\')
                    .next()
                    .unwrap_or("")
                    .to_lowercase()
            })
        }
    }

    fn windows_list() -> Vec<Win> {
        let mut hwnds: Vec<HWND> = Vec::new();
        unsafe {
            let _ = EnumWindows(Some(collect), LPARAM(&mut hwnds as *mut Vec<HWND> as isize));
        }
        hwnds
            .into_iter()
            .filter_map(|hwnd| unsafe {
                if !IsWindowVisible(hwnd).as_bool() {
                    return None;
                }
                let mut buf = [0u16; 512];
                let n = GetWindowTextW(hwnd, &mut buf);
                if n <= 0 {
                    return None;
                }
                let mut pid = 0u32;
                GetWindowThreadProcessId(hwnd, Some(&mut pid));
                Some(Win {
                    hwnd,
                    pid,
                    exe: exe_name(pid).unwrap_or_default(),
                    title: String::from_utf16_lossy(&buf[..n as usize]),
                })
            })
            .collect()
    }

    fn find(exe: &str, title: &str) -> Result<Win> {
        let (exe, title) = (exe.to_lowercase(), title.to_lowercase());
        windows_list()
            .into_iter()
            .find(|w| w.exe == exe && w.title.to_lowercase().contains(&title))
            .with_context(|| format!("không thấy cửa sổ của {exe} có tiêu đề chứa \"{title}\""))
    }

    fn text(r: windows::core::Result<BSTR>) -> String {
        r.map(|b| b.to_string())
            .unwrap_or_default()
            .replace(['|', '\n', '\r'], " ")
    }

    fn walk(auto: &IUIAutomation, root: &IUIAutomationElement) -> Result<Vec<String>> {
        let walker = unsafe { auto.RawViewWalker()? };
        let mut out = Vec::new();
        let mut stack = vec![(root.clone(), 0usize)];
        while let Some((el, depth)) = stack.pop() {
            if out.len() >= MAX_NODES {
                break;
            }
            let ct = unsafe { el.CurrentControlType() }.map(|c| c.0).unwrap_or(0);
            out.push(format!(
                "{depth}|{ct}|{}|{}|{}|{}",
                text(unsafe { el.CurrentName() }),
                text(unsafe { el.CurrentAutomationId() }),
                text(unsafe { el.CurrentClassName() }),
                text(unsafe { el.CurrentHelpText() }),
            ));
            if depth < MAX_DEPTH {
                let mut kids = Vec::new();
                let mut child = unsafe { walker.GetFirstChildElement(&el) }.ok();
                while let Some(c) = child {
                    child = unsafe { walker.GetNextSiblingElement(&c) }.ok();
                    kids.push(c);
                }
                for c in kids.into_iter().rev() {
                    stack.push((c, depth + 1));
                }
            }
        }
        Ok(out)
    }

    fn now() -> f64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs_f64())
            .unwrap_or(0.0)
    }

    pub fn run() -> Result<()> {
        let args: Vec<String> = std::env::args().collect();
        unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).ok()? };
        let auto: IUIAutomation = unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)? };
        match args.get(1).map(String::as_str) {
            Some("list") => {
                for w in windows_list() {
                    println!("{}\t{}\t{}", w.pid, w.exe, w.title);
                }
            }
            Some("dump") if args.len() >= 5 => {
                let w = find(&args[2], &args[3])?;
                let root = unsafe { auto.ElementFromHandle(w.hwnd)? };
                let t0 = Instant::now();
                let lines = walk(&auto, &root)?;
                let ms = t0.elapsed().as_secs_f64() * 1000.0;
                let json = serde_json::json!({ "title": w.title, "walk_ms": ms, "n": lines.len(), "lines": lines });
                std::fs::write(&args[4], serde_json::to_string(&json)?)?;
                println!("{} phần tử, {ms:.0} ms → {}", lines.len(), args[4]);
            }
            Some("watch") if args.len() >= 5 => {
                let interval = args.get(5).map(|s| s.parse::<f64>()).transpose()?.unwrap_or(0.25);
                let mut file = std::fs::File::create(&args[4])?;
                let mut last: Vec<String> = Vec::new();
                loop {
                    let t0 = Instant::now();
                    let stamp = now();
                    let w = find(&args[2], &args[3])?;
                    let root = unsafe { auto.ElementFromHandle(w.hwnd)? };
                    let lines = walk(&auto, &root)?;
                    let ms = t0.elapsed().as_secs_f64() * 1000.0;
                    if lines != last {
                        let json = serde_json::json!({ "t": stamp, "walk_ms": ms, "n": lines.len(), "lines": lines });
                        writeln!(file, "{}", serde_json::to_string(&json)?)?;
                        last = lines;
                    }
                    let left = interval - t0.elapsed().as_secs_f64();
                    if left > 0.0 {
                        std::thread::sleep(Duration::from_secs_f64(left));
                    }
                }
            }
            _ => bail!(
                "cách dùng: uia-probe list | dump <exe> <chữ trong tiêu đề> <ra.json> | watch <exe> <chữ trong tiêu đề> <ra.jsonl> [giây]"
            ),
        }
        Ok(())
    }
}
