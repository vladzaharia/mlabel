import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ExportResponse } from "@core";
import { useStore, type AppStore } from "../store/store";
import { DoneScreen } from "./DoneScreen";

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

  it("renders the output path", () => {
    render(<DoneScreen />);
    expect(screen.getByText("/tmp/data-output.csv")).toBeInTheDocument();
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
