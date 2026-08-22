import {
  findNodeAtLocation,
  parse as parseJsonc,
  parseTree,
  printParseErrorCode,
  type Node,
  type ParseError,
  type ParseOptions,
} from "jsonc-parser";
import { z } from "zod";
import { AppConfig, CONFIG_VERSION } from "./schema";

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

/** Shared by the value parse and the tree parse — they must agree or offsets drift. */
const JSONC_OPTIONS: ParseOptions = { allowTrailingComma: true, disallowComments: false };

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
 * Find where `path` lives in the source.
 *
 * Degrades to the nearest ancestor that does exist: cross-field checks can name
 * a path with no corresponding node (an index past the end of an array, say),
 * and a roughly-right line beats no line at all.
 */
function locate(
  root: Node | undefined,
  path: (string | number)[],
  text: string,
): { line?: number; column?: number } {
  if (!root) return {};
  for (let depth = path.length; depth >= 0; depth--) {
    const node = findNodeAtLocation(root, path.slice(0, depth));
    if (node) return offsetToLineCol(text, node.offset);
  }
  return {};
}

/** The `"key"` token inside `parent`, so an unknown-key error points at the typo. */
function locateKey(
  root: Node | undefined,
  parentPath: (string | number)[],
  key: string,
  text: string,
): { line?: number; column?: number } {
  const parent = root && findNodeAtLocation(root, parentPath);
  if (parent?.type === "object") {
    const keyNode = parent.children?.find((prop) => prop.children?.[0]?.value === key)
      ?.children?.[0];
    if (keyNode) return offsetToLineCol(text, keyNode.offset);
  }
  return locate(root, [...parentPath, key], text);
}

const dotted = (path: (string | number)[]): string | undefined =>
  path.length > 0 ? path.map(String).join(".") : undefined;

/**
 * Turn Zod issues into author-facing ones, anchored to the source.
 *
 * Unrecognized keys get special handling: Zod reports them against the *parent*
 * object with the offending names in `issue.keys`, so reporting them verbatim
 * points at `"network": {` rather than at the misspelling several lines below.
 * Fanning them out one-per-key gives each its own precise location.
 */
export function issuesFromZod(error: z.ZodError, text = "", root?: Node): ConfigIssue[] {
  return error.issues.flatMap((issue): ConfigIssue[] => {
    const path = issue.path.map((p) => (typeof p === "symbol" ? String(p) : p));

    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) => ({
        path: dotted([...path, key]),
        message: `Unrecognized key: "${key}"`,
        ...locateKey(root, path, key, text),
      }));
    }

    return [{ path: dotted(path), message: issue.message, ...locate(root, path, text) }];
  });
}

/**
 * Expand `"display": "Some title"` into `{ title: "Some title" }`.
 *
 * Done here rather than as a Zod `.transform()` because a transform would make
 * the schema's input and output types differ, which the recursive
 * `z.ZodType<S, S>` annotations in `value-type.ts` can't express — and it would
 * leave every consumer handling two shapes.
 *
 * `adapterConfig` is skipped: it is adapter-owned and the core must not
 * reinterpret anything inside it.
 */
function normalizeDisplayShorthand(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeDisplayShorthand);
  if (value === null || typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "adapterConfig") out[key] = child;
    else if (key === "display" && typeof child === "string") out[key] = { title: child };
    else out[key] = normalizeDisplayShorthand(child);
  }
  return out;
}

/**
 * Check the version before anything else.
 *
 * A v1 config measured 9 issues against the v2 schema, with the real cause —
 * "this is the old shape" — buried among eight consequences. One clear sentence
 * beats nine accurate ones.
 */
const VersionGate = z.looseObject({
  version: z.literal(CONFIG_VERSION, {
    error: (iss) =>
      iss.input === undefined
        ? `This config has no \`version\`. MLabel 0.3 and later require "version": ${String(CONFIG_VERSION)} and a rewritten schema.`
        : `Unsupported config version ${JSON.stringify(iss.input)}. This build reads version ${String(CONFIG_VERSION)}.`,
  }),
});

/**
 * Parse and validate a `.jsonc` config string:
 *   1. `jsonc-parser` for syntax (comments + trailing commas) with byte offsets.
 *   2. A version gate, so an old config gets one clear message.
 *   3. Zod for semantics, with dotted paths and human-readable messages.
 *
 * The syntax tree is kept around for stage 3 so schema errors carry a line and
 * column too — without it, only syntax errors were ever locatable.
 */
export function loadConfig(text: string): LoadConfigResult {
  const parseErrors: ParseError[] = [];
  const raw: unknown = parseJsonc(text, parseErrors, JSONC_OPTIONS);

  if (parseErrors.length > 0) {
    return {
      ok: false,
      issues: parseErrors.map((e) => {
        const { line, column } = offsetToLineCol(text, e.offset);
        return { message: `JSONC syntax error: ${printParseErrorCode(e.error)}`, line, column };
      }),
    };
  }

  const tree = parseTree(text, [], JSONC_OPTIONS);

  const version = VersionGate.safeParse(raw);
  if (!version.success) return { ok: false, issues: issuesFromZod(version.error, text, tree) };

  const result = AppConfig.safeParse(normalizeDisplayShorthand(raw));
  if (!result.success) return { ok: false, issues: issuesFromZod(result.error, text, tree) };
  return { ok: true, config: result.data };
}
