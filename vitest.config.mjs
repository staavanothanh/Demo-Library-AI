import { defaultExclude, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    exclude: [...defaultExclude, "**/.claude/worktrees/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: [
        "app.js",
        "controllers/**/*.js",
        "middleware/**/*.js",
        "models/**/*.js",
        "routes/**/*.js",
        "services/**/*.js",
      ],
      exclude: [
        "**/*.test.js",
        "**/services/tensorflowWorker.js",
        "**/server.js",
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
