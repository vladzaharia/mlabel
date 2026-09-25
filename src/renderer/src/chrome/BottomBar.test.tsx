import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { IpcApi } from "@core";
import { useStore } from "../store/store";
import { buildConfig } from "@test/fixtures/config";
import { ShortcutProvider } from "../shortcuts/ShortcutProvider";
import { BottomBar } from "./BottomBar";

const show = (props: { onHelp?: () => void } = {}) =>
  render(
    <ShortcutProvider>
      <BottomBar {...props} />
    </ShortcutProvider>,
  );

function mockApi(): void {
  const base: Partial<IpcApi> = {
    getTheme: async () => false,
    onThemeChange: () => () => {},
    onUpdateStatus: () => () => {},
    onSetMode: () => () => {},
    setMenuContext: async () => {},
    // Seeding a config puts the store into a state where the autosave
    // subscriber fires on every change.
    saveSession: async () => {},
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
    show();
    expect(screen.getByText("file.csv")).toBeInTheDocument();
  });

  it("does NOT render the help button when onHelp is not provided", () => {
    show();
    expect(screen.queryByRole("button", { name: "Keyboard shortcuts" })).not.toBeInTheDocument();
  });

  it("renders the help button when onHelp is provided", () => {
    show({ onHelp: () => {} });
    expect(screen.getByRole("button", { name: "Keyboard shortcuts" })).toBeInTheDocument();
  });

  it("calls onHelp when the help button is clicked", () => {
    const onHelp = vi.fn();
    show({ onHelp });
    fireEvent.click(screen.getByRole("button", { name: "Keyboard shortcuts" }));
    expect(onHelp).toHaveBeenCalledOnce();
  });
});

const jumpForward = (): HTMLElement =>
  screen.getByRole("button", { name: "Next unfinished record" });
const jumpBack = (): HTMLElement =>
  screen.getByRole("button", { name: "Previous unfinished record" });

describe("BottomBar: jumping to unfinished work", () => {
  /** One required field, so "complete" means it has an answer. */
  const config = buildConfig({ output: [{ name: "verdict" }] });

  /** `done[i]` decides whether record i counts as finished. */
  function seed(done: readonly boolean[], index: number): void {
    useStore.setState({
      phase: "labeling",
      config,
      configPath: "/a.jsonc",
      records: done.map((_, i) => ({
        index: i,
        inputValues: {},
        labelValues: { verdict: null },
        coercionErrors: [],
      })),
      labels: Object.fromEntries(done.map((d, i) => [i, { verdict: d ? "yes" : null }])),
      prefill: {},
      index,
      inputPath: "/some/file.csv",
    });
  }

  beforeEach(() => mockApi());
  afterEach(() => cleanup());

  it("offers a control in each direction", () => {
    seed([true, false, true], 0);
    show();
    expect(jumpForward()).toBeInTheDocument();
    expect(jumpBack()).toBeInTheDocument();
  });

  it("jumps past the finished records", () => {
    seed([false, true, true, false], 0);
    show();
    fireEvent.click(jumpForward());
    expect(useStore.getState().index).toBe(3);
  });

  it("jumps backwards too", () => {
    seed([false, true, true, false], 3);
    show();
    fireEvent.click(jumpBack());
    expect(useStore.getState().index).toBe(0);
  });

  // Previously this direction was a silent no-op, which reads as a broken key.
  it("goes quiet at the end of the file rather than pretending", () => {
    seed([true, true, false], 2);
    show();
    expect(jumpForward()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(jumpForward());
    expect(useStore.getState().index).toBe(2);
  });

  it("stays reachable by keyboard while disabled, so the state is announced", () => {
    seed([true, true, false], 2);
    show();
    // `aria-disabled` rather than `disabled`: a disabled button leaves the tab
    // order, taking the only clue about why with it.
    expect(jumpForward()).not.toHaveAttribute("disabled");
  });

  it("shows the chord that does the same thing", () => {
    seed([true, false, true], 0);
    show();
    expect(jumpForward().parentElement).toHaveTextContent("⇧→");
    expect(jumpBack()).toHaveAttribute("aria-keyshortcuts", "Shift+ArrowLeft");
  });

  it("shows a rebinding rather than the default", () => {
    seed([true, false, true], 0);
    useStore.setState({ shortcutOverrides: { "nav.nextIncomplete": ["mod+j"] } });
    show();
    expect(jumpForward().parentElement).toHaveTextContent("⌘J");
    useStore.setState({ shortcutOverrides: {} });
  });
});
