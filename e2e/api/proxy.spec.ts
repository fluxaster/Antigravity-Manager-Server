/**
 * 代理控制 API 测试
 * 对应 request.ts 中的代理相关命令
 */

import { describe, it, expect } from 'vitest';
import { API_ENDPOINTS, apiUrl } from '../fixtures/testData';

describe('代理控制 API', () => {
    describe('GET /api/admin/proxy/status (代理状态)', () => {
        it('返回代理运行状态', async () => {
            const res = await fetch(apiUrl(API_ENDPOINTS.proxyStatus));

            expect(res.ok).toBe(true);

            const json = await res.json();
            expect(json.status).toBe('success');
            expect(json.data).toHaveProperty('running');
            expect(typeof json.data.running).toBe('boolean');
        });

        it('状态对象包含端口信息', async () => {
            const res = await fetch(apiUrl(API_ENDPOINTS.proxyStatus));
            const json = await res.json();

            if (json.data.running) {
                expect(json.data).toHaveProperty('port');
            }
        });
    });

    describe('POST /api/admin/proxy/mapping (更新模型映射)', () => {
        it('更新空映射', async () => {
            const res = await fetch(apiUrl(API_ENDPOINTS.updateMapping), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mapping: {} }),
            });

            expect(res.ok).toBe(true);
        });

        it('更新自定义映射', async () => {
            const res = await fetch(apiUrl(API_ENDPOINTS.updateMapping), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mapping: {
                        'gpt-4': 'claude-3-5-sonnet',
                    },
                }),
            });

            expect(res.ok).toBe(true);
        });
    });

    describe('POST /api/admin/proxy/fetch_models (拉取模型)', () => {
        it('请求拉取模型列表', async () => {
            const res = await fetch(apiUrl(API_ENDPOINTS.fetchModels), {
                method: 'POST',
            });

            // 可能成功或失败（取决于网络连接）
            expect([200, 500].includes(res.status)).toBe(true);
        });
    });

    describe('DELETE /api/admin/proxy/sessions (清除会话)', () => {
        it('清除所有会话绑定', async () => {
            const res = await fetch(apiUrl(API_ENDPOINTS.clearSessions), {
                method: 'DELETE',
            });

            expect(res.ok).toBe(true);
        });
    });

    describe('POST /api/admin/utils/generate_key (生成 API Key)', () => {
        it('生成新的 API Key', async () => {
            const res = await fetch(apiUrl(API_ENDPOINTS.generateKey), {
                method: 'POST',
            });

            expect(res.ok).toBe(true);

            const json = await res.json();
            expect(json.status).toBe('success');
            expect(json.data).toBeDefined();
            expect(typeof json.data).toBe('string');
            expect(json.data.length).toBeGreaterThan(0);
        });
    });
});
