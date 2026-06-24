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
import { DECIMAL_PRESETS, formatUnitsLoose, isNumericSolidityType, toBigIntLoose } from '@shield3/sky-safe-core';
import { Address } from './Address';

interface ParamValueProps {
  type: string;
  value: unknown;
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

export function ParamValue({ type, value }: ParamValueProps) {
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
    return <UintValue value={value} />;
  }

  const display = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
  return <span className="font-mono break-all">{display}</span>;
}

/**
 * Raw uint/int value with an always-visible decimals picker: the raw integer
 * (the ground truth that matches the signed data) alongside a row of scale
 * chips. Choosing one renders an additional `= <scaled>` view; the raw value is
 * never replaced.
 */
function UintValue({ value }: { value: unknown }) {
  const raw = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const [mode, setMode] = useState('raw'); // 'raw' | '<decimals>' | 'custom'
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
        {DECIMAL_PRESETS.map((p) => (
          <Chip
            key={p.decimals}
            label={`1e${p.decimals}`}
            title={p.label}
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
