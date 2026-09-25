import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { networkLog } from "./network-log";
import { MODEL_PARTITION, UPDATER_PARTITION } from "./partitions";

/**
 * Tests for the guard *wiring*, which is a different thing from the policy.
 *
 * `network-policy.test.ts` proves that a given URL is allowed or refused under a
 * given scope. None of that helps if the handler is never installed on the
 * session the request actually goes out on — and that decision lives here, in
 * ~40 lines that had no test at all. Deleting the `defaultSession` block used to
 * break nothing.
 *
 * So these tests assert the things that fail *open*: which sessions get a
 * handler, that both gates start shut, and that a permitted request is recorded
 * rather than passing through invisibly.
 */

interface FakeSession {
  handlers: ((
    details: { url: string },
    callback: (response: { cancel: boolean }) => void,
  ) => void)[];
  webRequest: { onBeforeRequest: (fn: FakeSession["handlers"][number]) => void };
  setPermissionRequestHandler: (fn: unknown) => void;
  setPermissionCheckHandler: (fn: unknown) => void;
  setSpellCheckerEnabled: (value: boolean) => void;
  permissionHandlersSet: number;
  spellcheck?: boolean;
}

const h = vi.hoisted(() => {
  const sessions = new Map<string, FakeSession>();

  function make(): FakeSession {
    const s: FakeSession = {
      handlers: [],
      webRequest: {
        onBeforeRequest: (fn) => {
          s.handlers.push(fn);
        },
      },
      setPermissionRequestHandler: () => {
        s.permissionHandlersSet += 1;
      },
      setPermissionCheckHandler: () => {
        s.permissionHandlersSet += 1;
      },
      setSpellCheckerEnabled: (value: boolean) => {
        s.spellcheck = value;
      },
      permissionHandlersSet: 0,
    };
    return s;
  }

  return {
    sessions,
    get(name: string): FakeSession {
      const existing = sessions.get(name);
      if (existing) return existing;
      const created = make();
      sessions.set(name, created);
      return created;
    },
    reset(): void {
      sessions.clear();
    },
  };
});

vi.mock("electron", () => ({
  app: {
    // Packaged, so `isDev` is false and the dev-loopback exemption is off.
    get isPackaged() {
      return true;
    },
    on: vi.fn(),
  },
  session: {
    get defaultSession() {
      return h.get("__default");
    },
    fromPartition: (name: string) => h.get(name),
  },
}));

const DEFAULT = "__default";

/** Run a session's guard and report whether the request was cancelled. */
function ask(session: FakeSession, url: string): boolean {
  let cancelled: boolean | undefined;
  const handler = session.handlers[0];
  if (!handler) throw new Error("no onBeforeRequest handler installed");
  handler({ url }, (response) => {
    cancelled = response.cancel;
  });
  if (cancelled === undefined) throw new Error("handler never called back");
  return cancelled;
}

const realPlatform = process.platform;

