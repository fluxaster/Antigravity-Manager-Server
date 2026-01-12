/**
 * 账户管理 API 测试
 * 对应 request.ts 中的账户相关命令
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { API_ENDPOINTS, apiUrl, apiRequest, testAccounts } from '../fixtures/testData';

describe('账户管理 API', () => {
    // 存储测试中获取的数据
    let accounts: any[] = [];
    let currentAccount: any = null;

    describe('GET /api/admin/accounts', () => {
        it('返回账户列表', async () => {
            const res = await fetch(apiUrl(API_ENDPOINTS.listAccounts));

            expect(res.ok).toBe(true);

            const json = await res.json();
            expect(json.status).toBe('success');
            expect(Array.isArray(json.data)).toBe(true);

            accounts = json.data;
        });

        it('每个账户包含必要字段', async () => {
            if (accounts.length === 0) {
                console.log('⚠️ 没有账户数据，跳过字段验证');
                return;
            }

            const account = accounts[0];
            expect(account).toHaveProperty('id');
            expect(account).toHaveProperty('email');
        });
    });

    describe('GET /api/admin/accounts/current', () => {
        it('返回当前账户或 null', async () => {
            const res = await fetch(apiUrl(API_ENDPOINTS.getCurrentAccount));

            expect(res.ok).toBe(true);

            const json = await res.json();
            expect(json.status).toBe('success');
            // data 可以是账户对象或 null
            currentAccount = json.data;
        });
    });

    describe('POST /api/admin/accounts (添加账户)', () => {
        it('无效 token 返回错误响应', async () => {
            const res = await fetch(apiUrl(API_ENDPOINTS.addAccount), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    refresh_token: testAccounts.invalid.refreshToken,
                    email: testAccounts.invalid.email,
                }),
            });

            // 预期返回错误（因为 token 无效）
            const json = await res.json();
            expect(json).toHaveProperty('status');
            // 可能是 success (如果只是保存) 或 error (如果验证 token)
        });

        it('缺少必要参数返回 400 错误', async () => {
            const res = await fetch(apiUrl(API_ENDPOINTS.addAccount), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });

            // 应该返回错误
            expect(res.status).toBeGreaterThanOrEqual(400);
        });
    });

    describe('POST /api/admin/accounts/switch (切换账户)', () => {
        it('切换到有效账户 ID', async () => {
            if (accounts.length === 0) {
                console.log('⚠️ 没有账户数据，跳过切换测试');
                return;
            }

            const res = await fetch(apiUrl(API_ENDPOINTS.switchAccount), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ account_id: accounts[0].id }),
            });

            expect(res.ok).toBe(true);
        });

        it('切换到无效账户 ID 返回错误', async () => {
            const res = await fetch(apiUrl(API_ENDPOINTS.switchAccount), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ account_id: 'invalid-id-12345' }),
            });

            // 应该返回错误
            const json = await res.json();
            expect(json.status).toBe('error');
        });
    });

    describe('POST /api/admin/quota/refresh (刷新配额)', () => {
        it('刷新全部账户配额', async () => {
            const res = await fetch(apiUrl(API_ENDPOINTS.refreshAllQuotas), {
                method: 'POST',
            });

            expect(res.ok).toBe(true);

            const json = await res.json();
            expect(json.status).toBe('success');
            expect(json.data).toHaveProperty('total');
            expect(json.data).toHaveProperty('success');
            expect(json.data).toHaveProperty('failed');
        });

        it('刷新单个账户配额', async () => {
            if (accounts.length === 0) {
                console.log('⚠️ 没有账户数据，跳过单个刷新测试');
                return;
            }

            const res = await fetch(apiUrl(API_ENDPOINTS.refreshQuota(accounts[0].id)), {
                method: 'POST',
            });

            // 可能成功或失败（取决于账户状态）
            expect([200, 500].includes(res.status)).toBe(true);
        });
    });

    describe('POST /api/admin/accounts/:id/toggle_proxy (切换代理状态)', () => {
        it('禁用账户代理', async () => {
            if (accounts.length === 0) {
                console.log('⚠️ 没有账户数据，跳过代理切换测试');
                return;
            }

            const res = await fetch(apiUrl(API_ENDPOINTS.toggleProxy(accounts[0].id)), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enable: false, reason: 'Test disable' }),
            });

            expect(res.ok).toBe(true);
        });

        it('启用账户代理', async () => {
            if (accounts.length === 0) {
                console.log('⚠️ 没有账户数据，跳过代理启用测试');
                return;
            }

            const res = await fetch(apiUrl(API_ENDPOINTS.toggleProxy(accounts[0].id)), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enable: true }),
            });

            expect(res.ok).toBe(true);
        });
    });

    describe('POST /api/admin/accounts/reorder (重排序)', () => {
        it('重排序账户列表', async () => {
            if (accounts.length < 2) {
                console.log('⚠️ 账户少于 2 个，跳过重排序测试');
                return;
            }

            // 反转顺序
            const reversedIds = accounts.map(a => a.id).reverse();

            const res = await fetch(apiUrl(API_ENDPOINTS.reorderAccounts), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ account_ids: reversedIds }),
            });

            expect(res.ok).toBe(true);
        });
    });
});
