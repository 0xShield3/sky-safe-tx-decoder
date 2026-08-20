/**
 * Tests for the SPBEAM decoder
 *
 * The `set` fixture is the real calldata from Safe
 * 0xe1c6f81D0c3CD570A77813b81AA064c5fff80309 nonce 37 on Ethereum mainnet
 * (safeTxHash 0xc3dd5d5397a60211ff1cdd165bd4b9ba95172b5178be2fb603ca4212eabc393f).
 */

import { describe, it, expect } from 'vitest';
import type { Hex } from 'viem';
import { SPBEAMDecoder } from './spbeam.js';

const SPBEAM_ADDRESS = '0x36B072ed8AFE665E3Aa6DaBa79Decbec63752b22';

/** Real mainnet calldata: set() with 9 rate updates */
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

describe('SPBEAMDecoder', () => {
  const decoder = new SPBEAMDecoder();

  describe('canDecode', () => {
    it('should accept its own contract address', () => {
      expect(decoder.canDecode(SPBEAM_ADDRESS, SET_CALLDATA)).toBe(true);
    });

    it('should accept a checksum-insensitive address match', () => {
      expect(decoder.canDecode(SPBEAM_ADDRESS.toLowerCase() as Hex, SET_CALLDATA)).toBe(true);
    });

    it('should reject any other contract address', () => {
      expect(
        decoder.canDecode('0xCe01C90dE7FD1bcFa39e237FE6D8D9F569e8A6a3', SET_CALLDATA)
      ).toBe(false);
    });

    it('should reject data with no selector', () => {
      expect(decoder.canDecode(SPBEAM_ADDRESS, '0x')).toBe(false);
    });
  });

  describe('set((bytes32,uint256)[])', () => {
    it('should decode all nine updates from the real mainnet calldata', () => {
      const result = decoder.decode(SET_CALLDATA);

      expect(result.main.name).toBe('set');
      expect(result.main.signature).toBe('set((bytes32,uint256)[])');
      expect(result.isMulticall).toBe(false);
      expect(result.main.parameters).toHaveLength(9);
    });

    it('should render each id as its ASCII label with the full bytes32 retained', () => {
      const result = decoder.decode(SET_CALLDATA);
      const first = result.main.parameters[0]!;

      expect(first.name).toBe('updates[0] — ETH-A');
      // The complete 32-byte id must always be present, never abbreviated
      expect(String(first.value)).toContain(
        '0x4554482d41000000000000000000000000000000000000000000000000000000'
      );
      expect(String(first.value)).toContain('950 bps');
    });

    it('should convert basis points to percent', () => {
      const result = decoder.decode(SET_CALLDATA);
      const values = result.main.parameters.map(p => String(p.value));

      expect(values[0]).toContain('(9.50%)'); // ETH-A   950 bps
      expect(values[3]).toContain('(3.52%)'); // SSR     352 bps
      expect(values[5]).toContain('(15.00%)'); // WBTC-B 1500 bps
    });

    it('should list every id in the explanation', () => {
      const { explanation } = decoder.decode(SET_CALLDATA).main;

      for (const id of ['ETH-A', 'ETH-B', 'ETH-C', 'SSR', 'WBTC-A', 'WBTC-B', 'WBTC-C', 'WSTETH-A', 'WSTETH-B']) {
        expect(explanation).toContain(id);
      }
    });

    it('should not warn on well-formed calldata', () => {
      expect(decoder.decode(SET_CALLDATA).main.warnings).toBeUndefined();
    });

    it('should warn when the same id appears twice in one batch', () => {
      // set() with ETH-A listed twice — the second value silently wins
      const duplicated: Hex =
        '0x474d857f' +
        '0000000000000000000000000000000000000000000000000000000000000020' +
        '0000000000000000000000000000000000000000000000000000000000000002' +
        '4554482d41000000000000000000000000000000000000000000000000000000' +
        '00000000000000000000000000000000000000000000000000000000000003b6' +
        '4554482d41000000000000000000000000000000000000000000000000000000' +
        '00000000000000000000000000000000000000000000000000000000000003e8';

      const warnings = decoder.decode(duplicated).main.warnings;

      expect(warnings).toBeDefined();
      expect(warnings!.join(' ')).toContain('appears more than once');
    });
  });

  describe('re-encode self-check', () => {
    // viem's decoder ignores bytes past the end of the encoded arguments, so
    // without this check appended calldata would render as an ordinary call.
    it('should flag trailing calldata that the decoder would otherwise ignore', () => {
      const result = decoder.decode((SET_CALLDATA + 'deadbeef') as Hex);
      const warnings = result.main.warnings!.join(' ');

      expect(warnings).toContain('4 bytes');
      expect(warnings).toContain('0xdeadbeef');
    });

    it('should show the trailing bytes in full', () => {
      const result = decoder.decode((SET_CALLDATA + 'cafebabedeadbeef') as Hex);

      expect(result.main.warnings!.join(' ')).toContain('0xcafebabedeadbeef');
    });

    it('should not raise a decoder-verification failure for trailing bytes', () => {
      // The parameters re-encode to the start of the call exactly, so they are
      // correct. generalWarnings drives the red "decoder verification failed"
      // banner, which would be false here.
      const result = decoder.decode((SET_CALLDATA + 'deadbeef') as Hex);

      expect(result.generalWarnings).toBeUndefined();
      expect(result.main.riskLevel).toBe('medium');
      expect(result.main.warnings!.join(' ')).not.toContain('DO NOT SIGN');
    });

    it('should still decode the parameters correctly alongside trailing bytes', () => {
      const result = decoder.decode((SET_CALLDATA + 'deadbeef') as Hex);

      expect(result.main.name).toBe('set');
      expect(result.main.parameters).toHaveLength(9);
      expect(result.main.parameters[0]!.name).toBe('updates[0] — ETH-A');
    });

    it('should still hard-fail a genuine parameter mismatch', () => {
      // A non-canonical encoding: the array's head offset is moved from 0x20 to
      // 0x40 and a padding word inserted. viem follows the offset and decodes
      // the same nine updates, but re-encoding produces the canonical layout,
      // so the bytes do not round-trip. This is the shape that makes a display
      // disagree with what executes, and it must stay a stop-signing signal.
      //
      // Changing a value nibble would NOT do: that yields a different but
      // perfectly canonical call, which re-encodes exactly and is not a
      // mismatch at all.
      const OFFSET_0X40 = '0000000000000000000000000000000000000000000000000000000000000040';
      const PADDING_WORD = '0'.repeat(64);
      const nonCanonical = ('0x474d857f' + OFFSET_0X40 + PADDING_WORD + SET_CALLDATA.slice(74)) as Hex;

      const result = decoder.decode(nonCanonical);

      expect(result.main.riskLevel).toBe('high');
      expect(result.generalWarnings).toBeDefined();
      expect(result.generalWarnings!.join(' ')).toContain('DOES NOT MATCH RAW CALLDATA');
      expect(result.generalWarnings!.join(' ')).toContain('DO NOT SIGN');
      expect(result.generalWarnings!.join(' ')).toContain(nonCanonical);
    });
  });

  describe('authorisation functions', () => {
    it('should decode rely(address) as a high-risk admin grant', () => {
      // rely(0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045)
      const data: Hex =
        '0x65fae35e000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045';

      const { main } = decoder.decode(data);

      expect(main.name).toBe('rely');
      expect(main.riskLevel).toBe('high');
      expect(main.parameters[0]!.value).toBe('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
      expect(main.explanation).toContain('ward');
    });

    it('should decode kiss(address) as granting rate-setting access', () => {
      // kiss(0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045)
      const data: Hex =
        '0xf29c29c4000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045';

      const { main } = decoder.decode(data);

      expect(main.name).toBe('kiss');
      expect(main.riskLevel).toBe('high');
      expect(main.explanation).toContain('set()');
    });
  });

  describe('file (configuration)', () => {
    it('should decode the three-argument per-id overload', () => {
      // file("ETH-A", "max", 2000)
      const data: Hex =
        '0x1a0b287e' +
        '4554482d41000000000000000000000000000000000000000000000000000000' +
        '6d61780000000000000000000000000000000000000000000000000000000000' +
        '00000000000000000000000000000000000000000000000000000000000007d0';

      const { main } = decoder.decode(data);

      expect(main.name).toBe('file');
      expect(main.signature).toBe('file(bytes32,bytes32,uint256)');
      expect(main.riskLevel).toBe('high');
      expect(String(main.parameters[0]!.value)).toContain('ETH-A');
      expect(String(main.parameters[1]!.value)).toContain('max');
      // Full bytes32 must remain visible alongside the label
      expect(String(main.parameters[0]!.value)).toContain(
        '0x4554482d41000000000000000000000000000000000000000000000000000000'
      );
    });

    it('should decode the two-argument module-wide overload', () => {
      // file("tau", 3600)
      const data: Hex =
        '0x29ae8114' +
        '7461750000000000000000000000000000000000000000000000000000000000' +
        '0000000000000000000000000000000000000000000000000000000000000e10';

      const { main } = decoder.decode(data);

      expect(main.name).toBe('file');
      expect(main.signature).toBe('file(bytes32,uint256)');
      expect(String(main.parameters[0]!.value)).toContain('tau');
    });
  });

  describe('unknown selectors', () => {
    it('should throw so the registry falls back to the undecodable state', () => {
      expect(() => decoder.decode('0xdeadbeef00000000000000000000000000000000')).toThrow();
    });
  });
});
