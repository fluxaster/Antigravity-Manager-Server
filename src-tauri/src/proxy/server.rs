use crate::proxy::TokenManager;
use axum::{
    extract::DefaultBodyLimit,
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{any, get, post},
    Router,
};
use std::sync::Arc;
use tokio::sync::oneshot;
use tower_http::trace::TraceLayer;
use tower_http::services::{ServeDir, ServeFile};
use tracing::{debug, error};
use tokio::sync::RwLock;
use std::sync::atomic::AtomicUsize;

/// Axum 应用状态
#[derive(Clone)]
pub struct AppState {
    pub token_manager: Arc<TokenManager>,
    pub custom_mapping: Arc<tokio::sync::RwLock<std::collections::HashMap<String, String>>>,
    #[allow(dead_code)]
    pub request_timeout: u64, // API 请求超时(秒)
    #[allow(dead_code)]
    pub thought_signature_map: Arc<tokio::sync::Mutex<std::collections::HashMap<String, String>>>, // 思维链签名映射 (ID -> Signature)
    #[allow(dead_code)]
    pub upstream_proxy: Arc<tokio::sync::RwLock<crate::proxy::config::UpstreamProxyConfig>>,
    pub upstream: Arc<crate::proxy::upstream::client::UpstreamClient>,
    pub zai: Arc<RwLock<crate::proxy::ZaiConfig>>,
    pub provider_rr: Arc<AtomicUsize>,
    pub zai_vision_mcp: Arc<crate::proxy::zai_vision_mcp::ZaiVisionMcpState>,
    pub monitor: Arc<crate::proxy::monitor::ProxyMonitor>,
    pub experimental: Arc<RwLock<crate::proxy::config::ExperimentalConfig>>,
    pub security_state: Arc<RwLock<crate::proxy::ProxySecurityConfig>>,
    pub sessions: crate::proxy::handlers::web_auth::SessionStore, // Web 登录 session
}

impl AppState {
    /// 更新模型映射配置
    pub async fn update_mapping(&self, config: &crate::proxy::config::ProxyConfig) {
        let mut m = self.custom_mapping.write().await;
        *m = config.custom_mapping.clone();
        tracing::debug!("模型映射 (Custom) 已通过 Admin API 热更新");
    }
}

// 实现 FromRef 以便 handlers::web_auth 可以只提取 SessionStore
impl axum::extract::FromRef<AppState> for crate::proxy::handlers::web_auth::SessionStore {
    fn from_ref(state: &AppState) -> Self {
        state.sessions.clone()
    }
}

/// Axum 服务器实例
pub struct AxumServer {
    shutdown_tx: Option<oneshot::Sender<()>>,
    custom_mapping: Arc<tokio::sync::RwLock<std::collections::HashMap<String, String>>>,
    proxy_state: Arc<tokio::sync::RwLock<crate::proxy::config::UpstreamProxyConfig>>,
    security_state: Arc<RwLock<crate::proxy::ProxySecurityConfig>>,
    zai_state: Arc<RwLock<crate::proxy::ZaiConfig>>,
}

impl AxumServer {
    pub async fn update_mapping(&self, config: &crate::proxy::config::ProxyConfig) {
        {
            let mut m = self.custom_mapping.write().await;
            *m = config.custom_mapping.clone();
        }
        tracing::debug!("模型映射 (Custom) 已全量热更新");
    }

    /// 更新代理配置
    pub async fn update_proxy(&self, new_config: crate::proxy::config::UpstreamProxyConfig) {
        let mut proxy = self.proxy_state.write().await;
        *proxy = new_config;
        tracing::info!("上游代理配置已热更新");
    }

    pub async fn update_security(&self, config: &crate::proxy::config::ProxyConfig) {
        let mut sec = self.security_state.write().await;
        *sec = crate::proxy::ProxySecurityConfig::from_proxy_config(config);
        tracing::info!("反代服务安全配置已热更新");
    }

