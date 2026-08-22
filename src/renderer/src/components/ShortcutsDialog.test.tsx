import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { buildConfig } from "@test/fixtures/config";
import { useStore } from "../store/store";
import { ShortcutsDialog } from "./ShortcutsDialog";

describe("ShortcutsDialog", () => {
  afterEach(() => cleanup());

  it("renders role=dialog with shortcut rows when open", () => {
    render(<ShortcutsDialog open={true} onOpenChange={() => {}} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Previous \/ next record/)).toBeInTheDocument();
    expect(screen.getByText(/Pick the Nth choice/)).toBeInTheDocument();
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

describe("ShortcutsDialog: config-declared chords", () => {
  afterEach(() => cleanup());

  // An author who adds a chord shouldn't also have to remember to document it;
  // the one place a labeler looks stays truthful by reading the config.
  it("lists the shortcuts the loaded config declares", () => {
    const config = buildConfig({
      output: [
        {
          name: "sentiment",
          kind: "choice",
          displayName: "Sentiment",
          choices: [{ value: "negative", label: "Negative" }],
        },
      ],
    });
    const withChords = {
      ...config,
      output: {
        ...config.output,
        fields: config.output.fields.map((f) =>
          f.type === "enum"
            ? { ...f, shortcut: "mod+s", choices: [{ ...f.choices[0]!, shortcut: "n" }] }
            : f,
        ),
      },
    } as typeof config;

    useStore.setState({ config: withChords });
    render(<ShortcutsDialog open onOpenChange={() => {}} />);

    expect(screen.getByText("Focus Sentiment")).toBeInTheDocument();
    expect(screen.getByText("Sentiment: Negative")).toBeInTheDocument();
  });

  it("shows nothing extra when the config declares no chords", () => {
    useStore.setState({ config: buildConfig() });
    render(<ShortcutsDialog open onOpenChange={() => {}} />);
    expect(screen.queryByText(/^Focus /)).not.toBeInTheDocument();
  });
});
