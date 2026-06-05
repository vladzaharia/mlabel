import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import type { RecentPaths, SessionData } from "@core";

function userDataFile(name: string): string {
  return join(app.getPath("userData"), name);
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(path, JSON.stringify(value), "utf8");
}

const SESSION_FILE = "session.json";
const RECENT_FILE = "recent.json";

export async function saveSession(data: SessionData): Promise<void> {
  await writeJson(userDataFile(SESSION_FILE), data);
}

/** Return the saved session only if it matches the given config + input paths. */
export async function loadSessionFor(
  configPath: string,
  inputPath: string,
): Promise<SessionData | null> {
  const saved = await readJson<SessionData>(userDataFile(SESSION_FILE));
  if (saved && saved.configPath === configPath && saved.inputPath === inputPath) return saved;
  return null;
}

export async function clearSession(): Promise<void> {
  await rm(userDataFile(SESSION_FILE), { force: true });
}

export async function getRecent(): Promise<RecentPaths> {
  return (await readJson<RecentPaths>(userDataFile(RECENT_FILE))) ?? {};
}

export async function setRecent(update: Partial<RecentPaths>): Promise<void> {
  const current = await getRecent();
  await writeJson(userDataFile(RECENT_FILE), { ...current, ...update });
}
