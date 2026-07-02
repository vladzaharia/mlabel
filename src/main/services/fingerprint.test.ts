import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fingerprintOf } from "./fingerprint";

function sha256hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

describe("fingerprintOf", () => {
  it("returns the sha256 of the buffer contents as hex", () => {
    const buf = Buffer.from("hello world", "utf8");
    const stat = { size: buf.length, mtimeMs: 1_700_000_000_000 };
    const result = fingerprintOf(buf, stat);
    expect(result.sha256).toBe(sha256hex("hello world"));
  });

  it("passes size and mtimeMs through from the stat unchanged", () => {
    const buf = Buffer.from("some data");
    const stat = { size: 9999, mtimeMs: 42.5 };
    const result = fingerprintOf(buf, stat);
    expect(result.size).toBe(9999);
    expect(result.mtimeMs).toBe(42.5);
  });

  it("produces different hashes for different content", () => {
    const stat = { size: 5, mtimeMs: 0 };
    const a = fingerprintOf(Buffer.from("hello"), stat);
    const b = fingerprintOf(Buffer.from("world"), stat);
    expect(a.sha256).not.toBe(b.sha256);
  });

  it("known vector: empty buffer", () => {
    const buf = Buffer.alloc(0);
    const result = fingerprintOf(buf, { size: 0, mtimeMs: 0 });
    // SHA-256 of empty string is well-known
    expect(result.sha256).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});
