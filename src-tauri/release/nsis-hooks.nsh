; Macro cho bộ cài NSIS của Tauri (bundle.windows.nsis.installerHooks; kế hoạch 07a).
;
; Mẫu bộ cài của Tauri 2.12 đã có ô "xóa dữ liệu app" ở bộ gỡ: tick thì xóa %APPDATA%\com.aitranslator.desktop và
; %LOCALAPPDATA%\com.aitranslator.desktop (gồm model, spec §6.7, A6), và luôn xóa giá trị "AI Translator" ở
; HKCU\...\CurrentVersion\Run. Kho khóa (Credential Manager) giữ nguyên, vì bộ đếm hạn mức không mất khi gỡ app (§6.8).
;
; Macro dưới đây dọn thêm phần mẫu không làm (01 QĐ16): mục khởi động mà auto-launch 0.6.0 ghi ở HKLM (khi app từng chạy
; bằng quyền admin), và khóa StartupApproved của Task Manager ở cả hai nơi. Không làm khi bộ gỡ chạy để cập nhật, để giữ
; lựa chọn "khởi động cùng hệ thống" qua các bản. HKLM chỉ xóa được khi bộ gỡ có quyền admin; không có quyền thì lệnh
; lỗi mà không dừng bộ gỡ, và dòng chi tiết ghi lại để người hỗ trợ biết.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${PRODUCTNAME}"
    DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}"
    DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${PRODUCTNAME}"
    ClearErrors
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}"
    ${IfNot} ${Errors}
      DetailPrint "HKLM Run '${PRODUCTNAME}' is still present: run the uninstaller as administrator to remove it."
    ${EndIf}
  ${EndIf}
!macroend
