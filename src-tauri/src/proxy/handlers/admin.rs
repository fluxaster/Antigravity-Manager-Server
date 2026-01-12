use axum::{
    extract::{Path, Json, State},
    response::IntoResponse,
    http::StatusCode,
};
use crate::modules;
use crate::models::AppConfig;
use crate::proxy::server::AppState;
use serde_json::json;

// --- DTOs ---

#[derive(serde::Deserialize)]
pub struct AddAccountRequest {
    pub refresh_token: String,
    pub email: Option<String>, // Optional, we fetch it from Google
}

#[derive(serde::Deserialize)]
pub struct SwitchAccountRequest {
    pub account_id: String,
}

#[derive(serde::Deserialize)]
pub struct ReorderAccountsRequest {
    pub account_ids: Vec<String>,
}

#[derive(serde::Deserialize)]
pub struct ToggleProxyRequest {
    pub enable: bool,
    pub reason: Option<String>,
}

// --- Accounts ---

/// Get all accounts
pub async fn handle_list_accounts() -> impl IntoResponse {
    match modules::list_accounts() {
        Ok(accounts) => Json(json!({
            "status": "success",
            "data": accounts
        })).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR, 
            Json(json!({ "status": "error", "message": e }))
        ).into_response(),
    }
}

/// Get current account
pub async fn handle_get_current_account() -> impl IntoResponse {
    match modules::account::get_current_account() {
        Ok(account) => Json(json!({ "status": "success", "data": account })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "status": "error", "message": e }))).into_response(),
    }
}

/// Add account via Refresh Token
pub async fn handle_add_account(
    State(state): State<AppState>,
    Json(payload): Json<AddAccountRequest>,
) -> impl IntoResponse {
    // 1. Refresh access token
    let token_res = match modules::oauth::refresh_access_token(&payload.refresh_token).await {
        Ok(t) => t,
        Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({ "status": "error", "message": format!("Invalid Refresh Token: {}", e) }))).into_response(),
    };

    // 2. Get User Info
    let user_info = match modules::oauth::get_user_info(&token_res.access_token).await {
        Ok(u) => u,
        Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({ "status": "error", "message": format!("Failed to get user info: {}", e) }))).into_response(),
    };

    // 3. Construct TokenData
    let token = crate::models::TokenData::new(
        token_res.access_token,
        payload.refresh_token.clone(),
        token_res.expires_in,
        Some(user_info.email.clone()),
        None, // project_id lazy load
        None,
    );

    // 4. Upsert Account
    let mut account = match modules::upsert_account(user_info.email.clone(), user_info.get_display_name(), token) {
        Ok(a) => a,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "status": "error", "message": e }))).into_response(),
    };

    // 5. Trigger Quota Refresh (Async/Background or Sync? - Let's do Sync for feedback)
    match modules::account::fetch_quota_with_retry(&mut account).await {
        Ok(quota) => {
             let _ = modules::update_account_quota(&account.id, quota);
        },
        Err(e) => {
            tracing::warn!("Failed to refresh quota for new account: {}", e);
        }
    }

    // Reload TokenManager to pick up the new account
    if let Err(e) = state.token_manager.load_accounts().await {
        tracing::error!("Failed to reload accounts in TokenManager: {}", e);
        // We generally don't fail the request if reload fails, but logging is important
    } else {
        tracing::info!("TokenManager reloaded successfully after adding account");
    }
    
    // Reload proxy state
    // We assume this might be running in the AxumServer which has access to proxy state?
    // Actually Admin handlers might need access to ProxyState to reload accounts.
    // But currently `reload_proxy_accounts` is in `commands::proxy`. We should probably refactor it or just ignore it for now
    // In "Headless" mode, the proxy is the main thing.
    // We need a way to reload the TokenManager.
    // The `AppState` has `token_manager`. We can use that!
    
    // TODO: We need to inject AppState to reload token manager. 
    // For now, let's just return success. The Proxy will pick it up if it reloads or we can implement hot reload later.
    // Actually, `AppState` has `token_manager`.
    
    Json(json!({
        "status": "success",
        "data": account
    })).into_response()
}

/// Delete Account
pub async fn handle_delete_account(
    State(state): State<AppState>,
    Path(account_id): Path<String>,
) -> impl IntoResponse {
    match modules::delete_account(&account_id) {
        Ok(_) => {
            if let Err(e) = state.token_manager.load_accounts().await {
                tracing::error!("Failed to reload accounts after deletion: {}", e);
            }
            Json(json!({ "status": "success" })).into_response()
        },
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "status": "error", "message": e }))).into_response(),
    }
}

/// Switch Active Account
pub async fn handle_switch_account(
    Json(payload): Json<SwitchAccountRequest>,
) -> impl IntoResponse {
    match modules::switch_account(&payload.account_id).await {
        Ok(_) => Json(json!({ "status": "success" })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "status": "error", "message": e }))).into_response(),
    }
}

/// Reorder Accounts
pub async fn handle_reorder_accounts(
    Json(payload): Json<ReorderAccountsRequest>,
) -> impl IntoResponse {
    match modules::account::reorder_accounts(&payload.account_ids) {
        Ok(_) => Json(json!({ "status": "success" })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "status": "error", "message": e }))).into_response(),
    }
}

