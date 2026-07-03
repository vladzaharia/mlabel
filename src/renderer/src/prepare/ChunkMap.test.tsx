import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ChunkMap } from "./ChunkMap";

describe("ChunkMap", () => {
  afterEach(() => cleanup());

  it("renders one block per part with row counts and full output names", () => {
    render(<ChunkMap sourcePath="/d/survey.csv" sizes={[3, 3, 2]} />);
    expect(screen.getByText("Part 1")).toBeInTheDocument();
    expect(screen.getByText("Part 3")).toBeInTheDocument();
    expect(screen.getByText("survey-part1-of-3.csv")).toBeInTheDocument();
    expect(screen.getByText("survey-part3-of-3.csv")).toBeInTheDocument();
    expect(screen.getAllByText("3 rows")).toHaveLength(2);
    expect(screen.getByText("2 rows")).toBeInTheDocument();
  });

  it("sizes blocks proportionally to their row counts", () => {
    render(<ChunkMap sourcePath="/d/survey.csv" sizes={[6, 2]} />);
    const list = screen.getByRole("list", { name: /2 part files/i });
    const blocks = [...list.children] as HTMLElement[];
    expect(blocks[0]!.style.flexGrow).toBe("6");
    expect(blocks[1]!.style.flexGrow).toBe("2");
  });
});
