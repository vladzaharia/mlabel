/**
 * Canonical coerced value shape used across the core and the UI. Adapters hand
 * the core raw primitives; the core coerces them per the declared `ValueType`
 * into these values, which the renderer's formatter registry then displays.
 */
export type CoercedValue =
  | string
  | number
  | boolean
  | Date
  | null
  | CoercedValue[]
  | { [key: string]: CoercedValue };
