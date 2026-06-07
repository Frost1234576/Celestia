mod diff;
mod system_prompt;
mod tools;

use diff::DiffLine;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tools::{execute_tool, ToolContext};

const OLLAMA: &str = "http://127.0.0.1:11434/api/chat";
const MAX_STEPS: usize = 20;
const MAX_CONSECUTIVE_ERRORS: usize = 3;

// ── public types ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentToolEvent {
    pub id: String,
    pub name: String,
    pub args: HashMap<String, serde_json::Value>,
    pub status: String, // "running" | "done" | "error"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diff: Option<Vec<DiffLine>>,
    #[serde(rename = "filePath", skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenFile {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HistoryMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentRunRequest {
    pub model: String,
    #[serde(rename = "userMessage")]
    pub user_message: String,
    pub history: Vec<HistoryMessage>,
    #[serde(rename = "projectPath")]
    pub project_path: Option<String>,
    #[serde(rename = "openFiles")]
    pub open_files: Vec<OpenFile>,
    #[serde(rename = "activeFilePath")]
    pub active_file_path: Option<String>,
    #[serde(rename = "referencedFiles")]
    pub referenced_files: Vec<OpenFile>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentRunResult {
    pub content: String,
    #[serde(rename = "toolEvents")]
    pub tool_events: Vec<AgentToolEvent>,
    #[serde(rename = "filesChanged")]
    pub files_changed: bool,
}

// ── Ollama wire types ────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
struct OllamaMessage {
    role: String,
    content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<OllamaToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct OllamaToolCall {
    function: OllamaFunction,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct OllamaFunction {
    name: String,
    arguments: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct OllamaChatResponse {
    message: OllamaMessage,
}

// ── helpers ──────────────────────────────────────────────────────────────────

fn agent_tools() -> serde_json::Value {
    serde_json::json!([
        {
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Read file contents. Use relative path from project root.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string" },
                        "start_line": { "type": "number" },
                        "end_line": { "type": "number" }
                    },
                    "required": ["path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "edit_file",
                "description": "Replace exact text in a file. old_string must match exactly once.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string" },
                        "old_string": { "type": "string" },
                        "new_string": { "type": "string" }
                    },
                    "required": ["path", "old_string", "new_string"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "Create or overwrite entire file.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string" },
                        "content": { "type": "string" }
                    },
                    "required": ["path", "content"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_directory",
                "description": "List files and folders in a directory.",
                "parameters": {
                    "type": "object",
                    "properties": { "path": { "type": "string" } }
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "search_codebase",
                "description": "Search for regex pattern in project files.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pattern": { "type": "string" },
                        "glob": { "type": "string" }
                    },
                    "required": ["pattern"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "summarize_file",
                "description": "Get file metadata and a short preview.",
                "parameters": {
                    "type": "object",
                    "properties": { "path": { "type": "string" } },
                    "required": ["path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "web_search",
                "description": "Search the web for documentation, errors, or APIs.",
                "parameters": {
                    "type": "object",
                    "properties": { "query": { "type": "string" } },
                    "required": ["query"]
                }
            }
        }
    ])
}

fn parse_tool_args(raw: &serde_json::Value) -> HashMap<String, serde_json::Value> {
    match raw {
        serde_json::Value::Object(m) => m.clone().into_iter().collect(),
        serde_json::Value::String(s) => {
            serde_json::from_str(s).unwrap_or_default()
        }
        _ => HashMap::new(),
    }
}

fn extract_fallback_tool_calls(
    text: &str,
) -> Vec<(String, HashMap<String, serde_json::Value>)> {
    let re = regex::Regex::new(r"```(?:json|tool)?\s*(\{[\s\S]*?\})\s*```").unwrap();
    let mut out = Vec::new();
    for cap in re.captures_iter(text) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&cap[1]) {
            if let Some(name) = val.get("tool").or_else(|| val.get("name")) {
                if let Some(name_str) = name.as_str() {
                    let args = val
                        .get("args")
                        .or_else(|| val.get("arguments"))
                        .or_else(|| val.get("parameters"))
                        .and_then(|v| v.as_object())
                        .map(|m| m.clone().into_iter().collect())
                        .unwrap_or_default();
                    out.push((name_str.to_string(), args));
                }
            }
        }
    }
    out
}

fn build_error_guidance(
    tool_name: &str,
    error_output: &str,
    args: &HashMap<String, serde_json::Value>,
) -> String {
    if tool_name == "edit_file" {
        if error_output.contains("not found") {
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            return format!(
                "\nACTION REQUIRED: The old_string was not found verbatim.\n\
                 1. Call read_file on \"{path}\" to get exact content.\n\
                 2. Copy the exact text character-for-character.\n\
                 3. Retry edit_file with that exact text."
            );
        }
        if error_output.contains("matches") {
            return "\nACTION REQUIRED: old_string is not unique — add more surrounding lines to make it unique, then retry.".to_string();
        }
    }
    if (tool_name == "read_file" || tool_name == "summarize_file")
        && error_output.contains("not found")
    {
        return "\nThe file path may be wrong. Call list_directory to find the correct path, then retry.".to_string();
    }
    "\nThis was an error. Diagnose the problem and retry or take an alternative approach.".to_string()
}

async fn ollama_chat(
    client: &reqwest::Client,
    model: &str,
    messages: &[OllamaMessage],
    use_tools: bool,
) -> Result<OllamaMessage, String> {
    let mut body = serde_json::json!({ "model": model, "messages": messages, "stream": false });
    if use_tools {
        body["tools"] = agent_tools();
    }

    let res = client
        .post(OLLAMA)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_default());
    }

    let data: OllamaChatResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(data.message)
}

