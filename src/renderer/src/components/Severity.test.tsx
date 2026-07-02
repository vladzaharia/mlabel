import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { SEVERITY, type SeverityKind } from "./Severity";

afterEach(() => cleanup());

/** Minimal wrapper that renders the Icon from a severity descriptor. */
function SeverityBadge({ kind }: { kind: SeverityKind }): React.JSX.Element {
  const { Icon, textClass } = SEVERITY[kind];
  return (
    <span data-testid="badge" className={textClass}>
      <Icon data-testid="icon" size={16} aria-label={kind} />
    </span>
  );
}

describe("SEVERITY map", () => {
  it("error → AlertTriangle icon + text-danger-text class", () => {
    expect(SEVERITY.error.Icon).toBe(AlertTriangle);
    expect(SEVERITY.error.textClass).toBe("text-danger-text");
  });

  it("warning → AlertTriangle icon + text-warning-text class", () => {
    expect(SEVERITY.warning.Icon).toBe(AlertTriangle);
    expect(SEVERITY.warning.textClass).toBe("text-warning-text");
  });

  it("success → CheckCircle2 icon + text-progress-text class", () => {
    expect(SEVERITY.success.Icon).toBe(CheckCircle2);
    expect(SEVERITY.success.textClass).toBe("text-progress-text");
  });

  it("info → Info icon + text-info-text class", () => {
    expect(SEVERITY.info.Icon).toBe(Info);
    expect(SEVERITY.info.textClass).toBe("text-info-text");
  });
});

describe("SeverityBadge render", () => {
  it.each(["error", "warning", "success", "info"] as SeverityKind[])(
    "%s: renders icon accessible with kind label and correct textClass on wrapper",
    (kind) => {
      render(<SeverityBadge kind={kind} />);
      expect(screen.getByLabelText(kind)).toBeInTheDocument();
      const badge = screen.getByTestId("badge");
      expect(badge.className).toBe(SEVERITY[kind].textClass);
    },
  );
});
