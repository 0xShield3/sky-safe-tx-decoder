/**
 * Tests for Safe version compatibility utilities
 */

import { describe, it, expect } from 'vitest';
import {
  getVersion,
  validateVersion,
  compareVersions,
  isVersionGte,
  isVersionLte,
  isVersionLt,
} from './version.js';

describe('getVersion', () => {
  it('should remove +L2 suffix', () => {
    expect(getVersion('1.3.0+L2')).toBe('1.3.0');
    expect(getVersion('1.4.1+L2')).toBe('1.4.1');
  });

  it('should return version as-is if no suffix', () => {
    expect(getVersion('1.3.0')).toBe('1.3.0');
    expect(getVersion('1.4.1')).toBe('1.4.1');
    expect(getVersion('0.1.0')).toBe('0.1.0');
  });

  it('should handle other suffixes', () => {
    expect(getVersion('1.3.0+custom')).toBe('1.3.0');
    expect(getVersion('1.3.0+beta')).toBe('1.3.0');
  });
});

describe('compareVersions', () => {
  it('should return 0 for equal versions', () => {
    expect(compareVersions('1.3.0', '1.3.0')).toBe(0);
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0);
  });

  it('should return 1 when first version is greater', () => {
    expect(compareVersions('1.3.0', '1.2.0')).toBe(1);
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.3.1', '1.3.0')).toBe(1);
  });

  it('should return -1 when first version is less', () => {
    expect(compareVersions('1.2.0', '1.3.0')).toBe(-1);
    expect(compareVersions('0.9.0', '1.0.0')).toBe(-1);
    expect(compareVersions('1.3.0', '1.3.1')).toBe(-1);
  });

  it('should handle different version lengths', () => {
    expect(compareVersions('1.3', '1.3.0')).toBe(0);
    expect(compareVersions('1.3.0', '1.3')).toBe(0);
  });
});

describe('isVersionGte', () => {
  it('should return true when version is greater', () => {
    expect(isVersionGte('1.3.0', '1.2.0')).toBe(true);
    expect(isVersionGte('2.0.0', '1.9.9')).toBe(true);
  });

  it('should return true when versions are equal', () => {
    expect(isVersionGte('1.3.0', '1.3.0')).toBe(true);
    expect(isVersionGte('1.0.0', '1.0.0')).toBe(true);
  });

  it('should return false when version is less', () => {
    expect(isVersionGte('1.2.0', '1.3.0')).toBe(false);
    expect(isVersionGte('0.9.0', '1.0.0')).toBe(false);
  });
});

describe('isVersionLte', () => {
  it('should return true when version is less', () => {
    expect(isVersionLte('1.2.0', '1.3.0')).toBe(true);
    expect(isVersionLte('0.9.0', '1.0.0')).toBe(true);
  });

  it('should return true when versions are equal', () => {
    expect(isVersionLte('1.3.0', '1.3.0')).toBe(true);
    expect(isVersionLte('1.0.0', '1.0.0')).toBe(true);
  });

  it('should return false when version is greater', () => {
    expect(isVersionLte('1.3.0', '1.2.0')).toBe(false);
    expect(isVersionLte('2.0.0', '1.9.9')).toBe(false);
  });
});

describe('isVersionLt', () => {
  it('should return true when version is less', () => {
    expect(isVersionLt('0.9.0', '1.0.0')).toBe(true);
    expect(isVersionLt('1.2.0', '1.3.0')).toBe(true);
  });

  it('should return false when versions are equal', () => {
    expect(isVersionLt('1.0.0', '1.0.0')).toBe(false);
    expect(isVersionLt('1.3.0', '1.3.0')).toBe(false);
  });

  it('should return false when version is greater', () => {
    expect(isVersionLt('1.3.0', '1.2.0')).toBe(false);
    expect(isVersionLt('2.0.0', '1.9.9')).toBe(false);
  });
});

describe('validateVersion', () => {
  it('should not throw for supported versions', () => {
    expect(() => validateVersion('0.1.0')).not.toThrow();
    expect(() => validateVersion('1.0.0')).not.toThrow();
    expect(() => validateVersion('1.2.0')).not.toThrow();
    expect(() => validateVersion('1.3.0')).not.toThrow();
    expect(() => validateVersion('1.4.1')).not.toThrow();
    expect(() => validateVersion('1.5.0')).not.toThrow();
  });

  it('should not throw for supported versions with +L2 suffix', () => {
    expect(() => validateVersion('1.3.0+L2')).not.toThrow();
    expect(() => validateVersion('1.4.1+L2')).not.toThrow();
  });

  it('should throw for versions below 0.1.0', () => {
    expect(() => validateVersion('0.0.9')).toThrow('Safe multisig version "0.0.9" is not supported!');
    expect(() => validateVersion('0.0.1')).toThrow('Safe multisig version "0.0.1" is not supported!');
  });

  it('should throw for empty version', () => {
    expect(() => validateVersion('')).toThrow('No Safe multisig contract found');
  });
});
