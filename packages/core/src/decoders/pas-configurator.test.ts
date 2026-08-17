/**
 * Tests for the PAS Configurator decoder.
 *
 * The two `setRateLimit` fixtures carry the **live on-chain values** read from
 * the Grove RateLimits contract 0xE016Ae733A77Ba77E7907aAA749394Fc5e75C0e1 on
 * 2026-08-17 — the only two rate-limit keys set on it at that time. They are
 * the exact configuration a Grove cBEAM signer would be re-setting, which makes
 * them the right shape to test the decimal handling against: one key is
 * denominated in USDS (18 decimals) and the other in USDC (6), and both sit at
 * 5,000,000 tokens with a refill of 5,000,000 per day.
 */

import { describe, it, expect } from 'vitest';
import type { Hex } from 'viem';
import { PASConfiguratorDecoder } from './pas-configurator.js';

const CONFIGURATOR = '0xb7E61Df6CAb0A51E9A5dab1A7DD3f942dDe5b929';
const GROVE_RATE_LIMITS = '0xE016Ae733A77Ba77E7907aAA749394Fc5e75C0e1';

/** setRateLimit(GroveRateLimits, LIMIT_USDS_MINT, 5_000_000e18, 5_000_000e18/day) */
const SET_USDS_MINT: Hex =
  '0x91cc936a' +
  '000000000000000000000000e016ae733a77ba77e7907aaa749394fc5e75c0e1' +
  'cb0537d5e5dba65a8edbac12555995860e5b8e1b70996011edb1ca8173e56d3c' +
  '0000000000000000000000000000000000000000000422ca8b0a00a425000000' +
  '000000000000000000000000000000000000000000000003231cdb3dd2377b42';

/** setRateLimit(GroveRateLimits, LIMIT_USDS_TO_USDC, 5_000_000e6, 5_000_000e6/day) */
const SET_USDS_TO_USDC: Hex =
  '0x91cc936a' +
  '000000000000000000000000e016ae733a77ba77e7907aaa749394fc5e75c0e1' +
  '00d4cb8ac2838f11d95b0136a919a13b994f920024aba35eee16dc433c65851c' +
  '0000000000000000000000000000000000000000000000000000048c27395000' +
  '0000000000000000000000000000000000000000000000000000000003730822';

/** setRateLimit(..., LIMIT_USDS_MINT, type(uint256).max, 0) — the unlimited re-pin */
const SET_UNLIMITED: Hex =
  '0x91cc936a' +
  '000000000000000000000000e016ae733a77ba77e7907aaa749394fc5e75c0e1' +
  'cb0537d5e5dba65a8edbac12555995860e5b8e1b70996011edb1ca8173e56d3c' +
  'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
  '0000000000000000000000000000000000000000000000000000000000000000';

/** setRateLimit(..., LIMIT_USDS_MINT, type(uint256).max, 1) — reverts on a locked key */
const SET_UNLIMITED_BAD_SLOPE: Hex =
  '0x91cc936a' +
  '000000000000000000000000e016ae733a77ba77e7907aaa749394fc5e75c0e1' +
  'cb0537d5e5dba65a8edbac12555995860e5b8e1b70996011edb1ca8173e56d3c' +
  'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
  '0000000000000000000000000000000000000000000000000000000000000001';

/** setRateLimit(..., 0x1111…1111, 1000, 1) — a key no preimage resolves */
const SET_UNRESOLVABLE_KEY: Hex =
  '0x91cc936a' +
  '000000000000000000000000e016ae733a77ba77e7907aaa749394fc5e75c0e1' +
  '1111111111111111111111111111111111111111111111111111111111111111' +
  '00000000000000000000000000000000000000000000000000000000000003e8' +
  '0000000000000000000000000000000000000000000000000000000000000001';

/** setRateLimit(..., LIMIT_USDS_MINT, 0, 0) — closes the limit */
const SET_CLOSED: Hex =
  '0x91cc936a' +
  '000000000000000000000000e016ae733a77ba77e7907aaa749394fc5e75c0e1' +
  'cb0537d5e5dba65a8edbac12555995860e5b8e1b70996011edb1ca8173e56d3c' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000';

