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
}

const state: MainState = {};

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
  setConfig(config: AppConfig, path: string): void {
    state.config = config;
    state.configPath = path;
  },
  setInput(input: LoadedInput): void {
    state.input = input;
  },
  reset(): void {
    state.config = undefined;
    state.configPath = undefined;
    state.input = undefined;
  },
};
