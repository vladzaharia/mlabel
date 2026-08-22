import { describe, expect, it } from "vitest";
import {
  copySource,
  fillKind,
  isDerived,
  isRequired,
  isSessionFilled,
  isUserFilled,
  seedLabelValues,
  widgetOf,
} from "./automapping";
import { buildConfig } from "@test/fixtures/config";
import type { OutputField } from "./config/schema";

const config = buildConfig({
  input: ["id", { name: "count", type: { type: "integer" } }],
  output: [
    { name: "id", kind: "copied" },
    { name: "verdict", kind: "choice", choices: ["good", "bad"] },
    { name: "note", kind: "text", required: false },
    { name: "rating", kind: "slider", min: 0, max: 10 },
  ],
});

const byName = new Map(config.output.fields.map((f) => [f.name, f]));
const field = (name: string): OutputField => {
  const f = byName.get(name);
  if (!f) throw new Error(`no such output field: ${name}`);
  return f;
};

describe("fillKind", () => {
  it("defaults to user when the config says nothing", () => {
    expect(fillKind(field("verdict"))).toBe("user");
  });

  it("reads an explicit fill", () => {
    expect(fillKind(field("id"))).toBe("copy");
  });
});

describe("copySource", () => {
  it("defaults to the field's own name", () => {
    expect(copySource(field("id"))).toBe("id");
  });

  it("is undefined for a field nobody copies into", () => {
    expect(copySource(field("verdict"))).toBeUndefined();
  });

  // Impossible under the old name-matching convention, which is the point.
  it("follows an explicit rename", () => {
    const renamed = buildConfig({
      input: ["id"],
      output: [{ name: "sample_id", kind: "text" }],
    });
    const withFill = {
      ...renamed.output.fields[0]!,
      fill: { kind: "copy" as const, from: "id" },
    } as OutputField;
    expect(copySource(withFill)).toBe("id");
  });
});

describe("who fills a field", () => {
  it("treats an unannotated field as user-filled", () => {
    expect(isUserFilled(field("verdict"))).toBe(true);
    expect(isDerived(field("verdict"))).toBe(false);
  });

  it("treats a copied field as derived, so it renders no widget", () => {
    expect(isUserFilled(field("id"))).toBe(false);
    expect(isDerived(field("id"))).toBe(true);
  });

  it("distinguishes session-scoped fields from per-record ones", () => {
    expect(isSessionFilled(field("verdict"))).toBe(false);
  });
});

describe("isRequired", () => {
  it("defaults to required for something a person is asked for", () => {
    expect(isRequired(field("verdict"))).toBe(true);
  });

  // This is the trap the old default created: a derived field inherited
  // `required: true`, so an unfilled one made every record incomplete and the
  // export wrote a header-only file while reporting success.
  it("defaults to optional for something the app derives", () => {
    expect(isRequired(field("id"))).toBe(false);
  });

  it("honours an explicit required", () => {
    expect(isRequired(field("note"))).toBe(false);
  });
});

describe("widgetOf", () => {
  it("falls back to the type's default widget", () => {
    expect(widgetOf(field("verdict"))).toBe("radio"); // fixture asks for radio
    expect(widgetOf(field("note"))).toBe("text");
  });

  it("honours an explicit widget", () => {
    expect(widgetOf(field("rating"))).toBe("slider");
  });

  it("is undefined for a type that renders nothing", () => {
    expect(widgetOf(field("id"))).toBeUndefined();
  });
});

describe("seedLabelValues", () => {
  it("copies input values into copy-filled fields and leaves the rest unfilled", () => {
    const seeded = seedLabelValues({ id: "row-1", count: 3 }, config.output.fields);
    expect(seeded["id"]).toBe("row-1");
    expect(seeded["verdict"]).toBeUndefined();
    expect(seeded["note"]).toBeUndefined();
  });

  it("seeds null when the source column is absent from the record", () => {
    const seeded = seedLabelValues({}, config.output.fields);
    expect(seeded["id"]).toBeNull();
  });

  it("names every output field so the exported column set is stable", () => {
    const seeded = seedLabelValues({ id: "x" }, config.output.fields);
    expect(Object.keys(seeded)).toEqual(["id", "verdict", "note", "rating"]);
  });
});
