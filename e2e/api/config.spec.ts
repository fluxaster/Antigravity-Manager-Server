/**
 * 配置管理 API 测试
 * 对应 request.ts 中的 load_config 和 save_config 命令
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { API_ENDPOINTS, apiUrl } from '../fixtures/testData';

describe('配置管理 API', () => {
    let originalConfig: any = null;

    describe('GET /api/admin/config (加载配置)', () => {
        it('返回完整配置对象', async () => {
            const res = await fetch(apiUrl(API_ENDPOINTS.config));

            expect(res.ok).toBe(true);

            const json = await res.json();
            expect(json.status).toBe('success');
            expect(json.data).toBeDefined();

            originalConfig = json.data;
        });

        it('配置包含 proxy 字段', async () => {
            if (!originalConfig) {
                const res = await fetch(apiUrl(API_ENDPOINTS.config));
                originalConfig = (await res.json()).data;
            }

            expect(originalConfig).toHaveProperty('proxy');
        });

        it('proxy 配置包含必要字段', async () => {
            if (!originalConfig?.proxy) {
                console.log('⚠️ 没有 proxy 配置，跳过验证');
                return;
            }

            const proxy = originalConfig.proxy;
            expect(proxy).toHaveProperty('port');
            expect(typeof proxy.port).toBe('number');
        });
    });

    describe('POST /api/admin/config (保存配置)', () => {
        it('保存原始配置（无修改）', async () => {
            if (!originalConfig) {
                console.log('⚠️ 没有原始配置，跳过保存测试');
                return;
            }

            const res = await fetch(apiUrl(API_ENDPOINTS.config), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(originalConfig),
            });

            expect(res.ok).toBe(true);

            const json = await res.json();
            expect(json.status).toBe('success');
        });

        it('保存修改后的配置', async () => {
            if (!originalConfig) {
                console.log('⚠️ 没有原始配置，跳过修改测试');
                return;
            }

            // 修改一个配置项
            const modifiedConfig = {
                ...originalConfig,
                proxy: {
                    ...originalConfig.proxy,
                    enable_logging: !originalConfig.proxy?.enable_logging,
                },
            };

            const res = await fetch(apiUrl(API_ENDPOINTS.config), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(modifiedConfig),
            });

            expect(res.ok).toBe(true);

            // 恢复原始配置
            await fetch(apiUrl(API_ENDPOINTS.config), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(originalConfig),
            });
        });

        it('无效配置返回错误', async () => {
            const res = await fetch(apiUrl(API_ENDPOINTS.config), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invalid: 'config' }),
            });

            // 应该返回错误（422 或 400）
            expect(res.status).toBeGreaterThanOrEqual(400);
        });
    });
});
