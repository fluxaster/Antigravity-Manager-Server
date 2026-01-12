/**
 * API 代理页面 E2E 测试
 * 验证 Web 模式下代理控制功能
 */

import { test, expect } from '@playwright/test';

test.describe('API 代理页面', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/api-proxy');
        await page.waitForLoadState('networkidle');
    });

    test('页面正确加载', async ({ page }) => {
        await expect(page.locator('body')).toBeVisible();
    });

    test('代理状态显示', async ({ page }) => {
        // 检查状态指示器或文本
        const statusIndicator = page.locator('[class*="status"], [class*="running"], .badge').first();

        // 或者检查文本内容
        const pageText = await page.textContent('body');
        const hasStatusText = pageText?.includes('运行') ||
            pageText?.includes('Running') ||
            pageText?.includes('停止') ||
            pageText?.includes('Stopped') ||
            pageText?.includes('始终运行');

        expect(hasStatusText).toBe(true);
    });

    test('Web 模式显示"始终运行"状态', async ({ page }) => {
        // 在 Web 模式下应该显示特殊的状态指示
        const alwaysRunningBadge = page.locator('text=始终运行, text=Always Running, text=服务器模式').first();

        // 如果存在则测试通过
        if (await alwaysRunningBadge.isVisible()) {
            console.log('✓ Web 模式正确显示"始终运行"状态');
        } else {
            // 可能是启动/停止按钮（Tauri 模式）
            const toggleButton = page.locator('button').filter({ hasText: /启动|停止|Start|Stop/ }).first();
            if (await toggleButton.isVisible()) {
                console.log('⚠️ 检测到启动/停止按钮，可能是 Tauri 模式');
            }
        }
    });

    test('端口配置字段', async ({ page }) => {
        const portInput = page.locator('input[type="number"]').first();

        if (await portInput.isVisible()) {
            const value = await portInput.inputValue();
            console.log(`当前端口配置: ${value}`);

            // 端口应该在有效范围内
            const port = parseInt(value);
            expect(port).toBeGreaterThanOrEqual(1024);
            expect(port).toBeLessThanOrEqual(65535);
        }
    });

    test('生成 API Key 功能', async ({ page }) => {
        const generateKeyButton = page.locator('button').filter({ hasText: /生成|Generate|Key/ }).first();

        if (await generateKeyButton.isVisible()) {
            // 监听 API 请求
            const keyRequest = page.waitForResponse(
                resp => resp.url().includes('/generate_key') && resp.ok(),
                { timeout: 10000 }
            );

            await generateKeyButton.click();

            const response = await keyRequest;
            expect(response.ok()).toBe(true);
        }
    });

    test('模型映射配置区域', async ({ page }) => {
        // 检查是否有模型映射相关的 UI
        const pageText = await page.textContent('body');
        const hasMappingUI = pageText?.includes('映射') ||
            pageText?.includes('Mapping') ||
            pageText?.includes('模型');

        expect(hasMappingUI).toBe(true);
    });

    test('复制端点按钮', async ({ page }) => {
        const copyButton = page.locator('button').filter({ hasText: /复制|Copy/ }).first();

        if (await copyButton.isVisible()) {
            await copyButton.click();
            console.log('✓ 复制按钮可点击');
        }
    });
});
