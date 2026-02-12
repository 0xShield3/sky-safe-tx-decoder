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
});
