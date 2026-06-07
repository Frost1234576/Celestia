use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use zip::ZipArchive;

// ── types ──────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    #[serde(rename = "isDirectory")]
    pub is_directory: bool,
    #[serde(rename = "isArchive")]
    pub is_archive: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum ReadFileResult {
    #[serde(rename = "text")]
    Text { content: String },
    #[serde(rename = "binary")]
    Binary { message: String },
    #[serde(rename = "archive")]
    Archive { message: String },
    #[serde(rename = "error")]
    Error { message: String },
}

// ── helpers ─────────────────────────────────────────────────────────────────

const ARCHIVE_EXTS: &[&str] = &["zip", "jar", "war", "ear"];
const TEXT_EXTS: &[&str] = &[
    "txt", "md", "json", "xml", "yaml", "yml", "toml", "ini", "cfg", "conf", "ts", "tsx", "js",
    "jsx", "py", "java", "kt", "kts", "st", "css", "html", "sh", "ps1", "bat", "cmd", "gradle",
    "properties", "gitignore", "env", "csv", "sql", "rs", "go", "c", "cpp", "h", "hpp", "cs",
    "rb", "php", "lua", "vue", "svelte", "svg", "log", "stella",
];

fn ext(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
}

fn is_archive(path: &Path) -> bool {
    ARCHIVE_EXTS.contains(&ext(path).as_str())
}

fn is_likely_binary(buf: &[u8]) -> bool {
    let sample = &buf[..buf.len().min(8192)];
    sample.contains(&0)
}

fn archive_uri(archive_path: &str, entry: &str) -> String {
    format!("archive://{}#{}", archive_path, entry.replace('\\', "/"))
}

fn parse_archive_uri(uri: &str) -> Option<(String, String)> {
    let rest = uri.strip_prefix("archive://")?;
    let idx = rest.find('#')?;
    Some((rest[..idx].to_string(), rest[idx + 1..].to_string()))
}

fn is_hidden(name: &str) -> bool {
    name.starts_with('.') || name == "node_modules"
}

// ── commands ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn fs_read_dir(dir_path: String) -> Result<Vec<FileNode>, String> {
    read_dir_recursive(Path::new(&dir_path)).map_err(|e| e.to_string())
}

fn read_dir_recursive(dir: &Path) -> std::io::Result<Vec<FileNode>> {
    let mut entries = std::fs::read_dir(dir)?
        .filter_map(|e| e.ok())
        .filter(|e| !is_hidden(&e.file_name().to_string_lossy()))
        .collect::<Vec<_>>();

    entries.sort_by(|a, b| {
        let a_dir = a.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let b_dir = b.file_type().map(|t| t.is_dir()).unwrap_or(false);
        match (a_dir, b_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.file_name().cmp(&b.file_name()),
        }
    });

    let mut nodes = Vec::new();
    for entry in entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let ft = entry.file_type()?;

        if is_archive(&path) {
            let archive_path = path.to_string_lossy().to_string();
            nodes.push(FileNode {
                name,
                path: archive_uri(&archive_path, ""),
                is_directory: true,
                is_archive: true,
                children: None,
            });
        } else if ft.is_dir() {
            let children = read_dir_recursive(&path).unwrap_or_default();
            nodes.push(FileNode {
                path: path.to_string_lossy().to_string(),
                name,
                is_directory: true,
                is_archive: false,
                children: Some(children),
            });
        } else {
            nodes.push(FileNode {
                path: path.to_string_lossy().to_string(),
                name,
                is_directory: false,
                is_archive: false,
                children: None,
            });
        }
    }
    Ok(nodes)
}

#[tauri::command]
pub fn fs_read_archive_tree(uri_or_path: String) -> Result<Vec<FileNode>, String> {
    let (archive_path, prefix) = parse_archive_uri(&uri_or_path)
        .map(|(p, e)| {
            // Normalize prefix: strip trailing slash, ensure it ends with "/" for matching
            let prefix = if e.is_empty() { String::new() } else {
                if e.ends_with('/') { e } else { format!("{}/", e) }
            };
            (p, prefix)
        })
        .unwrap_or_else(|| (uri_or_path.clone(), String::new()));

    let file = std::fs::File::open(&archive_path).map_err(|e| e.to_string())?;
    let mut zip = ZipArchive::new(file).map_err(|e| e.to_string())?;

    // Collect all entry names (files only; dirs are implicit)
    let mut all_names: Vec<String> = Vec::new();
    for i in 0..zip.len() {
        let entry = zip.by_index(i).map_err(|e| e.to_string())?;
        if !entry.is_dir() {
            all_names.push(entry.name().replace('\\', "/"));
        }
    }

    Ok(build_tree(&archive_path, &prefix, &all_names))
}

