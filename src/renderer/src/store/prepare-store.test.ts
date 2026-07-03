import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcApi, PrepareFileInfo } from "@core";
import { usePrepareStore } from "./prepare-store";

function fileInfo(path: string, rowCount = 4, ok = true): PrepareFileInfo {
  return { path, rowCount, ok, issues: [] };
}

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

describe("prepare store", () => {
  beforeEach(() => {
    usePrepareStore.getState().reset();
  });

  it("analyzes a picked split file and clamps parts to its row count", async () => {
    mockApi({ pickSplitFile: async () => ({ ok: true, file: fileInfo("/d/in.csv", 3) }) });
    usePrepareStore.getState().setSplitParts(99); // no file yet → clamps to minimum
    await usePrepareStore.getState().pickSplitFile();
    const { split, busy } = usePrepareStore.getState();
    expect(busy).toBe(false);
    expect(split.file?.path).toBe("/d/in.csv");
    expect(split.parts).toBe(2);

    usePrepareStore.getState().setSplitParts(99);
    expect(usePrepareStore.getState().split.parts).toBe(3);
    usePrepareStore.getState().setSplitParts(0);
    expect(usePrepareStore.getState().split.parts).toBe(2);
  });

  it("keeps state untouched when the picker is canceled", async () => {
    mockApi({ pickSplitFile: async () => ({ ok: false, canceled: true }) });
    await usePrepareStore.getState().pickSplitFile();
    expect(usePrepareStore.getState().split.file).toBeNull();
    expect(usePrepareStore.getState().busy).toBe(false);
  });

  it("stores the split result and clears it when inputs change", async () => {
    mockApi({
      pickSplitFile: async () => ({ ok: true, file: fileInfo("/d/in.csv") }),
      runSplit: async () => ({ ok: true, files: [{ path: "/d/in-part1-of-2.csv", rowCount: 2 }] }),
    });
    await usePrepareStore.getState().pickSplitFile();
    await usePrepareStore.getState().runSplit();
    expect(usePrepareStore.getState().split.result?.ok).toBe(true);

    usePrepareStore.getState().setSplitParts(3);
    expect(usePrepareStore.getState().split.result).toBeNull();
  });

  it("applies a pick into an empty join list directly", async () => {
    mockApi({
      pickJoinFiles: async () => ({
        ok: true,
        files: [fileInfo("/d/a-output.csv")],
        crossFileIssues: [],
        totalRows: 4,
      }),
    });
    await usePrepareStore.getState().pickJoinFiles("output");
    const join = usePrepareStore.getState().join.output;
    expect(join.files.map((f) => f.path)).toEqual(["/d/a-output.csv"]);
    expect(join.totalRows).toBe(4);
  });

  it("re-analyzes the merged, deduplicated list when adding to existing files", async () => {
    const analyze = vi.fn(async ({ paths }: { paths: string[] }) => ({
      ok: true,
      files: paths.map((p) => fileInfo(p)),
      crossFileIssues: [],
      totalRows: paths.length * 4,
    }));
    mockApi({
      pickJoinFiles: async () => ({
        ok: true,
        files: [fileInfo("/d/a-output.csv"), fileInfo("/d/b-output.csv")],
        crossFileIssues: [],
        totalRows: 8,
      }),
      analyzeJoinFiles: analyze as unknown as IpcApi["analyzeJoinFiles"],
    });
    usePrepareStore.setState({
      join: {
        output: {
          files: [fileInfo("/d/a-output.csv")],
          crossFileIssues: [],
          totalRows: 4,
          result: null,
        },
        remaining: { files: [], crossFileIssues: [], totalRows: 0, result: null },
      },
    });

    await usePrepareStore.getState().pickJoinFiles("output");
    expect(analyze).toHaveBeenCalledWith({
      kind: "output",
      paths: ["/d/a-output.csv", "/d/b-output.csv"],
    });
    expect(usePrepareStore.getState().join.output.files).toHaveLength(2);
  });

  it("removing the last join file clears the list without an IPC call", async () => {
    const analyze = vi.fn();
    mockApi({ analyzeJoinFiles: analyze as unknown as IpcApi["analyzeJoinFiles"] });
    usePrepareStore.setState({
      join: {
        output: { files: [fileInfo("/d/a.csv")], crossFileIssues: [], totalRows: 4, result: null },
        remaining: { files: [], crossFileIssues: [], totalRows: 0, result: null },
      },
    });
    await usePrepareStore.getState().removeJoinFile("output", "/d/a.csv");
    expect(usePrepareStore.getState().join.output.files).toEqual([]);
    expect(analyze).not.toHaveBeenCalled();
  });

  it("routes output-suffixed drops to the output join", async () => {
    const analyzeJoin = vi.fn(async ({ paths }: { paths: string[] }) => ({
      ok: true,
      files: paths.map((p) => fileInfo(p)),
      crossFileIssues: [],
      totalRows: paths.length,
    }));
    mockApi({ analyzeJoinFiles: analyzeJoin as unknown as IpcApi["analyzeJoinFiles"] });

    await usePrepareStore.getState().addDroppedPaths(["/d/a-output.csv", "/d/b-output.csv"]);
    expect(usePrepareStore.getState().tab).toBe("join-output");
    expect(usePrepareStore.getState().selectedAction).toBe("join-output");
    expect(analyzeJoin).toHaveBeenCalledWith({
      kind: "output",
      paths: ["/d/a-output.csv", "/d/b-output.csv"],
    });
  });

  it("routes remaining-suffixed drops to the remaining join", async () => {
    const analyzeJoin = vi.fn(async ({ paths }: { paths: string[] }) => ({
      ok: true,
      files: paths.map((p) => fileInfo(p)),
      crossFileIssues: [],
      totalRows: paths.length,
    }));
    mockApi({ analyzeJoinFiles: analyzeJoin as unknown as IpcApi["analyzeJoinFiles"] });

    await usePrepareStore
      .getState()
      .addDroppedPaths(["/d/a-part1-of-2-remaining.csv", "/d/a-part2-of-2-remaining.csv"]);
    expect(usePrepareStore.getState().tab).toBe("join-remaining");
    expect(usePrepareStore.getState().selectedAction).toBe("join-remaining");
    expect(analyzeJoin).toHaveBeenCalledWith({
      kind: "remaining",
      paths: ["/d/a-part1-of-2-remaining.csv", "/d/a-part2-of-2-remaining.csv"],
    });
  });

  it("routes a single unsuffixed drop to split", async () => {
    const analyzeSplit = vi.fn(async () => ({ ok: true, file: fileInfo("/d/x.csv") }));
    mockApi({ analyzeSplitFile: analyzeSplit as unknown as IpcApi["analyzeSplitFile"] });

    await usePrepareStore.getState().addDroppedPaths(["/d/x.csv"]);
    expect(usePrepareStore.getState().tab).toBe("split");
    expect(usePrepareStore.getState().selectedAction).toBe("split");
    expect(analyzeSplit).toHaveBeenCalledWith("/d/x.csv");
  });

  it("probes multiple unsuffixed drops and applies the single valid join kind", async () => {
    const analyzeSplit = vi.fn(async () => ({ ok: true, file: fileInfo("/d/a.csv") }));
    const analyzeJoin = vi.fn(async ({ kind, paths }: { kind: string; paths: string[] }) => ({
      ok: kind === "remaining",
      files: paths.map((p) => fileInfo(p)),
      crossFileIssues: [],
      totalRows: paths.length,
    }));
    mockApi({
      analyzeSplitFile: analyzeSplit as unknown as IpcApi["analyzeSplitFile"],
      analyzeJoinFiles: analyzeJoin as unknown as IpcApi["analyzeJoinFiles"],
    });

    await usePrepareStore.getState().addDroppedPaths(["/d/a.csv", "/d/b.csv"]);
    expect(usePrepareStore.getState().tab).toBe("join-remaining");
    expect(usePrepareStore.getState().selectedAction).toBe("join-remaining");
    expect(usePrepareStore.getState().pendingDrop).toBeNull();
  });

  it("keeps ambiguous drops pending until the user chooses a task", async () => {
    const analyzeSplit = vi.fn(async () => ({ ok: true, file: fileInfo("/d/a.csv") }));
    const analyzeJoin = vi.fn(async ({ kind, paths }: { kind: string; paths: string[] }) => ({
      ok: true,
      files: paths.map((p) => fileInfo(p)),
      crossFileIssues: [],
      totalRows: kind === "output" ? 2 : 3,
    }));
    mockApi({
      analyzeSplitFile: analyzeSplit as unknown as IpcApi["analyzeSplitFile"],
      analyzeJoinFiles: analyzeJoin as unknown as IpcApi["analyzeJoinFiles"],
    });

    await usePrepareStore.getState().addDroppedPaths(["/d/a.csv", "/d/b.csv"]);
    expect(usePrepareStore.getState().pendingDrop?.summaries).toHaveLength(3);
    expect(usePrepareStore.getState().busy).toBe(false);

    await usePrepareStore.getState().resolvePendingDrop("join-output");
    expect(usePrepareStore.getState().pendingDrop).toBeNull();
    expect(usePrepareStore.getState().tab).toBe("join-output");
    expect(usePrepareStore.getState().selectedAction).toBe("join-output");
  });

  it("allows explicit task drops to bypass inference", async () => {
    const analyzeJoin = vi.fn(async ({ paths }: { paths: string[] }) => ({
      ok: true,
      files: paths.map((p) => fileInfo(p)),
      crossFileIssues: [],
      totalRows: paths.length,
    }));
    mockApi({ analyzeJoinFiles: analyzeJoin as unknown as IpcApi["analyzeJoinFiles"] });

    await usePrepareStore
      .getState()
      .addDroppedPathsToTab("join-remaining", ["/d/a.csv", "/d/a.csv", "/d/b.csv"]);
    expect(analyzeJoin).toHaveBeenCalledWith({
      kind: "remaining",
      paths: ["/d/a.csv", "/d/b.csv"],
    });
  });

  it("keeps join state when the save dialog is canceled", async () => {
    mockApi({ runJoin: async () => ({ ok: false, canceled: true }) });
    usePrepareStore.setState({
      join: {
        output: { files: [fileInfo("/d/a.csv")], crossFileIssues: [], totalRows: 4, result: null },
        remaining: { files: [], crossFileIssues: [], totalRows: 0, result: null },
      },
    });
    await usePrepareStore.getState().runJoin("output");
    expect(usePrepareStore.getState().join.output.result).toBeNull();
    expect(usePrepareStore.getState().join.output.files).toHaveLength(1);
  });
});
