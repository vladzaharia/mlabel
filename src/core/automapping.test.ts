import { describe, expect, it } from "vitest";
import { hasInputSource, isAutoCopied } from "./automapping";
import type { OutputControl, OutputField } from "./config/schema";

/** Build a fully-defaulted OutputField (mirrors the Zod-parsed shape). */
function field(
  name: string,
  control: OutputControl,
  extra: Partial<OutputField> = {},
): OutputField {
  return {
    name,
    control,
    labelPosition: "left",
    textSize: "md",
    required: true,
    ...extra,
  };
}

const inputNames: ReadonlySet<string> = new Set(["id", "source_text"]);

describe("isAutoCopied", () => {
  it("treats a hidden control as auto-copied even without a matching input field", () => {
    const f = field("not_an_input", "hidden");
    expect(isAutoCopied(f, inputNames)).toBe(true);
  });

  it("treats a visible field whose name matches an input field as auto-copied", () => {
    const f = field("id", "text");
    expect(isAutoCopied(f, inputNames)).toBe(true);
  });

  it("is false for a visible field with no matching input field", () => {
    const f = field("verdict", "radio", { options: [{ value: "good" }] });
    expect(isAutoCopied(f, inputNames)).toBe(false);
  });

  it("is true for a hidden control that also matches an input field", () => {
    const f = field("source_text", "hidden");
    expect(isAutoCopied(f, inputNames)).toBe(true);
  });
});

describe("hasInputSource", () => {
  it("is true only when the name matches an input field", () => {
    expect(hasInputSource(field("id", "text"), inputNames)).toBe(true);
    expect(hasInputSource(field("id", "hidden"), inputNames)).toBe(true);
  });

  it("is false for a hidden control without a matching input field", () => {
    expect(hasInputSource(field("standalone", "hidden"), inputNames)).toBe(false);
  });

  it("is false for a user-facing field without a matching input field", () => {
    expect(hasInputSource(field("verdict", "text"), inputNames)).toBe(false);
  });
});
