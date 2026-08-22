import "@testing-library/jest-dom/vitest";
import { makeIpcApi } from "./fixtures/ipc";

// Node 22+ ships an experimental `localStorage` global that resolves to
// `undefined` unless `--localstorage-file` is passed, and it shadows the one
// happy-dom provides. Product code already guards with `globalThis.localStorage?.`
// (store.ts), but tests assert on persistence, so install a real in-memory
// Storage when the ambient one is missing. Keeps the suite green on any Node.
if (!globalThis.localStorage) {
  const entries = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return entries.size;
    },
    key: (i) => [...entries.keys()][i] ?? null,
    getItem: (k) => entries.get(k) ?? null,
    setItem: (k, v) => void entries.set(k, String(v)),
    removeItem: (k) => void entries.delete(k),
    clear: () => void entries.clear(),
  };
  for (const target of [globalThis, window]) {
    Object.defineProperty(target, "localStorage", {
      value: storage,
      configurable: true,
      writable: true,
    });
  }
}

// A complete `window.api` so the menu-context subscriber installed by store.ts
// never crashes in tests that don't set one up. Tests needing to inspect or
// override methods should call `installIpcApi` from ./fixtures/ipc.
if (!window.api) {
  Object.defineProperty(window, "api", {
    value: makeIpcApi(),
    configurable: true,
    writable: true,
  });
}
