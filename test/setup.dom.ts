import "@testing-library/jest-dom/vitest";

// Provide a minimal window.api stub so the menu-context subscriber installed
// by store.ts does not crash in tests that don't set up a full API mock.
// Tests that need to inspect or override specific API methods should use
// Object.defineProperty(window, "api", { ... }) in their own beforeEach.
if (!window.api) {
  Object.defineProperty(window, "api", {
    value: { setMenuContext: async () => {} },
    configurable: true,
    writable: true,
  });
}
