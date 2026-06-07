use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

fn parse_archive_path(uri: &str) -> Option<String> {
    let rest = uri.strip_prefix("archive://")?;
    Some(rest[..rest.find('#')?].to_string())
}

#[tauri::command]
pub async fn shell_show_item_in_folder(app: AppHandle, target_path: String) -> Result<bool, String> {
    let path = parse_archive_path(&target_path).unwrap_or(target_path);

    // Cross-platform reveal
    #[cfg(target_os = "macos")]
    app.shell()
        .command("open")
        .args(["-R", &path])
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    app.shell()
        .command("explorer")
        .args([&format!("/select,{}", path)])
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    app.shell()
        .command("xdg-open")
        .args([
            std::path::Path::new(&path)
                .parent()
                .and_then(|p| p.to_str())
                .unwrap_or(&path),
        ])
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(true)
}
