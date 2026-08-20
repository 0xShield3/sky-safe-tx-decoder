/**
 * Utilities for verifying Safe API decoded data against raw transaction data
 *
 * This ensures we don't blindly trust the API's decoded data - we verify it
 * by re-encoding and comparing to the raw data.
 */

import { encodeFunctionData, parseAbiParameters, type AbiParameter, type Hex } from 'viem';
import type { SafeApiDataDecoded } from '../types.js';
import { classifyReencode, trailingDataWarning } from './reencode.js';

/**
 * Outcome of a verification attempt.
 *
 * `mismatch` and `unverifiable` are deliberately distinct. "We re-encoded the
 * decoded parameters and got different bytes than you are about to sign" is a
 * stop-signing signal. "We had nothing to check against, or could not run the
 * check" is not. Collapsing them into a single `verified: false` made the UI
 * raise a red mismatch banner on transactions that were fine, which trains
 * signers to ignore the banner that matters.
 */
export type DecodeVerificationStatus = 'verified' | 'trailing-data' | 'mismatch' | 'unverifiable';

/**
 * Result of verifying decoded data
 */
export interface DecodeVerificationResult {
  /**
   * True only when re-encoding reproduced the raw data EXACTLY.
   *
   * Deliberately stays false for `trailing-data`. Callers that gate on this
   * boolean keep their existing conservative behaviour, and only code that
   * handles the new status explicitly treats trailing bytes differently.
   */
  verified: boolean;
  /** Which outcome occurred — see DecodeVerificationStatus */
  status: DecodeVerificationStatus;
  /** Error message if verification did not succeed */
  error?: string;
  /** Re-encoded data (for debugging) */
  reencoded?: Hex;
  /** Set only for `trailing-data` — the bytes past the end of the arguments. */
  trailingData?: Hex;
  /** Set only for `trailing-data` — how many bytes those are. */
  trailingBytes?: number;
}

/** Matches an array type and captures the element type, e.g. `uint256[3]` */
const ARRAY_TYPE = /^(.*)\[\d*\]$/;

/**
 * Whether a Safe API decoding is the service's "could not decode" sentinel.
 *
 * When the Safe Transaction Service has no ABI entry for a call's selector, it
 * does not return null — it returns `{ method: "fallback", parameters: [] }`,
 * as if the call hit the contract's fallback function. That is almost never a
 * faithful decoding: the calldata carries a real 4-byte selector and often
 * arguments (e.g. Aave `supply(...)` decoded as `fallback`).
 *
 * Treating it as a real decoding is misleading both ways: re-encoding
 * `fallback()` to just the selector flags a red mismatch on a call that has
 * arguments, and a zero-argument call whose data IS just its selector would
 * "verify" as `fallback`, hiding the real function. Callers should treat this
 * as "not decoded" and fall through to their undecodable handling instead.
 */
export function isApiFallbackSentinel(decoded: SafeApiDataDecoded | null | undefined): boolean {
  return !!decoded && decoded.method === 'fallback' && (decoded.parameters?.length ?? 0) === 0;
}

/**
 * Coerce a Safe API parameter value into what viem's encoder expects.
 *
 * The Safe API returns every leaf as a string (or an array/nested array of
 * strings for arrays and tuples), so integers arrive as `"1000"` rather than
 * `1000n`. Walk the parsed ABI parameter alongside the value so array, tuple,
 * and nested-tuple shapes are coerced element by element.
 *
 * Array types are checked BEFORE the integer prefix check: `uint256[]` starts
 * with `uint`, and treating it as a scalar meant calling BigInt() on an array,
 * which throws and reported a good transaction as unverified.
 */
function coerceValue(param: AbiParameter, value: unknown): unknown {
  const arrayMatch = ARRAY_TYPE.exec(param.type);
  if (arrayMatch) {
    const element = { ...param, type: arrayMatch[1]! } as AbiParameter;
    return toArray(value).map((item) => coerceValue(element, item));
  }

  if (param.type === 'tuple') {
    // viem accepts a tuple as a positional array, which is the shape the Safe
    // API uses. Coerce component-wise so nested integers become BigInt.
    const components = (param as { components?: readonly AbiParameter[] }).components ?? [];
    const items = toArray(value);
    return components.map((component, i) => coerceValue(component, items[i]));
  }

  if (param.type.startsWith('uint') || param.type.startsWith('int')) {
    return typeof value === 'bigint' ? value : BigInt(String(value).trim());
  }

  if (param.type === 'bool') {
    return String(value).toLowerCase() === 'true';
  }

  // address, string, bytes, bytesN — pass through as the API gave them
  return value;
}

/**
 * Normalise a value into an array. The Safe API usually returns arrays as real
 * JSON arrays, but has historically returned them as JSON-encoded or
 * comma-separated strings, so handle those too.
 */
function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Not JSON — fall through to comma-splitting
    }
    return value.split(',').map((s) => s.trim());
  }
  return [value];
}

