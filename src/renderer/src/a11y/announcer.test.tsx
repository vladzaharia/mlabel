import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useAnnouncer, announce } from "./announcer";
import { LiveAnnouncer } from "./LiveAnnouncer";

afterEach(() => {
  cleanup();
  // Reset store state between tests.
  useAnnouncer.setState({ polite: { message: "", seq: 0 }, assertive: { message: "", seq: 0 } });
});

describe("announce()", () => {
  it("routes a polite message to the polite channel", () => {
    act(() => announce("Hello polite", "polite"));
    const { polite, assertive } = useAnnouncer.getState();
    expect(polite.message).toBe("Hello polite");
    expect(assertive.message).toBe("");
  });

  it("routes an assertive message to the assertive channel", () => {
    act(() => announce("Alert!", "assertive"));
    const { polite, assertive } = useAnnouncer.getState();
    expect(assertive.message).toBe("Alert!");
    expect(polite.message).toBe("");
  });

  it("defaults to polite when no politeness is provided", () => {
    act(() => announce("Default politeness"));
    const { polite, assertive } = useAnnouncer.getState();
    expect(polite.message).toBe("Default politeness");
    expect(assertive.message).toBe("");
  });

  it("increments seq so repeated identical messages re-announce", () => {
    act(() => announce("Same message", "polite"));
    const seq1 = useAnnouncer.getState().polite.seq;

    act(() => announce("Same message", "polite"));
    const seq2 = useAnnouncer.getState().polite.seq;

    expect(seq2).toBe(seq1 + 1);
  });

  it("increments polite seq independently of assertive seq", () => {
    act(() => announce("Polite", "polite"));
    act(() => announce("Alert", "assertive"));
    act(() => announce("Alert", "assertive"));
    const { polite, assertive } = useAnnouncer.getState();
    expect(polite.seq).toBe(1);
    expect(assertive.seq).toBe(2);
  });
});

describe("LiveAnnouncer", () => {
  beforeEach(() => {
    render(<LiveAnnouncer />);
  });

  it("renders a polite status region", () => {
    const region = screen.getByRole("status");
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("aria-atomic", "true");
  });

  it("renders an assertive alert region", () => {
    const region = screen.getByRole("alert");
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute("aria-live", "assertive");
    expect(region).toHaveAttribute("aria-atomic", "true");
  });

  it("reflects polite announcements in the status region", () => {
    act(() => announce("Record 3 of 10", "polite"));
    expect(screen.getByRole("status")).toHaveTextContent("Record 3 of 10");
  });

  it("reflects assertive announcements in the alert region", () => {
    act(() => announce("Export failed: disk full", "assertive"));
    expect(screen.getByRole("alert")).toHaveTextContent("Export failed: disk full");
  });

  it("re-renders when the same message is announced again (seq changes)", () => {
    act(() => announce("Done", "polite"));
    const before = screen.getByRole("status").textContent;

    act(() => announce("Done", "polite"));
    // textContent stays the same but the component re-rendered — we verify
    // by checking the seq incremented in the store.
    const { polite } = useAnnouncer.getState();
    expect(polite.seq).toBe(2);
    // Text is still visible (not cleared).
    expect(screen.getByRole("status").textContent).toBe(before);
  });
});
