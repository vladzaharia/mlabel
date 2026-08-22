import type { AppConfig } from "@core/config";
import type { CoercedValue, SourceDocument, SourceFingerprint } from "@core";

/** Heavy, main-process-only session state (kept out of the renderer). */
export interface LoadedInput {
  inputPath: string;
  document: SourceDocument;
  /** Coerced input values per record index. */
  inputValues: Map<number, Record<string, CoercedValue>>;
  /** Content fingerprint captured at load time; used to detect stale resumes. */
  fingerprint: SourceFingerprint;
}

interface MainState {
  config?: AppConfig;
  configPath?: string;
  input?: LoadedInput;
  revealablePaths: Set<string>;
}

const state: MainState = { revealablePaths: new Set() };

/**
 * True when `path` was produced by main (export output / remaining, prepare
 * split / join outputs). Only produced paths may be revealed in the file manager.
 */
export function isRevealable(path: string, revealable: Set<string>): boolean {
  return revealable.has(path);
}

export const appState = {
  get config(): AppConfig | undefined {
    return state.config;
  },
  get configPath(): string | undefined {
    return state.configPath;
  },
  get input(): LoadedInput | undefined {
    return state.input;
  },
  get revealablePaths(): Set<string> {
    return state.revealablePaths;
  },
  setConfig(config: AppConfig, path: string): void {
    state.config = config;
    state.configPath = path;
  },
  setInput(input: LoadedInput): void {
    state.input = input;
  },
  /**
   * Drop the loaded document when the renderer leaves a file.
   *
   * Two reasons this matters: the parsed document pins the whole source file in
   * memory for the process lifetime, and a stale one makes `exportLabels` write
   * the *previous* file's rows under the new file's name.
   */
  clearInput(): void {
    state.input = undefined;
  },
  /** Unload the config. The loaded input is meaningless without it, so it goes too. */
  clearConfig(): void {
    state.config = undefined;
    state.configPath = undefined;
    state.input = undefined;
  },
  addRevealablePath(path: string): void {
    state.revealablePaths.add(path);
  },
  reset(): void {
    state.config = undefined;
    state.configPath = undefined;
    state.input = undefined;
    state.revealablePaths = new Set();
  },
};
