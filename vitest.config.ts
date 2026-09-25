import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@core": resolve("src/core"),
      "@": resolve("src/renderer/src"),
      "@test": resolve("test"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/{core,main}/**/*.test.ts", "scripts/**/*.test.ts"],
          // Pinned west of UTC on purpose. Date handling has two failure modes
          // that are invisible in UTC — a date-only value rendering a day early,
          // and a local afternoon landing exactly on UTC midnight — and a CI box
          // running in UTC would pass straight through both.
          env: { TZ: "America/Los_Angeles" },
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "happy-dom",
          setupFiles: ["./test/setup.dom.ts"],
          include: ["src/renderer/**/*.test.{ts,tsx}"],
          // Pinned west of UTC for the same reason as the node project: a date
          // rendered in local time shows the previous day here, and nowhere in UTC.
          env: { TZ: "America/Los_Angeles" },
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/**/*.test.*", "src/renderer/src/components/ui/**"],
      reporter: ["text-summary", "html"],
    },
  },
});
