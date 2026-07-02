import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UpdateStatus } from "@core";
import { useStore } from "../store/store";
import { UpdateIndicator } from "./UpdateIndicator";

const installUpdate = vi.fn(async () => {});
const openExternal = vi.fn(async () => {});
const checkForUpdates = vi.fn(async () => {});

beforeEach(() => {
  installUpdate.mockClear();
  openExternal.mockClear();
  checkForUpdates.mockClear();
  useStore.setState({ updateStatus: null });
  Object.defineProperty(window, "api", {
    value: { installUpdate, openExternal, checkForUpdates },
    configurable: true,
  });
});
afterEach(() => cleanup());

function show(status: UpdateStatus | null): void {
  useStore.setState({ updateStatus: status });
  render(<UpdateIndicator />);
}

describe("UpdateIndicator", () => {
  it("renders nothing before any status arrives", () => {
    const { container } = render(<UpdateIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the labels for each non-interactive status", () => {
    show({ kind: "checking" });
    expect(screen.getByText(/Checking for updates/i)).toBeInTheDocument();
    cleanup();

    show({ kind: "up-to-date" });
    expect(screen.getByText(/Up to date/i)).toBeInTheDocument();
    cleanup();

    show({ kind: "downloading", version: "1.2.0", percent: 42 });
    expect(screen.getByText(/Downloading update… 42%/i)).toBeInTheDocument();
  });

  it("surfaces the error detail as a title on the retry button", () => {
    show({ kind: "error", message: "net::ERR_DISCONNECTED" });
    const btn = screen.getByRole("button", { name: /Couldn’t check for updates/i });
    expect(btn).toHaveAttribute("title", "net::ERR_DISCONNECTED");
  });

  it("calls checkForUpdates when the error retry button is clicked", async () => {
    const user = userEvent.setup();
    show({ kind: "error", message: "net::ERR_DISCONNECTED" });
    await user.click(screen.getByRole("button", { name: /Retry/i }));
    expect(checkForUpdates).toHaveBeenCalledOnce();
  });

  it("installs the update when the downloaded button is clicked", async () => {
    const user = userEvent.setup();
    show({ kind: "downloaded", version: "1.2.0" });
    await user.click(screen.getByRole("button", { name: /Restart to update/i }));
    expect(installUpdate).toHaveBeenCalledOnce();
  });

  it("opens the asset URL when the portable update button is clicked", async () => {
    const user = userEvent.setup();
    const url = "https://github.com/vladzaharia/mlabel/releases/download/v1.2.0/x.exe";
    show({ kind: "available-external", version: "1.2.0", url });
    await user.click(screen.getByRole("button", { name: /Update available/i }));
    expect(openExternal).toHaveBeenCalledWith(url);
  });
});
