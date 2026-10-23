# Payload thật của Creem (sandbox, đo ngày 2026-10-16)

Thân JSON thô do Creem sandbox (chế độ test) trả về hay gửi tới trong phép đo spike S5, giữ nguyên từng byte (không có xuống
dòng cuối). Dữ liệu cá nhân là giả (`spike@example.com`, `Test Tester`); các mã `ch_…`, `ord_…`, `tran_…`, `cust_…`,
`prod_…`, `evt_…`, `ref_…` là mã sandbox, không dùng được ở production.

| File | Nguồn |
| --- | --- |
| `checkout.completed.real.json` | thân webhook `checkout.completed` của đơn thử 3,99 USD |
| `refund.created.real.json` | thân webhook `refund.created` khi hoàn đủ đơn đó (số hoàn ở `object.refund_amount`; `object.transaction` là ảnh chụp lúc phát, `refunded_amount: null`, `status: "paid"`) |
| `get-checkout.pending.real.json` | thân `GET /v1/checkouts` khi phiên chưa trả (không có `order`) |
| `get-checkout.paid.real.json` | thân `GET /v1/checkouts` sau khi trả (sau khi hoàn đủ, API vẫn trả y hình dạng này: `completed`, `order.status: "paid"`) |
| `create-checkout.real.json` | thân trả về của `POST /v1/checkouts` (`checkout_url` là host sandbox `creem.io/test/…`, không phải host production) |

Ngoại lệ duy nhất với "giữ nguyên từng byte": ngày 2026-10-23 chuỗi `success_url` đổi tên miền từ `api.aitranslator.io.vn`
sang `api.aitranslator.vn` (spec `2026-10-23-ten-mien-aitranslator-vn-design.md`); test tự ký thân nên chữ ký không bị ảnh
hưởng.

Không có chữ ký hay secret nào ở đây: test tự ký thân thô bằng secret giả của test (HMAC-SHA256 hex, header
`creem-signature`), không dùng secret của lần đo. Test đọc file bằng `import … from "./fixtures/creem/<file>?raw"` để có đúng
byte của thân; muốn đổi `request_id` thì sửa chuỗi trong bộ nhớ, không sửa file.
