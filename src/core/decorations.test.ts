import { describe, expect, it } from "vitest";
import { evaluateDecorations, notesOf, toneOf } from "./decorations";
import type { DisplayRule } from "./config/schema";

// `evaluateCondition` is exercised in `conditions.test.ts`. This file is about
// what a rule *does* with a condition that held, not about the predicate itself.

describe("evaluateDecorations", () => {
  const rules: DisplayRule[] = [
    {
      name: "canned",
      when: { op: "matches", field: "response", pattern: "^Sorry" },
      appliesTo: ["response"],
      style: { tone: "muted", note: "Canned refusal." },
    },
    {
      name: "mismatch",
      when: { op: "ne", field: "expected", otherField: "actual" },
      appliesTo: ["expected", "actual"],
      style: { tone: "danger", note: "Expected ≠ actual." },
    },
    {
      name: "hot",
      when: { op: "gt", field: "score", value: 0.9 },
      style: { tone: "warning" },
    },
  ];

  it("is empty when no rule fires", () => {
    expect(
      evaluateDecorations(rules, { response: "Sure", expected: "a", actual: "a" }).fields.size,
    ).toBe(0);
  });

  it("paints every field a rule applies to, not just the one it tests", () => {
    const { fields } = evaluateDecorations(rules, { expected: "a", actual: "b" });
    expect(toneOf(fields.get("expected"))).toBe("danger");
    expect(toneOf(fields.get("actual"))).toBe("danger");
  });

  it("defaults the target to the field the condition tests", () => {
    const { fields } = evaluateDecorations(rules, { score: 0.95 });
    expect(toneOf(fields.get("score"))).toBe("warning");
  });

  it("collects every note for a field", () => {
    const { fields } = evaluateDecorations(rules, { response: "Sorry, no." });
    expect(notesOf(fields.get("response"))).toEqual(["Canned refusal."]);
  });

  it("lets the last tone win when rules overlap", () => {
    const overlapping: DisplayRule[] = [
      { name: "a", when: { op: "notEmpty", field: "x" }, style: { tone: "info" } },
      { name: "b", when: { op: "notEmpty", field: "x" }, style: { tone: "danger" } },
    ];
    expect(toneOf(evaluateDecorations(overlapping, { x: "v" }).fields.get("x"))).toBe("danger");
  });

  it("is a no-op when the config declares no rules", () => {
    expect(evaluateDecorations(undefined, { a: 1 }).fields.size).toBe(0);
    expect(evaluateDecorations([], { a: 1 }).fields.size).toBe(0);
  });

  it("does not mutate the values it reads", () => {
    const values = { expected: "a", actual: "b" };
    evaluateDecorations(rules, values);
    expect(values).toEqual({ expected: "a", actual: "b" });
  });
});

describe("evaluateDecorations — card scope", () => {
  const rules: DisplayRule[] = [
    {
      name: "surge",
      when: { op: "exceedsFactor", field: "now", otherField: "usual", factor: 3 },
      appliesToCards: ["velocity"],
      style: { tone: "warning", note: "Well above the usual rate." },
    },
  ];

  it("annotates the card rather than the field the condition tests", () => {
    const { fields, cards } = evaluateDecorations(rules, { now: 40, usual: 10 });
    expect(toneOf(cards.get("velocity"))).toBe("warning");
    expect(notesOf(cards.get("velocity"))).toEqual(["Well above the usual rate."]);
    // Stating it once on the card is the whole point — it must not also repeat
    // on every field inside it.
    expect(fields.size).toBe(0);
  });

  it("can annotate a card and a field from one rule", () => {
    const both: DisplayRule[] = [
      {
        name: "surge",
        when: { op: "exceedsFactor", field: "now", otherField: "usual", factor: 3 },
        appliesTo: ["now"],
        appliesToCards: ["velocity"],
        style: { tone: "warning" },
      },
    ];
    const { fields, cards } = evaluateDecorations(both, { now: 40, usual: 10 });
    expect(toneOf(cards.get("velocity"))).toBe("warning");
    expect(toneOf(fields.get("now"))).toBe("warning");
  });

  it("does not fall back to the tested field when only a card is targeted", () => {
    const { fields } = evaluateDecorations(rules, { now: 40, usual: 10 });
    expect(fields.get("now")).toBeUndefined();
  });
});

