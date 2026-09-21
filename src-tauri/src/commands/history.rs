use crate::storage;
use tauri::Emitter;

#[tauri::command]
pub async fn get_history(
    state: tauri::State<'_, storage::HistoryStore>,
    config: tauri::State<'_, storage::ConfigManager>,
    limit: u32,
    offset: u32,
) -> Result<Vec<storage::HistoryEntry>, String> {
    let config = config.load().await.map_err(|e| e.to_string())?;
    state
        .prune_with_policy(
            &config.history_retention_policy(),
            &chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string(),
        )
        .await
        .map_err(|e| e.to_string())?;
    state
        .list(limit.min(2000), offset)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_history(state: tauri::State<'_, storage::HistoryStore>) -> Result<(), String> {
    state.clear().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_history_entries(
    app: tauri::AppHandle,
    state: tauri::State<'_, storage::HistoryStore>,
    ids: Vec<i64>,
) -> Result<(), String> {
    state.delete_ids(&ids).await.map_err(|e| e.to_string())?;
    let _ = app.emit("history:changed", ());
    Ok(())
}
