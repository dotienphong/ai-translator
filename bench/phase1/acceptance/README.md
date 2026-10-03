# Công cụ nghiệm thu Giai đoạn 1 (kế hoạch 08)

Python 3.12 trở lên, chỉ dùng thư viện chuẩn. Chạy từ gốc repo. Kết quả của các lần thử ghi vào
`bench/phase1/results/acceptance/` và được commit.

| Script | Việc | Ra |
|---|---|---|
| `mapping.py summary` / `check` | Bảng đối chiếu của kế hoạch 00: đếm trạng thái, nhóm dòng chưa xong theo việc đang chặn; `check` là Task 5 của kế hoạch 00 | in Markdown hay JSON (`--json`) |
| `gates.py a2` | A2 từ JSON của `latency-bench latency` của một máy: luật lượt đo đáng tin và ngưỡng của `summarize.py`; gói lấy từ model, hạng trong nhãn đối chiếu với máy; đủ 6 session | `a2-<máy>.json` |
| `gates.py a3` | A3 từ `s7_mt-<nhãn>.json` của `score_mt.py`, so mốc `s7_mt.json`, cộng mức sàn Anh→Việt | `a3.json` |
| `gates.py a4` | A4 từ `a4_<nhãn>.json` của `score_asr.py`, nhận cả hai mốc `a4_m4pro-{turbo,small}-final.json`, gói suy từ số đo (mốc gần hơn), ≤ 10% tương đối | `a4-<gói>.json` |
| `soak.py sample` / `summarize` / `pids` | A5 (2 giờ, không crash, RAM sau giờ đầu ≤ 110%) và tải máy §8 (CPU ≤ 30%), gồm WebView của chính app; `--require` các tiến trình bắt buộc; CSV ghi hệ điều hành, mã máy; `pids` in tiến trình của app cho A7 | `a5-<máy>.*` |
| `netaudit.py` | A7 từ nhật ký HAR của proxy (chỉ lưu lượng của app), theo danh sách cho phép (`a7-allow.template.json`); mốc Bắt đầu, Dừng bắt buộc, có múi giờ, nằm trong nhật ký; chạy trên chính máy thử | `a7-<máy>.json` |
| `report.py` | Gom tất cả thành báo cáo nghiệm thu | `report.md` |

Gói, hạng, máy, hệ điều hành do công cụ ghi vào nội dung file; `report.py` đọc nội dung, không tin tên file.

Mẫu cho phần người điền: `a1-matrix.template.md` (A1), `a6-checklist.template.md` (A6), `a7-allow.template.json` (A7).

Test: `python3 -m unittest discover -s bench/phase1/acceptance -p 'test_*.py'`.
