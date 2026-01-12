import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 测试配置
 * 用于测试 Linux Web 前端版本的功能完整性
 */
export default defineConfig({
    testDir: './e2e/pages',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: [
        ['html', { outputFolder: 'playwright-report' }],
        ['list'],
    ],
    timeout: 60000,

    use: {
        baseURL: process.env.BASE_URL || 'http://localhost:5173',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        // 可选：Firefox 和 WebKit
        // {
        //   name: 'firefox',
        //   use: { ...devices['Desktop Firefox'] },
        // },
        // {
        //   name: 'webkit',
        //   use: { ...devices['Desktop Safari'] },
        // },
    ],

    /* 配置 Web 服务器 */
    webServer: [
        {
            // 启动后端服务器 (antigravity-server)
            command: 'cd src-tauri && cargo run --bin antigravity-server',
            url: 'http://127.0.0.1:8045/healthz',
            reuseExistingServer: !process.env.CI,
            timeout: 120000,
        },
        {
            // 启动前端开发服务器
            command: 'npm run dev',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 30000,
        },
    ],
});
