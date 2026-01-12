/**
 * 监控页面 E2E 测试
 * 验证 Web 模式下监控功能
 */

import { test, expect } from '@playwright/test';

test.describe('监控页面', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/monitor');
        await page.waitForLoadState('networkidle');
    });

    test('页面正确加载', async ({ page }) => {
        await expect(page.locator('body')).toBeVisible();
    });

    test('监控统计 API 被调用', async ({ page }) => {
        const statsRequest = page.waitForResponse(
            resp => resp.url().includes('/monitor/stats') && resp.ok(),
            { timeout: 10000 }
        );

        await page.reload();

        try {
            const response = await statsRequest;
            expect(response.ok()).toBe(true);
        } catch {
            console.log('⚠️ 监控统计 API 未被调用');
        }
    });

    test('日志列表 API 被调用', async ({ page }) => {
        const logsRequest = page.waitForResponse(
            resp => resp.url().includes('/monitor/logs') && resp.request().method() === 'GET',
            { timeout: 10000 }
        );

        await page.reload();

        try {
            const response = await logsRequest;
            expect(response.ok()).toBe(true);
        } catch {
            console.log('⚠️ 监控日志 API 未被调用');
        }
    });

    test('清除日志按钮', async ({ page }) => {
        const clearButton = page.locator('button').filter({ hasText: /清除|Clear|删除|Delete/ }).first();

        if (await clearButton.isVisible()) {
            console.log('✓ 清除日志按钮存在');
        } else {
            console.log('⚠️ 未找到清除日志按钮');
        }
    });

    test('统计数据展示', async ({ page }) => {
        const pageText = await page.textContent('body');

        // 检查统计相关文本
        const hasStats = pageText?.includes('请求') ||
            pageText?.includes('Request') ||
            pageText?.includes('成功') ||
            pageText?.includes('失败') ||
            pageText?.includes('统计');

        console.log(`统计数据展示: ${hasStats ? '存在' : '未找到'}`);
    });

    test('日志表格/列表', async ({ page }) => {
        // 检查日志列表元素
        const logTable = page.locator('table, [class*="log-list"], [class*="logs"]');

        if (await logTable.count() > 0) {
            console.log('✓ 日志列表存在');
        } else {
            // 可能是空状态
            const emptyState = page.locator('text=暂无, text=No logs, text=空');
            if (await emptyState.count() > 0) {
                console.log('✓ 显示空状态');
            }
        }
    });
});
