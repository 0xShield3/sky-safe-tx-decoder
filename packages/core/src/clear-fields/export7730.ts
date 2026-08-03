/**
 * SPIKE (Option 3) — emit an ERC-7730 calldata descriptor from the structured
 * field model, to show the same internal model can be contributed upstream so
 * Ledger and other wallets clear-sign these contracts.
 *
 * This produces the descriptor SHAPE for evaluation. It intentionally covers
 * only what maps cleanly; see the notes in the SPBEAM spike test for what does
 * not (conditional prose, warnings, risk — none of which 7730 carries).
 */

/** A single 7730 field spec inside display.formats[signature].fields. */
export interface Erc7730FieldSpec {
  path: string;
  label: string;
  format: string;
  params?: Record<string, unknown>;
}

export interface Erc7730Descriptor {
  $schema: string;
  context: { contract: { deployments: Array<{ chainId: number; address: string }>; abi?: unknown } };
  metadata: { owner: string };
  display: {
    formats: Record<string, { intent: string; fields: Erc7730FieldSpec[] }>;
  };
}

/**
 * Build a minimal ERC-7730 calldata descriptor.
 *
 * @param owner        display owner (e.g. "Sky")
 * @param chainId      deployment chain
 * @param address      contract address
 * @param signature    canonical function signature, the display.formats key
 * @param intent       fixed action verb
 * @param fields       7730 field specs (path + label + format + params)
 */
export function buildErc7730Descriptor(opts: {
  owner: string;
  chainId: number;
  address: string;
  signature: string;
  intent: string;
  fields: Erc7730FieldSpec[];
}): Erc7730Descriptor {
  return {
    $schema:
      'https://github.com/LedgerHQ/clear-signing-erc7730-registry/raw/master/specs/erc7730-v1.schema.json',
    context: { contract: { deployments: [{ chainId: opts.chainId, address: opts.address }] } },
    metadata: { owner: opts.owner },
    display: {
      formats: {
        [opts.signature]: { intent: opts.intent, fields: opts.fields },
      },
    },
  };
}
