import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Analysis, AppConfig, EngineState } from "@core";
import { buildConfig } from "@test/fixtures/config";
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
  aiModelId: "jevk5-4b",
});

/**
 * A config carrying the questions these tests ask about.
 *
 * The panel matches an answer back to its question by id, so a seeded analysis
 * needs the config that declared the question — which is also what the
 * "question has vanished" case below exercises.
 */
const configWithQuestions = (): AppConfig => {
  const config = buildConfig({ input: ["email"] });
  return {
    ...config,
    ai: {
      ...config.ai,
      questions: [
        { id: "throwaway", type: "boolean", field: "email", ask: "Is the domain a throwaway?" },
        { id: "timing", type: "boolean", ask: "Is the signup time unusual?" },
      ],
    },
  } as AppConfig;
};

function seed(options: {
  enabled?: boolean;
  state?: EngineState;
  analysis?: Analysis;
  config?: AppConfig | null;
}): void {
  useStore.setState({
    settings: settings(options.enabled ?? true),
    aiState: options.state ?? { kind: "ready", modelId: "jevk5-4b" },
    analyses: options.analysis ? { 0: options.analysis } : {},
    config: options.config === undefined ? configWithQuestions() : options.config,
    index: 0,
  });
}

const analysis = (over: Partial<Analysis>): Analysis => ({
  recordIndex: 0,
  status: "clean",
  answers: [],
  modelId: "jevk5-4b",
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

  it("lists each crossed answer with its question and its probability", () => {
    seed({
      analysis: analysis({
        status: "findings",
        answers: [
          { id: "throwaway", type: "boolean", p: 0.91, confidence: 0.91 },
          { id: "timing", type: "boolean", p: 0.84, confidence: 0.84 },
        ],
      }),
    });
    render(<AnomalyPanel />);
    expect(screen.getByText("Is the domain a throwaway?")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByText("Is the signup time unusual?")).toBeInTheDocument();
    expect(screen.getByText("84%")).toBeInTheDocument();
  });

  it("says nothing about an answer that fell below its threshold", () => {
    // A confident "no" is not a finding. Showing it would put a note on every
    // clean record, which is the one thing this panel must not do.
    seed({
      analysis: analysis({
        status: "findings",
        answers: [{ id: "throwaway", type: "boolean", p: 0.03, confidence: 0.97 }],
      }),
    });
    render(<AnomalyPanel />);
    expect(screen.queryByText("3%")).toBeNull();
    expect(screen.getByText("Nothing stood out.")).toBeInTheDocument();
  });

  it("drops an answer whose question is gone, rather than showing a bare number", () => {
    seed({
      config: null,
      analysis: analysis({
        status: "findings",
        answers: [{ id: "throwaway", type: "boolean", p: 0.99, confidence: 0.99 }],
      }),
    });
    render(<AnomalyPanel />);
    expect(screen.queryByText("99%")).toBeNull();
  });

  // The panel is where an unscoped remark appears at all — it has nowhere to sit
  // in the form, and repeating it on every field would be worse than a panel.
  it("names the field a targeted answer is about", () => {
    seed({
      analysis: analysis({
        status: "findings",
        answers: [{ id: "throwaway", type: "boolean", p: 0.9, confidence: 0.9 }],
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
    seed({ analysis: analysis({ status: "failed", error: "The model took too long." }) });
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
        answers: [{ id: "throwaway", type: "boolean", p: 0.9, confidence: 0.9 }],
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

// The model unloads after idling, and answers from five minutes ago are still
// about this record. A panel that forgot them because the engine went quiet
// would look like it had lost its work.
describe("AnomalyPanel — answers outlive the engine", () => {
  it("keeps showing answers after the model unloads", () => {
    seed({
      state: { kind: "no-model" },
      analysis: analysis({
        status: "findings",
        answers: [{ id: "throwaway", type: "boolean", p: 0.9, confidence: 0.9 }],
      }),
    });
    render(<AnomalyPanel />);
    expect(screen.getByText("Is the domain a throwaway?")).toBeInTheDocument();
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
