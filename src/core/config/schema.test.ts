import { describe, expect, it } from "vitest";
import { loadConfig } from "./loader";

const MINIMAL = `{
  "input": {
    "fields": [{ "name": "id", "type": { "type": "text" } }],
    "categories": [{ "id": "main", "displayName": "Main", "rows": [{ "fields": ["id"] }] }],
  },
  "output": { "fields": [{ "name": "id", "control": "hidden" }] },
}`;

function withNetwork(networkJson: string): string {
  return MINIMAL.replace('"output":', `"network": ${networkJson},\n  "output":`);
}

describe("AppConfig.network", () => {
  it("defaults updateChecks to true when network is absent", () => {
    const result = loadConfig(MINIMAL);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.network.updateChecks).toBe(true);
  });

  it("defaults updateChecks to true when network is an empty object", () => {
    const result = loadConfig(withNetwork("{}"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.network.updateChecks).toBe(true);
  });

  it("honors an explicit updateChecks: false (the network kill-switch)", () => {
    const result = loadConfig(withNetwork('{ "updateChecks": false }'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.network.updateChecks).toBe(false);
  });
});
