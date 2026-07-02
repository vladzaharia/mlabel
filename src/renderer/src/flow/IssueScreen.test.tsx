import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ValidationIssue } from "@core";
import { useStore, type AppStore } from "../store/store";
import { ConfigIssueScreen, InputIssueScreen } from "./IssueScreen";

afterEach(() => cleanup());

function seedConfigIssues(partial: Partial<AppStore> = {}): void {
  useStore.setState({
    configIssues: [
      { path: "output.fields.0", message: "broken thing", line: 12 },
      { message: "another problem" },
    ],
    configPath: "/home/me/config.jsonc",
    busy: false,
    pickConfig: vi.fn(async () => {}),
    ...partial,
  });
}

describe("ConfigIssueScreen", () => {
  it("renders the issue path, message, and line plus the config path subtitle", () => {
    seedConfigIssues();
    render(<ConfigIssueScreen />);
    expect(screen.getByText("This config isn’t valid")).toBeInTheDocument();
    expect(screen.getByText("/home/me/config.jsonc")).toBeInTheDocument();
    expect(screen.getByText("output.fields.0:", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/broken thing/)).toBeInTheDocument();
    expect(screen.getByText(/\(line 12\)/)).toBeInTheDocument();
    expect(screen.getByText(/another problem/)).toBeInTheDocument();
  });

  it("the action button calls the pickConfig store action", async () => {
    const user = userEvent.setup();
    const pickConfig = vi.fn(async () => {});
    seedConfigIssues({ pickConfig });
    render(<ConfigIssueScreen />);
    await user.click(screen.getByRole("button", { name: /Choose a different config/ }));
    expect(pickConfig).toHaveBeenCalledTimes(1);
  });

  it("disables the action button while busy", () => {
    seedConfigIssues({ busy: true });
    render(<ConfigIssueScreen />);
    expect(screen.getByRole("button", { name: /Choose a different config/ })).toBeDisabled();
  });
});

describe("InputIssueScreen", () => {
  const issues: ValidationIssue[] = [
    { kind: "missing", severity: "error", message: "Missing column", field: "id" },
    { kind: "extra", severity: "warning", message: "Unexpected column", field: "junk" },
  ];

  function seed(partial: Partial<AppStore> = {}): void {
    useStore.setState({
      headerIssues: issues,
      error: "This file doesn’t match the config",
      busy: false,
      pickInput: vi.fn(async () => {}),
      ...partial,
    });
  }

  it("renders severity-colored entries with their field names", () => {
    seed();
    render(<InputIssueScreen />);
    expect(screen.getByText("This file doesn’t match the config")).toBeInTheDocument();
    expect(screen.getByText("error")).toHaveClass("text-danger-text");
    expect(screen.getByText("warning")).toHaveClass("text-warning-text");
    expect(screen.getByText(/id — Missing column/)).toBeInTheDocument();
    expect(screen.getByText(/junk — Unexpected column/)).toBeInTheDocument();
  });

  it("falls back to the generic title when no error message is set", () => {
    seed({ error: null });
    render(<InputIssueScreen />);
    expect(screen.getByText("This input file can’t be used")).toBeInTheDocument();
  });

  it("the action button calls the pickInput store action", async () => {
    const user = userEvent.setup();
    const pickInput = vi.fn(async () => {});
    seed({ pickInput });
    render(<InputIssueScreen />);
    await user.click(screen.getByRole("button", { name: /Choose a different file/ }));
    expect(pickInput).toHaveBeenCalledTimes(1);
  });

  it("disables the action button while busy", () => {
    seed({ busy: true });
    render(<InputIssueScreen />);
    expect(screen.getByRole("button", { name: /Choose a different file/ })).toBeDisabled();
  });
});
