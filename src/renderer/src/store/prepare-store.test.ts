import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcApi, JoinAnalyzeResponse, PrepareFileInfo } from "@core";
import { usePrepareStore } from "./prepare-store";

function fileInfo(path: string, rowCount = 4, ok = true): PrepareFileInfo {
  return { path, rowCount, ok, issues: [] };
}

function joinOk(paths: readonly string[]): JoinAnalyzeResponse {
  return {
    ok: true,
    files: paths.map((path) => fileInfo(path)),
    crossFileIssues: [],
    totalRows: paths.length,
  };
}

const joinBad: JoinAnalyzeResponse = { ok: false, error: "wrong columns" };

function mockApi(overrides: Partial<IpcApi>): IpcApi {
  const base: IpcApi = {
    ping: async () => "pong",
    getTheme: async () => false,
    onThemeChange: () => () => {},
    onUpdateStatus: () => () => {},
    onSetMode: () => () => {},
    setMenuContext: async () => {},
    installUpdate: async () => {},
    checkForUpdates: async () => {},
    openExternal: async () => {},
    revealPath: async () => {},
    getStartupConfig: async () => ({ status: "none" }),
    pickConfig: async () => ({ status: "canceled" }),
    pickInput: async () => ({ ok: false, canceled: true }),
    loadInput: async () => ({ ok: false, canceled: true }),
    pathForFile: () => "",
    saveSession: async () => {},
    clearSession: async () => {},
    exportLabels: async () => ({ ok: true }),
    getRecent: async () => ({}),
    pickSplitFile: async () => ({ ok: false, canceled: true }),
    analyzeSplitFile: async () => ({ ok: false, canceled: true }),
    pickPrepareFiles: async () => ({ canceled: true, paths: [] }),
    runSplit: async () => ({ ok: false }),
    pickJoinFiles: async () => ({ ok: false, canceled: true }),
    analyzeJoinFiles: async () => ({ ok: false }),
    runJoin: async () => ({ ok: false }),
  };
  const api: IpcApi = { ...base, ...overrides };
  Object.defineProperty(window, "api", { value: api, configurable: true });
  return api;
}

/** Analyzers that accept anything: split ok on first path, joins ok on all paths. */
function permissiveAnalyzers(): {
  analyzeSplitFile: ReturnType<typeof vi.fn>;
  analyzeJoinFiles: ReturnType<typeof vi.fn>;
} {
  return {
    analyzeSplitFile: vi.fn(async (path: string) => ({ ok: true, file: fileInfo(path, 6) })),
    analyzeJoinFiles: vi.fn(async ({ paths }: { paths: string[] }) => joinOk(paths)),
  };
}

async function proposeTo(paths: string[]): Promise<void> {
  await usePrepareStore.getState().dropPaths(paths);
}

