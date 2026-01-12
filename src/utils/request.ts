// Check if running in Tauri environment
export const isTauri = () => {
  return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
};

// API Mapping for Web Mode
const API_MAP: Record<string, { url: string | ((args: any) => string), method: string }> = {
  'list_accounts': { url: '/api/admin/accounts', method: 'GET' },
  'get_current_account': { url: '/api/admin/accounts/current', method: 'GET' },
  'add_account': { url: '/api/admin/accounts', method: 'POST' },
  'delete_account': { url: (args) => `/api/admin/accounts/${args.accountId}`, method: 'DELETE' },
  'delete_accounts': { url: '/api/admin/accounts/batch_delete', method: 'POST' },
  'switch_account': { url: '/api/admin/accounts/switch', method: 'POST' },
  'reorder_accounts': { url: '/api/admin/accounts/reorder', method: 'POST' },
  'toggle_proxy_status': { url: (args) => `/api/admin/accounts/${args.accountId}/toggle_proxy`, method: 'POST' },
  'fetch_account_quota': { url: (args) => `/api/admin/quota/${args.accountId}`, method: 'POST' },
  'refresh_all_quotas': { url: '/api/admin/quota/refresh', method: 'POST' },
  'load_config': { url: '/api/admin/config', method: 'GET' },
  'save_config': { url: '/api/admin/config', method: 'POST' },
  'open_data_folder': { url: '/api/admin/system/open_folder', method: 'POST' },
  'get_antigravity_path': { url: '/api/admin/system/path', method: 'GET' },
  'show_main_window': { url: '/api/admin/system/show_window', method: 'POST' },

  // Proxy Control
  'get_proxy_status': { url: '/api/admin/proxy/status', method: 'GET' },
  'update_model_mapping': { url: '/api/admin/proxy/mapping', method: 'POST' },
  'fetch_zai_models': { url: '/api/admin/proxy/fetch_models', method: 'POST' },
  'clear_proxy_session_bindings': { url: '/api/admin/proxy/sessions', method: 'DELETE' },
  'generate_api_key': { url: '/api/admin/utils/generate_key', method: 'POST' },

  // Monitor
  'get_proxy_stats': { url: '/api/admin/monitor/stats', method: 'GET' },
  'get_proxy_logs': { url: '/api/admin/monitor/logs', method: 'GET' }, // limit via query?
  'set_proxy_monitor_enabled': { url: '/api/admin/monitor/enable', method: 'POST' },
  'clear_proxy_logs': { url: '/api/admin/monitor/logs', method: 'DELETE' },

  // Stub/Ignored
  'start_proxy_service': { url: '/api/admin/proxy/start', method: 'POST' },
  'stop_proxy_service': { url: '/api/admin/proxy/stop', method: 'POST' },

  // Web OAuth (手动 Code 流程)
  'get_web_oauth_url': { url: '/api/oauth/url', method: 'GET' },
  'submit_web_oauth_code': { url: '/api/oauth/exchange', method: 'POST' },
};

export async function request<T>(cmd: string, args?: any): Promise<T> {
  // 1. Tauri Mode
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<T>(cmd, args);
    } catch (error) {
      console.error(`API Error [${cmd}]:`, error);
      throw error;
    }
  }

  // 2. Web Mode
  // 忽略仅 Tauri 相关的命令
  // 这些命令在 Web 模式下无效，且如果在登录前调用（如 show_main_window in main.tsx），
  // 会触发受保护的 API 请求 -> 401 -> 全局刷新 -> 死循环
  if (cmd === 'show_main_window' || cmd === 'open_data_folder') {
    return undefined as any;
  }

  const mapping = API_MAP[cmd];
  if (!mapping) {
    console.warn(`Command '${cmd}' not supported in Web Mode`);
    // Return undefined or throw?
    // For show_main_window, just return undefined (success)
    if (cmd === 'show_main_window' || cmd === 'open_data_folder') return undefined as any;

    throw new Error(`Command '${cmd}' not supported in Web Mode`);
  }

  let url = typeof mapping.url === 'function' ? mapping.url(args || {}) : mapping.url;

  const options: RequestInit = {
    method: mapping.method,
    headers: {
      'Content-Type': 'application/json',
    }
  };

  // Payload Transformation
  if (mapping.method !== 'GET' && mapping.method !== 'DELETE') {
    let body = args;

    // Transform args to match backend snake_case structs
    if (cmd === 'add_account') {
      body = { refresh_token: args.refreshToken, email: args.email };
    } else if (cmd === 'switch_account') {
      body = { account_id: args.accountId };
    } else if (cmd === 'reorder_accounts') {
      body = { account_ids: args.accountIds };
    } else if (cmd === 'save_config') {
      body = args.config; // Config struct matches
    } else if (cmd === 'toggle_proxy_status') {
      body = { enable: args.enable, reason: args.reason };
    } else if (cmd === 'delete_accounts') {
      body = { account_ids: args.accountIds };
    }

    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, options);

    // Handle 401 Unauthorized
    if (res.status === 401) {
      window.location.href = '/login';
      throw 'Unauthorized';
    }

    if (!res.ok) {
      const text = await res.text();
      let msg = text;
      try {
        const errJson = JSON.parse(text);
        if (errJson.message) msg = errJson.message;
      } catch { }
      throw msg;
    }

    const text = await res.text();
    if (!text) return undefined as any;

    const json = JSON.parse(text);
    if (json.status === 'error') throw json.message;

    // Admin API returns { status: "success", data: ... }
    // OAuth API returns { url: "..." } or { status: "success", data: {...} }
    if (cmd === 'get_web_oauth_url' && json.url) {
      return json.url as T;
    }
    if (cmd === 'submit_web_oauth_code' && json.data) {
      return json.data as T;
    }
    return json.data !== undefined ? json.data : json;
  } catch (e) {
    console.error(`Web API Error [${cmd}]:`, e);
    throw e;
  }
}
