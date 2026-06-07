use crate::agent::{AgentRunRequest, AgentRunResult};

#[tauri::command]
pub async fn agent_run(payload: AgentRunRequest) -> Result<AgentRunResult, String> {
    crate::agent::run_agent(payload).await.map_err(|e| e.to_string())
}
