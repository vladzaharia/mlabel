import { describe, expect, it } from "vitest";
import { loadConfig } from "./loader";

const VALID_JSONC = `{
  // MLabel config with comments + trailing commas (JSONC).
  "input": {
    "adapterId": "csv",
    "fields": [
      { "name": "id", "type": { "type": "text" }, "title": true },
      { "name": "score", "type": { "type": "number", "format": "float" } },
      {
        "name": "tags",
        "type": { "type": "array", "items": { "type": "text" } },
      },
      {
        "name": "checks",
        "type": {
          "type": "map",
          "keyType": "text",
          "valueType": {
            "type": "object",
            "fields": [{ "name": "passed", "type": { "type": "bool" } }],
          },
        },
      },
    ],
  },
  "output": {
    "fields": [
      { "name": "id", "control": "hidden" },
      {
        "name": "verdict",
        "control": "radio",
        "options": [{ "value": "good" }, { "value": "bad" }],
      },
      { "name": "notes", "control": "textarea", "required": false },
    ],
  },
  "categories": [
    {
      "id": "main",
      "displayName": "Main",
      "rows": [{ "fields": ["id", "score"] }, { "columns": 2, "fields": ["tags", "checks"] }],
    },
  ],
}`;

describe("loadConfig", () => {
  it("loads a valid JSONC config with comments and trailing commas", () => {
    const result = loadConfig(VALID_JSONC);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.input.fields).toHaveLength(4);
      expect(result.config.input.fields[0]?.title).toBe(true);
      // Default label position applied.
      expect(result.config.input.fields[0]?.labelPosition).toBe("left");
    }
  });

  it("reports JSONC syntax errors with a line number", () => {
    const result = loadConfig('{ "input": { "fields": [  } }'); // malformed
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.line).toBeGreaterThanOrEqual(1);
      expect(result.issues[0]?.message).toMatch(/JSONC syntax error/);
    }
  });

  it("rejects a category that references an unknown input field", () => {
    const bad = VALID_JSONC.replace('"fields": ["id", "score"]', '"fields": ["nope"]');
    const result = loadConfig(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => /unknown input field "nope"/.test(i.message))).toBe(true);
    }
  });

  it("rejects a radio output field without options", () => {
    const bad = VALID_JSONC.replace('"options": [{ "value": "good" }, { "value": "bad" }],', "");
    const result = loadConfig(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => /requires non-empty options/.test(i.message))).toBe(true);
    }
  });

  it("rejects more than one title field", () => {
    const bad = VALID_JSONC.replace(
      '{ "name": "score", "type": { "type": "number", "format": "float" } }',
      '{ "name": "score", "type": { "type": "text" }, "title": true }',
    );
    const result = loadConfig(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some((i) => /one input field may be marked as the title/.test(i.message)),
      ).toBe(true);
    }
  });

  it("accepts an output layout and rejects unknown layout field references", () => {
    const withLayout = VALID_JSONC.replace(
      '"fields": [\n      { "name": "id", "control": "hidden" },',
      '"layout": [{ "columns": 2, "fields": ["verdict", "notes"] }],\n    "fields": [\n      { "name": "id", "control": "hidden" },',
    );
    expect(loadConfig(withLayout).ok).toBe(true);

    const badLayout = withLayout.replace('["verdict", "notes"]', '["verdict", "ghost"]');
    const result = loadConfig(badLayout);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => /unknown output field "ghost"/.test(i.message))).toBe(true);
    }
  });
});
