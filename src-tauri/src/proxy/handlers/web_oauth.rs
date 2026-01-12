// Web OAuth 处理器 - 用于 VPS/Docker 环境的手动 Code 流程
use axum::{
    extract::{Json, State},
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use crate::modules::{oauth, account};
use crate::models::TokenData;
use crate::proxy::server::AppState;

/// 固定的 Redirect URI，必须使用 localhost 以兼容 Desktop Client ID
const REDIRECT_URI: &str = "http://127.0.0.1:10101/callback";

// --- DTOs ---

#[derive(Serialize)]
pub struct OAuthUrlResponse {
    pub url: String,
}

#[derive(Deserialize)]
pub struct ExchangeRequest {
    pub code: String,
}

// --- 处理器 ---

/// 获取 Google OAuth 授权 URL
/// GET /api/oauth/url
/// 
/// 返回一个授权链接，用户在本地浏览器打开后完成登录，
/// 然后手动复制 code 参数回来提交。
pub async fn get_google_auth_url() -> impl IntoResponse {
    let url = oauth::get_auth_url(REDIRECT_URI);
    
    crate::modules::logger::log_info(&format!(
        "Web OAuth: 生成授权 URL (redirect_uri={})",
        REDIRECT_URI
    ));
    
    Json(OAuthUrlResponse { url })
}

/// 交换 Authorization Code 并添加账号
/// POST /api/oauth/exchange
/// 
/// 接收用户手动复制的 code，完成 Token 交换并保存账号。
pub async fn exchange_google_code(
    State(state): State<AppState>,
    Json(payload): Json<ExchangeRequest>,
) -> impl IntoResponse {
    let code = payload.code.trim();
    
    // 验证 code 格式
    if code.is_empty() {
        return Json(json!({
            "status": "error",
            "message": "Authorization Code 不能为空"
        }));
    }
    
    crate::modules::logger::log_info("Web OAuth: 开始交换 Authorization Code...");
    
    // A. 交换 Token
    let token_res = match oauth::exchange_code(code, REDIRECT_URI).await {
        Ok(res) => res,
        Err(e) => {
            crate::modules::logger::log_error(&format!("Web OAuth: Token 交换失败 - {}", e));
            return Json(json!({
                "status": "error",
                "message": format!("Token 交换失败: {}", e)
            }));
        }
    };

    // B. 检查 Refresh Token (关键)
    let refresh_token = match token_res.refresh_token {
        Some(rt) => rt,
        None => {
            crate::modules::logger::log_warn("Web OAuth: 未获取到 Refresh Token");
            return Json(json!({
                "status": "error",
                "message": "未获取到 Refresh Token。\n\n可能原因：\n1. 您之前已授权过此应用\n2. 请前往 https://myaccount.google.com/permissions 撤销 Antigravity 的授权后重试"
            }));
        }
    };

    // C. 获取用户信息 (Email)
    let user_info = match oauth::get_user_info(&token_res.access_token).await {
        Ok(info) => info,
        Err(e) => {
            crate::modules::logger::log_error(&format!("Web OAuth: 获取用户信息失败 - {}", e));
            return Json(json!({
                "status": "error",
                "message": format!("获取用户信息失败: {}", e)
            }));
        }
    };

    let email = user_info.email.clone();
    let name = user_info.get_display_name();
    
    crate::modules::logger::log_info(&format!(
        "Web OAuth: 已获取用户信息 - {}",
        email
    ));

    // D. 构造 TokenData 并保存账号
    let token_data = TokenData::new(
        token_res.access_token,
        refresh_token,
        token_res.expires_in,
        Some(email.clone()),
        None, // project_id
        None, // session_id
    );

    match account::upsert_account(email.clone(), name, token_data) {
        Ok(account) => {
            crate::modules::logger::log_info(&format!(
                "Web OAuth: 账号添加成功 - {} (ID: {})",
                account.email, account.id
            ));
            
            // 【关键修复】手动通知 TokenManager 重新加载账号
            // 否则 Proxy 服务内存中的 Token 列表不会更新，导致 "Token pool is empty"
            if let Err(e) = state.token_manager.load_accounts().await {
                crate::modules::logger::log_error(&format!("Web OAuth: 账号加载失败 - {}", e));
                // 虽然加载失败，但账号已保存到磁盘，不返回错误，只需警告
            } else {
                crate::modules::logger::log_info("Web OAuth: TokenManager 已刷新，新账号已生效");
            }
            
            Json(json!({
                "status": "success",
                "data": {
                    "email": account.email,
                    "id": account.id
                }
            }))
        }
        Err(e) => {
            crate::modules::logger::log_error(&format!("Web OAuth: 保存账号失败 - {}", e));
            Json(json!({
                "status": "error",
                "message": format!("保存账号失败: {}", e)
            }))
        }
    }
}
