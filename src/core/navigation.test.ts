import { describe, expect, it } from "vitest";
import { test, fc } from "@fast-check/vitest";
import { findIncomplete } from "./navigation";

/** `complete[i]` says whether record `i` needs no more work. */
const over = (complete: readonly boolean[]) => (index: number) => complete[index] ?? true;

describe("findIncomplete", () => {
  it("finds the next one needing work", () => {
    expect(findIncomplete(0, 1, 4, over([true, true, false, false]))).toBe(2);
  });

  it("finds the previous one needing work", () => {
    expect(findIncomplete(3, -1, 4, over([false, false, true, true]))).toBe(1);
  });

  it("starts from the neighbour, never from where you already are", () => {
    // Standing on an unfinished record and pressing "next unfinished" has to
    // move, or the key looks broken.
    expect(findIncomplete(1, 1, 3, over([true, false, false]))).toBe(2);
  });

  it("does not wrap", () => {
    expect(findIncomplete(2, 1, 4, over([false, false, true, true]))).toBeNull();
    expect(findIncomplete(1, -1, 4, over([true, true, false, false]))).toBeNull();
  });

  it("is null when everything is done", () => {
    expect(findIncomplete(0, 1, 3, over([true, true, true]))).toBeNull();
  });

  it("copes with the ends and with an empty file", () => {
    expect(findIncomplete(0, -1, 3, over([false, false, false]))).toBeNull();
    expect(findIncomplete(2, 1, 3, over([false, false, false]))).toBeNull();
    expect(findIncomplete(0, 1, 0, over([]))).toBeNull();
  });

  test.prop([
    fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }),
    fc.nat(19),
    fc.constantFrom<1 | -1>(1, -1),
  ])("lands on the nearest one, skipping nothing", (complete, from, direction) => {
    const count = complete.length;
    fc.pre(from < count);
    const found = findIncomplete(from, direction, count, over(complete));
    if (found === null) return;

    expect(complete[found]).toBe(false);
    // Everything strictly between where we were and where we landed was done.
    const [lo, hi] = direction === 1 ? [from + 1, found] : [found + 1, from];
    for (let i = lo; i < hi; i++) expect(complete[i]).toBe(true);
  });
});
