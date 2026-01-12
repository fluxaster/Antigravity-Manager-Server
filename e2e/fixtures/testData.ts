/**
 * 测试数据工厂
 * 提供标准化的测试数据用于 API 和 E2E 测试
 */

// API 基础配置
export const API_BASE_URL = process.env.API_URL || 'http://127.0.0.1:8045';
export const WEB_BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

// 测试账户数据
export const testAccounts = {
    // 用于添加账户测试（预期会失败，因为 token 无效）
    invalid: {
        email: 'test@example.com',
        refreshToken: 'invalid_test_token_for_testing',
    },
};

// 测试配置数据
export const testConfig = {
    proxy: {
        port: 7866,
        allow_lan_access: false,
        enable_logging: true,
        request_timeout: 300,
        custom_mapping: {},
    },
};

// API 端点映射 (与 request.ts 中的 API_MAP 对应)
export const API_ENDPOINTS = {
    // 账户管理
    listAccounts: '/api/admin/accounts',
    getCurrentAccount: '/api/admin/accounts/current',
    addAccount: '/api/admin/accounts',
    deleteAccount: (id: string) => `/api/admin/accounts/${id}`,
    batchDelete: '/api/admin/accounts/batch_delete',
    switchAccount: '/api/admin/accounts/switch',
    reorderAccounts: '/api/admin/accounts/reorder',
    toggleProxy: (id: string) => `/api/admin/accounts/${id}/toggle_proxy`,
    refreshQuota: (id: string) => `/api/admin/quota/${id}`,
    refreshAllQuotas: '/api/admin/quota/refresh',

    // 配置管理
    config: '/api/admin/config',

    // 代理控制
    proxyStatus: '/api/admin/proxy/status',
    updateMapping: '/api/admin/proxy/mapping',
    fetchModels: '/api/admin/proxy/fetch_models',
    clearSessions: '/api/admin/proxy/sessions',
    generateKey: '/api/admin/utils/generate_key',

    // 监控
    monitorStats: '/api/admin/monitor/stats',
    monitorLogs: '/api/admin/monitor/logs',
    monitorEnable: '/api/admin/monitor/enable',

    // 健康检查
    health: '/healthz',
} as const;

// 辅助函数：构建完整 URL
export function apiUrl(path: string): string {
    return `${API_BASE_URL}${path}`;
}

// 辅助函数：通用 fetch 请求
export async function apiRequest<T = any>(
    path: string,
    options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> {
    try {
        const res = await fetch(apiUrl(path), {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            ...options,
        });

        const text = await res.text();
        let data = null;
        let error = null;

        if (text) {
            try {
                const json = JSON.parse(text);
                if (json.status === 'success') {
                    data = json.data !== undefined ? json.data : json;
                } else if (json.status === 'error') {
                    error = json.message || 'Unknown error';
                } else {
                    data = json;
                }
            } catch {
                error = text;
            }
        }

        return { ok: res.ok, status: res.status, data, error };
    } catch (e) {
        return { ok: false, status: 0, data: null, error: String(e) };
    }
}
