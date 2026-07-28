import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    // 只收集 src 下的测试，避免 node_modules.bak 等备份目录被误收集
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
