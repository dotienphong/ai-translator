//! Lệnh của quản lý model, chỉ cửa sổ `main` gọi được (§10.2). Lệnh có thể chặn lâu (gọi mạng, xóa vài GB) là `async`
//! và chạy trên luồng của `spawn_blocking`; việc tải chạy trên luồng riêng, lệnh trả về ngay.

use std::sync::Arc;

use tauri::{AppHandle, Manager, Runtime, State};

use super::service::{ModelService, ModelsView};
use crate::errors::{self, CommandError};
use crate::settings::Settings;

fn service<R: Runtime>(app: &AppHandle<R>) -> Arc<ModelService> {
    app.state::<Arc<ModelService>>().inner().clone()
}

async fn blocking<R: Runtime, T: Send + 'static>(
    app: AppHandle<R>,
    f: impl FnOnce(&AppHandle<R>, &ModelService) -> T + Send + 'static,
) -> Result<T, CommandError> {
    tauri::async_runtime::spawn_blocking(move || f(&app, &service(&app)))
        .await
        .map_err(|e| CommandError::new(errors::UNKNOWN, None, e.to_string()))
}

#[tauri::command]
pub fn get_models_state<R: Runtime>(app: AppHandle<R>, models: State<'_, Arc<ModelService>>) -> ModelsView {
    models.view(&app)
}

/// Đọc manifest; tải bản mới nếu chưa có hay đã quá một ngày (§6.7).
#[tauri::command]
pub async fn load_models<R: Runtime>(app: AppHandle<R>) -> Result<ModelsView, CommandError> {
    blocking(app, |app, models| models.load(app)).await
}

/// Bắt đầu tải; việc tải chạy trên luồng riêng. Lệnh vẫn `async`: kiểm dung lượng trống, cấu hình máy, đọc kho có thể
/// chậm, và không lệnh nào của quản lý model chạy trên luồng chính (Q2 của review 04).
#[tauri::command]
pub async fn download_models<R: Runtime>(app: AppHandle<R>, pack: String) -> Result<ModelsView, CommandError> {
    tauri::async_runtime::spawn_blocking(move || service(&app).download(&app, &pack))
        .await
        .map_err(|e| CommandError::new(errors::UNKNOWN, None, e.to_string()))?
}

/// "Tải lại": băm lại gói, bỏ file hỏng (băm 2,5 GB mất vài giây).
#[tauri::command]
pub async fn verify_models<R: Runtime>(app: AppHandle<R>, pack: String) -> Result<ModelsView, CommandError> {
    blocking(app, move |app, models| models.verify(app, &pack)).await?
}

#[tauri::command]
pub fn pause_models_download<R: Runtime>(app: AppHandle<R>, models: State<'_, Arc<ModelService>>) -> ModelsView {
    models.pause(&app)
}

#[tauri::command]
pub fn select_model_pack<R: Runtime>(
    app: AppHandle<R>,
    models: State<'_, Arc<ModelService>>,
    pack: String,
) -> Result<Settings, CommandError> {
    models.select(&app, &pack)
}

#[tauri::command]
pub async fn delete_models<R: Runtime>(app: AppHandle<R>, pack: String) -> Result<ModelsView, CommandError> {
    blocking(app, move |app, models| models.delete(app, &pack)).await?
}

/// Nút "Xóa model và dữ liệu" (§4.3, A6).
#[tauri::command]
pub async fn delete_models_and_data<R: Runtime>(app: AppHandle<R>) -> Result<ModelsView, CommandError> {
    blocking(app, |app, models| {
        let view = models.delete_all(app)?;
        wipe_user_data(app)?;
        Ok(view)
    })
    .await?
}

#[tauri::command]
pub fn dismiss_models_update<R: Runtime>(app: AppHandle<R>, models: State<'_, Arc<ModelService>>) -> ModelsView {
    models.dismiss_update(&app)
}

/// Phần "dữ liệu" của nút "Xóa model và dữ liệu": lịch sử, bản chép lời và từ điển thuật ngữ, cùng việc với nút "Xóa
/// toàn bộ dữ liệu" của kế hoạch 03 (`data::clear_all_data`). Bản quyền và bộ đếm hạn mức trong kho khóa giữ nguyên
/// (Q14).
fn wipe_user_data<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
    crate::data::clear_all_data(app)
}
