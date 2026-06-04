/**
 * Renders a decoded-parameter value. If the parameter type is `address`,
 * routes through <Address> so the value picks up Safe / built-in / address-book
 * treatment. address[] values are split and each rendered as an <Address>.
 *
 * Anything else falls through to the same monospace block we had before.
 *
 * No safeAddress prop needed — <Address> reads from SafeRouteProvider context
 * (with an optional prop override if a caller ever needs to render an address
 * relative to a different Safe).
 */

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

  const display = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
  return <span className="font-mono break-all">{display}</span>;
}
