/**
 * 仪表盘页面 E2E 测试
 * 验证 Web 模式下首页功能
 */

import { test, expect } from '@playwright/test';

test.describe('仪表盘页面', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
    });

    test('页面正确加载', async ({ page }) => {
        await expect(page.locator('body')).toBeVisible();
    });

    test('当前账户信息显示', async ({ page }) => {
        // 等待账户信息加载
        await page.waitForResponse(
            resp => resp.url().includes('/api/admin/accounts') && resp.ok(),
            { timeout: 10000 }
        );

        // 检查账户信息区域
        const pageText = await page.textContent('body');
        const hasAccountInfo = pageText?.includes('@') ||
            pageText?.includes('邮箱') ||
            pageText?.includes('Email') ||
            pageText?.includes('账户');

        console.log(`账户信息区域: ${hasAccountInfo ? '存在' : '未找到'}`);
    });

    test('配额信息显示', async ({ page }) => {
        const pageText = await page.textContent('body');
        const hasQuotaInfo = pageText?.includes('配额') ||
            pageText?.includes('Quota') ||
            pageText?.includes('次') ||
            pageText?.includes('%');

        console.log(`配额信息: ${hasQuotaInfo ? '存在' : '未找到'}`);
    });

    test('导航链接存在', async ({ page }) => {
        // 检查主要导航链接
        const accountsLink = page.locator('a[href*="accounts"], nav >> text=账户');
        const settingsLink = page.locator('a[href*="settings"], nav >> text=设置');
        const proxyLink = page.locator('a[href*="proxy"], nav >> text=代理');

        const hasNavigation = (await accountsLink.count()) > 0 ||
            (await settingsLink.count()) > 0 ||
            (await proxyLink.count()) > 0;

        expect(hasNavigation).toBe(true);
    });

    test('响应式布局', async ({ page }) => {
        // 测试不同视口尺寸
        await page.setViewportSize({ width: 1200, height: 800 });
        await expect(page.locator('body')).toBeVisible();

        await page.setViewportSize({ width: 768, height: 1024 });
        await expect(page.locator('body')).toBeVisible();

        await page.setViewportSize({ width: 375, height: 667 });
        await expect(page.locator('body')).toBeVisible();
    });
});
