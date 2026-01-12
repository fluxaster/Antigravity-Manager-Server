/**
 * 监控 API 测试
 * 对应 request.ts 中的监控相关命令
 */

import { describe, it, expect } from 'vitest';
import { API_ENDPOINTS, apiUrl } from '../fixtures/testData';

describe('监控 API', () => {
    describe('GET /api/admin/monitor/stats (监控统计)', () => {
        it('返回监控统计数据', async () => {
            const res = await fetch(apiUrl(API_ENDPOINTS.monitorStats));

            expect(res.ok).toBe(true);

            const json = await res.json();
            expect(json.status).toBe('success');
            expect(json.data).toBeDefined();
        });

        it('统计数据包含请求数', async () => {
            const res = await fetch(apiUrl(API_ENDPOINTS.monitorStats));
            const json = await res.json();

            // 统计数据应该有请求计数等字段
            expect(json.data).toHaveProperty('totalRequests');
        });
    });

    describe('GET /api/admin/monitor/logs (监控日志)', () => {
        it('返回日志列表', async () => {
            const res = await fetch(apiUrl(API_ENDPOINTS.monitorLogs));

            expect(res.ok).toBe(true);

            const json = await res.json();
            expect(json.status).toBe('success');
            expect(Array.isArray(json.data)).toBe(true);
        });
    });

    describe('POST /api/admin/monitor/enable (启用监控)', () => {
        it('启用监控', async () => {
            const res = await fetch(apiUrl(API_ENDPOINTS.monitorEnable), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: true }),
            });

            expect(res.ok).toBe(true);
        });

        it('禁用监控', async () => {
            const res = await fetch(apiUrl(API_ENDPOINTS.monitorEnable), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: false }),
            });

            expect(res.ok).toBe(true);
        });
    });

    describe('DELETE /api/admin/monitor/logs (清除日志)', () => {
        it('清除所有日志', async () => {
            const res = await fetch(apiUrl(API_ENDPOINTS.monitorLogs), {
                method: 'DELETE',
            });

            expect(res.ok).toBe(true);
        });

        it('清除后日志列表为空', async () => {
            // 先清除
            await fetch(apiUrl(API_ENDPOINTS.monitorLogs), {
                method: 'DELETE',
            });

            // 再获取
            const res = await fetch(apiUrl(API_ENDPOINTS.monitorLogs));
            const json = await res.json();

            expect(json.data).toHaveLength(0);
        });
    });
});
