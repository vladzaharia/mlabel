import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/core/config";
import { IPC_INVOKE, IPC_EVENT } from "../src/core/ipc";

const minimal = {
  version: 2,
  input: { fields: [{ name: "text", type: "text" }] },
  output: { fields: [{ name: "label", type: "text" }] },
};

describe("public release contract", () => {
  it("accepts the public config without experimental defaults", () => {
    const result = loadConfig(JSON.stringify(minimal));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config).not.toHaveProperty("ai");
      expect(result.config.network).toEqual({ updateChecks: true });
    }
  });
  it("rejects internal configuration keys", () => {
    expect(loadConfig(JSON.stringify({ ...minimal, ai: {} })).ok).toBe(false);
    expect(loadConfig(JSON.stringify({ ...minimal, network: { modelDownload: true } })).ok).toBe(
      false,
    );
  });
  it("exposes settings without experimental IPC channels", () => {
    expect(IPC_INVOKE.getSettings).toBe("settings:get");
    expect(IPC_EVENT.openSettings).toBe("menu:open-settings");
    expect(
      [...Object.values(IPC_INVOKE), ...Object.values(IPC_EVENT)].some((channel) =>
        channel.startsWith("ai:"),
      ),
    ).toBe(false);
  });
});
