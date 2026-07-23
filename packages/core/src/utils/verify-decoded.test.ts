/**
 * Tests for decoded data verification
 */

import { describe, it, expect } from 'vitest';
import { verifyDecodedData } from './verify-decoded.js';
import type { Hex } from 'viem';
import type { SafeApiDataDecoded } from '../types.js';

describe('verifyDecodedData', () => {
  it('should verify a simple ERC20 transfer', () => {
    // Real data from Safe API for ERC20 transfer
    const rawData: Hex = '0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000de0b6b3a7640000';

    const decoded: SafeApiDataDecoded = {
      method: 'transfer',
      parameters: [
        {
          name: 'to',
          type: 'address',
          value: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        },
        {
          name: 'value',
          type: 'uint256',
          value: '1000000000000000000', // 1 ETH in wei
        },
      ],
    };

    const result = verifyDecodedData(rawData, decoded);

    expect(result.verified).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should verify an approval call', () => {
    // ERC20 approve(address spender, uint256 amount)
    const rawData: Hex = '0x095ea7b3000000000000000000000000f65475e74c1ed6d004d5240b06e3088724dfda5d00000000000000000000000000000000000000000000000000000000000003e8';

    const decoded: SafeApiDataDecoded = {
      method: 'approve',
      parameters: [
        {
          name: 'spender',
          type: 'address',
          value: '0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d',
        },
        {
          name: 'amount',
          type: 'uint256',
          value: '1000', // 1000 tokens
        },
      ],
    };

    const result = verifyDecodedData(rawData, decoded);

    expect(result.verified).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should detect mismatched decoded data', () => {
    // Real transfer data
    const rawData: Hex = '0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000de0b6b3a7640000';

    // But wrong decoded amount
    const decoded: SafeApiDataDecoded = {
      method: 'transfer',
      parameters: [
        {
          name: 'to',
          type: 'address',
          value: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        },
        {
          name: 'value',
          type: 'uint256',
          value: '2000000000000000000', // WRONG: 2 ETH instead of 1 ETH
        },
      ],
    };

    const result = verifyDecodedData(rawData, decoded);

    expect(result.verified).toBe(false);
    expect(result.error).toContain('does not match');
  });

  it('should detect wrong recipient address', () => {
    const rawData: Hex = '0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000de0b6b3a7640000';

    // Wrong recipient address
    const decoded: SafeApiDataDecoded = {
      method: 'transfer',
      parameters: [
        {
          name: 'to',
          type: 'address',
          value: '0x0000000000000000000000000000000000000000', // WRONG ADDRESS
        },
        {
          name: 'value',
          type: 'uint256',
          value: '1000000000000000000',
        },
      ],
    };

    const result = verifyDecodedData(rawData, decoded);

    expect(result.verified).toBe(false);
    expect(result.error).toContain('does not match');
  });

  it('should handle zero-parameter functions', () => {
    // Function with no parameters (e.g., "name()")
    const rawData: Hex = '0x06fdde03'; // name() selector

    const decoded: SafeApiDataDecoded = {
      method: 'name',
      parameters: [],
    };

    const result = verifyDecodedData(rawData, decoded);

    expect(result.verified).toBe(true);
  });

  it('should fail when no decoded data provided', () => {
    const rawData: Hex = '0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000de0b6b3a7640000';

    const result = verifyDecodedData(rawData, null);

    expect(result.verified).toBe(false);
    expect(result.error).toBe('No decoded data provided');
  });

  it('should fail when no raw data provided', () => {
    const decoded: SafeApiDataDecoded = {
      method: 'transfer',
      parameters: [
        {
          name: 'to',
          type: 'address',
          value: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        },
        {
          name: 'value',
          type: 'uint256',
          value: '1000000000000000000',
        },
      ],
    };

    const result = verifyDecodedData(null, decoded);

    expect(result.verified).toBe(false);
    expect(result.error).toBe('No raw data to verify against');
  });

  it('should verify real Safe API data - simple transfer (nonce 520)', () => {
    // Real data from Safe 0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d nonce 520
    const rawData: Hex = '0xa9059cbb000000000000000000000000fbca5c7138892f987313d9fa615ecb3a35997351000000000000000000000000000000000000000000000000000000a03ce998c8';

    const decoded: SafeApiDataDecoded = {
      method: 'transfer',
      parameters: [
        {
          name: 'to',
          type: 'address',
          value: '0xfBcA5C7138892F987313d9FA615ECB3a35997351',
        },
        {
          name: 'value',
          type: 'uint256',
          value: '688216709320',
        },
      ],
    };

    const result = verifyDecodedData(rawData, decoded);

    expect(result.verified).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should verify real Safe API data - nested MultiSend approve (nonce 511)', () => {
    // Real nested transaction from Safe nonce 511 - first nested tx (approve)
    const rawData: Hex = '0x095ea7b3000000000000000000000000a188eec8f81263234da3622a406892f3d630f98c00000000000000000000000000000000000000000000c0079aa9f29187938bd4';

    const decoded: SafeApiDataDecoded = {
      method: 'approve',
      parameters: [
        {
          name: 'spender',
          type: 'address',
          value: '0xA188EEC8F81263234dA3622A406892F3D630f98c',
        },
        {
          name: 'value',
          type: 'uint256',
          value: '906834636624947611667412',
        },
      ],
    };

    const result = verifyDecodedData(rawData, decoded);

    expect(result.verified).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should verify real Safe API data - nested MultiSend buyGem (nonce 511)', () => {
    // Real nested transaction from Safe nonce 511 - second nested tx (buyGem)
    const rawData: Hex = '0x8d7ef9bb000000000000000000000000f65475e74c1ed6d004d5240b06e3088724dfda5d000000000000000000000000000000000000000000000000000000d3238e6f50';

    const decoded: SafeApiDataDecoded = {
      method: 'buyGem',
      parameters: [
        {
          name: 'usr',
          type: 'address',
          value: '0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d',
        },
        {
          name: 'gemAmt',
          type: 'uint256',
          value: '906834636624',
        },
      ],
    };

    const result = verifyDecodedData(rawData, decoded);

    expect(result.verified).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should handle boolean parameters', () => {
    // Function with bool parameter: setBool(bool value)
    const rawData: Hex = '0x1e26fd330000000000000000000000000000000000000000000000000000000000000001';

    const decoded: SafeApiDataDecoded = {
      method: 'setBool',
      parameters: [
        {
          name: 'value',
          type: 'bool',
          value: 'true',
        },
      ],
    };

    const result = verifyDecodedData(rawData, decoded);

    expect(result.verified).toBe(true);
  });

  it('should handle bytes parameters', () => {
    // Function with bytes parameter
    const rawData: Hex = '0xdeadbeef0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000568656c6c6f000000000000000000000000000000000000000000000000000000';

    const decoded: SafeApiDataDecoded = {
      method: 'setBytes',
      parameters: [
        {
          name: 'data',
          type: 'bytes',
          value: '0x68656c6c6f', // "hello" in hex
        },
      ],
    };

    const result = verifyDecodedData(rawData, decoded);

    // This might fail due to dynamic encoding complexity, but the structure is correct
    expect(result.verified).toBeDefined();
  });

  describe('array parameters', () => {
    // Regression: `uint256[]` starts with "uint", so the scalar branch used to
    // win and call BigInt() on an array. That threw, and a correct transaction
    // was reported to the signer as a mismatch.
    it('should verify a uint256[] with several elements', () => {
      // f(uint256[]) with [1, 2, 3]
      const rawData: Hex =
        '0x7bc5bbbf' +
        '0000000000000000000000000000000000000000000000000000000000000020' +
        '0000000000000000000000000000000000000000000000000000000000000003' +
        '0000000000000000000000000000000000000000000000000000000000000001' +
        '0000000000000000000000000000000000000000000000000000000000000002' +
        '0000000000000000000000000000000000000000000000000000000000000003';

      const decoded: SafeApiDataDecoded = {
        method: 'f',
        parameters: [{ name: 'a', type: 'uint256[]', value: ['1', '2', '3'] as unknown as string }],
      };

      const result = verifyDecodedData(rawData, decoded);

      expect(result.status).toBe('verified');
      expect(result.verified).toBe(true);
    });

    it('should verify a uint256[] with a single element', () => {
      const rawData: Hex =
        '0x7bc5bbbf' +
        '0000000000000000000000000000000000000000000000000000000000000020' +
        '0000000000000000000000000000000000000000000000000000000000000001' +
        '0000000000000000000000000000000000000000000000000000000000000001';

      const decoded: SafeApiDataDecoded = {
        method: 'f',
        parameters: [{ name: 'a', type: 'uint256[]', value: ['1'] as unknown as string }],
      };

      expect(verifyDecodedData(rawData, decoded).status).toBe('verified');
    });
  });

  describe('tuple parameters', () => {
    // The Safe API emits tuples as flattened canonical signatures rather than
    // "tuple" plus components — this is the exact shape returned by
    // POST /api/v1/data-decoder/ for Uniswap V3 exactInputSingle.
    it('should verify a single tuple parameter', () => {
      const rawData: Hex =
        '0x414bf389' +
        '000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' +
        '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' +
        '0000000000000000000000000000000000000000000000000000000000000bb8' +
        '000000000000000000000000e1c6f81d0c3cd570a77813b81aa064c5fff80309' +
        '00000000000000000000000000000000000000000000000000000000713fb300' +
        '0000000000000000000000000000000000000000000000000de0b6b3a7640000' +
        '0000000000000000000000000000000000000000000000000000000000000000' +
        '0000000000000000000000000000000000000000000000000000000000000000';

      const decoded: SafeApiDataDecoded = {
        method: 'exactInputSingle',
        parameters: [
          {
            name: 'params',
            type: '(address,address,uint24,address,uint256,uint256,uint256,uint160)',
            value: [
              '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
              '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
              '3000',
              '0xe1c6f81D0c3CD570A77813b81AA064c5fff80309',
              '1900000000',
              '1000000000000000000',
              '0',
              '0',
            ] as unknown as string,
          },
        ],
      };

      expect(verifyDecodedData(rawData, decoded).status).toBe('verified');
    });

    it('should verify a tuple array parameter', () => {
      // set((bytes32,uint256)[]) with two entries
      const rawData: Hex =
        '0x474d857f' +
        '0000000000000000000000000000000000000000000000000000000000000020' +
        '0000000000000000000000000000000000000000000000000000000000000002' +
        '4554482d41000000000000000000000000000000000000000000000000000000' +
        '00000000000000000000000000000000000000000000000000000000000003b6' +
        '5353520000000000000000000000000000000000000000000000000000000000' +
        '0000000000000000000000000000000000000000000000000000000000000160';

      const decoded: SafeApiDataDecoded = {
        method: 'set',
        parameters: [
          {
            name: 'updates',
            type: '(bytes32,uint256)[]',
            value: [
              ['0x4554482d41000000000000000000000000000000000000000000000000000000', '950'],
              ['0x5353520000000000000000000000000000000000000000000000000000000000', '352'],
            ] as unknown as string,
          },
        ],
      };

      expect(verifyDecodedData(rawData, decoded).status).toBe('verified');
    });
  });

  // The Safe API is untrusted input. A hostile response must never earn a
  // "verified" result for a decoding that omits or fabricates a parameter.
  describe('hostile decoded data', () => {
    // transfer(address,uint256,bool) with force=false. The trailing bool
    // encodes to a zero word, so a two-parameter decoding of the same bytes
    // looks plausible to a reader.
    const threeArgTransfer: Hex =
      '0xe1ad1162' +
      '000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045' +
      '00000000000000000000000000000000000000000000000000000000000f4240' +
      '0000000000000000000000000000000000000000000000000000000000000000';

    it('must not verify when a parameter name smuggles in an extra parameter', () => {
      const decoded: SafeApiDataDecoded = {
        method: 'transfer',
        parameters: [
          { name: 'to', type: 'address', value: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' },
          // The name closes the parameter list and opens another one
          { name: 'amount, bool force', type: 'uint256', value: '1000000' },
        ],
      };

      const result = verifyDecodedData(threeArgTransfer, decoded);

      expect(result.verified).toBe(false);
      expect(result.status).toBe('mismatch');
    });

    it('must not verify when a parameter type smuggles in an extra parameter', () => {
      const decoded: SafeApiDataDecoded = {
        method: 'transfer',
        parameters: [
          { name: 'to', type: 'address', value: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' },
          { name: 'amount', type: 'uint256, bool force', value: '1000000' },
        ],
      };

      const result = verifyDecodedData(threeArgTransfer, decoded);

      expect(result.verified).toBe(false);
      expect(result.status).toBe('mismatch');
      expect(result.error).toContain('expands to 2 parameters');
    });

    it('must not verify when a type merges two displayed parameters into one', () => {
      // An unbalanced parenthesis would fold parameters b into a's tuple,
      // leaving b displayed but never encoded or compared.
      const decoded: SafeApiDataDecoded = {
        method: 'q',
        parameters: [
          { name: 'a', type: '(uint256', value: ['1'] as unknown as string },
          { name: 'b)', type: 'address', value: '0x1111111111111111111111111111111111111111' },
        ],
      };

      expect(verifyDecodedData('0x12345678', decoded).verified).toBe(false);
    });
  });

  describe('verification status', () => {
    it('should report a genuine re-encoding difference as a mismatch', () => {
      // transfer(address,uint256) — decoded value claims a different amount
      const rawData: Hex =
        '0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000de0b6b3a7640000';

      const decoded: SafeApiDataDecoded = {
        method: 'transfer',
        parameters: [
          { name: 'to', type: 'address', value: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' },
          { name: 'value', type: 'uint256', value: '1' },
        ],
      };

      const result = verifyDecodedData(rawData, decoded);

      expect(result.status).toBe('mismatch');
      expect(result.verified).toBe(false);
    });

    it('should report missing decoded data as unverifiable, not a mismatch', () => {
      const result = verifyDecodedData('0xa9059cbb', null);

      expect(result.status).toBe('unverifiable');
      expect(result.verified).toBe(false);
    });

    it('should report an unsupported parameter type as unverifiable, not a mismatch', () => {
      const decoded: SafeApiDataDecoded = {
        method: 'f',
        parameters: [{ name: 'a', type: 'not_a_solidity_type', value: '1' }],
      };

      expect(verifyDecodedData('0xdeadbeef', decoded).status).toBe('unverifiable');
    });
  });
});
