/**
 * Vitest 测试环境设置
 * 在所有 API 测试运行前检查服务器是否就绪
 */

import { beforeAll, afterAll } from 'vitest';
import { API_BASE_URL } from '../fixtures/testData';

// 等待服务器就绪
async function waitForServer(url: string, maxAttempts = 30): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const res = await fetch(`${url}/healthz`);
            if (res.ok) {
                console.log(`✓ 服务器已就绪: ${url}`);
                return true;
            }
        } catch {
            // 服务器尚未就绪
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    return false;
}

beforeAll(async () => {
    console.log('🔧 检查测试服务器...');

    const serverReady = await waitForServer(API_BASE_URL);

    if (!serverReady) {
        console.error(`❌ 服务器未就绪: ${API_BASE_URL}`);
        console.error('请先启动 antigravity-server:');
        console.error('  cd src-tauri && cargo run --bin antigravity-server');
        throw new Error('测试服务器未启动');
    }
}, 60000);

afterAll(() => {
    console.log('✓ 测试完成');
});
