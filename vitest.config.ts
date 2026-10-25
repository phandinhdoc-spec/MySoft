import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/.git/**", "**/.pvta-reset/**"],
    include: ["cli/test/**/*.test.ts", "chatbox/test/**/*.test.ts", "core/test/**/*.test.ts", "shared/test/**/*.test.ts", "bridge/test/**/*.test.ts", "addin/test/**/*.test.ts", "scripts/test/**/*.test.ts"],
    testTimeout: 20000,
  },
});