/** setRateLimit(..., LIMIT_USDS_MINT, 1000e18, 0) — a limit that never refills */
const SET_NO_REFILL: Hex =
  '0x91cc936a' +
  '000000000000000000000000e016ae733a77ba77e7907aaa749394fc5e75c0e1' +
  'cb0537d5e5dba65a8edbac12555995860e5b8e1b70996011edb1ca8173e56d3c' +
  '00000000000000000000000000000000000000000000003635c9adc5dea00000' +
  '0000000000000000000000000000000000000000000000000000000000000000';

/** callControllerAction(ALM_CONTROLLER, 0xdeadbeef…00ff) */
const CALL_CONTROLLER_ACTION: Hex =
  '0x7051c19c' +
  '0000000000000000000000005c46fc65855c0c7465a1ea85eea0b24b601502d3' +
  '0000000000000000000000000000000000000000000000000000000000000040' +
  '0000000000000000000000000000000000000000000000000000000000000024' +
  'deadbeef00000000000000000000000000000000000000000000000000000000' +
  '000000ff00000000000000000000000000000000000000000000000000000000';

/** keccak256 of the inner calldata above — the BeamState authorisation key */
const INNER_ACTION_HASH =
  '0x3521f38af08caab3904476fa6de273e2c3f6fb19d6cba66246ece19db035fc49';

