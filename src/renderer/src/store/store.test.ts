import { beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "@core/config";
import type { AppConfig, RecordView } from "@core";
import type { LabelMap } from "@core";
import { resolveDark, selectCompletedCount, useStore, type AppStore } from "./store";

const config = loadAppConfig();

function loadAppConfig(): AppConfig {
  const result = loadConfig(`{
    "input": {
      "fields": [{ "name": "id", "type": { "type": "text" } }],
      "categories": [{ "id": "c", "displayName": "C", "rows": [{ "fields": ["id"] }] }]
    },
    "output": {
      "fields": [
        { "name": "id", "control": "hidden" },
        { "name": "verdict", "control": "radio", "options": [{ "value": "good" }, { "value": "bad" }] }
      ]
    }
  }`);
  if (!result.ok) throw new Error("invalid test config");
  return result.config;
}

const records: RecordView[] = [
  {
    index: 0,
    inputValues: { id: "1" },
    labelValues: { id: "1", verdict: null },
    coercionErrors: [],
  },
  {
    index: 1,
    inputValues: { id: "2" },
    labelValues: { id: "2", verdict: null },
    coercionErrors: [],
  },
];

function seed(partial: Partial<AppStore>): void {
  // Mirror the real load flow: labels are pre-seeded from each record's
  // (auto-copied) label values.
  const labels: Record<number, LabelMap> = {};
  for (const record of records) labels[record.index] = { ...record.labelValues };
  useStore.setState({ config, records, index: 0, labels, phase: "labeling", ...partial });
}

describe("store: theme resolution", () => {
  it("resolves dark from mode + system", () => {
    expect(resolveDark("system", true)).toBe(true);
    expect(resolveDark("system", false)).toBe(false);
    expect(resolveDark("dark", false)).toBe(true);
    expect(resolveDark("light", true)).toBe(false);
  });
});

describe("store: navigation", () => {
  beforeEach(() => seed({}));

  it("clamps next/prev within bounds", () => {
    const { next, prev } = useStore.getState();
    prev();
    expect(useStore.getState().index).toBe(0);
    next();
    expect(useStore.getState().index).toBe(1);
    next();
    expect(useStore.getState().index).toBe(1);
  });
});

describe("store: completion count", () => {
  beforeEach(() => seed({}));

  it("counts records whose required fields are valid", () => {
    expect(selectCompletedCount(useStore.getState())).toBe(0);
    useStore.getState().setLabel(0, "verdict", "good");
    expect(selectCompletedCount(useStore.getState())).toBe(1);
    useStore.getState().setLabel(1, "verdict", "bad");
    expect(selectCompletedCount(useStore.getState())).toBe(2);
  });
});
