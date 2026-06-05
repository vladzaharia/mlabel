import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import type { UpdateStatus } from "@core";
import { portableAssetUrl, wireUpdater, type UpdaterLike } from "./update-status";

/** A fake autoUpdater: an EventEmitter with the mutable flags wireUpdater sets. */
class FakeUpdater extends EventEmitter implements UpdaterLike {
  autoDownload = true;
  autoInstallOnAppQuit = true;
}

function setup(portable: boolean): { updater: FakeUpdater; sent: UpdateStatus[] } {
  const updater = new FakeUpdater();
  const sent: UpdateStatus[] = [];
  wireUpdater(updater, { portable, send: (s) => sent.push(s) });
  return { updater, sent };
}

describe("wireUpdater (installable)", () => {
  it("enables autoDownload and install-on-quit", () => {
    const { updater } = setup(false);
    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(true);
  });

  it("maps the check → download → installed lifecycle", () => {
    const { updater, sent } = setup(false);
    updater.emit("checking-for-update");
    updater.emit("update-available", { version: "1.2.0" });
    updater.emit("download-progress", { percent: 42.6 });
    updater.emit("update-downloaded", { version: "1.2.0" });
    expect(sent).toEqual([
      { kind: "checking" },
      { kind: "downloading", version: "1.2.0", percent: 0 },
      { kind: "downloading", version: "1.2.0", percent: 43 },
      { kind: "downloaded", version: "1.2.0" },
    ]);
  });

  it("maps update-not-available to up-to-date and carries the error message", () => {
    const { updater, sent } = setup(false);
    updater.emit("update-not-available");
    updater.emit("error", new Error("net::ERR_DISCONNECTED"));
    expect(sent).toEqual([
      { kind: "up-to-date" },
      { kind: "error", message: "net::ERR_DISCONNECTED" },
    ]);
  });
});

describe("wireUpdater (portable)", () => {
  it("disables autoDownload and links out to the portable asset", () => {
    const { updater, sent } = setup(true);
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    updater.emit("update-available", { version: "1.2.0" });
    expect(sent).toEqual([
      {
        kind: "available-external",
        version: "1.2.0",
        url: portableAssetUrl("1.2.0"),
      },
    ]);
  });
});

describe("portableAssetUrl", () => {
  it("builds a release-download URL with tag, version and arch", () => {
    expect(portableAssetUrl("1.2.0", "arm64")).toBe(
      "https://github.com/vladzaharia/mlabel/releases/download/v1.2.0/MLabel-1.2.0-arm64-portable.exe",
    );
  });
});
