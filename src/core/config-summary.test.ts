import { describe, expect, it } from "vitest";
import { buildConfig } from "@test/fixtures/config";
import { summarizeConfig, type ConfigSummaryItem } from "./config-summary";

const find = (items: ConfigSummaryItem[], label: RegExp): ConfigSummaryItem | undefined =>
  items.find((item) => label.test(item.label));

describe("summarizeConfig", () => {
  it("counts what the config reads and writes", () => {
    const items = summarizeConfig(
      buildConfig({
        input: ["id", "prompt"],
        output: [{ name: "verdict" }, { name: "id", kind: "copied" }],
      }),
    );
    expect(find(items, /input field/)?.count).toBe(2);
    expect(find(items, /output field/)?.count).toBe(2);
  });

  // The qualifier is what stops this being a wall of numbers: "2 output fields"
  // is a tally; "1 you answer · 1 copied in" is a shape.
  it("says what kind of work the output fields are", () => {
    const items = summarizeConfig(
      buildConfig({
        input: ["id"],
        output: [
          { name: "verdict" },
          { name: "id", kind: "copied" },
          { name: "annotator", kind: "session" },
          { name: "at", kind: "timestamp" },
        ],
      }),
    );
    const detail = find(items, /output field/)?.detail ?? "";
    expect(detail).toContain("1 you answer");
    expect(detail).toContain("1 asked once");
    expect(detail).toContain("1 copied in");
    expect(detail).toContain("1 stamped by the app");
  });

  it("breaks the input fields down by type", () => {
    const items = summarizeConfig(
      buildConfig({
        input: ["a", "b", { name: "n", type: { type: "number" } }],
      }),
    );
    expect(find(items, /input field/)?.detail).toContain("2 text");
  });

  it("says so plainly when the layout is the default", () => {
    const items = summarizeConfig(buildConfig({ input: ["id"] }));
    expect(find(items, /Default input layout/)).toBeDefined();
    expect(find(items, /input card/)).toBeUndefined();
  });

  it("names the cards when there are some", () => {
    const items = summarizeConfig(
      buildConfig({
        input: ["id", "note"],
        inputCards: [
          { id: "detail", displayName: "The detail", rows: [{ fields: ["id", "note"] }] },
        ],
      }),
    );
    expect(find(items, /input card/)?.detail).toContain("The detail");
  });

  it("omits rows for things the config does not declare", () => {
    const items = summarizeConfig(buildConfig({ input: ["id"] }));
    expect(find(items, /display rule/)).toBeUndefined();
    expect(find(items, /keyboard shortcut/)).toBeUndefined();
  });

  it("counts the shortcuts across fields and choices", () => {
    const config = buildConfig({
      output: [
        {
          name: "verdict",
          kind: "choice",
          choices: [
            { value: "good", shortcut: "g" },
            { value: "bad", shortcut: "b" },
          ],
        },
      ],
    });
    expect(find(summarizeConfig(config), /keyboard shortcut/)?.count).toBe(2);
  });

  it("reports the window title when one is bound to a column", () => {
    const items = summarizeConfig(buildConfig({ input: [{ name: "id", title: true }] }));
    expect(find(items, /Window title/)?.detail).toContain("id");
  });

  it("states the network posture either way", () => {
    expect(find(summarizeConfig(buildConfig()), /Update checks allowed/)).toBeDefined();
  });

  it("groups every row into format, reads, writes or also", () => {
    for (const item of summarizeConfig(buildConfig())) {
      expect(["format", "reads", "writes", "also"]).toContain(item.group);
    }
  });

  // Which formats go in and out decides whether a file loads at all, so it
  // leads rather than sitting at the bottom among the odds and ends.
  it("reports the data format as its own group", () => {
    const format = summarizeConfig(buildConfig()).filter((i) => i.group === "format");
    expect(format).toHaveLength(1);
    expect(format[0]?.label).toMatch(/CSV in, CSV out/);
  });

  it("never says '1 fields'", () => {
    const items = summarizeConfig(buildConfig({ input: ["id"], output: [{ name: "verdict" }] }));
    for (const item of items) expect(item.label).not.toMatch(/^1 \w+s$/);
  });
});
