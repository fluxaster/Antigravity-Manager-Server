/**
 * 设置页面 E2E 测试
 * 验证 Web 模式下配置管理功能
 */

import { test, expect } from '@playwright/test';

test.describe('设置页面', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/settings');
        await page.waitForLoadState('networkidle');
    });

    test('页面正确加载', async ({ page }) => {
        await expect(page.locator('body')).toBeVisible();
    });

    test('配置 API 被调用', async ({ page }) => {
        // 监听配置加载请求
        const configRequest = page.waitForResponse(
            resp => resp.url().includes('/api/admin/config') && resp.request().method() === 'GET'
        );

        await page.reload();

        const response = await configRequest;
        expect(response.ok()).toBe(true);
    });

    test('保存按钮存在', async ({ page }) => {
        const saveButton = page.locator('button').filter({ hasText: /保存|Save/ }).first();
        await expect(saveButton).toBeVisible({ timeout: 10000 });
    });

    test('保存配置功能', async ({ page }) => {
        const saveButton = page.locator('button').filter({ hasText: /保存|Save/ }).first();

        if (await saveButton.isVisible()) {
            // 监听保存请求
            const saveRequest = page.waitForResponse(
                resp => resp.url().includes('/api/admin/config') && resp.request().method() === 'POST'
            );

            await saveButton.click();

            const response = await saveRequest;
            expect(response.ok()).toBe(true);
        }
    });

    test('配置表单字段存在', async ({ page }) => {
        // 检查常见配置字段
        const inputFields = page.locator('input, select, textarea');
        const fieldCount = await inputFields.count();

        expect(fieldCount).toBeGreaterThan(0);
        console.log(`配置字段数量: ${fieldCount}`);
    });

    test('语言切换选项', async ({ page }) => {
        // 查找语言选择器
        const languageSelect = page.locator('select, [role="listbox"]').filter({ hasText: /中文|English|语言|Language/ });

        if (await languageSelect.count() > 0) {
            console.log('✓ 语言切换选项存在');
        } else {
            // 可能是按钮形式
            const langButton = page.locator('button').filter({ hasText: /中文|English/ });
            if (await langButton.count() > 0) {
                console.log('✓ 语言切换按钮存在');
            }
        }
    });
});
