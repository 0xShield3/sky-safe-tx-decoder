/**
 * Renders a decoded-parameter value. If the parameter type is `address`,
 * routes through <Address> so the value picks up Safe / built-in / address-book
 * treatment. address[] values are split and each rendered as an <Address>.
 *
 * Numeric scalars (uint / int) render the raw integer (the ground truth that
 * matches the signed data) plus an inline decimals picker that shows an
 * ADDITIONAL scaled view — see <UintValue>. The raw value is never replaced.
 *
 * Anything else falls through to the same monospace block we had before.
 *
 * No safeAddress prop needed — <Address> reads from SafeRouteProvider context
 * (with an optional prop override if a caller ever needs to render an address
 * relative to a different Safe).
 */

import { useState } from 'react';
import {
  DECIMAL_PRESETS,
  formatUnitsLoose,
  getAmountDecimalsHint,
  isNumericSolidityType,
  toBigIntLoose,
} from '@shield3/sky-safe-core';
import { Address } from './Address';

/**
 * Enough context to decide whether this parameter is a token amount, and in
 * which token's decimals. Omitted where the call target or signature is not
 * known, in which case the picker starts on `raw` exactly as before.
 */
export interface AmountContext {
  network: string;
  /** The address this call is made to. */
  to: string;
  /** Canonical signature of the decoded function. */
  signature: string;
  /** Index of this parameter within the function's inputs. */
  paramIndex: number;
}

interface ParamValueProps {
  type: string;
  value: unknown;
  amount?: AmountContext;
}

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

function tryParseAddressArray(raw: unknown): string[] | null {
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === 'string');
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is string => typeof v === 'string');
      }
    } catch {
      // Fall through to comma-split
    }
    return raw.split(',').map((s) => s.trim());
  }
  return null;
}

export function ParamValue({ type, value, amount }: ParamValueProps) {
  const normalizedType = (type || '').toLowerCase();

  if (normalizedType === 'address' && typeof value === 'string' && ADDRESS_PATTERN.test(value.trim())) {
    return <Address address={value.trim()} />;
  }

  if (normalizedType.startsWith('address[')) {
    const items = tryParseAddressArray(value);
    if (items && items.length > 0 && items.every((s) => ADDRESS_PATTERN.test(s))) {
      return (
        <span className="space-y-1 block">
          [
          {items.map((addr, i) => (
            <span key={i} className="block ml-4">
              <Address address={addr} />
              {i < items.length - 1 ? ',' : ''}
            </span>
          ))}
          ]
        </span>
      );
    }
  }

  if (isNumericSolidityType(normalizedType)) {
    // A known token's decimals, when this parameter is that token's amount.
    // Null for everything else, which leaves the picker on `raw`.
    const hint = amount
      ? getAmountDecimalsHint({
          network: amount.network,
          to: amount.to,
          signature: amount.signature,
          paramIndex: amount.paramIndex,
          paramType: normalizedType,
        })
      : null;
    return <UintValue value={value} defaultDecimals={hint} />;
  }

  const display = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
  return <span className="font-mono break-all">{display}</span>;
}

/**
 * Raw uint/int value with an always-visible decimals picker: the raw integer
 * (the ground truth that matches the signed data) alongside a row of scale
 * chips. Choosing one renders an additional `= <scaled>` view; the raw value is
 * never replaced.
 *
 * `defaultDecimals` preselects a scale when the call is a known token's amount.
 * It changes only which chip starts active — every chip, including `raw`,
 * remains available, and the raw integer is rendered either way. When the
 * preselected scale is not one of the presets it is offered as an extra chip so
 * the selection is always visible and reversible.
 */
function UintValue({ value, defaultDecimals }: { value: unknown; defaultDecimals?: number | null }) {
  const raw = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const [mode, setMode] = useState(
    typeof defaultDecimals === 'number' ? String(defaultDecimals) : 'raw'
  ); // 'raw' | '<decimals>' | 'custom'
  const [custom, setCustom] = useState('18');

  // If the value doesn't coerce to an integer, don't offer scaling — just show
  // it as-is rather than risk a misleading number.
  let coercible = true;
  try {
    toBigIntLoose(raw);
  } catch {
    coercible = false;
  }
  if (!coercible) {
    return <span className="font-mono break-all">{raw}</span>;
  }

  let decimals: number | null = null;
  if (mode === 'custom') {
    const n = parseInt(custom, 10);
    decimals = Number.isFinite(n) && n >= 0 && n <= 77 ? n : null;
  } else if (mode !== 'raw') {
    decimals = parseInt(mode, 10);
  }

  // Offer the preselected scale as a chip when it is not already a preset, so
  // the active selection is always visible and can be switched off.
  const presets =
    typeof defaultDecimals === 'number' && !DECIMAL_PRESETS.some((p) => p.decimals === defaultDecimals)
      ? [...DECIMAL_PRESETS, { decimals: defaultDecimals, label: `1e${defaultDecimals}` }].sort(
          (a, b) => a.decimals - b.decimals
        )
      : DECIMAL_PRESETS;

  let scaled: string | null = null;
  if (decimals !== null) {
    try {
      scaled = formatUnitsLoose(raw, decimals, { group: true });
    } catch {
      scaled = null;
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-mono break-all">{raw}</span>

      <span className="inline-flex flex-wrap items-center gap-1">
        <Chip label="raw" active={mode === 'raw'} onClick={() => setMode('raw')} />
        {presets.map((p) => (
          <Chip
            key={p.decimals}
            label={`1e${p.decimals}`}
            title={
              p.decimals === defaultDecimals
                ? `${p.label} — preselected because this call is to a known token with ${p.decimals} decimals. The raw value is unchanged.`
                : p.label
            }
            active={mode === String(p.decimals)}
            onClick={() => setMode(String(p.decimals))}
          />
        ))}
        <Chip label="custom" active={mode === 'custom'} onClick={() => setMode('custom')} />
        {mode === 'custom' && (
          <input
            type="number"
            min={0}
            max={77}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="w-14 text-xs border border-gray-300 rounded px-1 py-0.5"
            aria-label="Custom decimals"
          />
        )}
      </span>

      {scaled !== null && <span className="font-mono text-gray-700">= {scaled}</span>}
    </span>
  );
}

function Chip({
  label,
  title,
  active,
  onClick,
}: {
  label: string;
  title?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`text-xs px-1.5 py-0.5 rounded border ${
        active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  );
}
