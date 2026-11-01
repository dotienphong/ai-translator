//! Công cụ kiểm gợi ý bật dịch trên **máy Windows thật** (spec 2026-11-01-goi-y-bat-dich-khi-hop §8). Chạy đúng vòng nhận biết mà app dùng
//! (phiên âm thanh của loa → gán về app họp qua cây tiến trình → cửa sổ họp → máy trạng thái gợi ý), mỗi 500 ms in một dòng, để bạn
//! mở Teams, Zoom, Google Meet (Chrome, Edge) và xem app nhận biết có đúng không, trước khi tin vào tính năng.
//!
//!     cargo run -p meeting-scan --example hint_probe --release
//!
//! Mỗi dòng: giây, đỉnh âm lượng của loa, từng phiên đang hoạt động (tên tệp chạy, đỉnh, app họp gán được hay `-`), app họp có mặt, app có
//! tiếng, và `=> GỢI Ý` khi app sẽ hiện hộp thoại. Dừng bằng Ctrl+C. Chỉ in ra màn hình; không ghi file, không in tiêu đề cửa sổ.
//!
//! Cách thử: (1) mở họp Teams/Zoom/Meet, nghe có tiếng: sau khoảng 5 giây phải có `=> GỢI Ý: <app>`; (2) mở YouTube trong Chrome, không họp:
//! không được có `=> GỢI Ý`; (3) họp xong, tắt tiếng hơn 1 phút rồi họp lại: phải gợi ý lại. Dán kết quả nếu có gì sai.

#[cfg(not(windows))]
fn main() {
    eprintln!("Công cụ này chỉ chạy trên Windows.");
}

#[cfg(windows)]
fn main() {
    use std::time::Instant;

    use meeting_scan::hint::{Action, Hint, SAMPLE_EVERY, Tick};
    use meeting_scan::probe::Probe;
    use meeting_scan::procmap::{Levels, ProcTable};
    use meeting_scan::win::{Win32Desktop, process_table};

    let recipes = speaker_recipe::parse(speaker_recipe::BUILTIN_JSON).ok();
    println!(
        "hint_probe: công thức có sẵn {}. Mở họp rồi quan sát; Ctrl+C để dừng.",
        if recipes.is_some() {
            "dùng được"
        } else {
            "không đọc được (không có dự phòng cho Teams, Zoom)"
        }
    );
    let (mut probe, mut hint, mut desktop) = (Probe::default(), Hint::new(), Win32Desktop);
    let started = Instant::now();
    loop {
        std::thread::sleep(SAMPLE_EVERY);
        let now = Instant::now();
        let levels = match audio_capture::windows::output_levels() {
            Ok(l) => Levels {
                sessions: l.sessions,
                device_peak: l.device_peak,
            },
            Err(e) => {
                println!("{:6.1}s  lỗi đọc âm thanh: {e}", started.elapsed().as_secs_f32());
                continue;
            }
        };
        let loud = levels.device_loud()
            || levels
                .sessions
                .iter()
                .any(|(_, p)| *p >= meeting_scan::hint::PEAK_THRESHOLD);
        let table = if loud { process_table() } else { ProcTable::default() };
        let observation = probe.observe(&mut desktop, recipes.as_ref(), &levels, &table, now);
        let action = hint.tick(&Tick {
            now,
            enabled: true,
            idle: true,
            ignored: &[],
            present: &observation.present,
            sound: &observation.sound,
        });
        let sessions: Vec<String> = levels
            .sessions
            .iter()
            .map(|(pid, peak)| {
                let exe = table.exe_of(*pid).unwrap_or("?");
                let app = table.app_of_pid(*pid).map_or("-".to_string(), |a| format!("{a:?}"));
                format!("{exe}[{peak:.2}→{app}]")
            })
            .collect();
        println!(
            "{:6.1}s  loa {:.2}  phiên: {}  có mặt: {:?}  có tiếng: {:?}{}",
            started.elapsed().as_secs_f32(),
            levels.device_peak,
            if sessions.is_empty() {
                "-".to_string()
            } else {
                sessions.join(" ")
            },
            observation.present,
            observation.sound,
            match action {
                Action::Show(app) => format!("  => GỢI Ý: {app:?}"),
                Action::Hide(why) => format!("  => đóng ({why:?})"),
                Action::None => String::new(),
            }
        );
        // Giả lập người dùng bỏ qua ngay, để thử cuộc họp kế tiếp (cuộc họp này không hỏi lại).
        if hint.shown().is_some() {
            hint.dismissed();
        }
    }
}
