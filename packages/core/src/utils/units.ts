/**
 * Decimal-scaling helpers for displaying uint256/int amounts.
 *
 * We deliberately do NOT auto-detect ERC-20 decimals (too heavy, and a wrong
 * guess on a signing tool is dangerous). Instead the UI shows the raw integer
 * — the ground truth that matches what the hardware wallet signs — and offers a
 * decimals picker that renders an ADDITIONAL scaled view. The raw value is never
 * replaced.
 *
 * Math is delegated to viem's formatUnits (already a dependency) so we don't
 * hand-roll BigInt division.
 */

import { formatUnits } from 'viem';

export interface DecimalPreset {
  decimals: number;
  /** Tooltip hint naming tokens at this scale, e.g. "USDC / USDT (6 decimals)". */
  label: string;
}

/**
 * Decimal scales offered as quick chips. Tuned for Sky transactions; anything
 * else goes through the "custom" entry. Labels are tooltip hints naming the
 * tokens at each scale.
 */
export const DECIMAL_PRESETS: DecimalPreset[] = [
  { decimals: 6, label: '1e6 · USDC / USDT' },
  { decimals: 8, label: '1e8 · WBTC' },
  { decimals: 18, label: '1e18 · USDS / SKY / ETH' },
];

/** True for Solidity numeric scalar types (uint, uint256, int128, …). */
export function isNumericSolidityType(type: string): boolean {
  return /^(u?int)(\d*)$/.test(type.trim().toLowerCase());
}

/**
 * Coerce a decoded value into a bigint. Accepts bigint, integer number, and
 * decimal or 0x-hex strings. Throws on anything non-integral so the UI can fall
 * back to the raw string rather than render a misleading value.
 */
export function toBigIntLoose(raw: string | number | bigint): bigint {
  if (typeof raw === 'bigint') return raw;
  if (typeof raw === 'number') {
    if (!Number.isInteger(raw)) throw new Error(`Not an integer: ${raw}`);
    return BigInt(raw);
  }
  const s = raw.trim();
  if (s === '') throw new Error('Empty value');
  return BigInt(s); // handles both decimal and 0x-hex, and a leading '-'
}

/** Insert thousands separators into the integer part of a decimal string. */
function groupIntegerPart(s: string): string {
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const dot = body.indexOf('.');
  const int = dot === -1 ? body : body.slice(0, dot);
  const frac = dot === -1 ? '' : body.slice(dot);
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + grouped + frac;
}

/**
 * Format a raw integer value as a decimal string at the given scale.
 * @param raw     bigint | integer number | decimal/0x-hex string
 * @param decimals number of decimal places to shift by (0 = unchanged)
 * @param options.group add thousands separators to the integer part
 * @throws if `raw` is not an integer value
 */
export function formatUnitsLoose(
  raw: string | number | bigint,
  decimals: number,
  options: { group?: boolean } = {}
): string {
  const out = formatUnits(toBigIntLoose(raw), decimals);
  return options.group ? groupIntegerPart(out) : out;
}
