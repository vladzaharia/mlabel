import { describe, expect, it } from "vitest";
import { loadConfig } from "./loader";

const VALID_JSONC = `{
  // MLabel config with comments + trailing commas (JSONC).
  "version": 2,
  "ui": { "appTitle": { "field": "id" } },
  "input": {
    "adapterId": "csv",
    "fields": [
      { "name": "id", "type": "text" },
      { "name": "score", "type": "number", "min": 0, "max": 1 },
      {
        "name": "tags",
        "type": "array",
        "items": { "type": "text" },
      },
      {
        "name": "checks",
        "type": "map",
        "values": {
          "type": "object",
          "fields": [{ "name": "passed", "type": "boolean" }],
        },
      },
    ],
    "cards": [
      {
        "name": "main",
        "display": "Main",
        "rows": [{ "use": ["id", "score"] }, { "perRow": 2, "use": ["tags", "checks"] }],
      },
    ],
  },
  "output": {
    "fields": [
      { "name": "id", "type": "text", "fill": { "kind": "copy" } },
      {
        "name": "verdict",
        "type": "enum",
        "widget": "radio",
        "choices": [{ "name": "good" }, { "name": "bad" }],
      },
      { "name": "notes", "type": "text", "widget": "textarea", "required": false },
    ],
  },
}`;

/** The source line an issue points at — asserting on text beats hard-coded numbers. */
function lineAt(source: string, line: number | undefined): string {
  return line === undefined ? "" : (source.split("\n")[line - 1] ?? "");
}

function messages(text: string): string[] {
  const result = loadConfig(text);
  return result.ok ? [] : result.issues.map((i) => `${i.path ?? ""}: ${i.message}`);
}

describe("loadConfig", () => {
  it("loads a valid JSONC config with comments and trailing commas", () => {
    const result = loadConfig(VALID_JSONC);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.input.fields).toHaveLength(4);
      expect(result.config.input.fields[0]?.type).toBe("text");
      expect(result.config.ui?.appTitle).toEqual({ field: "id" });
    }
  });

  it("reports JSONC syntax errors with a line number", () => {
    const result = loadConfig('{ "input": { "fields": [  } }');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.line).toBeGreaterThanOrEqual(1);
      expect(result.issues[0]?.message).toMatch(/JSONC syntax error/);
    }
  });

  it("rejects a card that references an unknown input field", () => {
    const bad = VALID_JSONC.replace('"use": ["id", "score"]', '"use": ["nope"]');
    expect(messages(bad).join("\n")).toMatch(/unknown input field "nope"/);
  });

  it("rejects an appTitle bound to a field that does not exist", () => {
    const bad = VALID_JSONC.replace(
      '"appTitle": { "field": "id" }',
      '"appTitle": { "field": "x" }',
    );
    expect(messages(bad).join("\n")).toMatch(/Unknown input field "x"/);
  });

  it("accepts a literal appTitle as well as a field reference", () => {
    const literal = VALID_JSONC.replace('{ "field": "id" }', '"Batch 4 review"');
    const result = loadConfig(literal);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.ui?.appTitle).toBe("Batch 4 review");
  });

  it("accepts output cards and rejects unknown references in them", () => {
    const withCards = VALID_JSONC.replace(
      '{ "name": "notes", "type": "text", "widget": "textarea", "required": false },\n    ],\n  },',
      '{ "name": "notes", "type": "text", "widget": "textarea", "required": false },\n    ],\n    "cards": [{ "name": "out", "display": "Out", "rows": [{ "perRow": 2, "use": ["verdict", "notes"] }] }],\n  },',
    );
    expect(loadConfig(withCards).ok).toBe(true);

    const bad = withCards.replace('["verdict", "notes"]', '["verdict", "ghost"]');
    expect(messages(bad).join("\n")).toMatch(/unknown output field "ghost"/);
  });
});

describe("loadConfig version gate", () => {
  // A v1 config measured nine issues against the v2 schema, with the real cause
  // buried among eight consequences. One clear sentence beats nine accurate ones.
  it("gives an old config exactly one message about its version", () => {
    const v1 = `{
      "input": {
        "fields": [{ "name": "id", "type": { "type": "text" } }],
        "categories": [{ "id": "c", "displayName": "C", "rows": [{ "fields": ["id"] }] }]
      },
      "output": { "fields": [{ "name": "label", "control": "text" }] }
    }`;
    const result = loadConfig(v1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.message).toMatch(/no `version`/);
  });

  it("names the version it read when it is one it does not support", () => {
    const future = VALID_JSONC.replace('"version": 2', '"version": 99');
    const result = loadConfig(future);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.message).toMatch(/Unsupported config version 99/);
  });
});

describe("loadConfig display shorthand", () => {
  it("expands a bare string into a title", () => {
    const result = loadConfig(VALID_JSONC);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.input.cards?.[0]?.display).toEqual({ title: "Main" });
  });

  it("leaves the object form alone", () => {
    const long = VALID_JSONC.replace('"display": "Main"', '"display": { "title": "Main Card" }');
    const result = loadConfig(long);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.input.cards?.[0]?.display?.title).toBe("Main Card");
  });

  // adapterConfig is adapter-owned; the core must not reinterpret anything in it.
  it("does not rewrite a `display` key inside adapterConfig", () => {
    const withAdapter = VALID_JSONC.replace(
      '"adapterId": "csv",',
      '"adapterId": "csv",\n    "adapterConfig": { "display": "verbatim" },',
    );
    const result = loadConfig(withAdapter);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.input.adapterConfig).toEqual({ display: "verbatim" });
  });
});

describe("loadConfig locates semantic errors in the source", () => {
  it("reports a line and column for a schema error, not just for syntax errors", () => {
    const bad = VALID_JSONC.replace('"widget": "textarea"', '"widget": "slidr"');
    const result = loadConfig(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(lineAt(bad, result.issues[0]?.line)).toContain("slidr");
  });

  it("points at the unrecognized key itself rather than its parent object", () => {
    const bad = VALID_JSONC.replace(
      '"adapterId": "csv"',
      '"adapterId": "csv",\n    "adapterld": 1',
    );
    const result = loadConfig(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const issue = result.issues.find((i) => i.message.includes("adapterld"));
    expect(lineAt(bad, issue?.line)).toContain("adapterld");
  });

  it("locates an error inside an array element", () => {
    const bad = VALID_JSONC.replace('"name": "tags"', '"name": "tags!!"');
    const result = loadConfig(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(lineAt(bad, result.issues[0]?.line)).toContain("tags!!");
  });

  it("keeps a usable location when the exact path is absent from the source", () => {
    const bad = VALID_JSONC.replace('"use": ["id", "score"]', '"use": ["nope"]');
    const result = loadConfig(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const issue = result.issues.find((i) => /unknown input field "nope"/.test(i.message));
    expect(lineAt(bad, issue?.line)).toContain("nope");
  });
});
