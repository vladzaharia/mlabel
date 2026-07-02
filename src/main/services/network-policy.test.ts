import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { test, fc } from "@fast-check/vitest";
import { isAllowedExternalUrl, isNavigationAllowed, isRequestAllowed } from "./network-policy";
import { dmgAssetUrl, portableAssetUrl } from "./update-status";
import type { PolicyContext } from "./network-policy";

const contexts: PolicyContext[] = (["renderer", "updater"] as const).flatMap((scope) =>
  [true, false].flatMap((updatesEnabled) =>
    [true, false].map((isDev) => ({ scope, updatesEnabled, isDev })),
  ),
);

const updaterOn: PolicyContext = { scope: "updater", updatesEnabled: true, isDev: false };
const updaterOff: PolicyContext = { scope: "updater", updatesEnabled: false, isDev: false };

describe("isRequestAllowed", () => {
  it("denies unparseable URLs in every context", () => {
    for (const ctx of contexts) {
      expect(isRequestAllowed("not a url", ctx)).toBe(false);
      expect(isRequestAllowed("", ctx)).toBe(false);
      expect(isRequestAllowed("http//missing-colon", ctx)).toBe(false);
    }
  });

  it("allows non-network schemes in every context", () => {
    const urls = [
      "file:///Users/someone/app/index.html",
      "devtools://devtools/bundled/inspector.html",
      "data:image/png;base64,AAAA",
      "blob:file:///some-id",
      "about:blank",
      "chrome-extension://abc/def.js",
      "chrome://gpu",
    ];
    for (const ctx of contexts) {
      for (const url of urls) expect(isRequestAllowed(url, ctx)).toBe(true);
    }
  });

  it("allows loopback http/ws only in dev", () => {
    const urls = [
      "http://localhost:5173/@vite/client",
      "ws://localhost:5173/",
      "http://127.0.0.1:9999/x",
      "ws://[::1]:5173/",
    ];
    for (const url of urls) {
      expect(isRequestAllowed(url, { scope: "renderer", updatesEnabled: false, isDev: true })).toBe(
        true,
      );
      expect(
        isRequestAllowed(url, { scope: "renderer", updatesEnabled: false, isDev: false }),
      ).toBe(false);
    }
  });

  it("denies non-loopback plain http even in dev", () => {
    expect(
      isRequestAllowed("http://github.com/vladzaharia/mlabel/releases", {
        scope: "updater",
        updatesEnabled: true,
        isDev: true,
      }),
    ).toBe(false);
  });

  it("renderer scope never reaches remote https, even with updates enabled", () => {
    const urls = [
      "https://github.com/vladzaharia/mlabel/releases.atom",
      "https://release-assets.githubusercontent.com/anything",
      "https://example.com/",
    ];
    for (const url of urls) {
      expect(isRequestAllowed(url, { scope: "renderer", updatesEnabled: true, isDev: false })).toBe(
        false,
      );
    }
  });

  it("updater scope denies everything while updates are disabled", () => {
    const urls = [
      "https://github.com/vladzaharia/mlabel/releases.atom",
      "https://github.com/vladzaharia/mlabel/releases/latest",
      "https://release-assets.githubusercontent.com/asset",
      "https://objects.githubusercontent.com/asset",
    ];
    for (const url of urls) expect(isRequestAllowed(url, updaterOff)).toBe(false);
  });

  it("updater scope with updates enabled allows exactly the GitHub release endpoints", () => {
    const allowed = [
      "https://github.com/vladzaharia/mlabel/releases.atom",
      "https://github.com/vladzaharia/mlabel/releases/latest",
      "https://github.com/vladzaharia/mlabel/releases/tag/v0.1.3",
      "https://github.com/vladzaharia/mlabel/releases/download/v0.1.3/latest-mac.yml",
      "https://github.com/vladzaharia/mlabel/releases/download/v0.1.3/MLabel-0.1.3-arm64.zip.blockmap",
      "https://github.com/vladzaharia/mlabel/releases",
      "https://release-assets.githubusercontent.com/github-production-release-asset/12345?sig=abc",
      "https://objects.githubusercontent.com/github-production-release-asset/12345?sig=abc",
    ];
    for (const url of allowed) expect(isRequestAllowed(url, updaterOn)).toBe(true);
  });

  it("denies adversarial lookalike URLs in every context", () => {
    const denied = [
      "https://github.com/other/repo/releases/latest",
      "https://github.com/vladzaharia/mlabel/releasesevil",
      "https://github.com/vladzaharia/mlabel/issues",
      "https://github.com@evil.com/vladzaharia/mlabel/releases",
      "https://evil.com/vladzaharia/mlabel/releases/x",
      "https://github.com.evil.com/vladzaharia/mlabel/releases",
      "http://github.com/vladzaharia/mlabel/releases",
      "https://github.com:8443/vladzaharia/mlabel/releases",
      "https://api.github.com/repos/vladzaharia/mlabel/releases/latest",
    ];
    for (const ctx of contexts) {
      for (const url of denied) expect(isRequestAllowed(url, ctx)).toBe(false);
    }
  });

  const allowedHosts = new Set([
    "github.com",
    "release-assets.githubusercontent.com",
    "objects.githubusercontent.com",
    "localhost",
    "127.0.0.1",
    "[::1]",
  ]);

  test.prop([fc.webUrl()])("any URL to a host outside the closed set is denied", (url) => {
    const host = new URL(url).hostname;
    if (allowedHosts.has(host)) return;
    for (const ctx of contexts) expect(isRequestAllowed(url, ctx)).toBe(false);
  });
});

