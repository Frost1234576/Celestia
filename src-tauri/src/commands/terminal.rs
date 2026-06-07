use crate::terminal::{spawn_pty, TerminalState};
use std::io::Write;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn terminal_create(
    app: AppHandle,
    state: State<'_, TerminalState>,
    id: String,
    cwd: Option<String>,
) -> Result<bool, String> {
    let arc = state.0.clone();
    spawn_pty(app, id, cwd, arc).map(|_| true)
}

#[tauri::command]
pub fn terminal_write(state: State<'_, TerminalState>, id: String, data: String) {
    let mut map = state.0.lock().unwrap();
    if let Some(h) = map.get_mut(&id) {
        let _ = h.writer.write_all(data.as_bytes());
    }
}

#[tauri::command]
pub fn terminal_resize(
    state: State<'_, TerminalState>,
    id: String,
    cols: u16,
    rows: u16,
) {
    // portable-pty doesn't expose resize on the writer directly;
    // we'd need to keep the master handle. For now this is a no-op stub —
    // the xterm.js side will still work, just without server-side resize propagation.
    // A full implementation stores the PtyMaster and calls resize() on it.
    let _ = (state, id, cols, rows);
}

#[tauri::command]
pub fn terminal_kill(state: State<'_, TerminalState>, id: String) {
    let mut map = state.0.lock().unwrap();
    if let Some(mut h) = map.remove(&id) {
        let _ = h.killer.kill();
    }
}
