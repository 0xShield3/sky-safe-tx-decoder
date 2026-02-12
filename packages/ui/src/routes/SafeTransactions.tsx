import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SafeApiClient, type SafeApiMultisigTransaction, getSafeUrl, getEtherscanAddressUrl } from '@shield3/sky-safe-core';

export default function SafeTransactions() {
  const params = useParams<{ address: string; network: string }>();
  const address = params.address!;
  const network = params.network!;
  const navigate = useNavigate();

  const [transactions, setTransactions] = useState<SafeApiMultisigTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Loading transactions...');
  const [error, setError] = useState<string | null>(null);
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const [nonceInput, setNonceInput] = useState('');

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        setLoading(true);
        setError(null);
        setLoadingMessage('Loading transactions...');

        const client = new SafeApiClient(network, (message) => {
          setLoadingMessage(message);
        });
        const result = await client.fetchTransactions(address as `0x${string}`);

        setTransactions(result.results);
      } catch (err) {
        let errorMessage = 'Failed to fetch transactions';

        if (err instanceof Error) {
          // Check for rate limiting (429 status)
          if (err.message.includes('429') || err.message.toLowerCase().includes('rate limit')) {
            errorMessage = 'Rate limited by Safe API. Please try again in a moment. Safe rate limits the public API for security.';
          } else {
            errorMessage = err.message;
          }
        }

        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, [address, network]);

  const handleTransactionClick = (nonce: string) => {
    navigate(`/safe/${network}/${address}/tx/${nonce}`);
  };

  const handleNonceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (nonceInput && !isNaN(parseInt(nonceInput))) {
      navigate(`/safe/${network}/${address}/tx/${nonceInput}`);
    }
  };

  const filteredTransactions = showPendingOnly
    ? transactions.filter(tx => !tx.isExecuted)
    : transactions;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-gray-700 font-medium">{loadingMessage}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">
            <strong>Error:</strong> {error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold mb-2">Safe Transactions</h2>
            <p className="text-gray-600 text-sm mb-1">Safe: {address}</p>
            <p className="text-gray-600 text-sm">Network: {network}</p>
          </div>
          <div className="flex gap-2">
            <a
              href={getSafeUrl(network, address)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
            >
              View on Safe ↗
            </a>
            <a
              href={getEtherscanAddressUrl(network, address)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
            >
              View on Etherscan ↗
            </a>
          </div>
        </div>
      </div>

      {/* Nonce input and filters */}
      <div className="mb-6 space-y-4">
        <form onSubmit={handleNonceSubmit} className="flex gap-2">
          <input
            type="number"
            value={nonceInput}
            onChange={(e) => setNonceInput(e.target.value)}
            placeholder="Go to nonce..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            min="0"
          />
          <button
            type="submit"
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Go
          </button>
        </form>

        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Showing {filteredTransactions.length} of {transactions.length} transactions
            {transactions.length === 20 && <span className="text-gray-500"> (20 most recent)</span>}
          </p>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={showPendingOnly}
              onChange={(e) => setShowPendingOnly(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Show pending only</span>
          </label>
        </div>
      </div>

      {filteredTransactions.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">
            {showPendingOnly ? 'No pending transactions found.' : 'No transactions found for this Safe.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTransactions.map((tx) => (
            <div
              key={tx.safeTxHash}
              onClick={() => handleTransactionClick(tx.nonce.toString())}
              className="border rounded-lg p-4 hover:border-blue-500 hover:shadow-md cursor-pointer transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                      Nonce: {tx.nonce}
                    </span>
                    <span className={`text-sm px-2 py-1 rounded ${
                      tx.isExecuted
                        ? tx.isSuccessful
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {tx.isExecuted ? (tx.isSuccessful ? 'Executed' : 'Failed') : 'Pending'}
                    </span>
                  </div>

                  <div className="space-y-1 text-sm">
                    <div>
                      <span className="text-gray-600">To:</span>{' '}
                      <span className="font-mono">{tx.to}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Value:</span> {tx.value} wei
                    </div>
                    {tx.dataDecoded && (
                      <div>
                        <span className="text-gray-600">Method:</span>{' '}
                        <span className="font-semibold">{tx.dataDecoded.method}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-gray-600">Confirmations:</span>{' '}
                      {tx.confirmations.length}/{tx.confirmationsRequired}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <button className="text-blue-600 hover:text-blue-700 font-medium text-sm">
                    Analyze →
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
