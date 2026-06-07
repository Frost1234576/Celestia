use crate::agent::diff::{compute_line_diff, DiffLine};
use regex::Regex;
use std::collections::HashMap;
use std::path::Path;

pub struct ToolContext {
    pub project_path: Option<String>,
    pub open_file_contents: HashMap<String, String>,
}

pub struct ToolResult {
    pub ok: bool,
    pub output: String,
    pub diff: Option<Vec<DiffLine>>,
    pub file_path: Option<String>,
    pub files_changed: bool,
}

impl ToolResult {
    fn ok(output: impl Into<String>) -> Self {
        Self { ok: true, output: output.into(), diff: None, file_path: None, files_changed: false }
    }
    fn err(output: impl Into<String>) -> Self {
        Self { ok: false, output: output.into(), diff: None, file_path: None, files_changed: false }
    }
}

fn resolve_path(ctx: &ToolContext, file_path: &str) -> Option<String> {
    let root = ctx.project_path.as_deref()?;
    if file_path == "." || file_path == "./" {
        return Some(root.to_string());
    }
    let p = Path::new(file_path);
    if p.is_absolute() {
        let norm = p.to_string_lossy().to_string();
        if norm.starts_with(root) { Some(norm) } else { None }
    } else {
        Some(
            Path::new(root)
                .join(file_path)
                .to_string_lossy()
                .to_string(),
        )
    }
}

fn read_text_file(abs: &str) -> Result<String, String> {
    let buf = std::fs::read(abs).map_err(|e| e.to_string())?;
    if buf.contains(&0) {
        return Err("Binary file — cannot read as text".to_string());
    }
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

fn walk_dir(dir: &str, out: &mut Vec<String>) {
    if let Ok(rd) = std::fs::read_dir(dir) {
        for entry in rd.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name == "node_modules" {
                continue;
            }
            let path = entry.path().to_string_lossy().to_string();
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                walk_dir(&path, out);
            } else {
                out.push(path);
            }
        }
    }
}

async fn web_search(query: &str) -> String {
    let url = format!(
        "https://api.duckduckgo.com/?q={}&format=json&no_redirect=1",
        urlencoding::encode(query)
    );
    let client = reqwest::Client::new();
    let Ok(res) = client
        .get(&url)
        .header("User-Agent", "CelestiaAgent/1.0")
        .send()
        .await
    else {
        return "Search failed".to_string();
    };
    let Ok(data) = res.json::<serde_json::Value>().await else {
        return "Search parse failed".to_string();
    };

    let mut parts: Vec<String> = Vec::new();
    if let Some(t) = data["AbstractText"].as_str().filter(|s| !s.is_empty()) {
        parts.push(t.to_string());
        if let Some(u) = data["AbstractURL"].as_str() {
            parts.push(u.to_string());
        }
    }
    if let Some(topics) = data["RelatedTopics"].as_array() {
        for t in topics.iter().take(5) {
            if let Some(text) = t["Text"].as_str() {
                parts.push(format!("• {text}"));
            }
        }
    }
    if parts.is_empty() { "No results found.".to_string() } else { parts.join("\n") }
}

