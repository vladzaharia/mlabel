import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Analysis, EngineState } from "@core";
import { makeIpcApi } from "@test/fixtures/ipc";
import { useStore } from "../store/store";
import { AnomalyPanel } from "./AnomalyPanel";

const settings = (aiEnabled: boolean) => ({
  version: 1,
  themeMode: "system" as const,
  colorTheme: "cobalt" as const,
  shortcuts: {},
  updateChecks: true,
  aiEnabled,
  aiModelId: "qwen3.5-2b",
});

function seed(options: { enabled?: boolean; state?: EngineState; analysis?: Analysis }): void {
  useStore.setState({
    settings: settings(options.enabled ?? true),
    aiState: options.state ?? { kind: "ready", modelId: "qwen3.5-2b" },
    analyses: options.analysis ? { 0: options.analysis } : {},
    index: 0,
  });
}

const analysis = (over: Partial<Analysis>): Analysis => ({
  recordIndex: 0,
  status: "clean",
  findings: [],
  modelId: "qwen3.5-2b",
  ...over,
});

beforeEach(() => {
  Object.defineProperty(window, "api", { value: makeIpcApi(), configurable: true });
});
afterEach(() => cleanup());

describe("AnomalyPanel", () => {
  it("is absent entirely when the labeler has not turned it on", () => {
    seed({ enabled: false });
    const { container } = render(<AnomalyPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says nothing stood out for a clean record", () => {
    seed({ analysis: analysis({ status: "clean" }) });
    render(<AnomalyPanel />);
    expect(screen.getByText("Nothing stood out.")).toBeInTheDocument();
  });

  it("lists the findings", () => {
    seed({
      analysis: analysis({
        status: "findings",
        findings: [
          { field: "email", severity: "warning", reason: "Domain looks like a throwaway." },
          { severity: "info", reason: "Signup time is unusual." },
        ],
      }),
    });
    render(<AnomalyPanel />);
    expect(screen.getByText("Domain looks like a throwaway.")).toBeInTheDocument();
    expect(screen.getByText("Signup time is unusual.")).toBeInTheDocument();
  });

  // The panel is where an unscoped remark appears at all — it has nowhere to sit
  // in the form, and repeating it on every field would be worse than a panel.
  it("names the field a scoped finding is about", () => {
    seed({
      analysis: analysis({
        status: "findings",
        findings: [{ field: "email", severity: "warning", reason: "Throwaway." }],
      }),
    });
    render(<AnomalyPanel />);
    expect(screen.getByText("email:")).toBeInTheDocument();
  });

  it("shows progress rather than going blank while it works", () => {
    seed({ analysis: analysis({ status: "running" }) });
    render(<AnomalyPanel />);
    expect(screen.getByText("Reading this record…")).toBeInTheDocument();
  });

  it("points at Settings when there is no model yet", () => {
    seed({ state: { kind: "no-model" } });
    render(<AnomalyPanel />);
    expect(screen.getByText(/Settings/)).toBeInTheDocument();
  });

  it("reports a failure rather than pretending the record was clean", () => {
    seed({ analysis: analysis({ status: "failed", error: "Model output was malformed." }) });
    render(<AnomalyPanel />);
    expect(screen.getByText(/Could not read this record/)).toBeInTheDocument();
  });

  // The whole risk with this feature in a labeling tool is a plausible wrong
  // hint quietly becoming the answer. There is no one-click path from a
  // suggestion to a recorded label, and there should never be.
  it("offers no way to accept a suggestion as an answer", () => {
    seed({
      analysis: analysis({
        status: "findings",
        findings: [{ field: "email", severity: "warning", reason: "Throwaway." }],
      }),
    });
    render(<AnomalyPanel />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("announces politely, so a new record's notes are read out", () => {
    seed({ analysis: analysis({ status: "clean" }) });
    render(<AnomalyPanel />);
    const region = screen.getByText("Nothing stood out.").parentElement;
    expect(region).toHaveAttribute("aria-live", "polite");
  });
});

// The model unloads after idling, and findings from five minutes ago are still
// about this record. A panel that forgot them because the engine went quiet
// would look like it had lost its work.
describe("AnomalyPanel — findings outlive the engine", () => {
  it("keeps showing findings after the model unloads", () => {
    seed({
      state: { kind: "no-model" },
      analysis: analysis({
        status: "findings",
        findings: [{ field: "email", severity: "warning", reason: "Throwaway." }],
      }),
    });
    render(<AnomalyPanel />);
    expect(screen.getByText("Throwaway.")).toBeInTheDocument();
    expect(screen.queryByText(/No model downloaded yet/)).toBeNull();
  });

  it("keeps a clean verdict too", () => {
    seed({ state: { kind: "no-model" }, analysis: analysis({ status: "clean" }) });
    render(<AnomalyPanel />);
    expect(screen.getByText("Nothing stood out.")).toBeInTheDocument();
  });

  it("falls back to the engine's state only when there is nothing to show", () => {
    seed({ state: { kind: "downloading", modelId: "x", receivedBytes: 1, totalBytes: 2 } });
    render(<AnomalyPanel />);
    expect(screen.getByText("Downloading the model…")).toBeInTheDocument();
  });
});
