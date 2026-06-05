import { describe, expect, it } from "vitest";
import { IPC_EVENT, IPC_INVOKE } from "./ipc";

describe("ipc channel constants", () => {
  it("exposes unique invoke channels", () => {
    const channels = Object.values(IPC_INVOKE);
    expect(new Set(channels).size).toBe(channels.length);
  });

  it("exposes a theme-changed event channel", () => {
    expect(IPC_EVENT.themeChanged).toBe("theme:changed");
  });
});
