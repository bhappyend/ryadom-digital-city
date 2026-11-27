import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({ root: resolve(__dirname, '../../..'), test: {
  include: ['packages/qa/support/owner.runtime.test.ts'], fileParallelism: false,
  testTimeout: 120_000, hookTimeout: 30_000
} });
