use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

pub struct PtyHandle {
    pub writer: Box<dyn Write + Send>,
    pub killer: Box<dyn portable_pty::Child + Send>,
    pub _slave: Box<dyn portable_pty::SlavePty + Send>, // keep alive
}

#[derive(Default)]
pub struct TerminalState(pub Arc<Mutex<HashMap<String, PtyHandle>>>);

pub fn spawn_pty(
    app: AppHandle,
    id: String,
    cwd: Option<String>,
    state: Arc<Mutex<HashMap<String, PtyHandle>>>,
) -> Result<(), String> {
    // println!("[pty] spawn_pty called for id={}", id);

    let pty_system = native_pty_system();
    // println!("[pty] native_pty_system acquired");

    let pair = pty_system
        .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| {
            // println!("[pty] openpty failed: {}", e);
            e.to_string()
        })?;
    // println!("[pty] openpty succeeded");

    let shell = if cfg!(target_os = "windows") {
        "powershell.exe".to_string()
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "bash".to_string())
    };
    // println!("[pty] using shell: {}", shell);

    let mut cmd = CommandBuilder::new(&shell);
    if let Some(dir) = cwd {
        // println!("[pty] cwd={}", dir);
        cmd.cwd(&dir);
    } else {
        let home = dirs_home();
        // println!("[pty] cwd=home({})", home);
        cmd.cwd(&home);
    }

    let slave = pair.slave;
    let child = slave.spawn_command(cmd).map_err(|e| {
        // println!("[pty] spawn_command failed: {}", e);
        e.to_string()
    })?;
    // println!("[pty] child spawned");

    let writer = pair.master.take_writer().map_err(|e| {
        // println!("[pty] take_writer failed: {}", e);
        e.to_string()
    })?;
    // println!("[pty] writer acquired");

    let mut reader = pair.master.try_clone_reader().map_err(|e| {
        // println!("[pty] try_clone_reader failed: {}", e);
        e.to_string()
    })?;
    // println!("[pty] reader acquired");

    let id_clone = id.clone();
    let app_clone = app.clone();
    let state_clone = state.clone();
    std::thread::spawn(move || {
        // println!("[pty] reader thread started for id={}", id_clone);
        let mut buf = [0u8; 1024];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    // println!("[pty] reader got EOF (Ok(0)) for id={}", id_clone);
                    let _ = app_clone.emit(&format!("terminal:exit:{}", id_clone), ());
                    break;
                }
                Err(e) => {
                    // println!("[pty] reader error for id={}: {}", id_clone, e);
                    let _ = app_clone.emit(&format!("terminal:exit:{}", id_clone), ());
                    break;
                }
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    // println!("[pty] emitting {} bytes for id={}: {:?}", n, id_clone, &data[..data.len().min(80)]);
                    let result = app_clone.emit(&format!("terminal:data:{}", id_clone), data);
                    if let Err(e) = result {
                        println!("[pty] emit error for id={}: {}", id_clone, e);
                    }
                }
            }
        }
        let mut map = state_clone.lock().unwrap();
        map.remove(&id_clone);
    });

    state.lock().unwrap().insert(
        id.clone(),
        PtyHandle { writer, killer: child, _slave: slave },
    );
    Ok(())
}

fn dirs_home() -> String {
    #[cfg(target_os = "windows")]
    return std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\".to_string());
    #[cfg(not(target_os = "windows"))]
    return std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
}