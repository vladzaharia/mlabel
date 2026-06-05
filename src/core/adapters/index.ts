import { AdapterRegistry } from "./registry";
import { csvSinkAdapter, csvSourceAdapter } from "./csv";

export * from "./interfaces";
export { AdapterRegistry } from "./registry";

/** Build a registry with all built-in adapters registered. */
export function createDefaultRegistry(): AdapterRegistry {
  return new AdapterRegistry().registerSource(csvSourceAdapter).registerSink(csvSinkAdapter);
}
