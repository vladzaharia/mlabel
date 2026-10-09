import { describe, expect, it } from "vitest";
import { test, fc } from "@fast-check/vitest";
import { hasTimeOfDay, parseDateish, splitList } from "./tolerant";

const pad = (n: number): string => String(n).padStart(2, "0");

/** A calendar date that exists in every month, so no shape needs a validity guard. */
const ymd = fc.record({
  y: fc.integer({ min: 1900, max: 2099 }),
  m: fc.integer({ min: 1, max: 12 }),
  d: fc.integer({ min: 1, max: 28 }),
});

describe("splitList", () => {
  it("splits a bare comma-separated list", () => {
    expect(splitList("a, b, c")).toEqual(["a", "b", "c"]);
  });

  it("strips one matched layer of brackets", () => {
    expect(splitList("[a, b]")).toEqual(["a", "b"]);
    expect(splitList("(a|b)")).toEqual(["a", "b"]);
    expect(splitList("{a;b}")).toEqual(["a", "b"]);
  });

  it("leaves an unmatched bracket alone", () => {
    expect(splitList("[a, b")).toEqual(["[a", "b"]);
  });

  it("strips matched quotes from each item", () => {
    expect(splitList(`'a', "b"`)).toEqual(["a", "b"]);
    expect(splitList(`["red", "green"]`)).toEqual(["red", "green"]);
  });

  it("splits on semicolons, pipes and newlines", () => {
    expect(splitList("a;b")).toEqual(["a", "b"]);
    expect(splitList("a|b")).toEqual(["a", "b"]);
    expect(splitList("a\nb")).toEqual(["a", "b"]);
  });

  it("drops empty pieces", () => {
    expect(splitList("a,,b")).toEqual(["a", "b"]);
    expect(splitList(",,,")).toEqual([]);
    expect(splitList("")).toEqual([]);
  });

  it("returns a single item when there is no separator", () => {
    expect(splitList("solo")).toEqual(["solo"]);
  });

  test.prop([
    fc.array(
      fc
        .string({ minLength: 1, maxLength: 12 })
        .filter((s) => s === s.trim() && s.length > 0 && !/[,;|\r\n[\](){}'"]/.test(s)),
      { minLength: 1, maxLength: 8 },
    ),
  ])("round-trips any separator-free token list", (tokens) => {
    expect(splitList(tokens.join(", "))).toEqual(tokens);
  });
});

/** Readable assertion helper: the instant a date landed on, as an ISO string. */
const iso = (raw: string): string | undefined => parseDateish(raw)?.toISOString();

describe("parseDateish — date-only shapes land on UTC midnight", () => {
  it("parses ISO dates", () => {
    expect(iso("2026-05-01")).toBe("2026-05-01T00:00:00.000Z");
  });

  it("parses slash-separated year-first dates", () => {
    expect(iso("2026/05/01")).toBe("2026-05-01T00:00:00.000Z");
  });

  it("reads an ambiguous all-numeric date as month-first", () => {
    expect(iso("01/05/2026")).toBe("2026-01-05T00:00:00.000Z");
  });

  it("reads a day-first date when the first component cannot be a month", () => {
    expect(iso("25/12/2026")).toBe("2026-12-25T00:00:00.000Z");
  });

  it("parses a compact YYYYMMDD date", () => {
    expect(iso("20260501")).toBe("2026-05-01T00:00:00.000Z");
  });

  it("parses a bare year as its first day", () => {
    expect(iso("2026")).toBe("2026-01-01T00:00:00.000Z");
  });

  it("parses a spelled-out date", () => {
    expect(iso("May 1, 2026")).toBe("2026-05-01T00:00:00.000Z");
  });

  it("rejects an out-of-range date", () => {
    expect(parseDateish("2026-13-45")).toBeUndefined();
  });
});

describe("parseDateish — timestamps", () => {
  it("reads a zone-less timestamp as UTC, not as the labeler's local time", () => {
    expect(iso("2026-05-01T14:30:00")).toBe("2026-05-01T14:30:00.000Z");
    expect(iso("2026-05-01 14:30:00")).toBe("2026-05-01T14:30:00.000Z");
  });

  it("fills in omitted seconds", () => {
    expect(iso("2026-05-01 14:30")).toBe("2026-05-01T14:30:00.000Z");
  });

  it("accepts a time on a non-ISO date", () => {
    expect(iso("01/05/2026 14:30")).toBe("2026-01-05T14:30:00.000Z");
  });

  it("honours an explicit zone", () => {
    expect(iso("2026-05-01T14:30:00Z")).toBe("2026-05-01T14:30:00.000Z");
    expect(iso("2026-05-01T14:30:00+02:00")).toBe("2026-05-01T12:30:00.000Z");
  });

  it("keeps fractional seconds", () => {
    expect(iso("2026-05-01T14:30:00.250Z")).toBe("2026-05-01T14:30:00.250Z");
  });
});

describe("parseDateish — epoch", () => {
  it("reads ten digits as seconds", () => {
    expect(iso("1767225600")).toBe("2026-01-01T00:00:00.000Z");
  });

  it("reads thirteen digits as milliseconds", () => {
    expect(iso("1767225600000")).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("parseDateish — rejections", () => {
  it("returns undefined for unreadable input", () => {
    expect(parseDateish("not-a-date")).toBeUndefined();
    expect(parseDateish("")).toBeUndefined();
    expect(parseDateish("   ")).toBeUndefined();
  });
});

describe("hasTimeOfDay", () => {
  it("is false for every date-only shape", () => {
    for (const raw of ["2026-05-01", "2026/05/01", "01/05/2026", "20260501", "May 1, 2026"]) {
      expect(hasTimeOfDay(parseDateish(raw)!)).toBe(false);
    }
  });

  it("is true for a zone-less afternoon that would land on UTC midnight if read locally", () => {
    // 17:00 in America/Los_Angeles is exactly 00:00 UTC the next day. Reading
    // zone-less input as UTC is what keeps this from silently losing its time.
    expect(hasTimeOfDay(parseDateish("2026-05-01 17:00:00")!)).toBe(true);
  });

  it("is true whenever a time component is set", () => {
    for (const raw of ["2026-05-01 14:30", "2026-05-01T00:00:01Z", "2026-05-01T00:01:00Z"]) {
      expect(hasTimeOfDay(parseDateish(raw)!)).toBe(true);
    }
  });

  it("is false for a timestamp that genuinely names UTC midnight", () => {
    // The documented cost of deriving precision from the value itself.
    expect(hasTimeOfDay(parseDateish("2026-05-01T00:00:00Z")!)).toBe(false);
  });

  test.prop([ymd])("is false for any generated date-only string", ({ y, m, d }) => {
    const parsed = parseDateish(`${y}-${pad(m)}-${pad(d)}`);
    expect(parsed).toBeDefined();
    expect(hasTimeOfDay(parsed!)).toBe(false);
  });

  test.prop([ymd, fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 })])(
    "is true for any generated timestamp naming a non-zero time",
    ({ y, m, d }, hh, mm) => {
      fc.pre(hh !== 0 || mm !== 0);
      const parsed = parseDateish(`${y}-${pad(m)}-${pad(d)} ${pad(hh)}:${pad(mm)}`);
      expect(parsed).toBeDefined();
      expect(hasTimeOfDay(parsed!)).toBe(true);
    },
  );
});