describe("prepare store stage machine", () => {
  beforeEach(() => {
    usePrepareStore.getState().reset();
  });

  it("starts idle", () => {
    expect(usePrepareStore.getState().stage).toEqual({ kind: "idle" });
  });

  it("dropPaths from idle builds three proposals and enters confirm", async () => {
    const fns = permissiveAnalyzers();
    mockApi(fns);
    await proposeTo(["/d/a.csv", "/d/b.csv"]);

    const stage = usePrepareStore.getState().stage;
    expect(stage.kind).toBe("confirm");
    if (stage.kind !== "confirm") return;
    expect(stage.paths).toEqual(["/d/a.csv", "/d/b.csv"]);
    expect(stage.proposals.map((p) => p.op)).toEqual(["split", "join-output", "join-remaining"]);
    expect(fns.analyzeSplitFile).toHaveBeenCalledTimes(1);
    expect(fns.analyzeJoinFiles).toHaveBeenCalledTimes(2);
    expect(usePrepareStore.getState().busy).toBe(false);
  });

  it("recommends join-output when every filename hints -output", async () => {
    mockApi(permissiveAnalyzers());
    await proposeTo(["/d/a-output.csv", "/d/b-part1-of-2-output.csv"]);
    const stage = usePrepareStore.getState().stage;
    if (stage.kind !== "confirm") throw new Error("expected confirm");
    expect(stage.recommended).toBe("join-output");
    expect(stage.selected).toBe("join-output");
  });

  it("recommends join-remaining when every filename hints -remaining", async () => {
    mockApi(permissiveAnalyzers());
    await proposeTo(["/d/a-remaining.csv", "/d/b-remaining.csv"]);
    const stage = usePrepareStore.getState().stage;
    if (stage.kind !== "confirm") throw new Error("expected confirm");
    expect(stage.recommended).toBe("join-remaining");
  });

  it("recommends split for a single unhinted file", async () => {
    mockApi(permissiveAnalyzers());
    await proposeTo(["/d/plain.csv"]);
    const stage = usePrepareStore.getState().stage;
    if (stage.kind !== "confirm") throw new Error("expected confirm");
    expect(stage.recommended).toBe("split");
  });

  it("falls back to the unique valid op for mixed unhinted drops", async () => {
    mockApi({
      analyzeSplitFile: async () => ({ ok: false, error: "no" }),
      analyzeJoinFiles: async ({ kind, paths }) => (kind === "output" ? joinOk(paths) : joinBad),
    });
    await proposeTo(["/d/a.csv", "/d/b.csv"]);
    const stage = usePrepareStore.getState().stage;
    if (stage.kind !== "confirm") throw new Error("expected confirm");
    expect(stage.recommended).toBe("join-output");
  });

  it("recommends nothing when several ops are valid and nothing is hinted", async () => {
    mockApi(permissiveAnalyzers());
    await proposeTo(["/d/a.csv", "/d/b.csv"]);
    const stage = usePrepareStore.getState().stage;
    if (stage.kind !== "confirm") throw new Error("expected confirm");
    expect(stage.recommended).toBeNull();
    expect(stage.selected).toBeNull();
  });

  it("confirmOp applies the retained analysis without re-analyzing", async () => {
    const fns = permissiveAnalyzers();
    mockApi(fns);
    await proposeTo(["/d/plain.csv"]);
    usePrepareStore.getState().confirmOp();

    const state = usePrepareStore.getState();
    expect(state.stage).toMatchObject({ kind: "configure", op: "split" });
    expect(state.split.file?.path).toBe("/d/plain.csv");
    expect(fns.analyzeSplitFile).toHaveBeenCalledTimes(1); // still just the proposal call
  });

  it("confirmOp populates the join slice for a join op", async () => {
    mockApi(permissiveAnalyzers());
    await proposeTo(["/d/a-output.csv", "/d/b-output.csv"]);
    usePrepareStore.getState().confirmOp();

    const state = usePrepareStore.getState();
    expect(state.stage).toMatchObject({ kind: "configure", op: "join-output" });
    expect(state.join.output.files.map((f) => f.path)).toEqual([
      "/d/a-output.csv",
      "/d/b-output.csv",
    ]);
    expect(state.join.output.totalRows).toBe(2);
  });

  it("selectOp switches the selection; confirmOp honors it", async () => {
    mockApi(permissiveAnalyzers());
    await proposeTo(["/d/plain.csv"]);
    usePrepareStore.getState().selectOp("join-remaining");
    usePrepareStore.getState().confirmOp();
    expect(usePrepareStore.getState().stage).toMatchObject({
      kind: "configure",
      op: "join-remaining",
    });
  });

  it("changeOp returns to confirm with the same proposals", async () => {
    mockApi(permissiveAnalyzers());
    await proposeTo(["/d/plain.csv"]);
    const before = usePrepareStore.getState().stage;
    if (before.kind !== "confirm") throw new Error("expected confirm");
    usePrepareStore.getState().confirmOp();
    usePrepareStore.getState().changeOp();
    const after = usePrepareStore.getState().stage;
    if (after.kind !== "confirm") throw new Error("expected confirm");
    expect(after.proposals).toBe(before.proposals); // same reference — retained, not rebuilt
  });

  it("dropPaths during confirm unions with the pending paths", async () => {
    const fns = permissiveAnalyzers();
    mockApi(fns);
    await proposeTo(["/d/a.csv"]);
    await proposeTo(["/d/b.csv", "/d/a.csv"]);
    const stage = usePrepareStore.getState().stage;
    if (stage.kind !== "confirm") throw new Error("expected confirm");
    expect(stage.paths).toEqual(["/d/a.csv", "/d/b.csv"]);
  });

  it("dropPaths during split-configure replaces the source", async () => {
    const fns = permissiveAnalyzers();
    mockApi(fns);
    await proposeTo(["/d/first.csv"]);
    usePrepareStore.getState().confirmOp();
    await usePrepareStore.getState().dropPaths(["/d/second.csv"]);

    const state = usePrepareStore.getState();
    expect(state.stage).toMatchObject({ kind: "configure", op: "split" });
    expect(state.split.file?.path).toBe("/d/second.csv");
  });

  it("dropPaths during join-configure adds to the file set", async () => {
    const fns = permissiveAnalyzers();
    mockApi(fns);
    await proposeTo(["/d/a-output.csv"]);
    usePrepareStore.getState().confirmOp();
    await usePrepareStore.getState().dropPaths(["/d/b-output.csv"]);

    const state = usePrepareStore.getState();
    expect(state.stage).toMatchObject({ kind: "configure", op: "join-output" });
    expect(state.join.output.files.map((f) => f.path)).toEqual([
      "/d/a-output.csv",
      "/d/b-output.csv",
    ]);
  });

  it("removing the last join file returns to idle", async () => {
    mockApi(permissiveAnalyzers());
    await proposeTo(["/d/a-output.csv"]);
    usePrepareStore.getState().confirmOp();
    await usePrepareStore.getState().removeJoinFile("output", "/d/a-output.csv");

    const state = usePrepareStore.getState();
    expect(state.stage).toEqual({ kind: "idle" });
    expect(state.join.output.files).toEqual([]);
  });

  it("browseFiles cancel keeps the idle stage and clears busy", async () => {
    mockApi({ pickPrepareFiles: async () => ({ canceled: true, paths: [] }) });
    await usePrepareStore.getState().browseFiles();
    expect(usePrepareStore.getState().stage).toEqual({ kind: "idle" });
    expect(usePrepareStore.getState().busy).toBe(false);
  });

  it("browseFiles feeds picked paths into the proposal flow", async () => {
    mockApi({
      ...permissiveAnalyzers(),
      pickPrepareFiles: async () => ({ canceled: false, paths: ["/d/x.csv"] }),
    });
    await usePrepareStore.getState().browseFiles();
    expect(usePrepareStore.getState().stage.kind).toBe("confirm");
  });

  it("clamps split parts to the source row count and clears stale results", async () => {
    mockApi({
      ...permissiveAnalyzers(),
      runSplit: async () => ({ ok: true, files: [{ path: "/d/p1.csv", rowCount: 3 }] }),
    });
    await proposeTo(["/d/plain.csv"]); // fileInfo rowCount = 6
    usePrepareStore.getState().confirmOp();

    usePrepareStore.getState().setSplitParts(99);
    expect(usePrepareStore.getState().split.parts).toBe(6);
    usePrepareStore.getState().setSplitParts(0);
    expect(usePrepareStore.getState().split.parts).toBe(2);

    await usePrepareStore.getState().runSplit();
    expect(usePrepareStore.getState().split.result?.ok).toBe(true);
    usePrepareStore.getState().setSplitParts(3);
    expect(usePrepareStore.getState().split.result).toBeNull();
  });

  it("runJoin stores the result and ignores canceled saves", async () => {
    mockApi({
      ...permissiveAnalyzers(),
      runJoin: async () => ({ ok: false, canceled: true }),
    });
    await proposeTo(["/d/a-output.csv"]);
    usePrepareStore.getState().confirmOp();
    await usePrepareStore.getState().runJoin("output");
    expect(usePrepareStore.getState().join.output.result).toBeNull();
    expect(usePrepareStore.getState().busy).toBe(false);
  });

  it("reset returns to idle from any stage", async () => {
    mockApi(permissiveAnalyzers());
    await proposeTo(["/d/plain.csv"]);
    usePrepareStore.getState().confirmOp();
    usePrepareStore.getState().reset();
    expect(usePrepareStore.getState().stage).toEqual({ kind: "idle" });
    expect(usePrepareStore.getState().split.file).toBeNull();
  });
});