describe("isNavigationAllowed", () => {
  it("always allows file and devtools navigations", () => {
    for (const isDev of [true, false]) {
      expect(isNavigationAllowed("file:///app/index.html", { isDev })).toBe(true);
      expect(isNavigationAllowed("devtools://devtools/inspector.html", { isDev })).toBe(true);
    }
  });

  it("allows the dev server origin only in dev", () => {
    expect(isNavigationAllowed("http://localhost:5173/", { isDev: true })).toBe(true);
    expect(isNavigationAllowed("http://localhost:5173/", { isDev: false })).toBe(false);
  });

  it("denies remote navigations everywhere", () => {
    for (const isDev of [true, false]) {
      expect(isNavigationAllowed("https://example.com/", { isDev })).toBe(false);
      expect(isNavigationAllowed("https://github.com/vladzaharia/mlabel/releases", { isDev })).toBe(
        false,
      );
    }
  });

  it("denies unparseable navigation targets", () => {
    expect(isNavigationAllowed("not a url", { isDev: true })).toBe(false);
  });
});

describe("isAllowedExternalUrl", () => {
  it("accepts the asset URLs the updater actually produces", () => {
    expect(isAllowedExternalUrl(dmgAssetUrl("1.2.0", "arm64"))).toBe(true);
    expect(isAllowedExternalUrl(portableAssetUrl("1.2.0", "x64"))).toBe(true);
    expect(isAllowedExternalUrl("https://github.com/vladzaharia/mlabel/releases/latest")).toBe(
      true,
    );
  });

  it("rejects everything else", () => {
    const denied = [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "smb://evil/share",
      "http://github.com/vladzaharia/mlabel/releases/latest",
      "https://github.com/other/repo/releases/latest",
      "https://github.com/vladzaharia/mlabel/issues",
      "https://github.com@evil.com/vladzaharia/mlabel/releases/x",
      "https://github.com:8443/vladzaharia/mlabel/releases/x",
      "https://evil.com/vladzaharia/mlabel/releases/x",
      "not a url",
    ];
    for (const url of denied) expect(isAllowedExternalUrl(url)).toBe(false);
  });
});

describe("electron-updater session contract", () => {
  // The network guard intercepts updater traffic by attaching to the session
  // partition electron-updater creates internally. If an upgrade renames it,
  // the guard would fail OPEN for updater traffic — fail the build instead.
  it("still uses the 'electron-updater' partition for all its requests", () => {
    const source = readFileSync(
      "node_modules/electron-updater/out/electronHttpExecutor.js",
      "utf8",
    );
    expect(source).toContain('NET_SESSION_NAME = "electron-updater"');
    expect(source).toContain("session: this.cachedSession");
  });
});
