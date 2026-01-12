import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'node',
        include: ['e2e/api/**/*.spec.ts'],
        exclude: ['node_modules', 'dist', 'src-tauri'],
        testTimeout: 30000,
        setupFiles: ['e2e/setup/vitest.setup.ts'],
        reporters: ['verbose'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/**/*.ts', 'src/**/*.tsx'],
            exclude: ['src/**/*.d.ts', 'src/vite-env.d.ts'],
        },
    },
});
