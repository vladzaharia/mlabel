import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useStore } from "../store/store";
import { StartScreen } from "./StartScreen";

afterEach(() => cleanup());

beforeEach(() => {
  useStore.setState({ busy: false });
});

describe("StartScreen config variant", () => {
  it("shows the config heading and descriptive copy", () => {
    render(<StartScreen kind="config" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Configure MLabel");
    expect(
      screen.getByText(
        "MLabel is driven by a config file — a JSONC document describing your input columns and the labels to collect.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the Select config button", () => {
    render(<StartScreen kind="config" />);
    expect(screen.getByRole("button", { name: /Select config/ })).toBeInTheDocument();
  });

  it("shows the drag hint", () => {
    render(<StartScreen kind="config" />);
    expect(screen.getByText(/drag a file onto the window/)).toBeInTheDocument();
  });
});

describe("StartScreen input variant", () => {
  it("shows the input heading and description", () => {
    render(<StartScreen kind="input" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Open data to label");
    expect(
      screen.getByText("Select a CSV file that matches the input schema."),
    ).toBeInTheDocument();
  });

  it("shows the Select input file button", () => {
    render(<StartScreen kind="input" />);
    expect(screen.getByRole("button", { name: /Select input file/ })).toBeInTheDocument();
  });
});

describe("StartScreen drag-over visual state", () => {
  it("adds dashed accent border class on dragenter and removes on dragleave", () => {
    render(<StartScreen kind="config" />);

    // The card is the div with glass-card class — find it via its known heading child.
    const heading = screen.getByRole("heading", { level: 1 });
    // The card wraps the heading; walk up to find the card container.
    const card = heading.closest("div.rounded-2xl") as HTMLElement;
    expect(card).not.toBeNull();

    // Initially no dashed border.
    expect(card.className).not.toContain("border-dashed");

    // Simulate drag enter on the window.
    fireEvent(window, new Event("dragenter", { bubbles: false }));
    expect(card.className).toContain("border-dashed");

    // Simulate drag leave.
    fireEvent(window, new Event("dragleave", { bubbles: false }));
    expect(card.className).not.toContain("border-dashed");
  });

  it("resets drag state on drop", () => {
    render(<StartScreen kind="config" />);
    const heading = screen.getByRole("heading", { level: 1 });
    const card = heading.closest("div.rounded-2xl") as HTMLElement;

    fireEvent(window, new Event("dragenter", { bubbles: false }));
    expect(card.className).toContain("border-dashed");

    fireEvent(window, new Event("drop", { bubbles: false }));
    expect(card.className).not.toContain("border-dashed");
  });

  it("handles nested enters correctly (counter approach)", () => {
    render(<StartScreen kind="config" />);
    const heading = screen.getByRole("heading", { level: 1 });
    const card = heading.closest("div.rounded-2xl") as HTMLElement;

    // Two enters, one leave — should still be dragging.
    fireEvent(window, new Event("dragenter", { bubbles: false }));
    fireEvent(window, new Event("dragenter", { bubbles: false }));
    fireEvent(window, new Event("dragleave", { bubbles: false }));
    expect(card.className).toContain("border-dashed");

    // Second leave brings count to 0 — drag ends.
    fireEvent(window, new Event("dragleave", { bubbles: false }));
    expect(card.className).not.toContain("border-dashed");
  });
});

describe("StartScreen: no example config content", () => {
  it("does not render any code snippet or example JSON", () => {
    const { container } = render(<StartScreen kind="config" />);
    // Ensure no <code>, <pre>, or <details> elements (example/snippet markers)
    expect(container.querySelector("code")).toBeNull();
    expect(container.querySelector("pre")).toBeNull();
    expect(container.querySelector("details")).toBeNull();
  });
});
