import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDefaultRegistry } from "@core/adapters";
import { coerceValue } from "@core/coercion";
import { loadConfig } from "@core/config";
import type { CoercedValue } from "@core/types/values";

/**
 * The committed demo fixture still loads.
 *
 * `examples/accounts.csv` is what the docs, the screenshots and a manual demo
 * all open, and it is the only account-shaped file in the repo — the real
 * extract it imitates is not ours to commit. A fixture that has quietly stopped
 * parsing is worse than no fixture: every demo of this feature starts by opening
 * it, so it breaks in front of an audience rather than in CI.
 *
 * It deliberately carries the shapes a real extract rarely produces — a row with
 * no email, one with no neighbours, one with no timeline, an account still
 * awaiting activation — because those are exactly the config's missing-data
 * rules, and nothing else in the repo exercises them.
 */

const CONFIG = "examples/accounts.config.jsonc";
const CSV = "examples/accounts.csv";

describe("examples/accounts.csv", () => {
  const result = loadConfig(readFileSync(CONFIG, "utf8"));
  if (!result.ok) throw new Error(`${CONFIG} does not load`);
  const config = result.config;

  const adapter = createDefaultRegistry().source(config.input.adapterId);
  const parsed = adapter!.parse(
    { kind: "content", name: "accounts.csv", text: readFileSync(CSV, "utf8") },
    config.input.fields.map((field) => field.name),
  );

  const valueOf = (name: string, index: number): CoercedValue | null => {
    const record = parsed.document.records[index];
    const field = config.input.fields.find((f) => f.name === name);
    if (!record || !field) return null;
    const out = coerceValue(field, record.fields[name]);
    return out.ok ? out.value : null;
  };

  it("parses with no issues against the config it ships beside", () => {
    expect(parsed.issues).toEqual([]);
    expect(parsed.document.records.length).toBe(65);
  });

  it("coerces every value of every row", () => {
    const errors: string[] = [];
    for (const record of parsed.document.records) {
      for (const field of config.input.fields) {
        const out = coerceValue(field, record.fields[field.name]);
        if (!out.ok) {
          for (const error of out.errors) {
            errors.push(`row ${String(record.index)} ${field.name}: ${error.message}`);
          }
        }
      }
    }
    expect(errors).toEqual([]);
  });

  it("gives the structured columns real structure, not strings", () => {
    // The two list columns and the event map are what the model is actually
    // asked about; if they arrived as strings the questions would be answered
    // against punctuation.
    const lists = parsed.document.records.map((_, i) => valueOf("prev_10_emails", i));
    expect(lists.filter((v) => Array.isArray(v) && v.length === 10).length).toBe(64);

    const sizes = parsed.document.records.map((_, i) => {
      const value = valueOf("events", i);
      return value !== null && typeof value === "object" && !Array.isArray(value)
        ? Object.keys(value).length
        : -1;
    });
    expect(sizes.filter((n) => n === -1).length).toBe(0);
    // Creation and activation at minimum; the human archetypes add logins.
    expect(Math.max(...sizes)).toBeGreaterThanOrEqual(3);
  });

  it("still covers the gaps a real extract does not produce", () => {
    const emails = parsed.document.records.map((r) => String(r.fields["email"] ?? ""));
    const statuses = new Set(parsed.document.records.map((r) => String(r.fields["user_status"])));
    const neighbourless = parsed.document.records.filter((r) => r.fields["prev_10_emails"] === "");
    const timeless = parsed.document.records.filter((r) => r.fields["events"] === "{}");

    expect(emails.filter((e) => e === "").length).toBe(1);
    expect(neighbourless.length).toBe(1);
    expect(timeless.length).toBe(1);
    expect(statuses).toContain("awaiting-activation");
    expect(statuses).toContain("awaiting-reactivation");
  });

  it("spans the identity shapes the rules and questions look for", () => {
    const emails = parsed.document.records.map((r) => String(r.fields["email"] ?? ""));
    const names = parsed.document.records.map((r) => String(r.fields["username"] ?? ""));

    // An ordinary mailbox and a minted one, so neither the rules nor the domain
    // questions see a file that is all one thing.
    expect(emails.some((e) => e.endsWith("@gmail.com"))).toBe(true);
    expect(emails.some((e) => /\.(faith|trade|loan|win|review|racing|bid|men|club)$/.test(e))).toBe(
      true,
    );
    expect(emails.some((e) => e.endsWith("@privaterelay.appleid.com"))).toBe(true);
    // A machine-shaped handle and a human one.
    expect(names.some((n) => /^pT\d{13}$/.test(n))).toBe(true);
    expect(names.some((n) => /[._-]/.test(n))).toBe(true);
  });

  it("is labelled, so a question can be scored against it", () => {
    // The key is the fixture's counterpart to the labels a real run produces:
    // without it the archetypes are only a demo, and the questions stay
    // unmeasured.
    const key = readFileSync("examples/accounts-key.csv", "utf8").trim().split("\n");
    expect(key[0]).toBe("guid,archetype,expected_label");
    expect(key.length - 1).toBe(parsed.document.records.length);

    const guids = new Set(parsed.document.records.map((r) => String(r.fields["guid"])));
    for (const line of key.slice(1)) expect(guids.has(line.split(",")[0]!)).toBe(true);
  });
});
