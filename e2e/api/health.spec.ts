/**
 * 健康检查 API 测试
 * 验证服务器基本连通性
 */

import { describe, it, expect } from 'vitest';
import { API_ENDPOINTS, apiUrl } from '../fixtures/testData';

describe('健康检查', () => {
    it('GET /healthz 返回 200 OK', async () => {
        const res = await fetch(apiUrl(API_ENDPOINTS.health));

        expect(res.ok).toBe(true);
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.status).toBe('ok');
    });

    it('响应时间在合理范围内 (<1s)', async () => {
        const start = Date.now();
        await fetch(apiUrl(API_ENDPOINTS.health));
        const duration = Date.now() - start;

        expect(duration).toBeLessThan(1000);
    });
});
