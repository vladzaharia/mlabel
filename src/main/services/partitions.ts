/**
 * The session partition names, stated once.
 *
 * Each permitted kind of traffic gets its own Electron session so it is judged
 * under one scope alone: the updater session cannot reach Hugging Face and the
 * model session cannot reach GitHub, so a bug in one cannot borrow the other's
 * permission.
 *
 * That separation is held together entirely by two sides agreeing on a string.
 * `network-guard.ts` installs a `webRequest` handler on a partition, and the
 * code that actually makes the request asks for a partition by name — if those
 * names ever drift apart, the request goes out on an *unguarded* session and
 * every layer above keeps reporting success. It fails open and it fails
 * silently, which is the worst shape a security control can have.
 *
 * So the names live here, imported by both sides, and nobody writes the literal
 * twice.
 */

/**
 * Must match electron-updater's internal `NET_SESSION_NAME`: it routes all of
 * its requests through this partition and never through the default session.
 * We do not choose this value — electron-updater does — so it is pinned by a
 * contract test in `network-policy.test.ts` that reads the library's own source
 * and fails if an upgrade renames it.
 */
export const UPDATER_PARTITION = "electron-updater";

/** Model weights. Ours to choose; see `ai/downloader.ts` for the request side. */
export const MODEL_PARTITION = "model-download";

/**
 * `{ cache: false }` is part of the identity of a partition, not a detail:
 * `fromPartition(name, { cache: false })` and `fromPartition(name)` return
 * *different* sessions. Guarding one while fetching on the other is exactly the
 * silent failure described above, so both sides go through this helper rather
 * than repeating the options object.
 */
export const PARTITION_OPTIONS = { cache: false } as const;
