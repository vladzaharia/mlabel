import type { ProvenanceToken } from "../../../types/source";

/** Document-level CSV info, shared by reference across all of a parse's records. */
export interface CsvDocMeta {
  headerCells: string[];
  delimiter: string;
  newline: string;
}

/** Per-record CSV provenance: the original cells + a shared pointer to doc meta. */
export interface CsvRowProvenance {
  cells: string[];
  doc: CsvDocMeta;
}

export const CSV_ADAPTER_ID = "csv";

export function makeProvenance(
  cells: string[],
  doc: CsvDocMeta,
): ProvenanceToken<CsvRowProvenance> {
  return { __adapter: CSV_ADAPTER_ID, __raw: { cells, doc } };
}

export function readProvenance(token: ProvenanceToken): CsvRowProvenance {
  if (token.__adapter !== CSV_ADAPTER_ID) {
    throw new Error(`Expected CSV provenance, got "${token.__adapter}".`);
  }
  return token.__raw as CsvRowProvenance;
}
