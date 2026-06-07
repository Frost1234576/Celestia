use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct CompileResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
}

#[tauri::command]
pub async fn stella_compile(file_path: String, output_dir: String) -> Result<CompileResult, String> {
    let out_jar = Path::new(&output_dir).join("out.jar");
    let output = tokio::process::Command::new("stella")
        .args(["compile", &file_path, "-o", &out_jar.to_string_lossy()])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    Ok(CompileResult {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}
