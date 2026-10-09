import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { buildConfig } from "@test/fixtures/config";
import { useStore } from "../store/store";
import { ShortcutProvider } from "../shortcuts/ShortcutProvider";
import { ShortcutsDialog } from "./ShortcutsDialog";

/** The dialog reads its rows from the provider, exactly as the app composes it. */
const show = (open = true) =>
  render(
    <ShortcutProvider>
      <ShortcutsDialog open={open} onOpenChange={() => {}} />
    </ShortcutProvider>,
  );

describe("ShortcutsDialog", () => {
  afterEach(() => {
    cleanup();
    useStore.setState({ shortcutOverrides: {}, config: null, configPath: null });
  });

  it("renders role=dialog with shortcut rows when open", () => {
    show();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Previous record")).toBeInTheDocument();
    expect(screen.getByText("Next unfinished record")).toBeInTheDocument();
    expect(screen.getByText(/Number keys pick choices/)).toBeInTheDocument();
    expect(screen.getByText(/Save & export/)).toBeInTheDocument();
    expect(screen.getByText(/Switch to labeling/)).toBeInTheDocument();
    expect(screen.getByText(/Switch to preparing data/)).toBeInTheDocument();
    // The dialog's own title says this too, so scope to the row.
    const app = within(screen.getByRole("table", { name: "The app" }));
    expect(app.getByText("Keyboard shortcuts")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    show(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("groups the rows so a long list stays readable", () => {
    show();
    expect(screen.getByRole("table", { name: "Moving around" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "The app" })).toBeInTheDocument();
  });

  // The menu owns these, so the keyboard handler never matches them — say so
  // rather than implying the window is listening.
  it("marks the rows the native menu owns", () => {
    show();
    expect(screen.getAllByText("(menu)").length).toBeGreaterThan(0);
  });

  describe("platform-aware modifier rendering", () => {
    beforeEach(() => {
      Object.defineProperty(window, "platform", { value: "darwin", configurable: true });
    });

    it("shows ⌘ modifier on macOS", () => {
      show();
      expect(screen.getByText("⌘⏎")).toBeInTheDocument();
      expect(screen.getByText("⌘⇧L")).toBeInTheDocument();
      expect(screen.getByText("⌘⇧P")).toBeInTheDocument();
    });

    it("spells the named keys with their glyphs", () => {
      show();
      expect(screen.getByText("→")).toBeInTheDocument();
      expect(screen.getByText("⇧←")).toBeInTheDocument();
    });
  });

  describe("platform-aware modifier rendering (Windows)", () => {
    beforeEach(() => {
      Object.defineProperty(window, "platform", { value: "win32", configurable: true });
    });

    it("shows Ctrl+ modifier on Windows", () => {
      show();
      expect(screen.getByText("Ctrl+Enter")).toBeInTheDocument();
      expect(screen.getByText("Ctrl+Shift+L")).toBeInTheDocument();
      expect(screen.getByText("Ctrl+Shift+P")).toBeInTheDocument();
    });
  });
});

describe("ShortcutsDialog: config-declared chords", () => {
  afterEach(() => {
    cleanup();
    useStore.setState({ shortcutOverrides: {}, config: null, configPath: null });
  });

  const withChords = (() => {
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
    return {
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
  })();

  // An author who adds a chord shouldn't also have to remember to document it;
  // the one place a labeler looks stays truthful by reading the config.
  it("lists the shortcuts the loaded config declares, under the field's name", () => {
    useStore.setState({ config: withChords, configPath: "/a.jsonc" });
    show();
    expect(screen.getByRole("table", { name: "Sentiment" })).toBeInTheDocument();
    expect(screen.getByText("Focus this field")).toBeInTheDocument();
    expect(screen.getByText("Choose “Negative”")).toBeInTheDocument();
  });

  it("shows nothing extra when the config declares no chords", () => {
    useStore.setState({ config: buildConfig(), configPath: "/a.jsonc" });
    show();
    expect(screen.queryByText("Focus this field")).not.toBeInTheDocument();
  });

  // The whole reason the dialog reads resolved bindings rather than the config.
  it("shows a labeler their own rebinding, not the config's original", () => {
    useStore.setState({
      config: withChords,
      configPath: "/a.jsonc",
      shortcutOverrides: { "/a.jsonc::choice:sentiment/negative": ["k"] },
    });
    show();
    expect(screen.getByText("K")).toBeInTheDocument();
    expect(screen.queryByText("N")).not.toBeInTheDocument();
  });
});
