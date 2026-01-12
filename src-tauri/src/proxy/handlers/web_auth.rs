// Web 认证处理器 - 用于 Headless 模式的登录保护
use axum::{
    extract::{Json, State},
    http::{header, StatusCode},
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Session 存储 (session_token -> 创建时间戳)
pub type SessionStore = Arc<RwLock<HashMap<String, i64>>>;

/// 密码文件名
const PASSWORD_FILE: &str = "web_password.hash";

/// Session 有效期 (24 小时)
const SESSION_TTL_SECS: i64 = 86400;

/// Session Cookie 名称
pub const SESSION_COOKIE_NAME: &str = "ag_session";

// --- DTOs ---

#[derive(Deserialize)]
pub struct SetupRequest {
    pub password: String,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub password: String,
}

#[derive(Serialize)]
pub struct AuthStatusResponse {
    pub password_set: bool,
    pub logged_in: bool,
}

// --- 辅助函数 ---

/// 获取密码文件路径
fn get_password_path() -> Result<PathBuf, String> {
    let data_dir = crate::modules::account::get_data_dir()?;
    Ok(data_dir.join(PASSWORD_FILE))
}

/// 检查密码是否已设置
fn is_password_set() -> bool {
    get_password_path()
        .map(|p| p.exists())
        .unwrap_or(false)
}

/// 读取存储的密码哈希
fn read_password_hash() -> Option<String> {
    get_password_path()
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .map(|s| s.trim().to_string())
}

/// 保存密码哈希
fn save_password_hash(hash: &str) -> Result<(), String> {
    let path = get_password_path()?;
    fs::write(&path, hash).map_err(|e| format!("保存密码失败: {}", e))
}

/// 生成安全的 session token
fn generate_session_token() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: [u8; 32] = rng.gen();
    base64::Engine::encode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, bytes)
}

/// 从请求头中提取 session token
fn extract_session_from_cookie(cookie_header: Option<&str>) -> Option<String> {
    cookie_header.and_then(|cookies| {
        cookies
            .split(';')
            .map(|s| s.trim())
            .find(|s| s.starts_with(&format!("{}=", SESSION_COOKIE_NAME)))
            .and_then(|s| s.strip_prefix(&format!("{}=", SESSION_COOKIE_NAME)))
            .map(|s| s.to_string())
    })
}

/// 验证 session 是否有效
pub async fn is_session_valid(sessions: &SessionStore, token: &str) -> bool {
    let sessions = sessions.read().await;
    if let Some(&created_at) = sessions.get(token) {
        let now = chrono::Utc::now().timestamp();
        now - created_at < SESSION_TTL_SECS
    } else {
        false
    }
}

/// 清理过期 session
async fn cleanup_expired_sessions(sessions: &SessionStore) {
    let now = chrono::Utc::now().timestamp();
    let mut sessions = sessions.write().await;
    sessions.retain(|_, &mut created_at| now - created_at < SESSION_TTL_SECS);
}

// --- 处理器 ---

/// 获取认证状态
/// GET /api/auth/status
pub async fn handle_auth_status(
    State(sessions): State<SessionStore>,
    headers: axum::http::HeaderMap,
) -> impl IntoResponse {
    let password_set = is_password_set();
    
    // 检查是否已登录
    let cookie = headers
        .get(header::COOKIE)
        .and_then(|h| h.to_str().ok());
    
    let logged_in = if let Some(token) = extract_session_from_cookie(cookie) {
        is_session_valid(&sessions, &token).await
    } else {
        false
    };
    
    Json(json!({
        "status": "success",
        "data": AuthStatusResponse { password_set, logged_in }
    }))
}

