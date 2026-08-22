import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useStore } from "../store/store";
import { ThemeSwitcher } from "./ThemeSwitcher";

describe("ThemeSwitcher", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    useStore.setState({ colorTheme: "cobalt" });
  });
  afterEach(() => cleanup());

  it("shows the active theme and switches on selection", async () => {
    const user = userEvent.setup();
    render(<ThemeSwitcher />);

    expect(screen.getByRole("button", { name: /color theme/i })).toHaveTextContent(
      "Cobalt Cathedral",
    );

    await user.click(screen.getByRole("button", { name: /color theme/i }));
    await user.click(screen.getByText("Velvet Vespers"));

    expect(useStore.getState().colorTheme).toBe("vespers");
    expect(document.documentElement.dataset.theme).toBe("vespers");
    expect(screen.getByRole("button", { name: /color theme/i })).toHaveTextContent(
      "Velvet Vespers",
    );
  });
});