// ── main entry point ─────────────────────────────────────────────────────────

pub async fn run_agent(req: AgentRunRequest) -> Result<AgentRunResult, String> {
    let client = reqwest::Client::new();
    let mut tool_events: Vec<AgentToolEvent> = Vec::new();
    let mut files_changed = false;
    let mut tool_id: usize = 0;
    let mut consecutive_errors: usize = 0;

    let mut open_map: HashMap<String, String> = HashMap::new();
    for f in &req.open_files {
        open_map.insert(f.path.clone(), f.content.clone());
    }
    for f in &req.referenced_files {
        open_map.insert(f.path.clone(), f.content.clone());
    }

    let mut ctx = ToolContext {
        project_path: req.project_path.clone(),
        open_file_contents: open_map,
    };

    // Build referenced files section for system prompt
    let ref_section = if req.referenced_files.is_empty() {
        String::new()
    } else {
        let mut s = "\n\n## Referenced files\nThe user has explicitly attached these files. Treat their content as authoritative.\n\n".to_string();
        for f in &req.referenced_files {
            let rel = req.project_path.as_deref().and_then(|root| {
                f.path.strip_prefix(root).map(|p| p.trim_start_matches(['/', '\\']))
            }).unwrap_or(&f.path);
            s.push_str(&format!("### {rel}\n```\n{}\n```\n\n", &f.content[..f.content.len().min(8000)]));
        }
        s
    };

    let system_content = system_prompt::build(
        req.project_path.as_deref(),
        &req.open_files.iter().map(|f| f.path.as_str()).collect::<Vec<_>>(),
        req.active_file_path.as_deref(),
    ) + &ref_section;

    let mut messages: Vec<OllamaMessage> = vec![
        OllamaMessage { role: "system".into(), content: system_content, tool_calls: None, tool_name: None },
    ];
    for h in &req.history {
        messages.push(OllamaMessage { role: h.role.clone(), content: h.content.clone(), tool_calls: None, tool_name: None });
    }
    messages.push(OllamaMessage { role: "user".into(), content: req.user_message.clone(), tool_calls: None, tool_name: None });

    let mut final_content = String::new();

    for step in 0..MAX_STEPS {
        if consecutive_errors >= MAX_CONSECUTIVE_ERRORS {
            let mut force_msgs = messages.clone();
            force_msgs.push(OllamaMessage {
                role: "user".into(),
                content: "You have hit repeated errors. Stop using tools and give your best answer.".into(),
                tool_calls: None,
                tool_name: None,
            });
            let msg = ollama_chat(&client, &req.model, &force_msgs, false).await?;
            final_content = msg.content;
            break;
        }

        let use_tools = step < MAX_STEPS - 1;
        let msg = ollama_chat(&client, &req.model, &messages, use_tools).await?;

        let mut tool_calls: Vec<(String, HashMap<String, serde_json::Value>)> = msg
            .tool_calls
            .as_deref()
            .unwrap_or(&[])
            .iter()
            .map(|tc| (tc.function.name.clone(), parse_tool_args(&tc.function.arguments)))
            .collect();

        if tool_calls.is_empty() && !msg.content.is_empty() {
            tool_calls = extract_fallback_tool_calls(&msg.content);
        }

        if tool_calls.is_empty() {
            final_content = msg.content.clone();
            break;
        }

        messages.push(OllamaMessage {
            role: "assistant".into(),
            content: msg.content.clone(),
            tool_calls: msg.tool_calls.clone(),
            tool_name: None,
        });

        for (name, args) in &tool_calls {
            tool_id += 1;
            let id = format!("tool-{tool_id}");
            let ev = AgentToolEvent {
                id: id.clone(),
                name: name.clone(),
                args: args.clone(),
                status: "running".into(),
                output: None,
                diff: None,
                file_path: None,
            };
            tool_events.push(ev.clone());

            let result = execute_tool(name, args, &mut ctx).await;
            let ev_ref = tool_events.last_mut().unwrap();

            ev_ref.status = if result.ok { "done".into() } else { "error".into() };
            ev_ref.output = Some(result.output.clone());
            ev_ref.diff = result.diff.clone();
            ev_ref.file_path = result.file_path.clone();

            if result.files_changed {
                files_changed = true;
            }

            let tool_msg_content = if !result.ok {
                consecutive_errors += 1;
                let guidance = build_error_guidance(name, &result.output, args);
                format!("ERROR: {}{}", result.output, guidance)
            } else {
                consecutive_errors = 0;
                result.output.clone()
            };

            messages.push(OllamaMessage {
                role: "tool".into(),
                content: tool_msg_content,
                tool_calls: None,
                tool_name: Some(name.clone()),
            });
        }
    }

    if final_content.is_empty() {
        let msg = ollama_chat(&client, &req.model, &messages, false).await?;
        final_content = msg.content;
        if final_content.is_empty() {
            final_content = "Done.".into();
        }
    }

    Ok(AgentRunResult { content: final_content, tool_events, files_changed })
}
