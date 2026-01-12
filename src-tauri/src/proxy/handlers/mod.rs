// Handlers 模块 - API 端点处理器
// 核心端点处理器模块

pub mod claude;
pub mod openai;
pub mod gemini;
pub mod mcp;
pub mod common;
pub mod audio;  // 音频转录处理器 (PR #311)
pub mod admin;
pub mod proxy_control;  // 管理接口 (Web Control)
pub mod web_auth;       // Web 认证 (登录/登出)
pub mod web_oauth;      // Web OAuth (手动 Code 流程)

