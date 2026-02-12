import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();
  const [address, setAddress] = useState('');
  const [network, setNetwork] = useState('ethereum');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (address) {
      navigate(`/safe/${network}/${address}`);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-4">Verify Safe Transactions</h2>
        <p className="text-gray-600 mb-4">
          Enter a Safe address to view and verify transactions. This tool independently calculates
          transaction hashes using EIP-712, allowing you to verify what you see on your hardware wallet.
        </p>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            <strong>Why verify?</strong> Hardware wallets like Ledger only show transaction hashes.
            This tool helps you verify that the hash matches the transaction you expect to sign.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="network" className="block text-sm font-medium mb-2">
            Network
          </label>
          <select
            id="network"
            value={network}
            onChange={(e) => setNetwork(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="ethereum">Ethereum Mainnet</option>
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
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            pattern="^0x[a-fA-F0-9]{40}$"
            required
          />
          <p className="text-sm text-gray-500 mt-1">
            Enter a valid Ethereum address
          </p>
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
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 mb-2">Sky Protocol - LockstakeEngine</h4>
          <p className="text-sm text-blue-800 mb-2">
            Enhanced decoding for Sky Protocol staking and rewards operations on Ethereum mainnet.
          </p>
          <p className="text-xs font-mono text-blue-700 mb-3 break-all">
            0xCe01C90dE7FD1bcFa39e237FE6D8D9F569e8A6a3
          </p>
          <div className="flex gap-2 mb-3">
            <a
              href="https://etherscan.io/address/0xCe01C90dE7FD1bcFa39e237FE6D8D9F569e8A6a3"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 rounded hover:bg-blue-200 transition-colors"
            >
              View on Etherscan ↗
            </a>
            <a
              href="https://developers.sky.money/protocol/rewards/staking-engine/#deployments"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 rounded hover:bg-blue-200 transition-colors"
            >
              Protocol Docs ↗
            </a>
          </div>
          <details className="text-sm text-blue-800">
            <summary className="cursor-pointer font-medium hover:text-blue-900">
              Supported Functions (13 total)
            </summary>
            <ul className="mt-2 ml-4 space-y-1 list-disc">
              <li><strong>Urn Management:</strong> open, hope, nope</li>
              <li><strong>Deposit/Withdraw:</strong> lock, free, freeNoFee</li>
              <li><strong>Delegation/Farming:</strong> selectVoteDelegate, selectFarm</li>
              <li><strong>Borrow/Repay:</strong> draw, wipe, wipeAll</li>
              <li><strong>Rewards:</strong> getReward</li>
              <li><strong>Batch Operations:</strong> multicall (with recursive nested decoding)</li>
            </ul>
          </details>
        </div>
        <p className="text-sm text-gray-500 mt-4">
          More protocol decoders coming soon. Contributions welcome!
        </p>
      </div>
    </div>
  );
}