describe("evaluateDecorations — per-item scope", () => {
  const rules: DisplayRule[] = [
    {
      name: "same-domain",
      forEach: "recent",
      when: { op: "sameDomain", field: "email", otherField: "email" },
      style: { tone: "warning", note: "Same domain as this signup." },
    },
  ];

  const values = {
    email: "new@acme.com",
    recent: [{ email: "a@acme.com" }, { email: "b@other.com" }, { email: "c@acme.com" }],
  };

  it("decorates only the elements the condition held for", () => {
    const { items } = evaluateDecorations(rules, values);
    const rows = items.get("recent");
    expect(rows).toBeDefined();
    expect(toneOf(rows![0])).toBe("warning");
    expect(toneOf(rows![1])).toBeUndefined();
    expect(toneOf(rows![2])).toBe("warning");
  });

  it("stays index-aligned with the rendered rows", () => {
    const { items } = evaluateDecorations(rules, values);
    expect(items.get("recent")).toHaveLength(values.recent.length);
  });

  it("does not leak into the field or card scopes", () => {
    const { fields, cards } = evaluateDecorations(rules, values);
    expect(fields.size).toBe(0);
    expect(cards.size).toBe(0);
  });

  it("reads the element on the left and the record on the right", () => {
    // Both sides are spelled `email`. The left is the row's, the right is the
    // record's — otherwise every row would trivially match itself.
    const { items } = evaluateDecorations(rules, {
      email: "new@nowhere.com",
      recent: [{ email: "a@acme.com" }],
    });
    expect(toneOf(items.get("recent")![0])).toBeUndefined();
  });

  it("can still read a record column the item does not define", () => {
    const byUsername: DisplayRule[] = [
      {
        name: "sender-is-owner",
        forEach: "messages",
        when: { op: "sameLocalPart", field: "sender", otherField: "username" },
        style: { tone: "danger", note: "Sender matches the account username." },
      },
    ];
    const { items } = evaluateDecorations(byUsername, {
      username: "vlad",
      messages: [{ sender: "vlad@acme.com" }, { sender: "someone@acme.com" }],
    });
    expect(toneOf(items.get("messages")![0])).toBe("danger");
    expect(toneOf(items.get("messages")![1])).toBeUndefined();
  });

  it("collects the note on the matching element", () => {
    const { items } = evaluateDecorations(rules, values);
    expect(notesOf(items.get("recent")![0])).toEqual(["Same domain as this signup."]);
  });

  // A list of bare addresses is the common shape in an exported CSV — one cell
  // holding ten comma-joined emails. Requiring an array of objects would leave
  // the per-item rules unusable on exactly the data they were built for, so a
  // scalar element answers to the list's own name.
  describe("over a list of scalars", () => {
    const scalarRules: DisplayRule[] = [
      {
        name: "same-domain",
        forEach: "recent",
        when: { op: "sameDomain", field: "recent", otherField: "email" },
        style: { tone: "warning", note: "Same mail domain as this account." },
      },
    ];

    it("resolves the list's own name to the element under test", () => {
      const { items } = evaluateDecorations(scalarRules, {
        email: "new@acme.com",
        recent: ["a@acme.com", "b@other.com", "c@acme.com"],
      });
      const rows = items.get("recent")!;
      expect(toneOf(rows[0])).toBe("warning");
      expect(toneOf(rows[1])).toBeUndefined();
      expect(toneOf(rows[2])).toBe("warning");
    });

    it("still reads the record for the right-hand side", () => {
      const { items } = evaluateDecorations(scalarRules, {
        email: "new@nowhere.com",
        recent: ["a@acme.com"],
      });
      expect(toneOf(items.get("recent")![0])).toBeUndefined();
    });

    it("stays index-aligned when only some elements match", () => {
      const { items } = evaluateDecorations(scalarRules, {
        email: "new@acme.com",
        recent: ["x@other.com", "y@acme.com"],
      });
      expect(items.get("recent")).toHaveLength(2);
    });

    it("works for a regex over each element", () => {
      const generated: DisplayRule[] = [
        {
          name: "generated-handle",
          forEach: "handles",
          when: { op: "matches", field: "handles", pattern: "^[A-Za-z0-9]{16}$" },
          style: { tone: "warning", note: "Looks auto-generated." },
        },
      ];
      const { items } = evaluateDecorations(generated, {
        handles: ["aB3dE6gH9jK2mN5p", "real_person"],
      });
      expect(toneOf(items.get("handles")![0])).toBe("warning");
      expect(toneOf(items.get("handles")![1])).toBeUndefined();
    });

    // Without this, `sameDomain` on `email` vs `email` resolves both sides to
    // the record for every scalar element and paints the entire list.
    it("ignores a rule that tests a field the element cannot answer to", () => {
      const aboutTheRecord: DisplayRule[] = [
        {
          name: "wrong-subject",
          forEach: "recent",
          when: { op: "sameDomain", field: "email", otherField: "email" },
          style: { tone: "warning" },
        },
      ];
      const { items } = evaluateDecorations(aboutTheRecord, {
        email: "new@acme.com",
        recent: ["a@acme.com", "b@other.com"],
      });
      const rows = items.get("recent")!;
      expect(toneOf(rows[0])).toBeUndefined();
      expect(toneOf(rows[1])).toBeUndefined();
    });

    // A null hole in a list must not shift every later decoration up a row.
    it("leaves a hole for an element it cannot read", () => {
      const { items } = evaluateDecorations(scalarRules, {
        email: "new@acme.com",
        recent: [null, "c@acme.com"],
      });
      const rows = items.get("recent")!;
      expect(rows).toHaveLength(2);
      expect(toneOf(rows[0])).toBeUndefined();
      expect(toneOf(rows[1])).toBe("warning");
    });
  });

  it("stays quiet when the list is missing, empty or not a list", () => {
    for (const recent of [undefined, null, [], "not a list", 42]) {
      const { items } = evaluateDecorations(rules, { email: "new@acme.com", recent });
      expect(items.get("recent") ?? []).toHaveLength(Array.isArray(recent) ? recent.length : 0);
    }
  });

  it("handles a mixed list without shifting the others", () => {
    // `"nonsense"` is read as a scalar element and simply does not match; the
    // rule tests `email`, which a bare string does not answer to.
    const { items } = evaluateDecorations(rules, {
      email: "new@acme.com",
      recent: [null, "nonsense", { email: "c@acme.com" }],
    });
    const rows = items.get("recent")!;
    expect(rows).toHaveLength(3);
    expect(toneOf(rows[0])).toBeUndefined();
    expect(toneOf(rows[1])).toBeUndefined();
    expect(toneOf(rows[2])).toBe("warning");
  });

  it("does not mutate the record or its items", () => {
    const original = JSON.parse(JSON.stringify(values));
    evaluateDecorations(rules, values);
    expect(values).toEqual(original);
  });
});
