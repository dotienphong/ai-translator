# Thử tay chế độ Âm thanh máy + Micro trên Mac (2026-10-24)

Kế hoạch: `docs/superpowers/plans/2026-10-24-nguon-micro-03-che-do-tron.md`, Task 10. Nhánh `nguon-micro`, HEAD 34e877b5
(cộng sửa log ở 93bd315e).

## Điều kiện

- MacBook Pro M4 Pro, macOS 26.6.2, micro và loa tích hợp. Âm lượng loa 60%.
- Bản dev đóng gói bằng `scripts/run-dev-app.sh`, ký "Apple Development"; công tắc Pro của bản dev bật. Chủ dự án ủy quyền cho
  Claude điều khiển (`cliclick`, phát tiếng qua loa).
- Dựng lại cảnh 1 của spike (nói lần lượt) trên app thật, 100 giây đầu của track `s1-luot`:
  - **Người online:** track `online.wav` phát bằng `OnlinePlayer.app`. Đây là bản sao của `afplay` gói trong một `.app` có
    bundle id `com.aitranslator.test.onlineplayer`, để chọn được làm nguồn "chỉ một app". App tap được tiếng này, và tiếng
    cũng vọng vào micro.
  - **Người trong phòng:** track `room.wav` phát bằng `afplay`. `afplay` không có bundle id nên không bị tap; chỉ micro nghe
    thấy.
- Track có 5 câu online (en, ja, vi, zh, zh) và 5 câu trong phòng (ja, ko, ko, ja, ja), xen kẽ, không chồng nhau.
- Thử QuickTime Player trước nhưng AppleScript hết thời gian chờ, nên đổi sang `OnlinePlayer.app`.
- Dịch sang tiếng Việt.

## Kết quả

| Bước | Kết quả |
|---|---|
| 1. Cài đặt › Âm thanh chọn "Âm thanh máy + Micro" | **Đạt.** Hai bộ chọn (nguồn âm thanh máy, micro) cùng hiện; có ghi chú nhường lời; thanh trượt khóa ở 500 ms. |
| 2. Tiếng vọng | **Đạt.** 5/5 câu online, mỗi câu **một lần**, không có bản sao lệch giờ. Micro bị hạ 49% thời gian (log 60 giây). Câu tiếng Việt bị cắt thành ba đoạn ngắn, nhưng không lặp. |
| 3. Người trong phòng | **Đạt.** 4/4 câu trong phòng nhận được qua micro (câu thứ năm bị cắt vì hết track). Một câu tiếng Hàn bị cắt làm hai đoạn. |
| 4. Thiếu quyền | **Đạt.** Quyền chưa hỏi: bấm Bắt đầu thì macOS hỏi trước khi nạp model (QĐ1). Chọn "Don't Allow": phiên **vẫn chạy** và dịch âm thanh máy. Thanh phụ đề ghi "Micro chưa được phép"; màn hình chính có ghi chú kèm nút "Mở cài đặt quyền micro" và câu nhắc "Thoát & Mở lại". |
| 5. A2 | Xem dưới. |

**Chữ không có trong kịch bản** (chế độ trộn): ba câu.
- "Cái xe 5 ngự của ai đây?": lúc chưa phát gì.
- "It is a very good one.": ngay sau một câu trong phòng.
- "Và không muốn mình nữa rồi": lúc track vừa hết.

Có thể là tiếng thật trong phòng của chủ dự án lúc thử, cũng có thể là chữ ảo. Lần thử này không phân biệt được.

**Lặp đuôi câu tiếng Trung** ("而非除龙的绒毛" hai lần): có ở cả chế độ Âm thanh máy (không có micro). Lỗi này do whisper với chính
câu đó, không do trộn.

## A2: độ trễ phụ đề

Cùng cảnh, hai phiên liền nhau. Số từ dòng log "kết thúc phiên dịch":

| Chế độ | Ngắt câu | Cắt đoạn p50 | Nhận dạng p50 | Dịch p50 | Tổng p50 | Tổng p90 |
|---|---|---|---|---|---|---|
| Âm thanh máy | 50 ms (cài đặt) | 64 ms | 221 ms | 226 ms | 416 ms | 787 ms |
| Âm thanh máy + Micro | 500 ms (spec mục 16) | 512 ms | 226 ms | 324 ms | 1 056 ms | 1 805 ms |

- Chênh 640 ms ở p50:
  - 448 ms do đóng đoạn sau 500 ms, đúng thiết kế (spec mục 16 ghi phụ đề chậm khoảng 0,45 s);
  - nhận dạng chậm hơn 5 ms;
  - dịch chậm hơn 98 ms. Hai phiên không cùng nội dung: chế độ trộn dịch thêm năm câu trong phòng (câu dài tiếng Nhật, Hàn),
    chế độ âm thanh máy chỉ dịch câu online.
- Ngoài phần ngắt câu đã chủ ý, phần do trộn và micro gây ra (nhận dạng) dưới 100 ms: **A2 đạt** theo nghĩa đó. Phần dịch không
  so được vì nội dung khác; nghiệm thu A2 chính thức (kế hoạch 04) nên dùng cùng nội dung ở hai chế độ.

## Lỗi tìm thấy và đã sửa

- Quyền micro bị từ chối ở chế độ trộn thì log có một dòng "không mở được micro" mỗi 2 giây suốt phiên, khoảng 1 800 dòng mỗi
  giờ. Sửa ở 93bd315e: chỉ ghi cảnh báo khi mã lỗi đổi, còn lại ghi ở mức debug.

## Không làm

- Rút hay đổi micro giữa phiên: máy không có micro thứ hai.
- Âm thanh máy và micro cùng lúc có người nói chồng (cảnh 2): đã đo offline ở `tron-moi.md`.
- Windows: Task 16 của kế hoạch 02.

## Trả lại máy

Bản dev đã tắt, cùng tiến trình phụ và Vite. Quyền micro của app về "chưa hỏi". Cài đặt khôi phục từ bản sao lưu (giao diện
tiếng Việt, dịch sang tiếng Việt, nguồn toàn hệ thống, chế độ Âm thanh máy). Âm lượng về 75%. Bản đã cài mở lại.
