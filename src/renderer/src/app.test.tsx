import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./app";

describe("App", () => {
  it("renders the app chrome title", () => {
    render(<App />);
    expect(screen.getByText("MLabel")).toBeInTheDocument();
  });
});
