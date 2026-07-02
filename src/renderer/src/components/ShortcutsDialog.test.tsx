import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ShortcutsDialog } from "./ShortcutsDialog";

describe("ShortcutsDialog", () => {
  afterEach(() => cleanup());

  it("renders role=dialog with shortcut rows when open", () => {
    render(<ShortcutsDialog open={true} onOpenChange={() => {}} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Previous \/ next record/)).toBeInTheDocument();
    expect(screen.getByText(/Pick Nth option/)).toBeInTheDocument();
    expect(screen.getByText(/Save & export/)).toBeInTheDocument();
    expect(screen.getByText(/Switch to Label mode/)).toBeInTheDocument();
    expect(screen.getByText(/Switch to Prepare mode/)).toBeInTheDocument();
    expect(screen.getByText(/Toggle this help/)).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<ShortcutsDialog open={false} onOpenChange={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  describe("platform-aware modifier rendering", () => {
    beforeEach(() => {
      Object.defineProperty(window, "platform", { value: "darwin", configurable: true });
    });

    it("shows ⌘ modifier on macOS", () => {
      render(<ShortcutsDialog open={true} onOpenChange={() => {}} />);
      expect(screen.getByText(/⌘Enter/)).toBeInTheDocument();
      expect(screen.getByText(/⌘⇧L/)).toBeInTheDocument();
      expect(screen.getByText(/⌘⇧P/)).toBeInTheDocument();
    });
  });

  describe("platform-aware modifier rendering (Windows)", () => {
    beforeEach(() => {
      Object.defineProperty(window, "platform", { value: "win32", configurable: true });
    });

    it("shows Ctrl+ modifier on Windows", () => {
      render(<ShortcutsDialog open={true} onOpenChange={() => {}} />);
      expect(screen.getByText(/Ctrl\+Enter/)).toBeInTheDocument();
      expect(screen.getByText(/Ctrl\+Shift\+L/)).toBeInTheDocument();
      expect(screen.getByText(/Ctrl\+Shift\+P/)).toBeInTheDocument();
    });
  });
});
