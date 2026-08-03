/**
 * SPIKE (Option 3) — a decoder output model shaped after ERC-7730's field
 * formatting vocabulary, with the app's own security layers kept alongside.
 *
 * The idea: instead of each decoder hand-building an `explanation` string, it
 * emits a structured list of fields, each tagged with a 7730 `format` (unit,
 * enum, tokenAmount, addressName, raw). One renderer then turns any field into
 * display text — so rendering is uniform, and the same structure can be emitted
 * as an ERC-7730 descriptor for upstream contribution.
 *
 * What deliberately does NOT come from 7730, because 7730 cannot express it and
 * it is the app's security value: `warnings` and `riskLevel`. They ride
 * alongside the fields rather than inside them.
 *
 * This is exploratory. It reshapes ONE decoder (SPBEAM) to evaluate the fit; it
 * does not change the shipped decoder interface.
 */

/** Subset of ERC-7730 field format names this spike implements. */
export type FieldFormat = 'raw' | 'unit' | 'enum' | 'tokenAmount' | 'addressName';

export interface FieldFormatParams {
  /** unit: appended symbol, e.g. "%" */
  base?: string;
  /** unit / tokenAmount: value is divided by 10^decimals for display */
  decimals?: number;
  /** enum: maps a raw value (as a lowercase string) to a human label */
  ref?: Record<string, string>;
  /** tokenAmount: ticker appended after the scaled amount */
  ticker?: string;
}

export interface ClearField {
  label: string;
  format: FieldFormat;
  /** The exact decoded value (ground truth). Always available to the renderer. */
  value: unknown;
  params?: FieldFormatParams;
}

export interface ClearModel {
  /** Fixed action verb, e.g. "Set rate parameters". No interpolation (7730 limit). */
  intent: string;
  fields: ClearField[];
  /** App layer — NOT expressible in ERC-7730. */
  warnings?: string[];
  /** App layer — NOT expressible in ERC-7730. */
  riskLevel?: 'none' | 'low' | 'medium' | 'high';
}

/** Scale a bigint-ish value by 10^decimals, preserving the fractional part. */
function scale(value: bigint, decimals: number): string {
  if (decimals <= 0) return value.toString();
  const denom = 10n ** BigInt(decimals);
  const whole = value / denom;
  const frac = (value % denom).toString().padStart(decimals, '0');
  return `${whole.toString()}.${frac}`;
}

/**
 * Render one field to display text by applying its ERC-7730 format. This is the
 * single renderer that would replace every decoder's bespoke string-building.
 */
export function renderField(field: ClearField): string {
  const { format, value, params } = field;
  switch (format) {
    case 'unit': {
      const v = typeof value === 'bigint' ? value : BigInt(String(value));
      return `${scale(v, params?.decimals ?? 0)}${params?.base ?? ''}`;
    }
    case 'enum': {
      const key = String(value).toLowerCase();
      return params?.ref?.[key] ?? String(value);
    }
    case 'tokenAmount': {
      const v = typeof value === 'bigint' ? value : BigInt(String(value));
      return `${scale(v, params?.decimals ?? 0)}${params?.ticker ? ` ${params.ticker}` : ''}`;
    }
    case 'addressName':
    case 'raw':
    default:
      return String(value);
  }
}

/** Render every field to a `label: text` line. */
export function renderModel(model: ClearModel): string[] {
  return model.fields.map(f => `${f.label}: ${renderField(f)}`);
}
