/**
 * Safe Version Compatibility Utilities
 *
 * Reference: safe_hashes.sh lines 554-577
 */

import { MIN_SAFE_VERSION } from './constants.js';

/**
 * Extract the clean Safe multisig version by removing the L2 suffix.
 *
 * Safe multisig versions can have the format `X.Y.Z+L2`.
 * This function removes any suffix after and including the `+` for comparison.
 *
 * Reference: safe_hashes.sh lines 554-560
 *
 * @param version - Raw version string (e.g., "1.3.0+L2", "1.4.1")
 * @returns Clean version string (e.g., "1.3.0", "1.4.1")
 *
 * @example
 * getVersion("1.3.0+L2") // "1.3.0"
 * getVersion("1.4.1") // "1.4.1"
 */
export function getVersion(version: string): string {
  // Remove any suffix after and including the `+` in the version string.
  return version.split('+')[0] || '';
}

/**
 * Compare two semantic versions using natural sort order.
 *
 * Reference: safe_hashes.sh lines 96-99 (semver_ge function)
 *
 * @param v1 - First version string
 * @param v2 - Second version string
 * @returns -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
 *
 * @example
 * compareVersions("1.3.0", "1.2.0") // 1
 * compareVersions("1.0.0", "1.0.0") // 0
 * compareVersions("0.9.0", "1.0.0") // -1
 */
export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }

  return 0;
}

/**
 * Check if version v1 is greater than or equal to version v2.
 *
 * Reference: safe_hashes.sh lines 96-99
 *
 * @param v1 - First version string
 * @param v2 - Second version string
 * @returns True if v1 >= v2
 *
 * @example
 * isVersionGte("1.3.0", "1.2.0") // true
 * isVersionGte("1.0.0", "1.0.0") // true
 * isVersionGte("0.9.0", "1.0.0") // false
 */
export function isVersionGte(v1: string, v2: string): boolean {
  return compareVersions(v1, v2) >= 0;
}

/**
 * Check if version v1 is less than or equal to version v2.
 *
 * @param v1 - First version string
 * @param v2 - Second version string
 * @returns True if v1 <= v2
 *
 * @example
 * isVersionLte("1.2.0", "1.3.0") // true
 * isVersionLte("1.0.0", "1.0.0") // true
 * isVersionLte("1.3.0", "1.0.0") // false
 */
export function isVersionLte(v1: string, v2: string): boolean {
  return compareVersions(v1, v2) <= 0;
}

/**
 * Check if version v1 is less than version v2.
 *
 * @param v1 - First version string
 * @param v2 - Second version string
 * @returns True if v1 < v2
 *
 * @example
 * isVersionLt("0.9.0", "1.0.0") // true
 * isVersionLt("1.0.0", "1.0.0") // false
 */
export function isVersionLt(v1: string, v2: string): boolean {
  return compareVersions(v1, v2) < 0;
}

/**
 * Validate that the Safe version is supported.
 *
 * Reference: safe_hashes.sh lines 562-577
 *
 * @param version - Safe version string
 * @throws Error if version is empty or not supported
 *
 * @example
 * validateVersion("1.3.0+L2") // OK
 * validateVersion("0.0.9") // Throws error
 * validateVersion("") // Throws error
 */
export function validateVersion(version: string): void {
  if (!version) {
    throw new Error(
      'No Safe multisig contract found for the specified network. Please ensure that you have selected the correct network.'
    );
  }

  const cleanVersion = getVersion(version);

  // Ensure that the Safe multisig version is >= 0.1.0
  if (!isVersionGte(cleanVersion, MIN_SAFE_VERSION)) {
    throw new Error(`Safe multisig version "${cleanVersion}" is not supported!`);
  }
}
