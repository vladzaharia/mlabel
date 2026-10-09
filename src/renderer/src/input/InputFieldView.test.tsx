import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { InputField } from "@core/config";
import { InputFieldView } from "./InputFieldView";

afterEach(() => cleanup());

const field: InputField = { name: "score", type: "number", display: { title: "Score" } };

describe("InputFieldView — unreadable values", () => {
  it("collapses the problem to a single control rather than a block of text", () => {
    render(
      <InputFieldView field={field} value={null} coercionError='Expected a number, got "x".' />,
    );

    const badge = screen.getByRole("button", { name: /could not read this value/i });
    expect(badge).toBeInTheDocument();
    // The whole message has to reach a screen reader without the tooltip opening.
    expect(badge).toHaveAccessibleName('Could not read this value: Expected a number, got "x".');
  });

  it("reveals the full message on focus", async () => {
    const user = userEvent.setup();
    render(
      <InputFieldView field={field} value={null} coercionError='Expected a number, got "x".' />,
    );

    await user.tab();
    expect(screen.getByRole("button", { name: /could not read this value/i })).toHaveFocus();
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent('Expected a number, got "x".');
  });

  it("says nothing when the value read cleanly", () => {
    render(<InputFieldView field={field} value={3} />);
    expect(screen.queryByRole("button", { name: /could not read this value/i })).toBeNull();
  });
});
