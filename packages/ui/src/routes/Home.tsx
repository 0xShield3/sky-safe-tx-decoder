import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAddressBook } from '../address-book/AddressBookContext';
import type { AddressBookSafe } from '@shield3/sky-safe-core';

const NETWORK_LABELS: Record<string, string> = {
  ethereum: 'Ethereum Mainnet',
  base: 'Base',
  sepolia: 'Sepolia Testnet',
};

function getConfiguredSafeId(safe: AddressBookSafe): string {
  return `${safe.network}:${safe.address.toLowerCase()}`;
}

/**
 * The protocol decoders registered in this app, as advertised on the home page.
 *
 * One entry per decoder registered in TransactionAnalysis. Keep this list and
 * that registration in step — a decoder that runs but is not listed here leaves
 * a signer unable to tell whether a contract is covered. The `functions` groups
 * mirror the signatures each decoder's ABI declares.
 */
interface ProtocolDecoder {
  name: string;
  address: string;
  summary: string;
  /** Count shown in the disclosure heading — signatures, not names. */
  signatureCount: number;
  functions: Array<{ group: string; names: string }>;
  /** Optional protocol documentation. Omitted where no page exists. */
  docsUrl?: string;
}

const PROTOCOL_DECODERS: ProtocolDecoder[] = [
  {
    name: 'Sky Protocol — LockstakeEngine',
    address: '0xCe01C90dE7FD1bcFa39e237FE6D8D9F569e8A6a3',
    summary: 'Staking, borrowing, delegation and rewards operations on Ethereum mainnet.',
    signatureCount: 13,
    functions: [
      { group: 'Urn management', names: 'open, hope, nope' },
      { group: 'Deposit / withdraw', names: 'lock, free, freeNoFee' },
      { group: 'Delegation / farming', names: 'selectVoteDelegate, selectFarm' },
      { group: 'Borrow / repay', names: 'draw, wipe, wipeAll' },
      { group: 'Rewards', names: 'getReward' },
      { group: 'Batch operations', names: 'multicall (with recursive nested decoding)' },
    ],
    docsUrl: 'https://developers.sky.money/protocol/rewards/staking-engine/#deployments',
  },
  {
    name: 'Sky Protocol — SPBEAM',
    address: '0x36B072ed8AFE665E3Aa6DaBa79Decbec63752b22',
    summary:
      'Sky Protocol Bounded External Access Module. Sets stability fees and the savings rate within governance-configured bounds. The Safe Transaction Service does not decode this contract. Rate values show basis points and percentage; ilk identifiers show their ASCII label alongside the full bytes32.',
    signatureCount: 7,
    functions: [
      { group: 'Rate updates', names: 'set (bulk, one entry per ilk)' },
      { group: 'Configuration', names: 'file (global and per-ilk overloads)' },
      { group: 'Authorisation (wards)', names: 'rely, deny' },
      { group: 'Facilitator allowlist (buds)', names: 'kiss, diss' },
    ],
  },
  {
    name: 'Sky Protocol — StUsdsRateSetter',
    address: '0x30784615252B13E1DbE2bDf598627eaC297Bf4C5',
    summary:
      'Sets the stUSDS savings rate, ilk duty, debt ceiling and supply cap within governance-configured bounds. The Safe Transaction Service holds no ABI for this contract at all.',
    signatureCount: 7,
    functions: [
      { group: 'Rate / ceiling updates', names: 'set (strBps, dutyBps, line, cap)' },
      { group: 'Configuration', names: 'file (global and per-id overloads)' },
      { group: 'Authorisation (wards)', names: 'rely, deny' },
      { group: 'Facilitator allowlist (buds)', names: 'kiss, diss' },
    ],
  },
  {
    name: 'Sky Protocol — PAS Configurator',
    address: '0xb7E61Df6CAb0A51E9A5dab1A7DD3f942dDe5b929',
    summary:
      'Parallelized Allocation System — the cBEAM entry point for moving a PAU rate limit without a spell. PAS rate-limit keys are keccak hashes, not ASCII, so a raw decoding shows 32 opaque bytes; this decoder resolves the key by recomputing its preimage, scales the amount by that key’s own denomination, and renders the per-second refill rate per day. type(uint256).max is labelled UNLIMITED instead of printed as 78 digits.',
    signatureCount: 2,
    functions: [
      { group: 'Rate limits', names: 'setRateLimit (key resolved by keccak preimage)' },
      {
        group: 'Staged actions',
        names: 'callControllerAction (shows keccak256(data), the key BeamState authorises on)',
      },
    ],
  },
];

