use axum::{
    extract::{State, Json, Query},
    response::IntoResponse,
    http::StatusCode,
};
use crate::proxy::server::AppState;
use serde_json::json;
use serde::Deserialize;
use std::time::Duration; // Added

// --- DTOs ---

use crate::proxy::ProxyConfig;

#[derive(Deserialize)]
pub struct UpdateMappingRequestProxy {
    pub config: ProxyConfig,
}

#[derive(Deserialize)]
pub struct FetchZaiModelsRequest {
    pub zai: crate::proxy::ZaiConfig,
    pub upstream_proxy: crate::proxy::config::UpstreamProxyConfig,
    pub request_timeout: u64,
}

// --- Helpers ---

fn join_base_url(base: &str, path: &str) -> String {
    let base = base.trim_end_matches('/');
    let path = if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{}", path)
    };
    format!("{}{}", base, path)
}

fn extract_model_ids(value: &serde_json::Value) -> Vec<String> {
    let mut out = Vec::new();

    fn push_from_item(out: &mut Vec<String>, item: &serde_json::Value) {
        match item {
            serde_json::Value::String(s) => out.push(s.to_string()),
            serde_json::Value::Object(map) => {
                if let Some(id) = map.get("id").and_then(|v| v.as_str()) {
                    out.push(id.to_string());
                } else if let Some(name) = map.get("name").and_then(|v| v.as_str()) {
                    out.push(name.to_string());
                }
            }
            _ => {}
        }
    }

    match value {
        serde_json::Value::Array(arr) => {
            for item in arr {
                push_from_item(&mut out, item);
            }
        }
        serde_json::Value::Object(map) => {
            if let Some(data) = map.get("data") {
                if let serde_json::Value::Array(arr) = data {
                    for item in arr {
                        push_from_item(&mut out, item);
                    }
                }
            }
            if let Some(models) = map.get("models") {
                match models {
                    serde_json::Value::Array(arr) => {
                        for item in arr {
                            push_from_item(&mut out, item);
                        }
                    }
                    other => push_from_item(&mut out, other),
                }
            }
        }
        _ => {}
    }

    out
}

// --- Handlers ---

pub async fn handle_get_proxy_status(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let active_accounts = state.token_manager.len();
    
    let status = json!({
        "running": true,
        "active_accounts": active_accounts,
    });
    
    Json(json!({ "status": "success", "data": status })).into_response()
}

pub async fn handle_update_model_mapping(
    State(state): State<AppState>,
    Json(payload): Json<UpdateMappingRequestProxy>,
) -> impl IntoResponse {
    // Update memory
    state.update_mapping(&payload.config).await;
    
    // Save to disk
    if let Ok(mut app_config) = crate::modules::load_app_config() {
        app_config.proxy.custom_mapping = payload.config.custom_mapping;
        let _ = crate::modules::save_app_config(&app_config);
    }
    
    Json(json!({ "status": "success" })).into_response()
}

pub async fn handle_clear_session_bindings(
    State(state): State<AppState>,
) -> impl IntoResponse {
    state.token_manager.clear_all_sessions();
    Json(json!({ "status": "success" })).into_response()
}

// --- Monitor ---

pub async fn handle_get_proxy_stats(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let stats = state.monitor.get_stats().await;
    Json(json!({ "status": "success", "data": stats })).into_response()
}

#[derive(Deserialize)]
pub struct GetLogsQuery {
    limit: Option<usize>,
}

pub async fn handle_get_proxy_logs(
    State(state): State<AppState>,
    Query(query): Query<GetLogsQuery>,
) -> impl IntoResponse {
    let logs = state.monitor.get_logs(query.limit.unwrap_or(100)).await;
    Json(json!({ "status": "success", "data": logs })).into_response()
}

pub async fn handle_clear_proxy_logs(
    State(state): State<AppState>,
) -> impl IntoResponse {
    state.monitor.clear().await;
    Json(json!({ "status": "success" })).into_response()
}

