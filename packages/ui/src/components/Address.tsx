/**
 * Address — single render path for any Ethereum address shown in the UI.
 *
 * Resolves both built-in tags and address-book tags via core.getAddressTags()
 * and renders the appropriate badge. Built-in + address-book are shown together
 * (e.g. "LockstakeEngine · Sky Staking Vault") so signers see that the protocol
 * is recognized AND that they have explicitly verified it.
 */

import { getAddressTags, type AddressTag } from '@shield3/sky-safe-core';
import { useAddressBook } from '../address-book/AddressBookContext';
import { useOptionalSafeRoute } from '../safe-route/SafeRouteProvider';

interface AddressProps {
  address: string;
  /**
   * Override the Safe address for the "Your Safe" highlight. Optional —
   * by default the active SafeRouteProvider supplies it, so consumers in
   * /safe/* pages don't need to thread the prop manually. Pass explicitly
   * to render an address relative to a different Safe (rare).
   */
  safeAddress?: string;
  className?: string;
}

function pickBuiltIn(tags: AddressTag[]): AddressTag | undefined {
  return tags.find((t) => t.source === 'built-in');
}
function pickBook(tags: AddressTag[]): AddressTag | undefined {
  return tags.find((t) => t.source === 'address-book');
}

export function Address({ address, safeAddress, className = '' }: AddressProps) {
  const { loaded: bookLoaded } = useAddressBook();
  const routeCtx = useOptionalSafeRoute();
  // NEVER truncate — signers must see the full address to detect spoofs.
  const display = address;

  const effectiveSafe = safeAddress ?? routeCtx?.safeAddress;
  const isSafe =
    effectiveSafe !== undefined &&
    address.toLowerCase() === effectiveSafe.toLowerCase();

  if (isSafe) {
    return (
      <span
        className={`inline-flex items-center gap-1 bg-blue-100 text-blue-900 px-1 rounded font-mono font-semibold ${className}`}
        title="This is your Safe address"
      >
        {display}
        <span className="text-xs bg-blue-200 px-1 rounded">Your Safe</span>
      </span>
    );
  }

  const tags = getAddressTags(address as `0x${string}`);
  const builtIn = pickBuiltIn(tags);
  const book = pickBook(tags);

  // Inactive address-book entry — harsh warning, beats any other state.
  if (book?.status === 'inactive') {
    return (
      <span
        className={`inline-flex items-center gap-1 bg-red-100 text-red-900 border border-red-300 px-1 rounded font-mono ${className}`}
        title={`INACTIVE in address book — verified ${book.verificationDate || 'n/a'}`}
      >
        {display}
        <span className="text-xs bg-red-600 text-white px-1 rounded font-semibold">
          INACTIVE: {book.label}
        </span>
      </span>
    );
  }

  // Both built-in and address-book entry — show both labels.
  if (builtIn && book) {
    return (
      <span
        className={`inline-flex items-center gap-1 bg-green-50 text-green-900 border border-green-300 px-1 rounded font-mono ${className}`}
        title={`${builtIn.description} • Address book: ${book.label} (verified ${book.verificationDate || 'n/a'})`}
      >
        {display}
        <span className="text-xs bg-gray-200 text-gray-800 px-1 rounded">{builtIn.label}</span>
        <span className="text-xs bg-green-200 px-1 rounded">✓ {book.label}</span>
      </span>
    );
  }

  // Address-book only — verified by the signer.
  if (book) {
    return (
      <span
        className={`inline-flex items-center gap-1 bg-green-50 text-green-900 border border-green-300 px-1 rounded font-mono ${className}`}
        title={`Address book: ${book.label} (verified ${book.verificationDate || 'n/a'})`}
      >
        {display}
        <span className="text-xs bg-green-200 px-1 rounded">✓ {book.label}</span>
      </span>
    );
  }

  // Built-in only — show the protocol label.
  if (builtIn) {
    return (
      <span
        className={`inline-flex items-center gap-1 font-mono ${className}`}
        title={builtIn.description}
      >
        {display}
        <span className="text-xs bg-gray-200 text-gray-800 px-1 rounded">{builtIn.label}</span>
      </span>
    );
  }

  // Unlabeled. If a book is loaded, soft yellow tint; otherwise plain mono.
  if (bookLoaded) {
    return (
      <span
        className={`bg-yellow-50 text-yellow-900 px-1 rounded font-mono ${className}`}
        title="Not in your address book"
      >
        {display}
      </span>
    );
  }

  return <span className={`font-mono ${className}`}>{display}</span>;
}
