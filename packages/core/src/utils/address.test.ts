import { describe, it, expect } from 'vitest';
import { toChecksumAddress } from './address.js';

describe('toChecksumAddress', () => {
  it('canonicalises any casing to the correct EIP-55 checksum', () => {
    const checksummed = '0xe1c6f81D0c3CD570A77813b81AA064c5fff80309';
    expect(toChecksumAddress(checksummed.toLowerCase())).toBe(checksummed);
    expect(toChecksumAddress(checksummed.toUpperCase().replace('0X', '0x'))).toBe(checksummed);
    expect(toChecksumAddress(`  ${checksummed}  `)).toBe(checksummed);
  });

  it('returns null for a non-address', () => {
    expect(toChecksumAddress('not-an-address')).toBeNull();
    expect(toChecksumAddress('0x1234')).toBeNull();
  });
});
