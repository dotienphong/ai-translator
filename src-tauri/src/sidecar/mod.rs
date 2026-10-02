//! Phần của app quanh hai tiến trình phụ (Đ2 của kế hoạch 00): tìm file, kiểm SHA-256, nhớ binary đã chạy, dò GPU trên
//! Windows, rồi dựng `SidecarSpec`. Việc chạy và giám sát nằm ở `pipeline::supervisor`.

pub mod first_run;
pub mod integrity;
pub mod paths;
pub mod probe;
