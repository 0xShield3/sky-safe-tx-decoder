/**
 * Tests for the StUsdsRateSetter decoder
 */

import { describe, it, expect } from 'vitest';
import type { Hex } from 'viem';
import { StUsdsRateSetterDecoder } from './stusds-rate-setter.js';

const ADDRESS = '0x30784615252B13E1DbE2bDf598627eaC297Bf4C5';

/** set(strBps=625, dutyBps=700, line=500,000,000 RAD, cap=500,000,000e18) */
const SET_CALLDATA: Hex =
  '0x606ce3bf' +
  '0000000000000000000000000000000000000000000000000000000000000271' +
  '00000000000000000000000000000000000000000000000000000000000002bc' +
  '000000000000000000053861e2053273628ccc8485b2fb3ec920000000000000' +
  '0000000000000000000000000000000000000000019d971e4fe8401e74000000';

describe('StUsdsRateSetterDecoder', () => {
  const decoder = new StUsdsRateSetterDecoder();

  describe('canDecode', () => {
    it('should accept its own contract address', () => {
      expect(decoder.canDecode(ADDRESS, SET_CALLDATA)).toBe(true);
    });

    it('should reject any other contract address', () => {
      expect(decoder.canDecode('0x36B072ed8AFE665E3Aa6DaBa79Decbec63752b22', SET_CALLDATA)).toBe(
        false
      );
    });
  });

  describe('set(uint256,uint256,uint256,uint256)', () => {
    it('should decode all four parameters', () => {
      const { main } = decoder.decode(SET_CALLDATA);

      expect(main.name).toBe('set');
      expect(main.signature).toBe('set(uint256,uint256,uint256,uint256)');
      expect(main.parameters).toHaveLength(4);
      expect(main.parameters.map(p => p.name)).toEqual(['strBps', 'dutyBps', 'line', 'cap']);
    });

    it('should convert both rates from basis points to percent', () => {
      const { main } = decoder.decode(SET_CALLDATA);

      expect(String(main.parameters[0]!.value)).toBe('625 bps (6.25%)');
      expect(String(main.parameters[1]!.value)).toBe('700 bps (7.00%)');
    });

    it('should show line scaled down from RAD and cap as a raw integer', () => {
      const { main, } = decoder.decode(SET_CALLDATA);

      expect(main.explanation).toContain('500,000,000 USDS');
      // cap carries no assumed scaling — the exact integer must appear
      expect(main.explanation).toContain('500000000000000000000000000');
      expect(main.parameters[3]!.value).toBe(500000000n * 10n ** 18n);
    });

    it('should preserve line as the exact raw integer in the parameter list', () => {
      const { main } = decoder.decode(SET_CALLDATA);

      expect(main.parameters[2]!.value).toBe(500000000n * 10n ** 45n);
    });
  });

  describe('re-encode self-check', () => {
    it('should flag trailing calldata as extra bytes, not as a mismatch', () => {
      const result = decoder.decode((SET_CALLDATA + 'deadbeef') as Hex);
      const warnings = result.main.warnings!.join(' ');

      expect(warnings).toContain('4 extra bytes');
      expect(warnings).toContain('0xdeadbeef');
      expect(result.main.riskLevel).toBe('medium');
      expect(result.generalWarnings).toBeUndefined();
    });

    // Every function on this contract takes only static arguments, so there are
    // no offsets to make non-canonical. Appending bytes is the only way calldata
    // for these signatures can fail to round-trip, which means `trailing` is the
    // only reachable non-exact verdict here. Mismatch is covered against the
    // classifier directly in utils/reencode.test.ts, and end-to-end through a
    // dynamic argument in spbeam.test.ts.
    it('should still decode the parameters correctly alongside trailing bytes', () => {
      const result = decoder.decode((SET_CALLDATA + 'deadbeef') as Hex);

      expect(result.main.name).toBe('set');
      expect(result.main.parameters).toHaveLength(4);
    });
  });

  describe('file (configuration)', () => {
    it('should explain a recognised module-wide parameter', () => {
      // file("maxLine", 1e45)
      const data: Hex =
        '0x29ae8114' +
        '6d61784c696e6500000000000000000000000000000000000000000000000000' +
        '000000000000000000000000002cd76fe086b93ce2f768a00b22a00000000000';

      const { main } = decoder.decode(data);

      expect(main.name).toBe('file');
      expect(main.signature).toBe('file(bytes32,uint256)');
      expect(String(main.parameters[0]!.value)).toContain('maxLine');
      expect(main.explanation).toContain('Upper bound on the debt ceiling');
      expect(main.riskLevel).toBe('high');
    });

    it('should decode the per-rate bounds overload', () => {
      // file("STR", "max", 800)
      const data: Hex =
        '0x1a0b287e' +
        '5354520000000000000000000000000000000000000000000000000000000000' +
        '6d61780000000000000000000000000000000000000000000000000000000000' +
        '0000000000000000000000000000000000000000000000000000000000000320';

      const { main } = decoder.decode(data);

      expect(main.signature).toBe('file(bytes32,bytes32,uint256)');
      expect(String(main.parameters[0]!.value)).toContain('STR');
      expect(String(main.parameters[1]!.value)).toContain('max');
      // Full bytes32 retained alongside the label
      expect(String(main.parameters[0]!.value)).toContain(
        '0x5354520000000000000000000000000000000000000000000000000000000000'
      );
    });
  });

  describe('authorisation functions', () => {
    it('should decode kiss(address) as granting rate-setting access', () => {
      const data: Hex =
        '0xf29c29c4000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045';

      const { main } = decoder.decode(data);

      expect(main.name).toBe('kiss');
      expect(main.riskLevel).toBe('high');
      expect(main.explanation).toContain('set()');
    });

    it('should decode rely(address) as a high-risk admin grant', () => {
      const data: Hex =
        '0x65fae35e000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045';

      const { main } = decoder.decode(data);

      expect(main.name).toBe('rely');
      expect(main.riskLevel).toBe('high');
      expect(main.explanation).toContain('ward');
    });
  });
});