fn str_val(args: &HashMap<String, serde_json::Value>, key: &str) -> String {
    args.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

pub async fn execute_tool(
    name: &str,
    args: &HashMap<String, serde_json::Value>,
    ctx: &mut ToolContext,
) -> ToolResult {
    match name {
        "read_file" => {
            let path_arg = str_val(args, "path");
            // strip archive notation suffix after ':'
            let path_clean = path_arg.split(':').next().unwrap_or(&path_arg).to_string();
            let Some(abs) = resolve_path(ctx, &path_clean) else {
                return ToolResult::err("Invalid path or no project open");
            };

            let raw = ctx
                .open_file_contents
                .get(&abs)
                .cloned()
                .or_else(|| read_text_file(&abs).ok());

            let Some(content) = raw else {
                return ToolResult::err("File not found");
            };

            let lines: Vec<&str> = content.lines().collect();
            let start = args.get("start_line").and_then(|v| v.as_u64()).unwrap_or(1).max(1) as usize;
            let end = args.get("end_line").and_then(|v| v.as_u64()).unwrap_or(lines.len() as u64) as usize;
            let end = end.min(lines.len());

            let numbered: String = lines[start - 1..end]
                .iter()
                .enumerate()
                .map(|(i, l)| format!("{}|{}", start + i, l))
                .collect::<Vec<_>>()
                .join("\n");

            ToolResult { ok: true, output: numbered, diff: None, file_path: Some(abs), files_changed: false }
        }

        "edit_file" => {
            let path_arg = str_val(args, "path");
            let Some(abs) = resolve_path(ctx, &path_arg) else {
                return ToolResult::err("Invalid path");
            };
            let Ok(content) = read_text_file(&abs) else {
                return ToolResult::err("File not found");
            };

            let old_str = str_val(args, "old_string");
            let new_str = str_val(args, "new_string");
            let count = content.matches(&old_str as &str).count();

            if count == 0 {
                return ToolResult::err("old_string not found in file");
            }
            if count > 1 {
                return ToolResult::err(format!("old_string matches {count} times — must be unique"));
            }

            let updated = content.replacen(&old_str as &str, &new_str, 1);
            if let Err(e) = std::fs::write(&abs, &updated) {
                return ToolResult::err(e.to_string());
            }
            ctx.open_file_contents.insert(abs.clone(), updated.clone());

            ToolResult {
                ok: true,
                output: format!("Edited {path_arg}"),
                diff: Some(compute_line_diff(&content, &updated)),
                file_path: Some(abs),
                files_changed: true,
            }
        }

        "write_file" => {
            let path_arg = str_val(args, "path");
            let Some(abs) = resolve_path(ctx, &path_arg) else {
                return ToolResult::err("Invalid path");
            };
            let content = str_val(args, "content");
            let old_content = read_text_file(&abs).unwrap_or_default();

            if let Some(parent) = Path::new(&abs).parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if let Err(e) = std::fs::write(&abs, &content) {
                return ToolResult::err(e.to_string());
            }
            ctx.open_file_contents.insert(abs.clone(), content.clone());

            ToolResult {
                ok: true,
                output: format!("Wrote {path_arg}"),
                diff: if old_content != content {
                    Some(compute_line_diff(&old_content, &content))
                } else {
                    None
                },
                file_path: Some(abs),
                files_changed: true,
            }
        }

        "list_directory" => {
            let rel = {
                let v = str_val(args, "path");
                if v.is_empty() { ".".to_string() } else { v }
            };
            let Some(abs) = resolve_path(ctx, &rel) else {
                return ToolResult::err("Directory not found");
            };
            let Ok(rd) = std::fs::read_dir(&abs) else {
                return ToolResult::err("Directory not found");
            };
            let mut entries: Vec<String> = rd
                .flatten()
                .filter(|e| !e.file_name().to_string_lossy().starts_with('.'))
                .map(|e| {
                    let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
                    format!("{} {}", if is_dir { "📁" } else { "📄" }, e.file_name().to_string_lossy())
                })
                .collect();
            entries.sort();
            ToolResult::ok(if entries.is_empty() { "(empty)".into() } else { entries.join("\n") })
        }

        "search_codebase" => {
            let Some(root) = ctx.project_path.clone() else {
                return ToolResult::err("No project open");
            };
            let pattern = str_val(args, "pattern");
            let ext_filter = {
                let g = str_val(args, "glob");
                if g.is_empty() { None } else { Some(g.trim_start_matches('.').to_string()) }
            };

            let Ok(re) = Regex::new(&format!("(?i){pattern}")) else {
                return ToolResult::err("Invalid regex pattern");
            };

            let mut files = Vec::new();
            walk_dir(&root, &mut files);

            let mut hits = Vec::new();
            'outer: for file in files {
                if let Some(ref ext) = ext_filter {
                    if !file.ends_with(&format!(".{ext}")) {
                        continue;
                    }
                }
                let Ok(content) = read_text_file(&file) else { continue };
                let rel = file.strip_prefix(&root).unwrap_or(&file).trim_start_matches(['/', '\\']);
                for (i, line) in content.lines().enumerate() {
                    if re.is_match(line) {
                        hits.push(format!("{}:{}: {}", rel, i + 1, &line.trim()[..line.trim().len().min(120)]));
                        if hits.len() >= 40 {
                            break 'outer;
                        }
                    }
                }
            }
            ToolResult::ok(if hits.is_empty() { "No matches".into() } else { hits.join("\n") })
        }

        "summarize_file" => {
            let path_arg = str_val(args, "path");
            let Some(abs) = resolve_path(ctx, &path_arg) else {
                return ToolResult::err("Invalid path");
            };
            let Ok(content) = read_text_file(&abs) else {
                return ToolResult::err("File not found");
            };
            let lines: Vec<&str> = content.lines().collect();
            let preview: String = lines
                .iter()
                .take(30)
                .enumerate()
                .map(|(i, l)| format!("{}|{}", i + 1, l))
                .collect::<Vec<_>>()
                .join("\n");
            let summary = format!(
                "Path: {path_arg}\nLines: {}\nChars: {}\nPreview (first 30 lines):\n{preview}{}",
                lines.len(),
                content.len(),
                if lines.len() > 30 { format!("\n... {} more lines", lines.len() - 30) } else { String::new() }
            );
            ToolResult { ok: true, output: summary, diff: None, file_path: Some(abs), files_changed: false }
        }

        "web_search" => {
            let query = str_val(args, "query");
            let result = web_search(&query).await;
            ToolResult::ok(result)
        }

        _ => ToolResult::err(format!("Unknown tool: {name}")),
    }
}