describe('PASConfiguratorDecoder', () => {
  const decoder = new PASConfiguratorDecoder();

  describe('canDecode', () => {
    it('should accept its own contract address', () => {
      expect(decoder.canDecode(CONFIGURATOR, SET_USDS_MINT)).toBe(true);
    });

    it('should accept a checksum-insensitive address match', () => {
      expect(decoder.canDecode(CONFIGURATOR.toLowerCase() as Hex, SET_USDS_MINT)).toBe(true);
    });

    it('should reject any other contract address', () => {
      // The BeamState is a different PAS contract — this decoder must not claim it
      expect(
        decoder.canDecode('0x1A1879E66547F90bfF87D45A5b0335950E019E02', SET_USDS_MINT)
      ).toBe(false);
    });

    it('should reject data with no selector', () => {
      expect(decoder.canDecode(CONFIGURATOR, '0x')).toBe(false);
    });
  });

  describe('setRateLimit — key resolution', () => {
    it('should resolve LIMIT_USDS_MINT by recomputing its keccak preimage', () => {
      const { main } = decoder.decode(SET_USDS_MINT);

      expect(main.name).toBe('setRateLimit');
      expect(main.signature).toBe('setRateLimit(address,bytes32,uint256,uint256)');
      expect(String(main.parameters[1]!.value)).toContain('LIMIT_USDS_MINT');
    });

    it('should keep the full bytes32 key alongside the resolved name', () => {
      const { main } = decoder.decode(SET_USDS_MINT);

      // The label is a convenience; the bytes are the ground truth and must
      // never be abbreviated or replaced.
      expect(String(main.parameters[1]!.value)).toContain(
        '0xcb0537d5e5dba65a8edbac12555995860e5b8e1b70996011edb1ca8173e56d3c'
      );
    });

    it('should show the full RateLimits address, never truncated', () => {
      const { main } = decoder.decode(SET_USDS_MINT);
      expect(main.parameters[0]!.value).toBe(GROVE_RATE_LIMITS);
    });

    it('should refuse to name a key it cannot resolve, and say so', () => {
      const { main } = decoder.decode(SET_UNRESOLVABLE_KEY);

      expect(String(main.parameters[1]!.value)).toBe(
        '0x1111111111111111111111111111111111111111111111111111111111111111'
      );
      expect(main.warnings!.join(' ')).toContain('could not be resolved');
      expect(main.riskLevel).toBe('high');
    });

    it('should never invent a name for an unresolved key', () => {
      const { main } = decoder.decode(SET_UNRESOLVABLE_KEY);
      expect(main.explanation).toContain('UNRESOLVED');
      expect(main.explanation).not.toContain('LIMIT_USDS');
    });
  });

  describe('setRateLimit — denomination', () => {
    it('should scale an 18-decimal key to whole USDS', () => {
      const { main } = decoder.decode(SET_USDS_MINT);
      const maxAmount = String(main.parameters[2]!.value);

      expect(maxAmount).toContain('5000000000000000000000000');
      expect(maxAmount).toContain('5,000,000');
      expect(maxAmount).toContain('USDS');
    });

    it('should scale a 6-decimal key to whole USDC, not treat it as 18', () => {
      const { main } = decoder.decode(SET_USDS_TO_USDC);
      const maxAmount = String(main.parameters[2]!.value);

      // 5000000000000 at 6 decimals is 5,000,000 USDC. Read as 18 decimals it
      // would be 0.000005 — the exact misreading this decoder exists to prevent.
      expect(maxAmount).toContain('5000000000000');
      expect(maxAmount).toContain('5,000,000');
      expect(maxAmount).toContain('USDC');
    });

    it('should render the per-second slope as a per-day figure', () => {
      const { main } = decoder.decode(SET_USDS_MINT);
      const slope = String(main.parameters[3]!.value);

      expect(slope).toContain('57870370370370370370');
      expect(slope).toContain('per second');
      // 57870370370370370370 * 86400 = 4,999,999,999,999,999,999,968,000 wei/day
      expect(slope).toContain('per day');
      expect(slope).toContain('USDS');
    });

    it('should always keep the raw integer next to any scaled view', () => {
      const { main } = decoder.decode(SET_USDS_TO_USDC);
      expect(String(main.parameters[2]!.value)).toContain('5000000000000');
      expect(String(main.parameters[3]!.value)).toContain('57870370');
    });

    it('should emit a bare integer for maxAmount when the key is unresolved', () => {
      // Bare so the UI's decimals picker stays live — an unresolved key is
      // exactly where a signer needs to try a scale by hand. The explanation
      // still states that the scale is undetermined.
      const { main } = decoder.decode(SET_UNRESOLVABLE_KEY);

      expect(main.parameters[2]!.value).toBe('1000');
      expect(main.explanation).toContain('raw integers only');
    });

    it('should keep the UNLIMITED label even when the denomination is unknown', () => {
      // A picker cannot help with type(uint256).max, so the label wins over
      // emitting a bare integer.
      const unlimitedUnresolved: Hex =
        '0x91cc936a' +
        '000000000000000000000000e016ae733a77ba77e7907aaa749394fc5e75c0e1' +
        '1111111111111111111111111111111111111111111111111111111111111111' +
        'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
        '0000000000000000000000000000000000000000000000000000000000000000';

      const { main } = decoder.decode(unlimitedUnresolved);
      expect(String(main.parameters[2]!.value)).toContain('UNLIMITED');
    });
  });

  describe('setRateLimit — the unlimited sentinel', () => {
    it('should label type(uint256).max as UNLIMITED rather than 78 digits', () => {
      const { main } = decoder.decode(SET_UNLIMITED);
      const maxAmount = String(main.parameters[2]!.value);

      expect(maxAmount).toContain('UNLIMITED');
      // The exact value stays visible — it is what is being signed
      expect(maxAmount).toContain(
        '115792089237316195423570985008687907853269984665640564039457584007913129639935'
      );
    });

    it('should question why an unlimited key is being touched', () => {
      const { main } = decoder.decode(SET_UNLIMITED);
      expect(main.warnings!.join(' ')).toContain('unlimited-incorrect-params');
      expect(main.warnings!.join(' ')).toContain('emergency-exit');
    });

    it('should flag an unlimited maxAmount paired with a non-zero slope', () => {
      const { main } = decoder.decode(SET_UNLIMITED_BAD_SLOPE);
      expect(main.warnings!.join(' ')).toContain('slope is not 0');
    });

    it('should not call a zero slope "never refills" on an unlimited key', () => {
      // On an unlimited key, slope 0 is the argument the contract requires —
      // it routes to setUnlimitedRateLimitData. An unlimited limit never
      // depletes, so it has nothing to refill.
      const { main } = decoder.decode(SET_UNLIMITED);
      const slope = String(main.parameters[3]!.value);

      expect(slope).toContain('required for an unlimited key');
      expect(slope).not.toContain('never refills');
      expect(main.warnings!.join(' ')).not.toContain('never refills');
    });

    it('should treat touching an unlimited key as high risk', () => {
      expect(decoder.decode(SET_UNLIMITED).main.riskLevel).toBe('high');
    });
  });

  describe('setRateLimit — value-shape warnings', () => {
    it('should warn that a zero slope means the limit never refills', () => {
      const { main } = decoder.decode(SET_NO_REFILL);
      expect(main.warnings!.join(' ')).toContain('never refills');
    });

    it('should warn that a zero maxAmount closes the limit completely', () => {
      const { main } = decoder.decode(SET_CLOSED);
      expect(main.warnings!.join(' ')).toContain('closes the rate limit completely');
    });

    it('should not claim a direction it cannot know from calldata', () => {
      const { main } = decoder.decode(SET_USDS_MINT);
      const text = main.explanation + main.warnings!.join(' ');

      // Direction and ceiling need the limit's current on-chain value
      expect(text).toContain('cannot be determined from calldata');
      expect(text).toContain('getRateLimitData');
    });
  });

  describe('callControllerAction', () => {
    it('should decode the controller and the full inner calldata', () => {
      const { main } = decoder.decode(CALL_CONTROLLER_ACTION);

      expect(main.name).toBe('callControllerAction');
      expect(main.signature).toBe('callControllerAction(address,bytes)');
      expect(main.parameters[0]!.value).toBe('0x5c46Fc65855c0C7465a1EA85EEA0B24B601502D3');
      expect(main.parameters[1]!.value).toBe(
        '0xdeadbeef00000000000000000000000000000000000000000000000000000000000000ff'
      );
    });

    it('should show keccak256(data) — the key BeamState actually authorises on', () => {
      const { main } = decoder.decode(CALL_CONTROLLER_ACTION);

      expect(main.parameters[2]!.name).toBe('keccak256(data)');
      expect(main.parameters[2]!.value).toBe(INNER_ACTION_HASH);
      expect(main.explanation).toContain(INNER_ACTION_HASH);
    });

    it('should refuse to guess an ABI for the inner call', () => {
      const { main } = decoder.decode(CALL_CONTROLLER_ACTION);

      expect(main.warnings!.join(' ')).toContain('NOT decoded here');
      expect(main.warnings!.join(' ')).toContain('will not guess one from a selector');
      expect(main.riskLevel).toBe('high');
    });

    it('should surface the inner selector without claiming to know the function', () => {
      const { main } = decoder.decode(CALL_CONTROLLER_ACTION);
      expect(main.parameters[3]!.value).toBe('0xdeadbeef');
    });
  });

  describe('re-encode self-check', () => {
    // viem's decoder ignores bytes past the end of the encoded arguments, so
    // without this check appended calldata would render as an ordinary call.
    it('should flag trailing calldata that the decoder would otherwise ignore', () => {
      const result = decoder.decode((SET_USDS_MINT + 'deadbeef') as Hex);

      expect(result.main.riskLevel).toBe('high');
      expect(result.generalWarnings).toBeDefined();
      expect(result.generalWarnings!.join(' ')).toContain('DOES NOT MATCH RAW CALLDATA');
      expect(result.generalWarnings!.join(' ')).toContain('DO NOT SIGN');
    });

    it('should include both byte sequences in full in the mismatch warning', () => {
      const tampered = (SET_USDS_MINT + 'deadbeef') as Hex;
      const warning = decoder.decode(tampered).generalWarnings!.join(' ');

      expect(warning).toContain(tampered);
      expect(warning).toContain(SET_USDS_MINT);
    });

    it('should flag trailing calldata on callControllerAction too', () => {
      const result = decoder.decode((CALL_CONTROLLER_ACTION + 'deadbeef') as Hex);
      expect(result.generalWarnings!.join(' ')).toContain('DO NOT SIGN');
    });
  });

  describe('unknown selectors', () => {
    it('should throw so the registry falls back to the undecodable state', () => {
      expect(() => decoder.decode('0xdeadbeef00000000000000000000000000000000')).toThrow();
    });

    it('should not decode a BeamState function that is not on this contract', () => {
      // stop() — a real PAS function, but on BeamState, not the Configurator
      expect(() => decoder.decode('0x07da68f5')).toThrow();
    });
  });

  describe('getSupportedFunctions', () => {
    it('should list exactly the two state-changing functions the contract has', () => {
      expect(decoder.getSupportedFunctions().sort()).toEqual([
        'callControllerAction',
        'setRateLimit',
      ]);
    });
  });
});