    pub async fn update_zai(&self, config: &crate::proxy::config::ProxyConfig) {
        let mut zai = self.zai_state.write().await;
        *zai = config.zai.clone();
        tracing::info!("z.ai 配置已热更新");
    }
    /// 启动 Axum 服务器
    pub async fn start(
        host: String,
        port: u16,
        token_manager: Arc<TokenManager>,
        custom_mapping: std::collections::HashMap<String, String>,
        _request_timeout: u64,
        upstream_proxy: crate::proxy::config::UpstreamProxyConfig,
        security_config: crate::proxy::ProxySecurityConfig,
        zai_config: crate::proxy::ZaiConfig,
        monitor: Arc<crate::proxy::monitor::ProxyMonitor>,
        experimental_config: crate::proxy::config::ExperimentalConfig,

    ) -> Result<(Self, tokio::task::JoinHandle<()>), String> {
        let custom_mapping_state = Arc::new(tokio::sync::RwLock::new(custom_mapping));
	        let proxy_state = Arc::new(tokio::sync::RwLock::new(upstream_proxy.clone()));
	        let security_state = Arc::new(RwLock::new(security_config));
	        let zai_state = Arc::new(RwLock::new(zai_config));
	        let provider_rr = Arc::new(AtomicUsize::new(0));
	        let zai_vision_mcp_state =
	            Arc::new(crate::proxy::zai_vision_mcp::ZaiVisionMcpState::new());
	        let experimental_state = Arc::new(RwLock::new(experimental_config));

	        let state = AppState {
	            token_manager: token_manager.clone(),
	            custom_mapping: custom_mapping_state.clone(),
	            request_timeout: 300, // 5分钟超时
            thought_signature_map: Arc::new(tokio::sync::Mutex::new(
                std::collections::HashMap::new(),
            )),
            upstream_proxy: proxy_state.clone(),
            upstream: Arc::new(crate::proxy::upstream::client::UpstreamClient::new(Some(
                upstream_proxy.clone(),
            ))),
            zai: zai_state.clone(),
            provider_rr: provider_rr.clone(),
            zai_vision_mcp: zai_vision_mcp_state,
            monitor: monitor.clone(),
            experimental: experimental_state,
            security_state: security_state.clone(),
            sessions: Arc::new(RwLock::new(std::collections::HashMap::new())),
        };


        // 构建路由 - 使用新架构的 handlers！
        use crate::proxy::handlers;
        // 构建路由
        let app = Router::new()
            // OpenAI Protocol
            .route("/v1/models", get(handlers::openai::handle_list_models))
            .route(
                "/v1/chat/completions",
                post(handlers::openai::handle_chat_completions),
            )
            .route(
                "/v1/completions",
                post(handlers::openai::handle_completions),
            )
            .route("/v1/responses", post(handlers::openai::handle_completions)) // 兼容 Codex CLI
            .route(
                "/v1/images/generations",
                post(handlers::openai::handle_images_generations),
            ) // 图像生成 API
            .route(
                "/v1/images/edits",
                post(handlers::openai::handle_images_edits),
            ) // 图像编辑 API
            .route(
                "/v1/audio/transcriptions",
                post(handlers::audio::handle_audio_transcription),
            ) // 音频转录 API (PR #311)
            // Claude Protocol
            .route("/v1/messages", post(handlers::claude::handle_messages))
            .route(
                "/v1/messages/count_tokens",
                post(handlers::claude::handle_count_tokens),
            )
            .route(
                "/v1/models/claude",
                get(handlers::claude::handle_list_models),
            )
            // z.ai MCP (optional reverse-proxy)
            .route(
                "/mcp/web_search_prime/mcp",
                any(handlers::mcp::handle_web_search_prime),
            )
	            .route(
	                "/mcp/web_reader/mcp",
	                any(handlers::mcp::handle_web_reader),
	            )
	            .route(
	                "/mcp/zai-mcp-server/mcp",
	                any(handlers::mcp::handle_zai_mcp_server),
	            )
	            // Gemini Protocol (Native)
	            .route("/v1beta/models", get(handlers::gemini::handle_list_models))
            // Handle both GET (get info) and POST (generateContent with colon) at the same route
            .route(
                "/v1beta/models/:model",
                get(handlers::gemini::handle_get_model).post(handlers::gemini::handle_generate),
            )
            .route(
                "/v1beta/models/:model/countTokens",
                post(handlers::gemini::handle_count_tokens),
            ) // Specific route priority
            .route("/v1/models/detect", post(handlers::common::handle_detect_model))
            .route("/v1/api/event_logging/batch", post(silent_ok_handler))
            .route("/v1/api/event_logging", post(silent_ok_handler))
            // Admin API (Web Control)
            .route("/api/admin/accounts", get(handlers::admin::handle_list_accounts).post(handlers::admin::handle_add_account))
            .route("/api/admin/accounts/current", get(handlers::admin::handle_get_current_account))
            .route("/api/admin/accounts/batch_delete", post(handlers::admin::handle_delete_accounts))
            .route("/api/admin/accounts/:id", axum::routing::delete(handlers::admin::handle_delete_account))
            .route("/api/admin/accounts/switch", post(handlers::admin::handle_switch_account))
            .route("/api/admin/accounts/reorder", post(handlers::admin::handle_reorder_accounts))
            .route("/api/admin/accounts/:id/toggle_proxy", post(handlers::admin::handle_toggle_proxy))
            .route("/api/admin/config", get(handlers::admin::handle_load_config).post(handlers::admin::handle_save_config))
            .route("/api/admin/quota/refresh", post(handlers::admin::handle_refresh_all_quotas))
            .route("/api/admin/quota/:id", post(handlers::admin::handle_refresh_account_quota))
            // Proxy Control
            .route("/api/admin/proxy/status", get(handlers::proxy_control::handle_get_proxy_status))
            .route("/api/admin/proxy/mapping", post(handlers::proxy_control::handle_update_model_mapping))
            .route("/api/admin/proxy/fetch_models", post(handlers::proxy_control::handle_fetch_zai_models))
            .route("/api/admin/proxy/sessions", axum::routing::delete(handlers::proxy_control::handle_clear_session_bindings))
            .route("/api/admin/utils/generate_key", post(handlers::proxy_control::handle_generate_api_key))
            // Monitor
            .route("/api/admin/monitor/stats", get(handlers::proxy_control::handle_get_proxy_stats))
            .route("/api/admin/monitor/logs", get(handlers::proxy_control::handle_get_proxy_logs).delete(handlers::proxy_control::handle_clear_proxy_logs))
            .route("/api/admin/monitor/enable", post(handlers::proxy_control::handle_set_monitor_enabled))
            // Stub control
            .route("/api/admin/proxy/start", post(handlers::proxy_control::handle_start_stop_stub))
            .route("/api/admin/proxy/stop", post(handlers::proxy_control::handle_start_stop_stub))
            .route("/api/admin/proxy/restart", post(handlers::proxy_control::handle_restart_server))
            // Auth API (Web Login)
            .route("/api/auth/status", get(handlers::web_auth::handle_auth_status))
            .route("/api/auth/setup", post(handlers::web_auth::handle_setup_password))
            .route("/api/auth/login", post(handlers::web_auth::handle_login))
            .route("/api/auth/logout", post(handlers::web_auth::handle_logout))
            // Web OAuth API (手动 Code 流程)
            .route("/api/oauth/url", get(handlers::web_oauth::get_google_auth_url))
            .route("/api/oauth/exchange", post(handlers::web_oauth::exchange_google_code))
            
            .route("/healthz", get(health_check_handler))
            .fallback_service(
                ServeDir::new("dist")
                    .not_found_service(ServeFile::new("dist/index.html"))
            )
            .layer(DefaultBodyLimit::max(100 * 1024 * 1024))
            .layer(axum::middleware::from_fn_with_state(state.clone(), crate::proxy::middleware::monitor::monitor_middleware))
            .layer(TraceLayer::new_for_http())
            // Admin 页面 session 认证中间件（先添加，后执行）
            .layer(axum::middleware::from_fn_with_state(
                state.sessions.clone(),
                crate::proxy::middleware::admin_auth_middleware,
            ))
            // API Key 认证中间件（后添加，先执行）
            .layer(axum::middleware::from_fn_with_state(
                security_state.clone(),
                crate::proxy::middleware::auth_middleware,
            ))
            .layer(crate::proxy::middleware::cors_layer())
            .with_state(state);

        // 绑定地址
        let addr = format!("{}:{}", host, port);
        let listener = tokio::net::TcpListener::bind(&addr)
            .await
            .map_err(|e| format!("地址 {} 绑定失败: {}", addr, e))?;

        tracing::info!("反代服务器启动在 http://{}", addr);

        // 创建关闭通道
        let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();

        let server_instance = Self {
            shutdown_tx: Some(shutdown_tx),
            custom_mapping: custom_mapping_state.clone(),
            proxy_state,
            security_state,
            zai_state,
        };

        // 在新任务中启动服务器
        let handle = tokio::spawn(async move {
            use hyper::server::conn::http1;
            use hyper_util::rt::TokioIo;
            use hyper_util::service::TowerToHyperService;

            loop {
                tokio::select! {
                    res = listener.accept() => {
                        match res {
                            Ok((stream, _)) => {
                                let io = TokioIo::new(stream);
                                let service = TowerToHyperService::new(app.clone());

                                tokio::task::spawn(async move {
                                    if let Err(err) = http1::Builder::new()
                                        .serve_connection(io, service)
                                        .with_upgrades() // 支持 WebSocket (如果以后需要)
                                        .await
                                    {
                                        debug!("连接处理结束或出错: {:?}", err);
                                    }
                                });
                            }
                            Err(e) => {
                                error!("接收连接失败: {:?}", e);
                            }
                        }
                    }
                    _ = &mut shutdown_rx => {
                        tracing::info!("反代服务器停止监听");
                        break;
                    }
                }
            }
        });

        Ok((server_instance, handle))
    }

    /// 停止服务器
    pub fn stop(mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
    }
}

// ===== API 处理器 (旧代码已移除，由 src/proxy/handlers/* 接管) =====

/// 健康检查处理器
async fn health_check_handler() -> Response {
    Json(serde_json::json!({
        "status": "ok"
    }))
    .into_response()
}

/// 静默成功处理器 (用于拦截遥测日志等)
async fn silent_ok_handler() -> Response {
    StatusCode::OK.into_response()
}
