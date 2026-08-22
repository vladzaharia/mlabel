import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ExportResponse } from "@core";
import { useStore, type AppStore } from "../store/store";
import { DoneScreen } from "./DoneScreen";

const revealPath = vi.fn(async () => {});

beforeEach(() => {
  revealPath.mockClear();
  Object.defineProperty(window, "api", {
    value: { revealPath },
    configurable: true,
  });
  Object.defineProperty(window, "platform", {
    value: "darwin",
    configurable: true,
  });
});

function seed(partial: Partial<AppStore> = {}): void {
  const exportResult: ExportResponse = {
    ok: true,
    outputPath: "/tmp/data-output.csv",
    remainingPath: "/tmp/data-remaining.csv",
    completeCount: 2,
    remainingCount: 0,
  };
  useStore.setState({
    exportResult,
    busy: false,
    backToLabeling: vi.fn(),
    pickInput: vi.fn(async () => {}),
    ...partial,
  });
}

describe("DoneScreen", () => {
  beforeEach(() => seed());
  afterEach(() => cleanup());

  it("renders the plural exported count", () => {
    render(<DoneScreen />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("records exported")).toBeInTheDocument();
  });

  it("renders the singular wording for a single record", () => {
    seed({
      exportResult: { ok: true, completeCount: 1, remainingCount: 1, outputPath: "/tmp/o.csv" },
    });
    render(<DoneScreen />);
    expect(screen.getByText("record exported")).toBeInTheDocument();
    expect(screen.getByText("incomplete record saved to the remaining file")).toBeInTheDocument();
  });

  it("hides the remaining row when remainingCount is 0", () => {
    render(<DoneScreen />);
    expect(screen.queryByText(/incomplete record/)).not.toBeInTheDocument();
  });

  it("shows the remaining row with plural wording when records were incomplete", () => {
    seed({
      exportResult: { ok: true, completeCount: 5, remainingCount: 3, outputPath: "/tmp/o.csv" },
    });
    render(<DoneScreen />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("incomplete records saved to the remaining file")).toBeInTheDocument();
  });

  it("renders the output path basename with full path in title", () => {
    render(<DoneScreen />);
    const nameEl = screen.getByText("data-output.csv");
    expect(nameEl).toHaveAttribute("title", "/tmp/data-output.csv");
  });

  it("shows a 'Show in Finder' button for the output file on macOS", async () => {
    const user = userEvent.setup();
    render(<DoneScreen />);
    const buttons = screen.getAllByRole("button", { name: /Show in Finder/i });
    // At least the output row; remaining path is set but remainingCount=0 hides count row.
    // OutputRow is still shown when remainingPath is set regardless of count.
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    await user.click(buttons[0]!);
    expect(revealPath).toHaveBeenCalledWith("/tmp/data-output.csv");
  });

  it("shows a 'Show in Finder' button for the remaining file when remainingPath is set", async () => {
    const user = userEvent.setup();
    render(<DoneScreen />);
    // seed() sets remainingPath="/tmp/data-remaining.csv"
    const remainingBtn = screen.getAllByRole("button", { name: /Show in Finder/i })[1];
    expect(remainingBtn).toBeTruthy();
    await user.click(remainingBtn!);
    expect(revealPath).toHaveBeenCalledWith("/tmp/data-remaining.csv");
  });

  it("does NOT show a remaining reveal button when remainingPath is absent", () => {
    seed({
      exportResult: { ok: true, completeCount: 5, remainingCount: 0, outputPath: "/tmp/o.csv" },
    });
    render(<DoneScreen />);
    const buttons = screen.getAllByRole("button", { name: /Show in Finder/i });
    // Only the output row button; no remaining row.
    expect(buttons).toHaveLength(1);
    expect(revealPath).not.toHaveBeenCalled();
  });

  it('"Keep editing" calls backToLabeling', async () => {
    const user = userEvent.setup();
    const backToLabeling = vi.fn();
    seed({ backToLabeling });
    render(<DoneScreen />);
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(backToLabeling).toHaveBeenCalledTimes(1);
  });

  it('"Label another file" is disabled while busy', () => {
    seed({ busy: true });
    render(<DoneScreen />);
    expect(screen.getByRole("button", { name: /Label another file/ })).toBeDisabled();
  });
});

describe("DoneScreen: label another file", () => {
  afterEach(() => cleanup());

  // It used to open a native picker immediately, so the only way to change
  // config between files was to finish, pick a file, then back out again.
  it("returns to the file screen instead of opening a picker", async () => {
    const user = userEvent.setup();
    const backToInput = vi.fn();
    const pickInput = vi.fn(async () => {});
    seed({ backToInput, pickInput });

    render(<DoneScreen />);
    await user.click(screen.getByRole("button", { name: /label another file/i }));

    expect(backToInput).toHaveBeenCalledOnce();
    expect(pickInput).not.toHaveBeenCalled();
  });
});
