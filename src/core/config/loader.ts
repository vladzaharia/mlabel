import { parse as parseJsonc, printParseErrorCode, type ParseError } from "jsonc-parser";
import { z } from "zod";
import { AppConfig } from "./schema";

export interface ConfigIssue {
  /** Dotted path to the offending node, when known. */
  path?: string;
  message: string;
  line?: number;
  column?: number;
}

export type LoadConfigResult =
  | { ok: true; config: AppConfig }
  | { ok: false; issues: ConfigIssue[] };

function offsetToLineCol(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      lastNewline = i;
    }
  }
  return { line, column: offset - lastNewline };
}

/**
 * Parse and validate a `.jsonc` config string in two stages:
 *   1. `jsonc-parser` for syntax (comments + trailing commas) with byte offsets.
 *   2. Zod for semantics, with dotted paths and human-readable messages.
 */
export function loadConfig(text: string): LoadConfigResult {
  const parseErrors: ParseError[] = [];
  const data: unknown = parseJsonc(text, parseErrors, {
    allowTrailingComma: true,
    disallowComments: false,
  });

  if (parseErrors.length > 0) {
    return {
      ok: false,
      issues: parseErrors.map((e) => {
        const { line, column } = offsetToLineCol(text, e.offset);
        return { message: `JSONC syntax error: ${printParseErrorCode(e.error)}`, line, column };
      }),
    };
  }

  const result = AppConfig.safeParse(data);
  if (!result.success) {
    return { ok: false, issues: issuesFromZod(result.error) };
  }
  return { ok: true, config: result.data };
}

export function issuesFromZod(error: z.ZodError): ConfigIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.map(String).join(".") : undefined,
    message: issue.message,
  }));
}
