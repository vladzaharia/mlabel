import { resolve } from "node:path";
import { builtinModules } from "node:module";
import { defineConfig } from "electron-vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import babel from "@rolldown/plugin-babel";

const coreAlias = { "@core": resolve("src/core") };

// `electron` and the node builtins must stay external so they resolve to the
// runtime's built-ins; bundling `electron` pulls in node_modules/electron/index.js
// (a path-returning installer shim) and breaks the app at launch. electron-vite's
// auto-externalization only covers `dependencies` (electron is a devDependency) and
// its preset's RegExp-based external list is dropped under Rolldown, so we list them
// explicitly as plain strings here. The @electron-toolkit/* helpers are intentionally
// bundled; only their internal `electron` import needs to stay external.
const nodeExternals = ["electron", ...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

export default defineConfig({
  main: {
    resolve: { alias: coreAlias },
    build: {
      rollupOptions: {
        external: nodeExternals,
        input: { index: resolve("src/main/index.ts") },
        output: { format: "es", entryFileNames: "[name].mjs" },
      },
    },
  },
  preload: {
    resolve: { alias: coreAlias },
    build: {
      rollupOptions: {
        external: nodeExternals,
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
