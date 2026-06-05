import type { SinkAdapter, SourceAdapter } from "./interfaces";

/**
 * Registry of source/sink adapters, selected by the config's `adapterId` (with
 * extension-based auto-detection as a fallback). The core depends only on the
 * adapter interfaces; concrete adapters register themselves here.
 */
export class AdapterRegistry {
  private readonly sources = new Map<string, SourceAdapter>();
  private readonly sinks = new Map<string, SinkAdapter>();

  registerSource(adapter: SourceAdapter): this {
    this.sources.set(adapter.manifest.id, adapter);
    return this;
  }

  registerSink(adapter: SinkAdapter): this {
    this.sinks.set(adapter.manifest.id, adapter);
    return this;
  }

  source(id: string): SourceAdapter {
    const adapter = this.sources.get(id);
    if (!adapter) throw new Error(`No source adapter registered for id "${id}".`);
    return adapter;
  }

  sink(id: string): SinkAdapter {
    const adapter = this.sinks.get(id);
    if (!adapter) throw new Error(`No sink adapter registered for id "${id}".`);
    return adapter;
  }

  sourceForExtension(ext: string): SourceAdapter | undefined {
    const needle = ext.toLowerCase();
    for (const adapter of this.sources.values()) {
      if (adapter.manifest.extensions.includes(needle)) return adapter;
    }
    return undefined;
  }
}
