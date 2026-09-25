import { AlertTriangle, CheckCircle2, EyeOff, Info } from "lucide-react";
import type { Tone } from "@core/config";

/**
 * One vocabulary for every semantic level in the app: icon, text colour, and a
 * frame for the two different jobs colour has to do here.
 *
 * `textClass` uses the `-text` token variants, which meet WCAG AA 4.5:1 on all
 * light surfaces and are covered by the contrast gate.
 *
 * `frameClass` is the distinction that matters most. A **full border and red
 * text** means *you must fix this* — a validation error the labeler can act on.
 * A **left rail and a tint** means *the system is telling you something* about
 * read-only source data, which they cannot fix. Using the same treatment for
 * both sends people hunting for a fix that doesn't exist.
 */

/** Matches the config's `Tone` so a rule's tone maps straight onto a descriptor. */
export type SeverityKind = Tone;

export interface SeverityDescriptor {
  Icon: React.ElementType;
  textClass: string;
  /** Left rail + tint, for system annotations on data the user can't change. */
  frameClass: string;
  /**
   * Border colour for a whole surface a rule has annotated — a card, not a value.
   *
   * Spelled out rather than composed as `border-${tone}/40`: Tailwind only
   * generates classes it can see as literal strings in the source, so an
   * interpolated one silently produces no CSS at all.
   */
  borderClass: string;
  /**
   * Solid fill for a small marker — a dot or a bar.
   *
   * Spelled out for the same reason as `borderClass`: Tailwind only generates
   * classes it can see literally, so `bg-${tone}` produces no CSS at all.
   */
  dotClass: string;
}

export const SEVERITY: Record<SeverityKind, SeverityDescriptor> = {
  danger: {
    Icon: AlertTriangle,
    textClass: "text-danger-text",
    frameClass: "border-l-2 border-danger/60 bg-danger/5 pl-2",
    borderClass: "border-danger/40",
    dotClass: "bg-danger",
  },
  warning: {
    Icon: AlertTriangle,
    textClass: "text-warning-text",
    frameClass: "border-l-2 border-warning/60 bg-warning/5 pl-2",
    borderClass: "border-warning/40",
    dotClass: "bg-warning",
  },
  success: {
    Icon: CheckCircle2,
    textClass: "text-progress-text",
    frameClass: "border-l-2 border-progress/50 bg-progress/5 pl-2",
    borderClass: "border-progress/40",
    dotClass: "bg-progress",
  },
  info: {
    Icon: Info,
    textClass: "text-info-text",
    frameClass: "border-l-2 border-info/50 bg-info/5 pl-2",
    borderClass: "border-info/40",
    dotClass: "bg-info",
  },
  accent: {
    Icon: Info,
    textClass: "text-accent",
    frameClass: "border-l-2 border-accent/50 bg-accent/5 pl-2",
    borderClass: "border-accent/40",
    dotClass: "bg-accent",
  },
  // Deliberately de-emphasised, never faded with opacity: on a translucent
  // surface that would show wallpaper through the text and read as a rendering
  // failure rather than as something intentionally quietened.
  muted: {
    Icon: EyeOff,
    textClass: "text-muted-foreground",
    frameClass: "border-l-2 border-border bg-muted/40 pl-2",
    borderClass: "border-border",
    dotClass: "bg-muted-foreground",
  },
};

/**
 * Map a validation issue's severity onto a tone.
 *
 * `ValidationIssue` says "error"; the token is `--danger` and the config's tone
 * vocabulary follows the token. One translation point rather than two spellings
 * drifting apart across the app.
 */
export function toneForSeverity(severity: "error" | "warning"): SeverityKind {
  return severity === "error" ? "danger" : "warning";
}
