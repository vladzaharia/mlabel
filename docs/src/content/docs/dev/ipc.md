---
title: IPC contract
description: One interface, three layers, and why renaming a method fails the build everywhere.
sidebar:
  order: 5
---

`src/core/ipc.ts` is the single source of truth for the renderer ↔ main surface.

```
IpcApi (src/core/ipc.ts)
   │
   ├── preload implements it     `satisfies IpcApi`, exposed as window.api
   ├── main registers a handler  one ipcMain.handle per method
   └── renderer consumes it      window.api: IpcApi
```

Renaming or retyping a method here fails the build in all three layers. That is the whole
design: there is no string channel name typed twice, and no way for the three to drift.

## Channels

Channel names live in two `as const` maps beside the interface — `IPC_INVOKE` for
request/response and `IPC_EVENT` for main → renderer pushes. Keys are method names, so the
mapping is mechanical.

```ts
export const IPC_INVOKE = { ping: "app:ping", pickConfig: "config:pick", … } as const;
export const IPC_EVENT  = { themeChanged: "theme:changed", updateStatus: "update:status", … } as const;
```

## The surface

| Group    | Methods                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------- |
| Config   | `getStartupConfig`, `pickConfig`, `unloadConfig`                                                                    |
| Input    | `pickInput`, `loadInput`, `pathForFile`, `unloadInput`                                                              |
| Session  | `saveSession`, `clearSession`                                                                                       |
| Export   | `exportLabels`                                                                                                      |
| Prepare  | `pickSplitFile`, `analyzeSplitFile`, `runSplit`, `pickPrepareFiles`, `pickJoinFiles`, `analyzeJoinFiles`, `runJoin` |
| Update   | `onUpdateStatus`, `installUpdate`, `checkForUpdates`, `openExternal`                                                |
| Shell    | `revealPath`                                                                                                        |
| Chrome   | `getTheme`, `onThemeChange`, `onSetMode`, `setMenuContext`                                                          |
| Liveness | `ping`                                                                                                              |

## Subscriptions return an unsubscribe

Every `on*` method returns a teardown function rather than needing a matching `off*`:

```ts
onThemeChange: (listener: ThemeListener) => () => void;
```

The renderer calls them in a `useEffect` cleanup. There is no channel name at the call site
and no way to leak a listener by forgetting the counterpart.

## Response shapes carry their own failure

Methods return discriminated results rather than throwing across the boundary:

```ts
type ConfigLoadResponse =
  | { status: "loaded"; config: AppConfig; path: string }
  | { status: "none" }
  | { status: "canceled" }
  | { status: "invalid"; issues: ConfigIssue[]; path?: string };
```

"The user cancelled the picker" is a normal outcome, not an exception. Distinguishing it
from "nothing was found" and "the file was bad" at the type level means the renderer cannot
conflate them.

## Values that cross the boundary

IPC payloads are structured-cloned, so `Date` survives — but the **session file** is plain
`JSON.stringify`/`parse`, where it does not.

That asymmetry is why `reviveLabelMap` re-coerces a restored session through the same
`coerceValue` the input pipeline uses. Before it existed, a `Date` left as an ISO string,
came back a string, failed `value instanceof Date`, and a record the labeler had finished
silently reverted to incomplete the moment they resumed.

`LabelMap` uses `null` for "not provided" rather than `undefined`, because `undefined` does
not survive JSON.

## Adding a method

1. Add it to `IpcApi` in `src/core/ipc.ts`, with a doc comment.
2. Add its channel name to `IPC_INVOKE` or `IPC_EVENT`.
3. Implement it in `src/preload/index.ts`.
4. Register the handler in `src/main/ipc.ts`.
5. Call it from the renderer.

Steps 3 and 4 fail to compile until they match step 1. `src/core/ipc.test.ts` additionally
asserts that every method has a channel and vice versa, so a half-added method is caught
even before the build.

## Preload constraints

The preload is emitted as an **unsandboxed `.mjs`** — required for ESM. It exposes exactly
`IpcApi` and nothing else; no `ipcRenderer`, no `require`, no Node globals reach the window.

`pathForFile` is the one synchronous method: it wraps `webUtils.getPathForFile`, which is
how a dropped `File` becomes an absolute path now that `File.path` has been removed.
