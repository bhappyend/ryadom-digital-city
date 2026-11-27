import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({ root: resolve(__dirname, '../../..'), test: {
  include: ['packages/qa/support/admin.runtime.test.ts'], fileParallelism: false,
  testTimeout: 180_000, hookTimeout: 30_000
} });
