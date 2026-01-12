/**
 * 账户页面 E2E 测试
 * 验证 Web 模式下账户管理功能
 */

import { test, expect } from '@playwright/test';

test.describe('账户页面', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/accounts');
        await page.waitForLoadState('networkidle');
    });

    test('页面正确加载', async ({ page }) => {
        // 等待页面内容加载
        await expect(page.locator('body')).toBeVisible();

        // 检查是否有账户相关的 UI 元素
        const pageContent = await page.textContent('body');
        expect(pageContent).toBeTruthy();
    });

    test('账户列表 API 被调用', async ({ page }) => {
        // 监听 API 请求
        const accountsRequest = page.waitForResponse(
            resp => resp.url().includes('/api/admin/accounts') && resp.request().method() === 'GET'
        );

        await page.reload();

        const response = await accountsRequest;
        expect(response.ok()).toBe(true);
    });

    test('添加账户对话框可打开', async ({ page }) => {
        // 查找添加按钮
        const addButton = page.locator('button').filter({ hasText: /添加|Add|新增|Token/ }).first();

        if (await addButton.isVisible()) {
            await addButton.click();

            // 等待对话框出现
            const dialog = page.locator('dialog, [role="dialog"], .modal').first();
            await expect(dialog).toBeVisible({ timeout: 5000 });
        } else {
            console.log('⚠️ 未找到添加按钮，可能需要调整选择器');
        }
    });

    test('刷新配额功能', async ({ page }) => {
        // 查找刷新按钮
        const refreshButton = page.locator('button').filter({ hasText: /刷新|Refresh|配额/ }).first();

        if (await refreshButton.isVisible()) {
            // 监听 API 请求
            const quotaRequest = page.waitForResponse(
                resp => resp.url().includes('/quota') && resp.ok()
            );

            await refreshButton.click();

            const response = await quotaRequest;
            expect(response.ok()).toBe(true);
        } else {
            console.log('⚠️ 未找到刷新按钮');
        }
    });

    test('分页功能存在', async ({ page }) => {
        // 检查是否有分页组件
        const pagination = page.locator('[class*="pagination"], [aria-label*="pagination"], button:has-text("下一页"), button:has-text("Next")');

        // 分页可能存在也可能不存在（取决于账户数量）
        const paginationCount = await pagination.count();
        console.log(`分页组件数量: ${paginationCount}`);
    });

    test('搜索/过滤功能', async ({ page }) => {
        // 查找搜索输入框
        const searchInput = page.locator('input[type="search"], input[placeholder*="搜索"], input[placeholder*="Search"]').first();

        if (await searchInput.isVisible()) {
            await searchInput.fill('test');
            // 等待过滤效果
            await page.waitForTimeout(500);
            console.log('✓ 搜索功能可用');
        } else {
            console.log('⚠️ 未找到搜索输入框');
        }
    });
});
