# Agent Instructions

This project's canonical guidance for AI agents lives in
[CLAUDE.md](CLAUDE.md). Read it before making changes.

## Writing a config (not changing the code)

If your task is to author an MLabel `.jsonc` config rather than modify this repository,
start here instead:

- **<https://mlabel.vlad.gg/config/agents/>** — a procedure, the full rejection list with
  exact error strings, and a self-check.
- **<https://mlabel.vlad.gg/llms-full.txt>** — every documentation page in one request.
- **<https://mlabel.vlad.gg/mlabel.schema.json>** — the authoritative JSON Schema. Set it as
  your config's `$schema`.

Offline, the same schema is at [`schema/mlabel.schema.json`](schema/mlabel.schema.json) and
an annotated example at [`examples/config.jsonc`](examples/config.jsonc).

Check your work without launching the app:

```bash
pnpm validate path/to/config.jsonc
```

Validation runs in three stages — syntax, shape, then coherence — and each only runs if the
previous passed. **Fixing one error routinely reveals more.** Loop until exit code 0.

## Changing the code

Key non-negotiables:

1. **Zero network at runtime** — the config-gated update check is the only exception.
2. **`src/core/**` is format-agnostic\*\* — no Electron, no adapter internals; adding a data
   format must not change the core, the renderer, or the config schema.
3. **Adapter internals stay private** behind an opaque `ProvenanceToken` (enforced by lint).
4. **Heavy work in the main process**; the renderer talks to it via the typed `window.api`
   IPC contract.
5. **TDD** for `src/core/` and `src/main/`.

Changing `src/core/config/**` also means regenerating the JSON Schema and checking the docs
— see the _Docs_ section of CLAUDE.md for the exact steps.

See [CLAUDE.md](CLAUDE.md) for architecture, commands, conventions, and gotchas, or
<https://mlabel.vlad.gg/dev/architecture/> for the long form.
