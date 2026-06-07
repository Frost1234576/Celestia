use tauri::{AppHandle, Manager, WebviewWindow};

fn get_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

#[tauri::command]
pub fn window_minimize(app: AppHandle) {
    if let Some(w) = get_window(&app) {
        let _ = w.minimize();
    }
}

#[tauri::command]
pub fn window_maximize(app: AppHandle) {
    if let Some(w) = get_window(&app) {
        if w.is_maximized().unwrap_or(false) {
            let _ = w.unmaximize();
        } else {
            let _ = w.maximize();
        }
    }
}

#[tauri::command]
pub fn window_close(app: AppHandle) {
    if let Some(w) = get_window(&app) {
        let _ = w.close();
    }
}

#[tauri::command]
pub fn window_is_maximized(app: AppHandle) -> bool {
    get_window(&app)
        .and_then(|w| w.is_maximized().ok())
        .unwrap_or(false)
}