/// 首次设置密码
/// POST /api/auth/setup
/// 
/// 安全措施：
/// 1. 只有当密码文件不存在时才允许设置
/// 2. 如果已设置，返回 403 Forbidden
pub async fn handle_setup_password(
    State(sessions): State<SessionStore>,
    Json(payload): Json<SetupRequest>,
) -> impl IntoResponse {
    // 🔒 安全检查：如果密码已设置，拒绝请求
    if is_password_set() {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "status": "error", "message": "密码已设置，无法重新设置。如需重置，请删除服务器上的密码文件。" }))
        ).into_response();
    }
    
    // 验证密码强度
    if payload.password.len() < 6 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "status": "error", "message": "密码长度至少需要 6 个字符" }))
        ).into_response();
    }
    
    // 使用 bcrypt 哈希密码 (cost = 12)
    let hash = match bcrypt::hash(&payload.password, 12) {
        Ok(h) => h,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "status": "error", "message": format!("密码加密失败: {}", e) }))
            ).into_response();
        }
    };
    
    // 保存密码哈希
    if let Err(e) = save_password_hash(&hash) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "status": "error", "message": e }))
        ).into_response();
    }
    
    // 自动登录 - 创建 session
    let token = generate_session_token();
    let now = chrono::Utc::now().timestamp();
    {
        let mut sessions = sessions.write().await;
        sessions.insert(token.clone(), now);
    }
    
    // 返回带 Set-Cookie 的响应
    let cookie_value = format!(
        "{}={}; Path=/; HttpOnly; SameSite=Strict; Max-Age={}",
        SESSION_COOKIE_NAME, token, SESSION_TTL_SECS
    );
    
    (
        StatusCode::OK,
        [(header::SET_COOKIE, cookie_value)],
        Json(json!({ "status": "success", "message": "密码设置成功" }))
    ).into_response()
}

/// 登录
/// POST /api/auth/login
pub async fn handle_login(
    State(sessions): State<SessionStore>,
    Json(payload): Json<LoginRequest>,
) -> impl IntoResponse {
    // 检查密码是否已设置
    if !is_password_set() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "status": "error", "message": "密码未设置，请先设置密码" }))
        ).into_response();
    }
    
    // 获取存储的密码哈希
    let stored_hash = match read_password_hash() {
        Some(h) => h,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "status": "error", "message": "无法读取密码文件" }))
            ).into_response();
        }
    };
    
    // 验证密码
    let valid = bcrypt::verify(&payload.password, &stored_hash).unwrap_or(false);
    
    if !valid {
        // 🔒 安全：不透露具体是密码错误还是其他问题
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "status": "error", "message": "密码错误" }))
        ).into_response();
    }
    
    // 清理过期 session
    cleanup_expired_sessions(&sessions).await;
    
    // 创建新 session
    let token = generate_session_token();
    let now = chrono::Utc::now().timestamp();
    {
        let mut sessions = sessions.write().await;
        sessions.insert(token.clone(), now);
    }
    
    // 返回带 Set-Cookie 的响应
    let cookie_value = format!(
        "{}={}; Path=/; HttpOnly; SameSite=Strict; Max-Age={}",
        SESSION_COOKIE_NAME, token, SESSION_TTL_SECS
    );
    
    (
        StatusCode::OK,
        [(header::SET_COOKIE, cookie_value)],
        Json(json!({ "status": "success", "message": "登录成功" }))
    ).into_response()
}

/// 登出
/// POST /api/auth/logout
pub async fn handle_logout(
    State(sessions): State<SessionStore>,
    headers: axum::http::HeaderMap,
) -> impl IntoResponse {
    // 获取当前 session
    let cookie = headers
        .get(header::COOKIE)
        .and_then(|h| h.to_str().ok());
    
    if let Some(token) = extract_session_from_cookie(cookie) {
        // 删除 session
        let mut sessions = sessions.write().await;
        sessions.remove(&token);
    }
    
    // 清除 cookie
    let cookie_value = format!(
        "{}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
        SESSION_COOKIE_NAME
    );
    
    (
        StatusCode::OK,
        [(header::SET_COOKIE, cookie_value)],
        Json(json!({ "status": "success", "message": "已登出" }))
    ).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_session_from_cookie() {
        let cookie = "other=value; ag_session=abc123; another=test";
        assert_eq!(extract_session_from_cookie(Some(cookie)), Some("abc123".to_string()));
        
        let no_session = "other=value; another=test";
        assert_eq!(extract_session_from_cookie(Some(no_session)), None);
        
        assert_eq!(extract_session_from_cookie(None), None);
    }
}
