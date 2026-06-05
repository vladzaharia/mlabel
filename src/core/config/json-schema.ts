import { z } from "zod";
import { AppConfig } from "./schema";

/**
 * Emit a JSON Schema for the config so editors can offer autocomplete and
 * validation while authoring the `.jsonc`. Uses the author-facing ("input")
 * view so optional/defaulted fields are not marked required.
 */
export function buildConfigJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(AppConfig, {
    target: "draft-7",
    io: "input",
    unrepresentable: "any",
  }) as Record<string, unknown>;
}
