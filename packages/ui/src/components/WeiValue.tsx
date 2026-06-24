/**
 * Native value display: the raw wei integer (ground truth) plus, when nonzero,
 * the equivalent in ETH. Native value is always 18 decimals, so unlike token
 * amounts there's no ambiguity — we can show the ETH conversion automatically.
 * The raw wei value is never replaced.
 */

import { formatUnitsLoose, toBigIntLoose } from '@shield3/sky-safe-core';

export function WeiValue({ value }: { value: unknown }) {
  const raw = String(value);
  let eth: string | null = null;
  try {
    const v = toBigIntLoose(raw);
    if (v !== 0n) eth = formatUnitsLoose(v, 18, { group: true });
  } catch {
    eth = null;
  }
  return (
    <>
      <span className="font-mono break-all">{raw}</span> wei
      {eth !== null && <span className="text-gray-600"> (= {eth} ETH)</span>}
    </>
  );
}
