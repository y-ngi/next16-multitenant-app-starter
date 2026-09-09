import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/vitest.setup.ts'], // セットアップファイルのパスを指定
    include: [
      'src/**/*.{test,spec}.{ts,tsx}', // src 配下のテスト（コロケーション用）
      'tests/examples/*.{test,spec}.{ts,tsx}', // tests 配下のテスト（サンプル用）
    ],
    globals: true,
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'], // 👈 カバレッジ計測対象とするソースコードの範囲
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/*.test.{ts,tsx}', // テストファイル自体はカバレッジ対象から除外
        'src/db/schema.ts',
      ],
    },
  },
});