function DecoderCard({ decoder }: { decoder: ProtocolDecoder }) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <h4 className="font-semibold text-blue-900 mb-2">{decoder.name}</h4>
      <p className="text-sm text-blue-800 mb-2">{decoder.summary}</p>
      <p className="text-xs font-mono text-blue-700 mb-3 break-all">{decoder.address}</p>
      <div className="flex gap-2 mb-3 flex-wrap">
        <a
          href={`https://etherscan.io/address/${decoder.address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 rounded hover:bg-blue-200 transition-colors"
        >
          View on Etherscan ↗
        </a>
        {decoder.docsUrl && (
          <a
            href={decoder.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 rounded hover:bg-blue-200 transition-colors"
          >
            Protocol Docs ↗
          </a>
        )}
      </div>
      <details className="text-sm text-blue-800">
        <summary className="cursor-pointer font-medium hover:text-blue-900">
          Supported functions ({decoder.signatureCount} signatures)
        </summary>
        <ul className="mt-2 ml-4 space-y-1 list-disc">
          {decoder.functions.map((f) => (
            <li key={f.group}>
              <strong>{f.group}:</strong> {f.names}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { mySafes } = useAddressBook();
  const [address, setAddress] = useState('');
  const [network, setNetwork] = useState('ethereum');
  const [selectedConfiguredSafeId, setSelectedConfiguredSafeId] = useState('');
  const configuredSafes = (mySafes?.safes ?? []).filter((safe) => safe.status === 'active');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedAddress = address.trim();
    if (trimmedAddress) {
      navigate(`/safe/${network}/${trimmedAddress}`);
    }
  };

  const handleConfiguredSafeChange = (id: string) => {
    setSelectedConfiguredSafeId(id);
    const configuredSafe = configuredSafes.find((item) => getConfiguredSafeId(item) === id);
    if (!configuredSafe) {
      return;
    }

    setNetwork(configuredSafe.network);
    setAddress(configuredSafe.address);
  };

  const clearSelectedConfiguredSafe = () => {
    if (selectedConfiguredSafeId) {
      setSelectedConfiguredSafeId('');
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-4">Verify Safe Transactions</h2>
        <p className="text-gray-600 mb-4">
          Enter a Safe address to view and verify transactions. This tool independently calculates transaction hashes
          using EIP-712, allowing you to verify what you see on your hardware wallet.
        </p>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            <strong>Why verify?</strong> Hardware wallets like Ledger only show transaction hashes. This tool helps you
            verify that the hash matches the transaction you expect to sign.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {configuredSafes.length > 0 && (
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <label htmlFor="configured-safe" className="block text-sm font-medium mb-2">
              My Safes
            </label>
            <select
              id="configured-safe"
              value={selectedConfiguredSafeId}
              onChange={(e) => handleConfiguredSafeChange(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select one of My Safes...</option>
              {configuredSafes.map((configuredSafe) => (
                <option key={getConfiguredSafeId(configuredSafe)} value={getConfiguredSafeId(configuredSafe)}>
                  {configuredSafe.label} - {NETWORK_LABELS[configuredSafe.network] ?? configuredSafe.network} -{' '}
                  {configuredSafe.address}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="network" className="block text-sm font-medium mb-2">
            Network
          </label>
          <select
            id="network"
            value={network}
            onChange={(e) => {
              clearSelectedConfiguredSafe();
              setNetwork(e.target.value);
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="ethereum">Ethereum Mainnet</option>
            <option value="base">Base</option>
            <option value="sepolia">Sepolia Testnet</option>
          </select>
        </div>

        <div>
          <label htmlFor="address" className="block text-sm font-medium mb-2">
            Safe Address
          </label>
          <input
            id="address"
            type="text"
            value={address}
            onChange={(e) => {
              clearSelectedConfiguredSafe();
              setAddress(e.target.value);
            }}
            placeholder="0x..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            pattern="^0x[a-fA-F0-9]{40}$"
            required
          />
          <p className="text-sm text-gray-500 mt-1">Enter a valid Ethereum address</p>
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          View Transactions
        </button>
      </form>

      <div className="mt-12 pt-8 border-t">
        <h3 className="text-lg font-semibold mb-4">Integrated Protocol Decoders</h3>
        <div className="space-y-4">
          {PROTOCOL_DECODERS.map((decoder) => (
            <DecoderCard key={decoder.address} decoder={decoder} />
          ))}
        </div>
        <p className="text-sm text-gray-500 mt-4">More protocol decoders coming soon. Contributions welcome!</p>
      </div>
    </div>
  );
}