/**
 * Verify that Safe API's decoded data matches the raw transaction data
 *
 * @param rawData - Raw transaction data (0x...)
 * @param decoded - Decoded data from Safe API
 * @returns Verification result
 *
 * @example
 * const result = verifyDecodedData(tx.data, tx.dataDecoded);
 * if (result.verified) {
 *   console.log('✅ Decoded data verified');
 * } else {
 *   console.warn('⚠️ Decoded data mismatch:', result.error);
 * }
 */
export function verifyDecodedData(rawData: Hex | null, decoded: SafeApiDataDecoded | null): DecodeVerificationResult {
  // If no decoded data provided, we can't verify
  if (!decoded) {
    return {
      verified: false,
      status: 'unverifiable',
      error: 'No decoded data provided',
    };
  }

  // If no raw data, can't verify
  if (!rawData || rawData === '0x') {
    return {
      verified: false,
      status: 'unverifiable',
      error: 'No raw data to verify against',
    };
  }

  try {
    // Extract function selector (first 4 bytes = 8 hex chars + 0x)
    const functionSelector = rawData.slice(0, 10) as Hex;

    // Build ABI from decoded data
    const parameters = decoded.parameters.map((param) => ({
      name: param.name,
      type: param.type,
    }));

    // If no parameters, just check if selector matches a zero-param function
    if (parameters.length === 0) {
      // For zero-parameter functions, raw data should just be the selector
      const verified = rawData === functionSelector;
      return {
        verified,
        status: verified ? 'verified' : 'mismatch',
        error: verified ? undefined : 'Raw data has extra bytes beyond function selector',
        reencoded: functionSelector,
      };
    }

    // Parse each parameter's type INDEPENDENTLY, and never parse its name.
    //
    // Both fields come from the Safe API, which this tool treats as untrusted.
    // Concatenating them into one string and parsing that let a hostile value
    // inject additional parameters: a name of `amount, bool force` turns a
    // two-parameter list into a three-parameter one. The extra parameter is
    // encoded but never displayed, so calldata for a different function could
    // re-encode exactly and earn a green "Verified" badge while the signer was
    // shown a decoding missing a parameter.
    //
    // Parsing one type at a time and requiring exactly one parameter out of it
    // makes that impossible: a parameter can describe itself, and nothing else.
    // Names do not affect ABI encoding, so they are not parsed at all.
    //
    // The Safe API emits tuples as flattened canonical signatures —
    // `(bytes32,uint256)[]` — which is already viem's human-readable ABI
    // format, so legitimate structs still parse to a single parameter.
    const abiParameters: AbiParameter[] = [];
    for (const param of decoded.parameters) {
      const parsed = parseAbiParameters(param.type);
      if (parsed.length !== 1) {
        return {
          verified: false,
          status: 'mismatch',
          error:
            `Parameter "${param.name}" declares the type "${param.type}", which expands to ` +
            `${parsed.length} parameters rather than one. The decoded data does not faithfully ` +
            `describe the raw data.`,
        };
      }
      // Deliberately drop the API-supplied name — it is inert for encoding and
      // must not reach the parser.
      abiParameters.push(parsed[0]!);
    }

    // Convert parameter values to the types viem's encoder expects, walking the
    // parsed ABI so arrays, tuples, and nested tuples coerce element-wise.
    const args = abiParameters.map((abiParam, i) => coerceValue(abiParam, decoded.parameters[i]?.value));

    // Re-encode the function call
    const reencoded = encodeFunctionData({
      abi: [
        {
          name: decoded.method,
          type: 'function',
          inputs: abiParameters,
        },
      ],
      functionName: decoded.method,
      args,
    });

    // Compare re-encoded data with raw data
    const verdict = classifyReencode(rawData as Hex, reencoded);

    if (verdict.kind === 'trailing') {
      return {
        verified: false,
        status: 'trailing-data',
        error: trailingDataWarning(verdict),
        reencoded,
        trailingData: verdict.trailing,
        trailingBytes: verdict.extraBytes,
      };
    }

    const verified = verdict.kind === 'exact';

    return {
      verified,
      status: verified ? 'verified' : 'mismatch',
      error: verified ? undefined : 'Re-encoded data does not match raw data',
      reencoded,
    };
  } catch (error) {
    // We could not run the check (unsupported type, malformed value). This is
    // NOT evidence of a mismatch, so it must not be reported as one.
    return {
      verified: false,
      status: 'unverifiable',
      error: `Could not verify: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Verify multiple nested transactions (e.g., from MultiSend)
 *
 * @param nestedTxs - Array of nested transactions with raw data and decoded data
 * @returns Array of verification results
 */
export function verifyNestedTransactions(
  nestedTxs: Array<{ data: Hex; decoded: SafeApiDataDecoded | null }>
): DecodeVerificationResult[] {
  return nestedTxs.map((tx) => verifyDecodedData(tx.data, tx.decoded));
}
