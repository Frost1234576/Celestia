use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, FilePath};

#[tauri::command]
pub async fn dialog_open_folder(app: AppHandle) -> Option<String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .pick_folder(move |path| {
            let _ = tx.send(path);
        });
    rx.await
        .ok()
        .flatten()
        .and_then(|p| match p {
            FilePath::Path(pb) => pb.to_str().map(String::from),
            _ => None,
        })
}

#[tauri::command]
pub async fn dialog_open_file(app: AppHandle) -> Option<String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("Stella", &["st"])
        .add_filter("All Files", &["*"])
        .pick_file(move |path| {
            let _ = tx.send(path);
        });
    rx.await
        .ok()
        .flatten()
        .and_then(|p| match p {
            FilePath::Path(pb) => pb.to_str().map(String::from),
            _ => None,
        })
}
