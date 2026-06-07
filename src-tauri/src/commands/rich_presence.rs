use crate::rich_presence::{RichPresenceCmd, RP_SENDER};

#[tauri::command]
pub fn rich_presence_set(
    details: String,
    state: Option<String>,
    project_name: Option<String>,
    small_image_key: Option<String>,
) {
    if let Some(tx) = RP_SENDER.get() {
        let _ = tx.send(RichPresenceCmd::Set {
            details,
            state,
            project_name,
            small_image_key,
        });
    }
}

#[tauri::command]
pub fn rich_presence_clear() {
    if let Some(tx) = RP_SENDER.get() {
        let _ = tx.send(RichPresenceCmd::Clear);
    }
}