fn build_tree(archive_path: &str, prefix: &str, all_names: &[String]) -> Vec<FileNode> {
    // depth = number of '/' segments in prefix
    let prefix_depth = if prefix.is_empty() {
        0
    } else {
        prefix.trim_end_matches('/').split('/').count()
    };

    let mut seen_dirs: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut nodes: Vec<FileNode> = Vec::new();

    for name in all_names {
        // Must be inside this prefix
        if !name.starts_with(prefix) {
            continue;
        }

        let rest = &name[prefix.len()..]; // relative to current dir
        if rest.is_empty() {
            continue;
        }

        let parts: Vec<&str> = rest.split('/').collect();
        let immediate = parts[0];

        if parts.len() == 1 {
            // Direct file child
            nodes.push(FileNode {
                name: immediate.to_string(),
                path: archive_uri(archive_path, &format!("{}{}", prefix, immediate)),
                is_directory: false,
                is_archive: false,
                children: None,
            });
        } else {
            // Immediate subdirectory
            if seen_dirs.insert(immediate.to_string()) {
                let dir_entry = format!("{}{}/", prefix, immediate);
                nodes.push(FileNode {
                    name: immediate.to_string(),
                    path: archive_uri(archive_path, dir_entry.trim_end_matches('/')),
                    is_directory: true,
                    is_archive: false,
                    children: Some(vec![]), // lazy — frontend expands on click
                });
            }
        }
    }

    nodes.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.cmp(&b.name),
    });

    nodes
}

#[tauri::command]
pub async fn fs_read_file(file_path: String) -> ReadFileResult {
    if let Some((archive_path, entry_path)) = parse_archive_uri(&file_path) {
        return read_from_archive(&archive_path, &entry_path).await;
    }

    let path = Path::new(&file_path);

    if is_archive(path) {
        return ReadFileResult::Archive {
            message: "Archive — expand in explorer to browse contents".to_string(),
        };
    }

    let buf = match std::fs::read(path) {
        Ok(b) => b,
        Err(e) => return ReadFileResult::Error { message: e.to_string() },
    };

    let extension = ext(path);
    if extension == "class" {
        return decompile_class(path).await;
    }

    if is_likely_binary(&buf) {
        return ReadFileResult::Binary {
            message: "Binary-encoded file — cannot display in editor".to_string(),
        };
    }

    ReadFileResult::Text {
        content: String::from_utf8_lossy(&buf).into_owned(),
    }
}

async fn read_from_archive(archive_path: &str, entry_path: &str) -> ReadFileResult {
    let buf = {
        let file = match std::fs::File::open(archive_path) {
            Ok(f) => f,
            Err(e) => return ReadFileResult::Error { message: e.to_string() },
        };
        let mut zip = match ZipArchive::new(file) {
            Ok(z) => z,
            Err(e) => return ReadFileResult::Error { message: e.to_string() },
        };

        let mut entry = match zip.by_name(entry_path) {
            Ok(e) => e,
            Err(e) => return ReadFileResult::Error { message: format!("Entry not found: {e}") },
        };

        let mut buf = Vec::new();
        if let Err(e) = entry.read_to_end(&mut buf) {
            return ReadFileResult::Error { message: e.to_string() };
        }
        buf
    };

    let entry_ext = Path::new(entry_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if entry_ext == "class" {
        let tmp = match tempfile::NamedTempFile::new() {
            Ok(t) => t,
            Err(e) => return ReadFileResult::Error { message: e.to_string() },
        };
        if let Err(e) = std::fs::write(tmp.path(), &buf) {
            return ReadFileResult::Error { message: e.to_string() };
        }
        return decompile_class(tmp.path()).await;
    }

    if is_likely_binary(&buf) && !TEXT_EXTS.contains(&entry_ext.as_str()) {
        return ReadFileResult::Binary {
            message: format!("Binary file inside archive ({entry_path}) — cannot display"),
        };
    }

    ReadFileResult::Text {
        content: String::from_utf8_lossy(&buf).into_owned(),
    }
}

async fn decompile_class(class_path: &Path) -> ReadFileResult {
    // Resolve cfr.jar relative to the app resources directory
    let cfr_jar = {
        let mut p = std::env::current_exe()
            .unwrap_or_else(|_| PathBuf::from("."))
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."));
        // In Tauri dev the resources are two levels up; handle both
        if !p.join("resources/cfr.jar").exists() {
            p = p.parent().map(|p| p.to_path_buf()).unwrap_or(p);
        }
        p.join("resources/cfr.jar")
    };

    let output = tokio::process::Command::new("java")
        .args(["-jar", &cfr_jar.to_string_lossy(), &class_path.to_string_lossy()])
        .output()
        .await;

    match output {
        Ok(out) if !out.stdout.is_empty() => ReadFileResult::Text {
            content: String::from_utf8_lossy(&out.stdout).into_owned(),
        },
        Ok(out) => ReadFileResult::Text {
            content: format!(
                "// decompile failed: {}",
                String::from_utf8_lossy(&out.stderr)
            ),
        },
        Err(e) => ReadFileResult::Text {
            content: format!("// decompile failed: {e}"),
        },
    }
}

#[tauri::command]
pub fn fs_write_file(file_path: String, content: String) -> Result<bool, String> {
    if file_path.starts_with("archive://") {
        return Ok(false);
    }
    std::fs::write(&file_path, content).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn fs_create_file(file_path: String) -> Result<bool, String> {
    std::fs::write(&file_path, "").map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn fs_create_dir(dir_path: String) -> Result<bool, String> {
    std::fs::create_dir_all(&dir_path).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn fs_rename(old_path: String, new_path: String) -> Result<bool, String> {
    std::fs::rename(&old_path, &new_path).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn fs_delete(target_path: String) -> Result<bool, String> {
    let path = Path::new(&target_path);
    if path.is_dir() {
        std::fs::remove_dir_all(path).map_err(|e| e.to_string())?;
    } else {
        std::fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(true)
}

#[tauri::command]
pub fn fs_exists(target_path: String) -> bool {
    Path::new(&target_path).exists()
}