#[derive(Deserialize)]
pub struct EnableMonitorRequest {
    enabled: bool,
}

pub async fn handle_set_monitor_enabled(
    State(state): State<AppState>,
    Json(payload): Json<EnableMonitorRequest>,
) -> impl IntoResponse {
    state.monitor.set_enabled(payload.enabled);
    Json(json!({ "status": "success" })).into_response()
}

// --- Utils ---

pub async fn handle_generate_api_key() -> impl IntoResponse {
    let key = format!("sk-{}", uuid::Uuid::new_v4().simple());
    Json(json!({ "status": "success", "data": key })).into_response()
}

pub async fn handle_fetch_zai_models(
    Json(payload): Json<FetchZaiModelsRequest>,
) -> impl IntoResponse {
    let zai = payload.zai;
    let upstream_proxy = payload.upstream_proxy;
    let request_timeout = payload.request_timeout;

    if zai.base_url.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({ "status": "error", "message": "z.ai base_url is empty" }))).into_response();
    }
    if zai.api_key.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({ "status": "error", "message": "z.ai api_key is not set" }))).into_response();
    }

    let url = join_base_url(&zai.base_url, "/v1/models");

    let mut builder = reqwest::Client::builder().timeout(Duration::from_secs(request_timeout.max(5)));
    if upstream_proxy.enabled && !upstream_proxy.url.is_empty() {
        if let Ok(proxy) = reqwest::Proxy::all(&upstream_proxy.url) {
            builder = builder.proxy(proxy);
        } else {
             return (StatusCode::BAD_REQUEST, Json(json!({ "status": "error", "message": "Invalid upstream proxy url" }))).into_response();
        }
    }
    
    let client = match builder.build() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "status": "error", "message": format!("Failed to build HTTP client: {}", e) }))).into_response(),
    };

    let resp_result = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", zai.api_key))
        .header("x-api-key", zai.api_key)
        .header("anthropic-version", "2023-06-01")
        .header("accept", "application/json")
        .send()
        .await;

    let resp = match resp_result {
        Ok(r) => r,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "status": "error", "message": format!("Upstream request failed: {}", e) }))).into_response(),
    };

    let status = resp.status();
    let text = match resp.text().await {
        Ok(t) => t,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "status": "error", "message": format!("Failed to read response: {}", e) }))).into_response(),
    };

    if !status.is_success() {
        let preview = if text.len() > 4000 { &text[..4000] } else { &text };
        return (StatusCode::BAD_REQUEST, Json(json!({ "status": "error", "message": format!("Upstream returned {}: {}", status, preview) }))).into_response();
    }

    let json_val: serde_json::Value = match serde_json::from_str(&text) {
        Ok(v) => v,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "status": "error", "message": format!("Invalid JSON response: {}", e) }))).into_response(),
    };
    
    let mut models = extract_model_ids(&json_val);
    models.retain(|s| !s.trim().is_empty());
    models.sort();
    models.dedup();
    
    Json(json!({ "status": "success", "data": models })).into_response()
}

// Stubs for start/stop
pub async fn handle_start_stop_stub() -> impl IntoResponse {
    (StatusCode::BAD_REQUEST, Json(json!({ "status": "error", "message": "Start/Stop not supported in Headless Mode" }))).into_response()
}

/// 重启服务 (Headless 模式专用)
/// 通过让进程优雅退出来触发重启，Docker 的 restart 策略会自动重启容器
pub async fn handle_restart_server() -> impl IntoResponse {
    tracing::info!("Restart requested via API, scheduling graceful shutdown...");
    
    // 返回成功响应后，延迟一小段时间再退出，确保响应能发送给客户端
    tokio::spawn(async {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        tracing::info!("Exiting process for restart...");
        std::process::exit(0);
    });
    
    Json(json!({ "status": "success", "message": "Server is restarting..." })).into_response()
}
