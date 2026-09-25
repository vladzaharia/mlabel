import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { test, fc } from "@fast-check/vitest";
import { MODELS, modelUrl } from "@core";
import { isAllowedExternalUrl, isNavigationAllowed, isRequestAllowed } from "./network-policy";
import { dmgAssetUrl, portableAssetUrl } from "./update-status";
import type { PolicyContext } from "./network-policy";

const contexts: PolicyContext[] = (["renderer", "updater", "model"] as const).flatMap((scope) =>
  [true, false].flatMap((updatesEnabled) =>
    [true, false].flatMap((modelDownloadEnabled) =>
      [true, false].map((isDev) => ({ scope, updatesEnabled, modelDownloadEnabled, isDev })),
    ),
  ),
);

const updaterOn: PolicyContext = {
  scope: "updater",
  updatesEnabled: true,
  modelDownloadEnabled: false,
  isDev: false,
};
const updaterOff: PolicyContext = { ...updaterOn, updatesEnabled: false };

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
      expect(
        isRequestAllowed(url, {
          scope: "renderer",
          updatesEnabled: false,
          modelDownloadEnabled: false,
          isDev: true,
        }),
      ).toBe(true);
      expect(
        isRequestAllowed(url, {
          scope: "renderer",
          updatesEnabled: false,
          modelDownloadEnabled: false,
          isDev: false,
        }),
      ).toBe(false);
    }
  });

  it("denies non-loopback plain http even in dev", () => {
    expect(
      isRequestAllowed("http://github.com/vladzaharia/mlabel/releases", {
        scope: "updater",
        modelDownloadEnabled: false,
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
      expect(
        isRequestAllowed(url, {
          scope: "renderer",
          updatesEnabled: true,
          modelDownloadEnabled: false,
          isDev: false,
        }),
      ).toBe(false);
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

// --- Model download -------------------------------------------------------

const modelOn: PolicyContext = {
  scope: "model",
  updatesEnabled: false,
  modelDownloadEnabled: true,
  isDev: false,
};
const modelOff: PolicyContext = { ...modelOn, modelDownloadEnabled: false };

const HF_URLS = [
  // Every model the app will actually ask for, taken from the manifest rather
  // than copied — an entry pointing somewhere the policy refuses would fail here
  // instead of as a mysterious download error on a labeler's machine.
  ...MODELS.map((m) => modelUrl(m)),
  // The resolve endpoint answers with a 302 to a regional CDN, and the redirect
  // is a separate request that has to pass the guard on its own.
  "https://us.aws.cdn.hf.co/repos/ab/cd/deadbeef/Qwen3.5-2B-UD-Q4_K_XL.gguf",
  "https://eu-west-3.aws.cdn.hf.co/repos/ab/cd/deadbeef/model.gguf",
  "https://cdn-lfs.hf.co/repos/ab/cd/model.gguf",
  "https://transfer.xethub.hf.co/xorbs/default/abc",
  "https://cas-bridge.xethub.hf.co/xet-bridge-us/abc/def",
];

describe("isRequestAllowed — model scope", () => {
  it("allows the Hugging Face endpoints a download actually uses", () => {
    for (const url of HF_URLS) expect(isRequestAllowed(url, modelOn), url).toBe(true);
  });

  it("denies everything while model downloads are disabled", () => {
    for (const url of HF_URLS) expect(isRequestAllowed(url, modelOff), url).toBe(false);
  });

  // Suffix matching is only safe if it is anchored on a dot. These are the
  // shapes an attacker reaches for first.
  it("is not fooled by a lookalike host", () => {
    const lookalikes = [
      "https://evilhf.co/model.gguf",
      "https://hf.co.evil.com/model.gguf",
      "https://huggingface.co.evil.com/model.gguf",
      "https://nothuggingface.co/model.gguf",
      "https://xhf.co/model.gguf",
    ];
    for (const url of lookalikes) expect(isRequestAllowed(url, modelOn), url).toBe(false);
  });

  it("requires clean HTTPS", () => {
    const dirty = [
      "http://huggingface.co/model.gguf",
      "https://user:pass@huggingface.co/model.gguf",
      "https://huggingface.co:8443/model.gguf",
    ];
    for (const url of dirty) expect(isRequestAllowed(url, modelOn), url).toBe(false);
  });

  // The two capabilities are independent: neither flag may open the other's door.
  it("does not let the model scope reach the update endpoints", () => {
    const release = "https://github.com/vladzaharia/mlabel/releases/latest";
    expect(isRequestAllowed(release, modelOn)).toBe(false);
  });

  it("does not let the updater scope reach Hugging Face", () => {
    const withBoth: PolicyContext = { ...updaterOn, modelDownloadEnabled: true };
    for (const url of HF_URLS) expect(isRequestAllowed(url, withBoth), url).toBe(false);
  });

  it("does not let the renderer reach Hugging Face, whatever is enabled", () => {
    const renderer: PolicyContext = {
      scope: "renderer",
      updatesEnabled: true,
      modelDownloadEnabled: true,
      isDev: false,
    };
    for (const url of HF_URLS) expect(isRequestAllowed(url, renderer), url).toBe(false);
  });

  it("never allows a model host to be opened in a browser", () => {
    // `openExternal` hands a URL to the OS; only release pages belong there.
    expect(isAllowedExternalUrl("https://huggingface.co/unsloth/Qwen3.5-2B-GGUF")).toBe(false);
  });
});

// The model download is the one place the app fetches something large from a
// host it does not own, so the shape of what it may reach is pinned here rather
// than left to the downloader to get right.
describe("the two network capabilities cannot borrow each other's permission", () => {
  const scopes = ["renderer", "updater", "model"] as const;

  it("denies everything when both flags are off, in every scope", () => {
    const urls = [
      "https://github.com/vladzaharia/mlabel/releases/latest",
      "https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/model.gguf",
      "https://example.com/",
    ];
    for (const scope of scopes) {
      const ctx: PolicyContext = {
        scope,
        updatesEnabled: false,
        modelDownloadEnabled: false,
        isDev: false,
      };
      for (const url of urls) expect(isRequestAllowed(url, ctx), `${scope} ${url}`).toBe(false);
    }
  });

  // Turning on model downloads must not, as a side effect, reopen anything the
  // update flag had closed.
  it("enabling model downloads does not reopen the update endpoints", () => {
    const ctx: PolicyContext = {
      scope: "updater",
      updatesEnabled: false,
      modelDownloadEnabled: true,
      isDev: false,
    };
    expect(isRequestAllowed("https://github.com/vladzaharia/mlabel/releases/latest", ctx)).toBe(
      false,
    );
  });

  test.prop([
    fc.constantFrom(...scopes),
    fc.boolean(),
    fc.boolean(),
    fc.webUrl({ withQueryParameters: true }),
  ])("never allows a host outside the two known families", (scope, updates, models, url) => {
    const host = new URL(url).hostname;
    const known =
      host === "github.com" ||
      host.endsWith(".githubusercontent.com") ||
      host === "huggingface.co" ||
      host === "hf.co" ||
      host.endsWith(".hf.co");
    if (known) return;
    const ctx: PolicyContext = {
      scope,
      updatesEnabled: updates,
      modelDownloadEnabled: models,
      isDev: false,
    };
    expect(isRequestAllowed(url, ctx)).toBe(false);
  });
});
