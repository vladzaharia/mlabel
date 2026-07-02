import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

/**
 * Severity descriptor: icon + Tailwind text class for each semantic level.
 * Used by IssueList and FileStatusRow to display consistent severity coloring.
 * Uses the -text token variants which meet WCAG AA 4.5:1 on all light surfaces.
 */

export type SeverityKind = "error" | "warning" | "success" | "info";

export interface SeverityDescriptor {
  Icon: React.ElementType;
  textClass: string;
}

export const SEVERITY: Record<SeverityKind, SeverityDescriptor> = {
  error: { Icon: AlertTriangle, textClass: "text-danger-text" },
  warning: { Icon: AlertTriangle, textClass: "text-warning-text" },
  success: { Icon: CheckCircle2, textClass: "text-progress-text" },
  info: { Icon: Info, textClass: "text-info-text" },
};
