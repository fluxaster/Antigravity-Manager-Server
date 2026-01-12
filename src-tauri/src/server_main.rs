use antigravity_tools_lib::{modules, proxy};
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("Starting Antigravity Server (Headless)...");

    // 1. Init Logger
    modules::logger::init_logger();

    // 2. Load Config
    let config = modules::config::load_app_config()
        .map_err(|e| format!("Failed to load config: {}", e))?;
    
    // 如果配置文件不存在（新部署），自动保存默认配置
    // 这确保默认的 auth_mode (AllExceptHealth) 被持久化
    {
        let data_dir = modules::account::get_data_dir()?;
        let config_path = data_dir.join("gui_config.json");
        if !config_path.exists() {
            println!("First run detected, saving default config...");
            modules::config::save_app_config(&config)
                .map_err(|e| format!("Failed to save default config: {}", e))?;
        }
    }
    
    let mut proxy_config = config.proxy.clone();
    
    // Allow env override
    if let Ok(port_str) = std::env::var("PORT") {
        if let Ok(p) = port_str.parse() {
            proxy_config.port = p;
        }
    }
    
    // 3. Init TokenManager
    // Use get_data_dir() (not get_accounts_dir()) - TokenManager appends "/accounts" internally
    let app_data_dir = modules::account::get_data_dir()?;
    // Ensure accounts dir exists
    let _ = modules::account::get_accounts_dir()?;
    let token_manager = Arc::new(proxy::TokenManager::new(app_data_dir));
    
    // Load accounts
    let count = token_manager.load_accounts().await?;
    println!("Loaded {} accounts.", count);

    // 4. Monitor
    // ProxyMonitor::new takes (buffer_size, Option<AppHandle>)
    let monitor = Arc::new(proxy::monitor::ProxyMonitor::new(1000, None));
    if proxy_config.enable_logging {
        monitor.set_enabled(true);
    }

    // 5. Start Server
    // 强制绑定到 0.0.0.0 (Headless Server 默认行为)
    let bind_addr = "0.0.0.0";
    println!("Binding to {}:{}", bind_addr, proxy_config.port);
    
    let (_server, handle) = proxy::AxumServer::start(
        bind_addr.to_string(),
        proxy_config.port,
        token_manager,
        proxy_config.custom_mapping.clone(),
        proxy_config.request_timeout,
        proxy_config.upstream_proxy.clone(),
        proxy::ProxySecurityConfig::from_proxy_config(&proxy_config),
        proxy_config.zai.clone(),
        monitor,
        proxy_config.experimental.clone(),
    ).await.map_err(|e| format!("Server start failed: {}", e))?;

    println!("Server is valid and running!");
    
    // Wait for shutdown
    handle.await?;
    
    Ok(())
}
