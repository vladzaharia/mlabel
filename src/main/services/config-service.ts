import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { app, dialog } from "electron";
import { loadConfig } from "@core/config";
import type { ConfigLoadResponse } from "@core";
import { appState } from "../state";
import { getRecent } from "./session-store";
import { startUpdates } from "./updater";

const CONFIG_NAMES = ["config.jsonc", "mlabel.config.jsonc", "mlabel.jsonc"];

/** Directories to search for an adjacent config (next to the executable). */
function candidateDirs(): string[] {
  const dirs = new Set<string>();
  if (app.isPackaged) {
    dirs.add(dirname(app.getPath("exe")));
    dirs.add(process.resourcesPath);
  } else {
    dirs.add(process.cwd());
  }
  return [...dirs];
}

function discoverAdjacentConfig(): string | undefined {
  for (const dir of candidateDirs()) {
    for (const name of CONFIG_NAMES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

async function loadConfigFile(path: string): Promise<ConfigLoadResponse> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return {
      status: "invalid",
      path,
      issues: [{ message: `Could not read config file: ${path}` }],
    };
  }
  const result = loadConfig(text);
  if (!result.ok) return { status: "invalid", path, issues: result.issues };
  appState.setConfig(result.config, path);
  // The config is the single gate for all network activity: only start update
  // checks once a loaded config permits them.
  if (result.config.network.updateChecks !== false) startUpdates();
  return { status: "loaded", config: result.config, path };
}

/** Auto-load an adjacent config, or the most recently used one, if available. */
export async function getStartupConfig(): Promise<ConfigLoadResponse> {
  const adjacent = discoverAdjacentConfig();
  if (adjacent) return loadConfigFile(adjacent);

  const recent = await getRecent();
  if (recent.config && existsSync(recent.config)) return loadConfigFile(recent.config);

  return { status: "none" };
}

/** Prompt for and load a config via the native file picker. */
export async function pickConfig(): Promise<ConfigLoadResponse> {
  const result = await dialog.showOpenDialog({
    title: "Select an MLabel config",
    properties: ["openFile"],
    filters: [{ name: "MLabel config", extensions: ["jsonc", "json"] }],
  });
  if (result.canceled || result.filePaths.length === 0) return { status: "canceled" };
  return loadConfigFile(result.filePaths[0]!);
}
