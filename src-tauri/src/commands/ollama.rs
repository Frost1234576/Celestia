use serde::{Deserialize, Serialize};

const OLLAMA_BASE: &str = "http://127.0.0.1:11434";

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ChatPayload {
    model: String,
    messages: Vec<OllamaMessage>,
    stream: bool,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    message: Option<MessageContent>,
}

#[derive(Debug, Deserialize)]
struct MessageContent {
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TagsResponse {
    models: Option<Vec<ModelEntry>>,
}

#[derive(Debug, Deserialize)]
struct ModelEntry {
    name: String,
}

#[tauri::command]
pub async fn ollama_chat(
    model: String,
    messages: Vec<OllamaMessage>,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let res = client
        .post(format!("{OLLAMA_BASE}/api/chat"))
        .json(&ChatPayload { model, messages, stream: false })
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Ollama error: {text}"));
    }

    let data: ChatResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(data.message.and_then(|m| m.content).unwrap_or_default())
}

#[tauri::command]
pub async fn ollama_list_models() -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let res = client
        .get(format!("{OLLAMA_BASE}/api/tags"))
        .send()
        .await
        .map_err(|_| "Ollama not reachable".to_string())?;

    let data: TagsResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(data.models.unwrap_or_default().into_iter().map(|m| m.name).collect())
}
