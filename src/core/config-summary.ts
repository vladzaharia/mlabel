import { fillKind } from "./automapping";
import type { AppConfig, OutputField } from "./config";
import { titleOf } from "./config";

/**
 * A plain reading of a config, for someone who did not write it.
 *
 * Deliberately shallow. A field-by-field dump is already in the file, and a
 * labeler opening this wants to know the *shape* of what they are working with
 * — "eight output fields, five of which you answer" — not to audit it.
 */

/**
 * `format` leads because it is the one fact that decides whether a file will
 * load at all. Everything after it describes a config that already opened.
 */
export type SummaryGroup = "format" | "reads" | "writes" | "also";

export interface ConfigSummaryItem {
  group: SummaryGroup;
  /**
   * The number the row is anchored on, when there is one. Rows without a count
   * are statements rather than tallies.
   */
  count?: number;
  label: string;
  /**
   * The qualifier that turns a tally into a shape: "8 output fields" is a
   * number; "5 you answer · 2 copied in · 1 stamped" says what kind of work it is.
   */
  detail?: string;
}

/** `n thing` / `n things`, without the bare "1 fields". */
const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/** Join the non-empty parts with the separator the app uses elsewhere. */
const parts = (...items: (string | false | undefined)[]): string | undefined => {
  const kept = items.filter((item): item is string => typeof item === "string" && item !== "");
  return kept.length > 0 ? kept.join(" · ") : undefined;
};

/** How many of each declared type, most common first. */
function typeBreakdown(fields: readonly { type: string }[]): string | undefined {
  const counts = new Map<string, number>();
  for (const field of fields) counts.set(field.type, (counts.get(field.type) ?? 0) + 1);
  const ordered = [...counts].toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return parts(...ordered.map(([type, n]) => `${String(n)} ${type}`));
}

/** What kind of work each output field represents. */
function outputBreakdown(fields: readonly OutputField[]): string | undefined {
  const byKind = new Map<string, number>();
  for (const field of fields) {
    const kind = fillKind(field);
    byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
  }
  const n = (kind: string): number => byKind.get(kind) ?? 0;
  return parts(
    n("user") > 0 && `${String(n("user"))} you answer`,
    n("session") > 0 && `${String(n("session"))} asked once`,
    n("copy") > 0 && `${String(n("copy"))} copied in`,
    n("timestamp") > 0 && `${String(n("timestamp"))} stamped by the app`,
  );
}

function countShortcuts(config: AppConfig): number {
  let n = 0;
  for (const field of config.output.fields) {
    if (field.shortcut !== undefined) n += 1;
    const choices =
      field.type === "enum"
        ? field.choices
        : field.type === "array" && field.items.type === "enum"
          ? field.items.choices
          : [];
    for (const choice of choices) if (choice.shortcut !== undefined) n += 1;
  }
  return n;
}

/** A shallow, plain-language inventory of a loaded config. */
export function summarizeConfig(config: AppConfig): ConfigSummaryItem[] {
  const out: ConfigSummaryItem[] = [];
  const { input, output } = config;

  const sameFormat = input.adapterId === output.adapterId;
  out.push({
    group: "format",
    label: sameFormat
      ? `${input.adapterId.toUpperCase()} in, ${input.adapterId.toUpperCase()} out`
      : `${input.adapterId.toUpperCase()} in, ${output.adapterId.toUpperCase()} out`,
    ...(input.adapterConfig || output.adapterConfig
      ? { detail: "with custom options on this config" }
      : {}),
  });

  out.push({
    group: "reads",
    count: input.fields.length,
    label: plural(input.fields.length, "input field", "input fields"),
    detail: typeBreakdown(input.fields),
  });

  if (input.cards && input.cards.length > 0) {
    out.push({
      group: "reads",
      count: input.cards.length,
      label: plural(input.cards.length, "input card", "input cards"),
      detail: parts(...input.cards.map((card) => titleOf(card.name, card.display))),
    });
  } else {
    out.push({ group: "reads", label: "Default input layout", detail: "one field per row" });
  }

  if (input.rules && input.rules.length > 0) {
    out.push({
      group: "reads",
      count: input.rules.length,
      label: plural(input.rules.length, "display rule", "display rules"),
    });
  }

  out.push({
    group: "writes",
    count: output.fields.length,
    label: plural(output.fields.length, "output field", "output fields"),
    detail: outputBreakdown(output.fields),
  });

  if (output.cards && output.cards.length > 0) {
    out.push({
      group: "writes",
      count: output.cards.length,
      label: plural(output.cards.length, "output card", "output cards"),
      detail: parts(...output.cards.map((card) => titleOf(card.name, card.display))),
    });
  }

  const shortcuts = countShortcuts(config);
  if (shortcuts > 0) {
    out.push({
      group: "writes",
      count: shortcuts,
      label: plural(shortcuts, "keyboard shortcut", "keyboard shortcuts"),
    });
  }

  const appTitle = config.ui?.appTitle;
  if (typeof appTitle === "string") {
    out.push({ group: "also", label: "Window title", detail: appTitle });
  } else if (appTitle) {
    out.push({ group: "also", label: "Window title", detail: `follows “${appTitle.field}”` });
  }

  out.push({
    group: "also",
    label: config.network.updateChecks ? "Update checks allowed" : "Update checks disabled",
    detail: config.network.updateChecks
      ? undefined
      : "this config forbids all network, and nothing can override it",
  });

  return out;
}
