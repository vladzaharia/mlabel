import type { CoercedValue } from "../../../types/values";

/** CSV-specific formatting helpers. Private to the CSV adapter. */

export const CSV_BOM = "﻿";

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function detectNewline(text: string): "\r\n" | "\n" | "\r" {
  const crlf = text.indexOf("\r\n");
  if (crlf !== -1) return "\r\n";
  const lf = text.indexOf("\n");
  const cr = text.indexOf("\r");
  if (cr !== -1 && (lf === -1 || cr < lf)) return "\r";
  return "\n";
}

/** Serialize one cell, quoting when it contains the delimiter, quotes, or newlines. */
export function serializeCell(value: string, delimiter: string): string {
  const needsQuote =
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r");
  if (!needsQuote) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

export function serializeRow(cells: readonly string[], delimiter: string): string {
  return cells.map((c) => serializeCell(c, delimiter)).join(delimiter);
}

/** Render a coerced output value to a canonical CSV cell string. */
export function coercedToCell(value: CoercedValue | undefined): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  // arrays / objects → JSON
  return JSON.stringify(value);
}
