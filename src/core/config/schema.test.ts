import { describe, expect, it } from "vitest";
import { loadConfig } from "./loader";
import { configObject, type ConfigSpec } from "@test/fixtures/config";

/**
 * Build a config and then break it in one specific way.
 *
 * Mutating the object graph rather than string-replacing the JSON keeps these
 * tests readable and stops them breaking when the fixture's formatting changes.
 */
type Mutable = Record<string, any>;

function tweak(spec: ConfigSpec, mutate: (config: Mutable) => void): string {
  const config = configObject(spec) as Mutable;
  mutate(config);
  return JSON.stringify(config, null, 2);
}

const outputFields = (config: Mutable): Mutable[] => config["output"].fields as Mutable[];
const inputFields = (config: Mutable): Mutable[] => config["input"].fields as Mutable[];

/** Every issue message, so assertions read on intent rather than order. */
function all(text: string): string {
  const result = loadConfig(text);
  return result.ok ? "" : result.issues.map((i) => `${i.path ?? ""}: ${i.message}`).join("\n");
}

const MINIMAL = JSON.stringify(configObject(), null, 2);

describe("AppConfig.network", () => {
  it("defaults updateChecks to true when network is absent", () => {
    const result = loadConfig(MINIMAL);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.network.updateChecks).toBe(true);
  });

  it("defaults updateChecks to true when network is an empty object", () => {
    const result = loadConfig(tweak({}, (c) => (c["network"] = {})));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.network.updateChecks).toBe(true);
  });

  it("honors an explicit updateChecks: false (the network kill-switch)", () => {
    const result = loadConfig(loadableWithNetwork(false));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.network.updateChecks).toBe(false);
  });
});

const loadableWithNetwork = (updateChecks: boolean): string =>
  tweak({}, (c) => (c["network"] = { updateChecks }));

describe("AppConfig rejects unknown keys", () => {
  // A silently-dropped `updateCheck` leaves the permissive default in place, so
  // someone who believes they opted out of all network is still checking GitHub.
  it("rejects a misspelled updateChecks instead of silently defaulting it to true", () => {
    expect(all(tweak({}, (c) => (c["network"] = { updateCheck: false })))).toContain("updateCheck");
  });

  it("rejects an unknown top-level key", () => {
    expect(all(tweak({}, (c) => (c["totallyUnknown"] = 42)))).toContain("totallyUnknown");
  });

  it("rejects an unknown key on a field", () => {
    expect(all(tweak({}, (c) => (inputFields(c)[0]!["titel"] = "x")))).toContain("titel");
  });

  it("still accepts arbitrary keys inside adapterConfig, which is adapter-owned", () => {
    const text = tweak({}, (c) => {
      c["input"].adapterConfig = { delimiter: "\t", anythingAtAll: 1 };
    });
    const result = loadConfig(text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.input.adapterConfig).toEqual({ delimiter: "\t", anythingAtAll: 1 });
    }
  });
});

describe("AppConfig reports every issue in one pass", () => {
  // A custom issue pushed without `continue: true` aborts validation in Zod 4,
  // so a single bad field used to hide every duplicate-name and dangling-
  // reference diagnostic behind it.
  it("reports a cross-field issue even when a per-field check already failed", () => {
    const text = tweak(
      { output: [{ name: "dup" }, { name: "dup" }] },
      (c) => (outputFields(c)[0]!["pattern"] = "("),
    );
    const found = all(text);
    expect(found).toMatch(/Invalid regular expression/);
    expect(found).toMatch(/Duplicate output field/);
  });
});

describe("a field is its type", () => {
  // Widget legality is structural: each variant only offers the widgets that
  // make sense for it, so the schema catches this — and so does the editor,
  // while you type, which a hand-written check could never do.
  it("rejects a widget the field's type cannot render", () => {
    const text = tweak({ output: [{ name: "note" }] }, (c) => {
      outputFields(c)[0]!["widget"] = "slider";
    });
    expect(all(text)).toMatch(/widget/i);
  });

  it("rejects constraints that belong to a different type", () => {
    const text = tweak({ output: [{ name: "note" }] }, (c) => (outputFields(c)[0]!["min"] = 3));
    expect(all(text)).toContain("min");
  });

  // Structural now: an enum without choices simply isn't a valid enum, so this
  // finally appears in the published JSON Schema too.
  it("rejects an enum with no choices", () => {
    const text = tweak(
      { output: [{ name: "v", kind: "choice", choices: ["a"] }] },
      (c) => (outputFields(c)[0]!["choices"] = []),
    );
    expect(all(text)).toMatch(/choices/);
  });

  it("rejects a composite type as something a user fills in", () => {
    const text = tweak({ output: [{ name: "blob" }] }, (c) => {
      Object.assign(outputFields(c)[0]!, { type: "map", values: { type: "text" } });
    });
    expect(all(text)).toMatch(/cannot be filled by a user/);
  });
});

describe("fill", () => {
  it("rejects a copy from an input field that does not exist", () => {
    const text = tweak({ input: ["id"], output: [{ name: "id", kind: "copied" }] }, (c) => {
      outputFields(c)[0]!["fill"] = { kind: "copy", from: "ghost" };
    });
    expect(all(text)).toMatch(/unknown input field "ghost"/);
  });

  // Prepare re-reads *-output.csv using the declared type, so a mismatch would
  // silently mistype the column on the way back in.
  it("rejects a copy whose declared type differs from its source", () => {
    const text = tweak(
      {
        input: [{ name: "count", type: { type: "integer" } }],
        output: [{ name: "count", kind: "copied" }],
      },
      (c) => (outputFields(c)[0]!["type"] = "text"),
    );
    expect(all(text)).toMatch(/does not match input field/);
  });

  it("rejects a shortcut on a field that renders no widget", () => {
    const text = tweak({ input: ["id"], output: [{ name: "id", kind: "copied" }] }, (c) => {
      outputFields(c)[0]!["shortcut"] = "mod+i";
    });
    expect(all(text)).toMatch(/nothing to focus/);
  });

  it("accepts a rename, which the old name-matching convention made impossible", () => {
    const text = tweak({ input: ["id"], output: [{ name: "sample_id" }] }, (c) => {
      outputFields(c)[0]!["fill"] = { kind: "copy", from: "id" };
    });
    expect(loadConfig(text).ok).toBe(true);
  });
});

