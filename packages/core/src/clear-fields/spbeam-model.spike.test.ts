/**
 * SPIKE (Option 3) — express SPBEAM's `set` decode as a 7730-aligned field
 * model, and evaluate the fit against the real thing.
 *
 * This test is the decision aid. It shows, on SPBEAM's real mainnet calldata:
 *   1. the structured model (intent + typed fields),
 *   2. that the single renderer reproduces "ETH-A" and "9.50%" from FORMAT
 *      specs, not hand-built strings,
 *   3. that warnings + risk survive alongside (7730 cannot carry them),
 *   4. that the same model exports to an ERC-7730 descriptor,
 *   5. the two friction points that make the fit imperfect even structurally.
 *
 * Run with: pnpm --filter @shield3/sky-safe-core test spbeam-model
 */

import { describe, it, expect } from 'vitest';
import { parseAbi, decodeFunctionData, type Hex } from 'viem';
import { bytes32ToLabel, bpsToPercent } from '../decoders/sky-common.js';
import { renderModel, renderField, type ClearModel } from './model.js';
import { buildErc7730Descriptor } from './export7730.js';

const SPBEAM = '0x36B072ed8AFE665E3Aa6DaBa79Decbec63752b22';

// Real mainnet calldata: set() with 9 rate updates (Safe nonce 37).
const SET_CALLDATA: Hex =
  '0x474d857f' +
  '0000000000000000000000000000000000000000000000000000000000000020' +
  '0000000000000000000000000000000000000000000000000000000000000009' +
  '4554482d41000000000000000000000000000000000000000000000000000000' +
  '00000000000000000000000000000000000000000000000000000000000003b6' +
  '4554482d42000000000000000000000000000000000000000000000000000000' +
  '00000000000000000000000000000000000000000000000000000000000003e8' +
  '4554482d43000000000000000000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000000000000000000000000039d' +
  '5353520000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000160' +
  '574254432d410000000000000000000000000000000000000000000000000000' +
  '00000000000000000000000000000000000000000000000000000000000005aa' +
  '574254432d420000000000000000000000000000000000000000000000000000' +
  '00000000000000000000000000000000000000000000000000000000000005dc' +
  '574254432d430000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000591' +
  '5753544554482d41000000000000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000000000000000000000000041a' +
  '5753544554482d42000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000401';

const ABI = parseAbi(['function set((bytes32 id, uint256 bps)[] updates)']);

interface ParamChange {
  id: Hex;
  bps: bigint;
}

/**
 * Build the 7730-aligned model for SPBEAM `set`.
 *
 * Modelling choice: each update becomes one field, labelled with the ilk and
 * formatted as a `unit` percentage. The `unit` format fits bps→% perfectly.
 * The ilk label is the friction — see notes at the end.
 */
function spbeamSetModel(updates: readonly ParamChange[]): ClearModel {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const u of updates) {
    const k = u.id.toLowerCase();
    if (seen.has(k)) duplicates.push(u.id);
    seen.add(k);
  }

  return {
    intent: 'Set Sky rate parameters',
    fields: updates.map(u => ({
      // FRICTION 1: the label is computed (bytes32→ASCII). 7730 has no
      // bytes32→ASCII format, so upstream this must become an `enum` with every
      // ilk enumerated, which stops auto-handling ilks added later.
      label: bytes32ToLabel(u.id),
      format: 'unit' as const,
      value: u.bps,
      params: { base: '%', decimals: 2 },
    })),
    // App layers 7730 cannot carry:
    warnings: duplicates.map(d => `id ${d} appears more than once; only the last value applies.`),
    riskLevel: 'medium',
  };
}

describe('SPIKE: SPBEAM as a 7730-aligned field model', () => {
  const { args } = decodeFunctionData({ abi: ABI, data: SET_CALLDATA });
  const updates = args[0] as readonly ParamChange[];
  const model = spbeamSetModel(updates);

  it('the single renderer reproduces the labels and percentages from format specs', () => {
    const lines = renderModel(model);
    // These strings came from the `unit` format + the label, NOT a hand-built
    // explanation. One renderer would serve every decoder.
    expect(lines[0]).toBe('ETH-A: 9.50%');
    expect(lines[3]).toBe('SSR: 3.52%');
    expect(lines[5]).toBe('WBTC-B: 15.00%');

    // Equivalent to the current bespoke computation, proving no info lost here.
    expect(renderField(model.fields[0]!)).toBe(`${bpsToPercent(950n)}`);
  });

  it('keeps warnings and risk alongside — 7730 has no place for them', () => {
    expect(model.riskLevel).toBe('medium');
    expect(model.warnings).toEqual([]); // this batch has no duplicate ids
    // (a duplicate-id batch would populate warnings; the point is the channel
    // exists outside the 7730 field model.)
  });

  it('exports to an ERC-7730 descriptor for upstream contribution', () => {
    const descriptor = buildErc7730Descriptor({
      owner: 'Sky',
      chainId: 1,
      address: SPBEAM,
      signature: 'set((bytes32,uint256)[])',
      intent: 'Set Sky rate parameters',
      fields: [
        // The array form 7730 actually uses: one field spec over updates.[].bps,
        // with the ilk label supplied by an enum over updates.[].id.
        {
          path: 'updates.[].bps',
          label: 'Rate',
          format: 'unit',
          params: { base: '%', decimals: 2 },
        },
      ],
    });

    expect(descriptor.display.formats['set((bytes32,uint256)[])']!.intent).toBe('Set Sky rate parameters');
    expect(descriptor.display.formats['set((bytes32,uint256)[])']!.fields[0]!.format).toBe('unit');
    expect(descriptor.context.contract.deployments[0]!.address).toBe(SPBEAM);
    // A real descriptor would add an `enum` field over updates.[].id referencing
    // an ilks constants file — see FRICTION 1.
  });

  /**
   * FINDINGS (the point of the spike):
   *
   * CLEAN FIT:
   *  - bps → "9.50%" via the `unit` format. Exact. This generalises: every
   *    rate/percentage/decimals value across the decoders uses one format.
   *  - The single renderer removes each decoder's bespoke string-building.
   *  - The model exports to a valid-shaped ERC-7730 descriptor.
   *
   * FRICTION 1 — ilk labels. bytes32→ASCII is not a 7730 format. Internally we
   *  keep computing it (fine). But the EXPORTED descriptor must use `enum` with
   *  every ilk enumerated, which (a) is manual upkeep and (b) stops covering
   *  ilks added after the descriptor is written — a regression vs the current
   *  auto-decode. So the internal model and the exported descriptor diverge
   *  here; they are not the same artifact.
   *
   * FRICTION 2 — no prose, no warnings, no risk. LockstakeEngine's conditional
   *  multi-sentence explanations and every decoder's warnings/riskLevel live
   *  entirely outside 7730. They are preserved as app layers, but that means
   *  "adopt 7730" only ever covers the structural half of what these decoders
   *  produce.
   *
   * CONCLUSION: worthwhile IF upstream contribution is a goal — the internal
   *  model gets more uniform and a descriptor falls out. Not worth the refactor
   *  for internal cleanliness alone, because the two frictions mean it is a
   *  partial, diverging mapping rather than a clean replacement.
   */
});
