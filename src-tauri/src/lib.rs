mod commands;
mod rich_presence;
mod terminal;
mod agent;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Initialise Discord Rich Presence on a background thread
            let app_handle = app.handle().clone();
            rich_presence::init(app_handle);

            // Initialise terminal manager state
            app.manage(terminal::TerminalState::default());

            // Spawn LSP bridge for Kotlin language server
            let project_root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| std::path::PathBuf::from("."));
            
            let bridge_script = project_root.join("resources/lsp-bridge.cjs");

            if bridge_script.exists() {
                std::thread::spawn(move || {
                    let _ = std::process::Command::new("node")
                        .arg(&bridge_script)
                        .current_dir(&project_root)
                        .spawn();
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Window
            commands::window::window_minimize,
            commands::window::window_maximize,
            commands::window::window_close,
            commands::window::window_is_maximized,
            // Dialog
            commands::dialog::dialog_open_folder,
            commands::dialog::dialog_open_file,
            // Filesystem
            commands::fs::fs_read_dir,
            commands::fs::fs_read_archive_tree,
            commands::fs::fs_read_file,
            commands::fs::fs_write_file,
            commands::fs::fs_create_file,
            commands::fs::fs_create_dir,
            commands::fs::fs_rename,
            commands::fs::fs_delete,
            commands::fs::fs_exists,
            // Shell
            commands::shell::shell_show_item_in_folder,
            // Terminal
            commands::terminal::terminal_create,
            commands::terminal::terminal_write,
            commands::terminal::terminal_resize,
            commands::terminal::terminal_kill,
            // Ollama
            commands::ollama::ollama_chat,
            commands::ollama::ollama_list_models,
            // Agent
            commands::agent::agent_run,
            // Stella
            commands::stella::stella_compile,
            // Rich Presence
            commands::rich_presence::rich_presence_set,
            commands::rich_presence::rich_presence_clear,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Celestia");
}
