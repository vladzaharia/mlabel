import { describe, expect, it } from "vitest";
import { configObject } from "@test/fixtures/config";
import { formatIssues, validateConfigText } from "./validate-config";

/**
 * The CLI exists so an author — often an agent — can check a config without
 * launching the GUI. These tests pin the two things a caller depends on: the
 * exit status, and that every message carries a location it can act on.
 */

const VALID = JSON.stringify(configObject(), null, 2);

/** Build a config and break it in one specific way, as `schema.test.ts` does. */
function broken(mutate: (config: Record<string, any>) => void): string {
  const config = configObject() as Record<string, any>;
  mutate(config);
  return JSON.stringify(config, null, 2);
}

describe("validateConfigText", () => {
  it("accepts a valid config", () => {
    expect(validateConfigText(VALID)).toEqual([]);
  });

  it("reports a schema violation with a path", () => {
    const issues = validateConfigText(
      broken((c) => {
        c["output"].fields[0].fill = { kind: "copy", from: "nope" };
      }),
    );
    expect(issues).not.toEqual([]);
    expect(issues.some((i) => i.message.includes("nope"))).toBe(true);
    expect(issues.every((i) => i.path !== undefined || i.line !== undefined)).toBe(true);
  });

  it("reports JSONC syntax errors rather than throwing", () => {
    const issues = validateConfigText('{ "version": 2, }{');
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.message).toContain("syntax");
  });

  // Comments and trailing commas are the whole point of `.jsonc`; a validator
  // that rejected them would disagree with the app it is meant to check.
  it("accepts the comments and trailing commas the app accepts", () => {
    const withComments = `// leading comment\n${VALID.replace(/\}$/, ",\n}")}`;
    expect(validateConfigText(withComments)).toEqual([]);
  });
});

describe("formatIssues", () => {
  it("renders line and column when the loader located the node", () => {
    const line = formatIssues("cfg.jsonc", [
      { path: "output.fields.0.type", message: "Bad.", line: 12, column: 5 },
    ]);
    expect(line).toContain("cfg.jsonc:12:5");
    expect(line).toContain("output.fields.0.type");
    expect(line).toContain("Bad.");
  });

  // Cross-field checks can name a path with no corresponding source node, so a
  // missing location must degrade to a usable line rather than print ":undefined".
  it("falls back to the file name when there is no location", () => {
    const line = formatIssues("cfg.jsonc", [{ message: "Bad." }]);
    expect(line).toContain("cfg.jsonc");
    expect(line).not.toContain("undefined");
  });
});
