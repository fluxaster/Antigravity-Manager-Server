// Admin 页面认证中间件 - 保护管理界面
use axum::{
    extract::{Request, State},
    http::{header, StatusCode},
    middleware::Next,
    response::Response,
};

use crate::proxy::handlers::web_auth::{is_session_valid, SessionStore, SESSION_COOKIE_NAME};

/// 从 Cookie 头中提取 session token
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

/// Admin API 认证中间件
/// 
/// 对所有 /api/admin/* 路由强制要求登录
/// 例外路由：
/// - /api/auth/* (认证相关)
/// - 静态资源 (非 /api/ 前缀)
/// - /healthz (健康检查)
pub async fn admin_auth_middleware(
    State(sessions): State<SessionStore>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let path = request.uri().path();
    
    // 🔒 例外路由 - 不需要认证
    // 1. 认证相关路由
    if path.starts_with("/api/auth/") {
        return Ok(next.run(request).await);
    }
    
    // 2. 健康检查
    if path == "/healthz" {
        return Ok(next.run(request).await);
    }
    
    // 3. 非 admin API（静态资源、代理 API 等）
    // 代理 API 使用自己的 API Key 认证，不需要 session
    if !path.starts_with("/api/admin/") {
        return Ok(next.run(request).await);
    }
    
    // 🔒 需要认证的路由 (/api/admin/*)
    
    // 提取 session cookie
    let cookie = request
        .headers()
        .get(header::COOKIE)
        .and_then(|h| h.to_str().ok());
    
    let token = extract_session_from_cookie(cookie);
    
    // 验证 session
    let is_valid = match token {
        Some(ref t) => is_session_valid(&sessions, t).await,
        None => false,
    };
    
    if is_valid {
        Ok(next.run(request).await)
    } else {
        // 返回 401 Unauthorized
        Err(StatusCode::UNAUTHORIZED)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_session() {
        let cookie = "ag_session=test123; other=value";
        assert_eq!(extract_session_from_cookie(Some(cookie)), Some("test123".to_string()));
    }
}
