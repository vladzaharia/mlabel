import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { IpcApi } from "@core";
import { useStore } from "../store/store";
import { BottomBar } from "./BottomBar";

function mockApi(): void {
  const base: Partial<IpcApi> = {
    getTheme: async () => false,
    onThemeChange: () => () => {},
    onUpdateStatus: () => () => {},
    onSetMode: () => () => {},
    setMenuContext: async () => {},
  };
  Object.defineProperty(window, "api", { value: base, configurable: true });
  Object.defineProperty(window, "platform", { value: "darwin", configurable: true });
}

describe("BottomBar", () => {
  beforeEach(() => {
    mockApi();
    useStore.setState({
      phase: "labeling",
      records: Array.from({ length: 3 }, (_, i) => ({
        index: i,
        inputValues: { id: String(i) },
        labelValues: {},
        coercionErrors: [],
      })),
      index: 0,
      labels: {},
      inputPath: "/some/file.csv",
    });
  });
  afterEach(() => cleanup());

  it("renders the filename from inputPath", () => {
    render(<BottomBar />);
    expect(screen.getByText("file.csv")).toBeInTheDocument();
  });

  it("does NOT render the help button when onHelp is not provided", () => {
    render(<BottomBar />);
    expect(screen.queryByRole("button", { name: "Keyboard shortcuts" })).not.toBeInTheDocument();
  });

  it("renders the help button when onHelp is provided", () => {
    render(<BottomBar onHelp={() => {}} />);
    expect(screen.getByRole("button", { name: "Keyboard shortcuts" })).toBeInTheDocument();
  });

  it("calls onHelp when the help button is clicked", () => {
    const onHelp = vi.fn();
    render(<BottomBar onHelp={onHelp} />);
    fireEvent.click(screen.getByRole("button", { name: "Keyboard shortcuts" }));
    expect(onHelp).toHaveBeenCalledOnce();
  });
});
