import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import babel from "@rolldown/plugin-babel";

const coreAlias = { "@core": resolve("src/core") };

// electron-vite 5 externalizes `dependencies` for main/preload automatically
// (build.externalizeDeps defaults to true), so no externalize plugin is needed.
export default defineConfig({
  main: {
    resolve: { alias: coreAlias },
    build: {
      rollupOptions: {
        input: { index: resolve("src/main/index.ts") },
        output: { format: "es", entryFileNames: "[name].mjs" },
      },
    },
  },
  preload: {
    resolve: { alias: coreAlias },
    build: {
      rollupOptions: {
        input: { index: resolve("src/preload/index.ts") },
        // Electron requires ESM preloads to use the .mjs extension.
        output: { format: "es", entryFileNames: "[name].mjs" },
      },
    },
  },
  renderer: {
    root: "src/renderer",
    resolve: {
      alias: {
        ...coreAlias,
        "@": resolve("src/renderer/src"),
      },
    },
    plugins: [
      react(),
      // React Compiler 1.0 via the official preset helper (needs @rolldown/plugin-babel
      // + @babel/core). plugin-react v6 uses oxc for the main transform, so the compiler
      // runs as a separate Babel pass.
      babel({ presets: [reactCompilerPreset()] }),
      tailwindcss(),
    ],
    build: {
      rollupOptions: {
        input: { index: resolve("src/renderer/index.html") },
      },
    },
  },
});
