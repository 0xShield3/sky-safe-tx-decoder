import { describe, it, expect } from 'vitest';
import { addressFromStorageWord } from './proxy.js';

describe('addressFromStorageWord', () => {
  it('extracts the right-aligned 20-byte address from a 32-byte word', () => {
    // EIP-1967 implementation slot value for the Aave V3 Pool proxy.
    const word = '0x000000000000000000000000728a138a4823392c2efa55e028d434f526fe03cf';
    expect(addressFromStorageWord(word)).toBe('0x728a138a4823392c2efa55e028d434f526fe03cf');
  });

  it('returns null for an empty (zero) slot — i.e. not a proxy', () => {
    expect(
      addressFromStorageWord('0x0000000000000000000000000000000000000000000000000000000000000000')
    ).toBeNull();
  });

  it('tolerates a short/unpadded word', () => {
    expect(addressFromStorageWord('0x0')).toBeNull();
  });
});
