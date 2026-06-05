import { defineConfig } from 'vitest/config'

// SDK 是纯 fetch 客户端，测试经 MSW 在 node 拦截网络；无需 globals，测试显式从 vitest 导入。
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.spec.ts'],
  },
})
