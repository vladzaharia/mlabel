import { join } from "node:path";
import { app } from "electron";
import type { RecentPaths, SessionData } from "@core";
import { readJsonSafe, removeFile, writeJsonAtomic } from "./atomic-json";
import { createWriteQueue } from "./write-queue";

function sessionPath(): string {
  return join(app.getPath("userData"), "session.json");
}

function recentPath(): string {
  return join(app.getPath("userData"), "recent.json");
}

// One ordered pipe for session writes. save and clear share the same queue so
// a save followed immediately by a clear cannot race — they are always
// serialised in the order they were called.
const sessionQueue = createWriteQueue<SessionData | null>(async (value) => {
  if (value === null) {
    await removeFile(sessionPath());
  } else {
    await writeJsonAtomic(sessionPath(), value); // fsync: true (default)
  }
});

/** Persist the current labeling session (fire-and-forget from the renderer). */
export function saveSession(data: SessionData): void {
  sessionQueue.push(data);
}

/** Clear the session file and wait until the file is actually gone. */
export async function clearSession(): Promise<void> {
  sessionQueue.push(null);
  return sessionQueue.flush();
}

/** Flush any pending session write; used in the before-quit handler. */
export function flushSession(): Promise<void> {
  return sessionQueue.flush();
}

/** Return the saved session only if it matches the given config + input paths. */
export async function loadSessionFor(
  configPath: string,
  inputPath: string,
): Promise<SessionData | null> {
  const saved = await readJsonSafe<SessionData>(sessionPath());
  if (saved && saved.configPath === configPath && saved.inputPath === inputPath) return saved;
  return null;
}

export async function getRecent(): Promise<RecentPaths> {
  return (await readJsonSafe<RecentPaths>(recentPath())) ?? {};
}

export async function setRecent(update: Partial<RecentPaths>): Promise<void> {
  const current = await getRecent();
  await writeJsonAtomic(recentPath(), { ...current, ...update }, { fsync: false });
}