describe("shortcuts", () => {
  const twoFields = (a: string, b: string): string =>
    tweak({ output: [{ name: "first" }, { name: "second" }] }, (c) => {
      outputFields(c)[0]!["shortcut"] = a;
      outputFields(c)[1]!["shortcut"] = b;
    });

  it("accepts distinct field shortcuts", () => {
    expect(loadConfig(twoFields("mod+j", "mod+k")).ok).toBe(true);
  });

  it("rejects two fields claiming the same shortcut", () => {
    expect(all(twoFields("mod+j", "mod+j"))).toMatch(/already used by "first"/);
  });

  it("rejects a chord it cannot parse", () => {
    expect(all(twoFields("mod+", "mod+b"))).toMatch(/mod\+s/);
  });

  // `matchConfigChords` runs before the typing guard and calls preventDefault,
  // so a config claiming mod+v silently breaks Paste inside the notes textarea.
  it("rejects a field shortcut that shadows a reserved chord", () => {
    expect(all(twoFields("mod+v", "mod+k"))).toMatch(/reserved/i);
  });

  it("rejects a choice shortcut that shadows a reserved chord", () => {
    const text = tweak({ output: [{ name: "a", kind: "choice", choices: ["yes"] }] }, (c) => {
      outputFields(c)[0]!["choices"][0].shortcut = "mod+c";
    });
    expect(all(text)).toMatch(/reserved/i);
  });

  /** Turn a single-choice field into the multi-select spelling of the same thing. */
  const asMultiSelect = (choices: Record<string, unknown>[]) =>
    tweak({ output: [{ name: "a", kind: "choice", choices: ["yes"] }] }, (c) => {
      const field = outputFields(c)[0]!;
      field["type"] = "array";
      field["widget"] = "checkboxes";
      field["items"] = { type: "enum", choices };
      delete field["choices"];
    });

  // A multi-select option is still an option: the chord toggles it.
  it("accepts a choice shortcut on a multi-select", () => {
    expect(loadConfig(asMultiSelect([{ name: "yes", shortcut: "y" }])).ok).toBe(true);
  });

  it("holds multi-select choice shortcuts to the same one-owner rule", () => {
    const text = asMultiSelect([
      { name: "yes", shortcut: "y" },
      { name: "nope", shortcut: "y" },
    ]);
    expect(all(text)).toMatch(/already used by choice "yes"/);
  });

  it("still allows a bare letter that merely appears inside a reserved chord", () => {
    const text = tweak({ output: [{ name: "a", kind: "choice", choices: ["yes"] }] }, (c) => {
      outputFields(c)[0]!["choices"][0].shortcut = "v";
    });
    expect(loadConfig(text).ok).toBe(true);
  });

  // Choice chords fire app-wide, so a chord may name exactly one option. Two
  // enums claiming "y" would leave the keystroke with no unambiguous meaning.
  it("rejects two enums reusing the same choice shortcut", () => {
    const text = tweak(
      {
        output: [
          { name: "a", kind: "choice", choices: ["yes"] },
          { name: "b", kind: "choice", choices: ["yes"] },
        ],
      },
      (c) => {
        outputFields(c)[0]!["choices"][0].shortcut = "y";
        outputFields(c)[1]!["choices"][0].shortcut = "y";
      },
    );
    expect(all(text)).toMatch(/already used by choice "yes" on "a"/);
  });

  it("rejects a choice shortcut colliding with a field shortcut", () => {
    const text = tweak({ output: [{ name: "a", kind: "choice", choices: ["yes"] }] }, (c) => {
      outputFields(c)[0]!["shortcut"] = "mod+y";
      outputFields(c)[0]!["choices"][0].shortcut = "mod+y";
    });
    expect(all(text)).toMatch(/already used by "a"/);
  });

  it("rejects two choices on the same field claiming one shortcut", () => {
    const text = tweak({ output: [{ name: "a", kind: "choice", choices: ["yes", "no"] }] }, (c) => {
      outputFields(c)[0]!["choices"][0].shortcut = "y";
      outputFields(c)[0]!["choices"][1].shortcut = "y";
    });
    expect(all(text)).toMatch(/already used by choice "yes"/);
  });
});

describe("composite table columns", () => {
  const withColumns = (use: string[]): string =>
    tweak(
      {
        input: [
          {
            name: "checks",
            type: {
              type: "array",
              items: {
                type: "object",
                fields: [
                  { name: "toxic", type: "boolean" },
                  { name: "pii", type: "boolean" },
                ],
              },
            },
          },
        ],
      },
      (c) => {
        inputFields(c)[0]!["items"].table = { columns: [{ name: "flags", use }] };
      },
    );

  it("accepts columns that name the object's own fields", () => {
    expect(loadConfig(withColumns(["toxic", "pii"])).ok).toBe(true);
  });

  // Columns address the object's fields, not the top-level ones — which is why
  // `table` lives on the object type rather than on the field.
  it("rejects a column naming a field the object does not have", () => {
    expect(all(withColumns(["toxic", "ghost"]))).toMatch(/unknown object field "ghost"/);
  });
});
