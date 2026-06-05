import type { AdapterManifest, OutputColumn, SinkAdapter } from "../interfaces";
import type { LabeledRecord } from "../../types/labeling";
import { coercedToCell, serializeRow } from "./internal/format";
import { CSV_ADAPTER_ID } from "./internal/provenance";

interface CsvSinkConfig {
  delimiter?: string;
  newline?: string;
}

const manifest: AdapterManifest = {
  id: CSV_ADAPTER_ID,
  label: "CSV",
  extensions: [".csv"],
};

class CsvSinkAdapter implements SinkAdapter {
  readonly manifest = manifest;

  serialize(
    records: readonly LabeledRecord[],
    columns: readonly OutputColumn[],
    adapterConfig?: unknown,
  ): string {
    const cfg = (adapterConfig as CsvSinkConfig | undefined) ?? {};
    const delimiter = cfg.delimiter ?? ",";
    const newline = cfg.newline ?? "\n";
    const names = columns.map((c) => c.name);

    const lines = [serializeRow(names, delimiter)];
    for (const record of records) {
      const cells = names.map((name) => coercedToCell(record.labelValues[name]));
      lines.push(serializeRow(cells, delimiter));
    }
    return lines.join(newline) + newline;
  }
}

export const csvSinkAdapter: SinkAdapter = new CsvSinkAdapter();