pub async fn handle_delete_accounts(
    State(state): State<AppState>,
    Json(payload): Json<ReorderAccountsRequest>, // Reuse struct { account_ids }
) -> impl IntoResponse {
    match modules::account::delete_accounts(&payload.account_ids) {
        Ok(_) => {
            if let Err(e) = state.token_manager.load_accounts().await {
                tracing::error!("Failed to reload accounts after batch deletion: {}", e);
            }
            Json(json!({ "status": "success" })).into_response()
        },
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "status": "error", "message": e }))).into_response(),
    }
}

/// Toggle Proxy Status
pub async fn handle_toggle_proxy(
    State(state): State<AppState>,
    Path(account_id): Path<String>,
    Json(payload): Json<ToggleProxyRequest>,
) -> impl IntoResponse {
    // Use JSON approach to toggle proxy status (same as commands::toggle_proxy_status)
    let data_dir = match modules::account::get_data_dir() {
        Ok(d) => d,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "status": "error", "message": e }))).into_response(),
    };
    let account_path = data_dir.join("accounts").join(format!("{}.json", account_id));
    
    if !account_path.exists() {
        return (StatusCode::NOT_FOUND, Json(json!({ "status": "error", "message": "Account file not found" }))).into_response();
    }
    
    let content = match std::fs::read_to_string(&account_path) {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "status": "error", "message": e.to_string() }))).into_response(),
    };
    
    let mut account_json: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "status": "error", "message": e.to_string() }))).into_response(),
    };
    
    if payload.enable {
        account_json["proxy_disabled"] = serde_json::Value::Bool(false);
        account_json["proxy_disabled_reason"] = serde_json::Value::Null;
        account_json["proxy_disabled_at"] = serde_json::Value::Null;
    } else {
        let now = chrono::Utc::now().timestamp();
        account_json["proxy_disabled"] = serde_json::Value::Bool(true);
        account_json["proxy_disabled_at"] = serde_json::Value::Number(now.into());
        account_json["proxy_disabled_reason"] = serde_json::Value::String(
            payload.reason.unwrap_or_else(|| "Manually disabled".to_string())
        );
    }
    
    if let Err(e) = std::fs::write(&account_path, serde_json::to_string_pretty(&account_json).unwrap()) {
         return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "status": "error", "message": e.to_string() }))).into_response();
    }
    
    if let Err(e) = state.token_manager.load_accounts().await {
        tracing::error!("Failed to reload accounts after toggle proxy: {}", e);
    }

    Json(json!({ "status": "success" })).into_response()
}

// --- Config ---

pub async fn handle_load_config() -> impl IntoResponse {
    match modules::load_app_config() {
        Ok(config) => Json(json!({ "status": "success", "data": config })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "status": "error", "message": e }))).into_response(),
    }
}

pub async fn handle_save_config(
    State(state): State<AppState>,
    Json(config): Json<AppConfig>,
) -> impl IntoResponse {
    if let Err(e) = modules::save_app_config(&config) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "status": "error", "message": e }))).into_response();
    }
    
    // Hot Reload
    // state.custom_mapping ...
    {
        let mut m = state.custom_mapping.write().await;
        *m = config.proxy.custom_mapping.clone();
    }
    
    {
        let mut p = state.upstream_proxy.write().await;
        *p = config.proxy.upstream_proxy.clone();
    }
    
    {
         // Assuming AppState has security_state? 
         // server.rs -> AppState definition. 
         // Wait, AppState definition in server.rs did NOT have security_state.
         // AxumServer struct had it.
         // Check server.rs again.
    }
    
    Json(json!({ "status": "success" })).into_response()
}


// --- Quota ---

pub async fn handle_refresh_all_quotas() -> impl IntoResponse {
    // Reimplement logic from commands::refresh_all_quotas
    // Simple serial version for now or parallel if easy
    
    let accounts = match modules::list_accounts() {
        Ok(a) => a,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "status": "error", "message": e }))).into_response(),
    };
    
    let mut success = 0;
    let mut failed = 0;
    
    for account in accounts {
         if account.disabled { continue; } // Skip disabled
         
         match modules::fetch_quota(&account.token.access_token, &account.email).await {
              Ok((quota, _)) => {
                  let _ = modules::update_account_quota(&account.id, quota);
                  success += 1;
              },
              Err(_) => {
                  failed += 1;
              }
         }
    }
    
    Json(json!({
        "status": "success", 
        "data": {
            "success": success,
            "failed": failed
        }
    })).into_response()
}

pub async fn handle_refresh_account_quota(
    State(state): State<AppState>,
    Path(account_id): Path<String>,
) -> impl IntoResponse {
    let mut account = match modules::load_account(&account_id) {
        Ok(a) => a,
        Err(e) => return (StatusCode::NOT_FOUND, Json(json!({ "status": "error", "message": e }))).into_response(),
    };
    
    match modules::account::fetch_quota_with_retry(&mut account).await {
        Ok(quota) => {
             let _ = modules::update_account_quota(&account.id, quota.clone());
             
             // Reload to update memory with new quota/subscription info
            if let Err(e) = state.token_manager.load_accounts().await {
                tracing::error!("Failed to reload accounts after quota refresh: {}", e);
            }

             Json(json!({ "status": "success", "data": quota })).into_response()
        },
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "status": "error", "message": e }))).into_response(),
    }
}