function setPlatform(value: string): void {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

afterAll(() => setPlatform(realPlatform));

/**
 * Fresh module state: the gates and the contacted-host set are module-level.
 *
 * `resetModules` also hands the guard a *new* `network-log` singleton, so the
 * log has to be re-imported from the same registry — reading the one this file
 * imported at the top would watch an instance nothing writes to.
 */
async function install(
  platform = "linux",
): Promise<typeof import("./network-guard") & { log: typeof networkLog }> {
  setPlatform(platform);
  h.reset();
  vi.resetModules();
  const mod = await import("./network-guard");
  const { networkLog: log } = await import("./network-log");
  mod.installNetworkGuard();
  return { ...mod, log };
}

beforeEach(() => {
  h.reset();
});

const HF = "https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/x.gguf";
const HF_CDN = "https://cas-bridge.xethub.hf.co/xet-bridge-us/abc/def";
const GH = "https://github.com/vladzaharia/mlabel/releases/latest";

describe("installNetworkGuard", () => {
  it("installs a request handler on all three sessions", async () => {
    await install();

    for (const name of [DEFAULT, UPDATER_PARTITION, MODEL_PARTITION]) {
      expect(h.get(name).handlers, `${name} has no onBeforeRequest handler`).toHaveLength(1);
    }
  });

  it("denies every permission request on all three sessions", async () => {
    await install();

    for (const name of [DEFAULT, UPDATER_PARTITION, MODEL_PARTITION]) {
      expect(h.get(name).permissionHandlersSet).toBe(2);
    }
  });

  // The whole claim rests on this: before a config has been read, the app is
  // not permitted to talk to anything.
  it("starts with both gates shut", async () => {
    await install();

    expect(ask(h.get(UPDATER_PARTITION), GH)).toBe(true);
    expect(ask(h.get(MODEL_PARTITION), HF)).toBe(true);
  });

  it("opens each gate only for its own traffic", async () => {
    const mod = await install();
    mod.setUpdatesEnabled(true);
    mod.setModelDownloadEnabled(true);

    expect(ask(h.get(UPDATER_PARTITION), GH)).toBe(false);
    expect(ask(h.get(MODEL_PARTITION), HF)).toBe(false);

    // Neither scope can borrow the other's permission, so a bug in one cannot
    // reach the other's hosts.
    expect(ask(h.get(UPDATER_PARTITION), HF)).toBe(true);
    expect(ask(h.get(MODEL_PARTITION), GH)).toBe(true);
  });

  it("closes the default session to remote hosts in every configuration", async () => {
    const mod = await install();
    mod.setUpdatesEnabled(true);
    mod.setModelDownloadEnabled(true);

    for (const url of [GH, HF, "https://example.com/"]) {
      expect(ask(h.get(DEFAULT), url), `${url} reached the renderer session`).toBe(true);
    }
    expect(ask(h.get(DEFAULT), "file:///app/index.html")).toBe(false);
  });
});

describe("the spellchecker dictionary download", () => {
  // Chromium fetches Hunspell dictionaries below `webRequest`, where no handler
  // above can see or stop it. Off macOS the only fix is not to ask for them.
  it("is disabled off macOS", async () => {
    await install("linux");
    expect(h.get(DEFAULT).spellcheck).toBe(false);
  });

  it("is left alone on macOS, which downloads nothing", async () => {
    await install("darwin");
    expect(h.get(DEFAULT).spellcheck).toBeUndefined();
  });
});

describe("logging", () => {
  it("records a refusal", async () => {
    const { log } = await install();
    ask(h.get(MODEL_PARTITION), HF);

    expect(log.entries()).toMatchObject([
      { kind: "denied", host: "huggingface.co", outcome: "denied" },
    ]);
  });

  it("records each permitted host once, not each request", async () => {
    const mod = await install();
    mod.setModelDownloadEnabled(true);

    ask(h.get(MODEL_PARTITION), HF);
    ask(h.get(MODEL_PARTITION), HF);
    ask(h.get(MODEL_PARTITION), `${HF}?chunk=2`);

    // A gigabyte arrives as thousands of requests. One row per host is what
    // keeps the 50-entry buffer readable while still being complete.
    expect(mod.log.entries()).toMatchObject([{ kind: "contacted", host: "huggingface.co" }]);
  });

  it("records the redirect target, which is the host that serves the bytes", async () => {
    const mod = await install();
    mod.setModelDownloadEnabled(true);

    ask(h.get(MODEL_PARTITION), HF);
    ask(h.get(MODEL_PARTITION), HF_CDN);

    expect(mod.log.entries().map((e) => e.host)).toEqual([
      "huggingface.co",
      "cas-bridge.xethub.hf.co",
    ]);
  });

  it("says nothing about the renderer loading its own files", async () => {
    const { log } = await install();
    ask(h.get(DEFAULT), "file:///app/index.html");

    expect(log.entries()).toEqual([]);
  });
});
