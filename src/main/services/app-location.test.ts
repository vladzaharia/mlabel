import { describe, expect, it } from "vitest";
import { shouldOfferRelocate } from "./app-location";

describe("shouldOfferRelocate", () => {
  it("offers only for packaged macOS apps running outside /Applications", () => {
    expect(shouldOfferRelocate({ packaged: true, isMac: true, inApplicationsFolder: false })).toBe(
      true,
    );
  });

  it("does not offer when already in /Applications", () => {
    expect(shouldOfferRelocate({ packaged: true, isMac: true, inApplicationsFolder: true })).toBe(
      false,
    );
  });

  it("does not offer in development", () => {
    expect(shouldOfferRelocate({ packaged: false, isMac: true, inApplicationsFolder: false })).toBe(
      false,
    );
  });

  it("does not offer on non-macOS platforms", () => {
    expect(shouldOfferRelocate({ packaged: true, isMac: false, inApplicationsFolder: false })).toBe(
      false,
    );
  });
});
