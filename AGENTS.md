# Agent Instructions

This project's canonical guidance for AI agents lives in [`CLAUDE.md`](./CLAUDE.md).

Read it before making changes. Key non-negotiables:

1. **Zero network at runtime** — no remote calls anywhere.
2. **`src/core/` is format-agnostic** — no Electron, no adapter internals; adding a
   new data format must not change the core, renderer, or config schema.
3. **Adapter internals stay private** behind an opaque `ProvenanceToken`.
4. **Heavy work in the main process**; the renderer talks to it via the typed
   `window.api` IPC contract.
5. **TDD** for `src/core/` and `src/main/`.

See `CLAUDE.md` for architecture, commands, conventions, and gotchas.
