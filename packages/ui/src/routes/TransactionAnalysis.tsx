import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  SafeApiClient,
  calculateSafeTxHash,
  analyzeSecurity,
  decoderRegistry,
  LockstakeEngineDecoder,
  decodeMultiSend,
  isMultiSend,
  getAddressTag,
  verifyDecodedData,
  type SafeApiMultisigTransaction,
  type SecurityAnalysisResult,
  type DecodedTransactionData,
  type DecodedMultiSendTransaction,
  type SafeApiNestedTransaction,
  type SafeApiDataDecoded,
  type DecodeVerificationResult,
} from '@shield3/sky-safe-core';
import { AddressHighlighter } from '../components/AddressHighlighter';

// Register custom decoders
decoderRegistry.register(new LockstakeEngineDecoder());

export default function TransactionAnalysis() {
  const navigate = useNavigate();
  const params = useParams<{ address: string; nonce: string; network: string }>();
  const address = params.address!;
  const nonce = params.nonce!;
  const network = params.network!;
  const [searchParams] = useSearchParams();
  const safeTxHashParam = searchParams.get('safeTxHash');

  const [allTransactions, setAllTransactions] = useState<SafeApiMultisigTransaction[]>([]);
  const [transaction, setTransaction] = useState<SafeApiMultisigTransaction | null>(null);
  const [version, setVersion] = useState<string>('');
  const [hashes, setHashes] = useState<{ domainHash: string; messageHash: string; safeTxHash: string } | null>(null);
  const [security, setSecurity] = useState<SecurityAnalysisResult | null>(null);
  const [customDecoded, setCustomDecoded] = useState<DecodedTransactionData | null>(null);
  const [apiDecodedVerification, setApiDecodedVerification] = useState<DecodeVerificationResult | null>(null);
  const [multiSendVerification, setMultiSendVerification] = useState<DecodeVerificationResult | null>(null);
  const [multiSendTxs, setMultiSendTxs] = useState<Array<{
    tx: DecodedMultiSendTransaction;
    decoded?: DecodedTransactionData;
    apiDecoded?: SafeApiDataDecoded | null;
    verification?: DecodeVerificationResult;
  }> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Loading transaction...');
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'decoded' | 'raw'>('decoded');

  useEffect(() => {
    const fetchAndAnalyze = async () => {
      try {
        setLoading(true);
        setError(null);
        setLoadingMessage('Loading transaction...');

        const client = new SafeApiClient(network, (message) => {
          setLoadingMessage(message);
        });

        // Fetch all transactions with this nonce
        const transactions = await client.fetchTransactionsByNonce(
          address as `0x${string}`,
          parseInt(nonce)
        );

        // Store all transactions
        setAllTransactions(transactions);

        // Select transaction: use safeTxHash param if provided (when switching via dropdown), otherwise use first
        let tx: typeof transactions[0];
        if (safeTxHashParam) {
          const found = transactions.find(t => t.safeTxHash === safeTxHashParam);
          tx = found || transactions[0]!;
        } else {
          tx = transactions[0]!;
        }
        setTransaction(tx);

        // Fetch Safe version
        setLoadingMessage('Loading Safe version...');
        const safeVersion = await client.fetchSafeVersion(address as `0x${string}`);
        setVersion(safeVersion);
        setLoadingMessage('Calculating transaction hash...');

        // Get chain ID for network
        const chainId = network === 'sepolia' ? 11155111 : 1;

        // Calculate hash
        const computed = calculateSafeTxHash(
          chainId,
          address as `0x${string}`,
          {
            to: tx.to as `0x${string}`,
            value: tx.value,
            data: tx.data as `0x${string}`,
            operation: tx.operation,
            safeTxGas: tx.safeTxGas.toString(),
            baseGas: tx.baseGas.toString(),
            gasPrice: tx.gasPrice,
            gasToken: tx.gasToken as `0x${string}`,
            refundReceiver: tx.refundReceiver as `0x${string}`,
            nonce: tx.nonce.toString(),
          },
          safeVersion
        );
        setHashes(computed);

        // Analyze security
        const analysis = analyzeSecurity({
          to: tx.to as `0x${string}`,
          value: tx.value,
          data: tx.data as `0x${string}`,
          operation: tx.operation,
          safeTxGas: tx.safeTxGas.toString(),
          baseGas: tx.baseGas.toString(),
          gasPrice: tx.gasPrice,
          gasToken: tx.gasToken as `0x${string}`,
          refundReceiver: tx.refundReceiver as `0x${string}`,
          nonce: tx.nonce.toString(),
        });
        setSecurity(analysis);

        // Try custom decoder or MultiSend detection
        if (tx.data && tx.data !== '0x' && tx.data.length > 2) {
          if (isMultiSend(tx.data as `0x${string}`)) {
            console.log('Detected MultiSend transaction');
            const nestedTxs = decodeMultiSend(tx.data as `0x${string}`);

            // Verify the outer MultiSend transaction itself
            if (tx.dataDecoded) {
              const outerVerification = verifyDecodedData(tx.data as `0x${string}`, tx.dataDecoded);
              setMultiSendVerification(outerVerification);
              console.log('MultiSend outer transaction verification:', outerVerification);
            }

            if (nestedTxs) {
              // Get Safe API decoded nested transactions from valueDecoded
              let apiNestedTxs: SafeApiNestedTransaction[] | null = null;
              if (tx.dataDecoded?.parameters) {
                const transactionsParam = tx.dataDecoded.parameters.find(p => p.name === 'transactions');
                if (transactionsParam?.valueDecoded && Array.isArray(transactionsParam.valueDecoded)) {
                  apiNestedTxs = transactionsParam.valueDecoded as SafeApiNestedTransaction[];
                  console.log('Found Safe API decoded nested transactions:', apiNestedTxs);
                }
              }

              // Try to decode each nested transaction with custom decoders + preserve Safe API data
              const decoded = nestedTxs.map((nestedTx, index) => {
                const customDecoded = decoderRegistry.decode(
                  nestedTx.to as `0x${string}`,
                  nestedTx.data,
                  network
                );

                // Get corresponding Safe API decoded data
                const apiDecoded = apiNestedTxs?.[index]?.dataDecoded || null;

                // Verify Safe API decoded data against raw data
                const verification = apiDecoded
                  ? verifyDecodedData(nestedTx.data, apiDecoded)
                  : undefined;

                return { tx: nestedTx, decoded: customDecoded, apiDecoded, verification };
              });

              setMultiSendTxs(decoded);
              console.log('Decoded nested transactions:', decoded);
            }
          } else {
            // Try direct custom decoder
            console.log('Attempting to decode:');
            console.log('  to address:', tx.to);
            console.log('  network:', network);
            console.log('  data length:', tx.data.length);
            console.log('  hasDecoder:', decoderRegistry.hasDecoder(tx.to as `0x${string}`, network));

            const decoded = decoderRegistry.decode(tx.to as `0x${string}`, tx.data, network);
            if (decoded) {
              console.log('Decoded:', decoded);
              setCustomDecoded(decoded);
            }
            else {
              console.log('No decoder found or decode failed');

              // If no custom decoder but Safe API has decoded data, verify it
              if (tx.dataDecoded) {
                const verification = verifyDecodedData(tx.data as `0x${string}`, tx.dataDecoded);
                setApiDecodedVerification(verification);
                console.log('Safe API decoded data verification:', verification);
              }
            }
          }
        }
      } catch (err) {
        let errorMessage = 'Failed to fetch transaction';

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

    fetchAndAnalyze();
  }, [address, nonce, network, safeTxHashParam]);

  // Handler for switching between multiple transactions
  const handleTransactionSwitch = (safeTxHash: string) => {
    navigate(`/safe/${network}/${address}/tx/${nonce}?safeTxHash=${safeTxHash}`);
  };

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

  if (error || !transaction) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">
            <strong>Error:</strong> {error || 'Transaction not found'}
          </p>
        </div>
      </div>
    );
  }

  const hashesMatch = hashes?.safeTxHash === transaction.safeTxHash;
  const hasRisks = security && security.overallRisk !== 'none';
  const hasCustomDecoding = customDecoded || (multiSendTxs && multiSendTxs.length > 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => navigate(`/safe/${network}/${address}`)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            ← Back to List
          </button>
          <h2 className="text-2xl font-bold">Transaction Analysis</h2>
        </div>
        <div className="text-sm text-gray-600 space-y-1">
          <p>Safe: <span className="font-mono">{address}</span></p>
          <p>Network: {network} | Nonce: {nonce} | Safe Version: {version}</p>
        </div>
      </div>

      {/* Transaction Selector (if multiple exist) */}
      {allTransactions.length > 1 && (
        <div className="border-2 border-blue-500 bg-blue-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-800 font-semibold mb-1">Multiple Transactions with Nonce {nonce}</p>
              <p className="text-sm text-blue-700">
                Select which transaction to analyze:
              </p>
            </div>
            <select
              value={transaction.safeTxHash}
              onChange={(e) => handleTransactionSwitch(e.target.value)}
              className="px-3 py-2 border border-blue-300 rounded-lg bg-white text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {allTransactions.map((tx, idx) => {
                const status = tx.isExecuted
                  ? (tx.isSuccessful ? '✅ Executed' : '❌ Failed')
                  : `⏳ Pending (${tx.confirmations?.length || 0}/${tx.confirmationsRequired})`;
                const date = tx.submissionDate ? new Date(tx.submissionDate).toLocaleString() : 'Unknown';
                return (
                  <option key={tx.safeTxHash} value={tx.safeTxHash}>
                    [{idx + 1}] {status} | {date} | {tx.safeTxHash.slice(0, 10)}...
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      )}

      {/* STEP 1: Security Warnings - MOST IMPORTANT */}
      {hasRisks && (
        <div className={`border-2 rounded-lg p-6 ${
          security.overallRisk === 'critical' ? 'border-red-600 bg-red-50' :
          security.overallRisk === 'high' ? 'border-orange-600 bg-orange-50' :
          security.overallRisk === 'medium' ? 'border-yellow-600 bg-yellow-50' :
          'border-blue-500 bg-blue-50'
        }`}>
          <div className="flex items-start gap-3 mb-4">
            <div className="text-3xl">⚠️</div>
            <div className="flex-1">
              <h3 className="text-xl font-bold mb-1">Security Warnings</h3>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Risk Level:</span>
                <span className={`px-3 py-1 rounded-full font-bold uppercase text-sm ${
                  security.overallRisk === 'critical' ? 'bg-red-600 text-white' :
                  security.overallRisk === 'high' ? 'bg-orange-600 text-white' :
                  security.overallRisk === 'medium' ? 'bg-yellow-600 text-white' :
                  'bg-blue-500 text-white'
                }`}>
                  {security.overallRisk}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {security.delegateCall.warning && (
              <div className="bg-white rounded-lg p-4">
                <p className="font-semibold mb-2">🔴 Delegate Call Warning</p>
                <p className="text-sm">{security.delegateCall.warning}</p>
              </div>
            )}

            {security.gasToken.warnings.length > 0 && (
              <div className="bg-white rounded-lg p-4">
                <p className="font-semibold mb-2">🔴 Gas Token Attack</p>
                <ul className="text-sm space-y-1">
                  {security.gasToken.warnings.map((warning, i) => (
                    <li key={i}>• {warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {security.ownerModification.warning && (
              <div className="bg-white rounded-lg p-4">
                <p className="font-semibold mb-2">🔴 Owner/Threshold Modification</p>
                <p className="text-sm">{security.ownerModification.warning}</p>
              </div>
            )}

            {security.moduleGuard.warnings && security.moduleGuard.warnings.length > 0 && (
              <div className="bg-white rounded-lg p-4">
                <p className="font-semibold mb-2">🔴 Module/Guard Warning</p>
                <ul className="text-sm space-y-1">
                  {security.moduleGuard.warnings.map((warning, i) => (
                    <li key={i}>• {warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: Transaction Data - What are you signing? */}
      <div className="border-2 border-gray-300 rounded-lg overflow-hidden">
        <div className="bg-gray-100 p-4 border-b-2 border-gray-300">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold">Transaction Data</h3>
              <p className="text-sm text-gray-600 mt-1">
                Review what this transaction does before signing
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('decoded')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === 'decoded'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Decoded
              </button>
              <button
                onClick={() => setViewMode('raw')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === 'raw'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Raw
              </button>
            </div>
          </div>
        </div>

        <div className="p-6">
          {viewMode === 'decoded' ? (
            <div className="space-y-6">
              {/* Enhanced Custom Decoder */}
              {customDecoded && (
                <div className="space-y-4">
                  <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                    <div className="flex items-start gap-2 mb-3">
                      <span className="text-lg">🔍</span>
                      <div className="flex-1">
                        <p className="font-semibold text-purple-900 mb-1">{customDecoded.main.name}</p>
                        <p className="text-xs font-mono text-purple-600">{customDecoded.main.signature}</p>
                      </div>
                    </div>
                    {customDecoded.main.explanation && (
                      <div className="text-sm text-gray-700 bg-white p-3 rounded">
                        <AddressHighlighter text={customDecoded.main.explanation} safeAddress={address} />
                      </div>
                    )}
                  </div>

                  {customDecoded.main.parameters.length > 0 && (
                    <div>
                      <p className="font-semibold mb-3">Parameters:</p>
                      <div className="space-y-3">
                        {customDecoded.main.parameters.map((param, i) => (
                          <div key={i} className="bg-gray-50 rounded-lg p-4">
                            <div className="flex items-start justify-between mb-2">
                              <span className="font-semibold">{param.name}</span>
                              <span className="text-xs text-gray-500 font-mono">{param.type}</span>
                            </div>
                            <div className="font-mono text-sm break-all bg-white p-3 rounded border">
                              {typeof param.value === 'object' ? JSON.stringify(param.value, null, 2) : String(param.value)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {customDecoded.main.warnings && customDecoded.main.warnings.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <p className="font-semibold text-yellow-900 mb-2">⚠️ Function-Specific Warnings:</p>
                      <ul className="text-sm space-y-1">
                        {customDecoded.main.warnings.map((warning, i) => (
                          <li key={i} className="text-yellow-800">• {warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Nested Calls */}
                  {customDecoded.nested && customDecoded.nested.length > 0 && (
                    <div className="border-t pt-4">
                      <p className="font-semibold mb-3">Nested Calls ({customDecoded.nested.length}):</p>
                      <div className="space-y-3">
                        {customDecoded.nested.map((call, idx) => (
                          <div key={idx} className="bg-gray-50 rounded-lg p-4 border">
                            <div className="flex items-start gap-2 mb-2">
                              <span className="text-xs font-semibold text-purple-600 bg-purple-100 px-2 py-1 rounded">
                                Call {idx + 1}
                              </span>
                              <div className="flex-1">
                                <p className="font-semibold">{call.name}</p>
                                <p className="text-xs font-mono text-gray-500">{call.signature}</p>
                              </div>
                            </div>
                            {call.explanation && (
                              <div className="text-sm text-gray-600 mb-2">
                                <AddressHighlighter text={call.explanation} safeAddress={address} />
                              </div>
                            )}
                            {call.parameters.length > 0 && (
                              <div className="space-y-2 mt-3">
                                {call.parameters.map((param, i) => (
                                  <div key={i} className="text-sm">
                                    <span className="font-semibold">{param.name}</span>
                                    <span className="text-gray-500"> ({param.type})</span>
                                    <div className="font-mono text-xs bg-white p-2 rounded border mt-1 break-all">
                                      {typeof param.value === 'object' ? JSON.stringify(param.value, null, 2) : String(param.value)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* MultiSend Batched Transactions */}
              {multiSendTxs && multiSendTxs.length > 0 && (
                <div className="space-y-4">
                  <div className={`rounded-lg p-4 border ${
                    multiSendVerification?.verified
                      ? 'bg-indigo-50 border-indigo-200'
                      : multiSendVerification?.verified === false
                      ? 'bg-red-50 border-red-400'
                      : 'bg-indigo-50 border-indigo-200'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📦</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-indigo-900">MultiSend Batch</p>
                          {multiSendVerification && (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                              multiSendVerification.verified
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {multiSendVerification.verified ? '✓ Verified' : '⚠ Mismatch'}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-indigo-700">{multiSendTxs.length} transactions in this batch</p>
                        {!multiSendVerification?.verified && multiSendVerification?.error && (
                          <p className="text-xs text-red-700 mt-2">
                            ⚠️ Warning: {multiSendVerification.error}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {multiSendTxs.map((item, idx) => (
                    <div key={idx} className="bg-gray-50 rounded-lg p-4 border-2 border-gray-200">
                      <div className="flex items-start gap-3 mb-3">
                        <span className="text-sm font-bold text-indigo-600 bg-indigo-100 px-3 py-1 rounded-full">
                          #{idx + 1}
                        </span>
                        <div className="flex-1">
                          <div className="text-sm space-y-2">
                            <div>
                              <span className="text-gray-600 font-medium">To:</span>
                              <div className="font-mono text-xs mt-1 break-all">{item.tx.to}</div>
                              {getAddressTag(item.tx.to as `0x${string}`) && (
                                <span className="inline-block mt-1 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                                  {getAddressTag(item.tx.to as `0x${string}`)!.label}
                                </span>
                              )}
                            </div>
                            <div>
                              <span className="text-gray-600 font-medium">Value:</span> {item.tx.value.toString()} wei
                            </div>
                            <div>
                              <span className="text-gray-600 font-medium">Operation:</span>{' '}
                              {item.tx.operation === 0 ? 'Call' : item.tx.operation === 1 ? 'DelegateCall' : 'Unknown'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Custom decoded data for nested transaction */}
                      {item.decoded && (
                        <div className="mt-3 pt-3 border-t border-gray-300">
                          <div className="bg-purple-50 rounded p-3 border border-purple-200 mb-3">
                            <p className="font-semibold text-purple-900">{item.decoded.main.name}</p>
                            <p className="text-xs font-mono text-purple-600">{item.decoded.main.signature}</p>
                            {item.decoded.main.explanation && (
                              <div className="text-sm text-gray-700 mt-2">
                                <AddressHighlighter text={item.decoded.main.explanation} safeAddress={address} />
                              </div>
                            )}
                          </div>
                          {item.decoded.main.parameters.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-gray-700">Parameters:</p>
                              {item.decoded.main.parameters.map((param, i) => (
                                <div key={i} className="text-xs">
                                  <span className="font-semibold">{param.name}</span>
                                  <span className="text-gray-500"> ({param.type})</span>
                                  <div className="font-mono bg-white p-2 rounded border mt-1 break-all">
                                    {typeof param.value === 'object' ? JSON.stringify(param.value, null, 2) : String(param.value)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {item.decoded.main.warnings && item.decoded.main.warnings.length > 0 && (
                            <div className="mt-2 bg-yellow-50 border border-yellow-200 rounded p-2">
                              {item.decoded.main.warnings.map((warning, i) => (
                                <p key={i} className="text-xs text-yellow-800">⚠️ {warning}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Safe API decoded data (when no custom decoder) */}
                      {!item.decoded && item.apiDecoded && (
                        <div className="mt-3 pt-3 border-t border-gray-300">
                          <div className={`rounded p-3 border mb-3 ${
                            item.verification?.verified
                              ? 'bg-blue-50 border-blue-200'
                              : 'bg-red-50 border-red-400'
                          }`}>
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold text-blue-900">Method: {item.apiDecoded.method}</p>
                              {item.verification && (
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                                  item.verification.verified
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-red-100 text-red-800'
                                }`}>
                                  {item.verification.verified ? '✓ Verified' : '⚠ Mismatch'}
                                </span>
                              )}
                            </div>
                            {!item.verification?.verified && item.verification?.error && (
                              <p className="text-xs text-red-700 mt-2">
                                ⚠️ Warning: {item.verification.error}
                              </p>
                            )}
                          </div>
                          {item.apiDecoded.parameters.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-gray-700">Parameters:</p>
                              {item.apiDecoded.parameters.map((param, i) => (
                                <div key={i} className="text-xs">
                                  <span className="font-semibold">{param.name}</span>
                                  <span className="text-gray-500"> ({param.type})</span>
                                  <div className="font-mono bg-white p-2 rounded border mt-1 break-all">
                                    {typeof param.value === 'object' ? JSON.stringify(param.value, null, 2) : String(param.value)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Safe API Decoded Data (if no custom decoder) */}
              {!hasCustomDecoding && transaction.dataDecoded && (
                <div className="space-y-4">
                  <div className={`rounded-lg p-4 border ${
                    apiDecodedVerification?.verified
                      ? 'bg-blue-50 border-blue-200'
                      : apiDecodedVerification?.verified === false
                      ? 'bg-red-50 border-red-400'
                      : 'bg-blue-50 border-blue-200'
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-blue-900">Method: {transaction.dataDecoded.method}</p>
                      {apiDecodedVerification && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          apiDecodedVerification.verified
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {apiDecodedVerification.verified ? '✓ Verified' : '⚠ Mismatch'}
                        </span>
                      )}
                    </div>
                    {!apiDecodedVerification?.verified && apiDecodedVerification?.error && (
                      <p className="text-xs text-red-700 mt-2">
                        ⚠️ Warning: {apiDecodedVerification.error}
                      </p>
                    )}
                  </div>

                  {transaction.dataDecoded.parameters.length > 0 && (
                    <div>
                      <p className="font-semibold mb-3">Parameters:</p>
                      <div className="space-y-3">
                        {transaction.dataDecoded.parameters.map((param, i) => (
                          <div key={i} className="bg-gray-50 rounded-lg p-4">
                            <div className="flex items-start justify-between mb-2">
                              <span className="font-semibold">{param.name}</span>
                              <span className="text-xs text-gray-500 font-mono">{param.type}</span>
                            </div>
                            <div className="font-mono text-sm break-all bg-white p-3 rounded border">
                              {typeof param.value === 'object' ? JSON.stringify(param.value, null, 2) : String(param.value)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Basic transaction info */}
              <div className="border-t pt-4 space-y-3 text-sm">
                <div>
                  <span className="text-gray-600 font-medium">To Address:</span>
                  <div className="font-mono text-xs mt-1 break-all">{transaction.to}</div>
                  {getAddressTag(transaction.to as `0x${string}`) && (
                    <span className="inline-block mt-1 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                      {getAddressTag(transaction.to as `0x${string}`)!.label}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-gray-600 font-medium">Value:</span> {transaction.value} wei
                </div>
                <div>
                  <span className="text-gray-600 font-medium">Operation:</span>{' '}
                  {transaction.operation === 0 ? 'Call' : transaction.operation === 1 ? 'DelegateCall' : 'Unknown'}
                </div>
              </div>
            </div>
          ) : (
            /* Raw View */
            <div className="space-y-4 font-mono text-sm">
              <div>
                <p className="text-gray-600 font-semibold mb-2">To:</p>
                <p className="bg-gray-50 p-3 rounded break-all">{transaction.to}</p>
              </div>
              <div>
                <p className="text-gray-600 font-semibold mb-2">Value (wei):</p>
                <p className="bg-gray-50 p-3 rounded">{transaction.value}</p>
              </div>
              <div>
                <p className="text-gray-600 font-semibold mb-2">Data:</p>
                <p className="bg-gray-50 p-3 rounded break-all text-xs">{transaction.data}</p>
              </div>
              <div>
                <p className="text-gray-600 font-semibold mb-2">Operation:</p>
                <p className="bg-gray-50 p-3 rounded">{transaction.operation}</p>
              </div>
              <div>
                <p className="text-gray-600 font-semibold mb-2">Safe TX Gas:</p>
                <p className="bg-gray-50 p-3 rounded">{transaction.safeTxGas}</p>
              </div>
              <div>
                <p className="text-gray-600 font-semibold mb-2">Base Gas:</p>
                <p className="bg-gray-50 p-3 rounded">{transaction.baseGas}</p>
              </div>
              <div>
                <p className="text-gray-600 font-semibold mb-2">Gas Price:</p>
                <p className="bg-gray-50 p-3 rounded">{transaction.gasPrice}</p>
              </div>
              <div>
                <p className="text-gray-600 font-semibold mb-2">Gas Token:</p>
                <p className="bg-gray-50 p-3 rounded break-all">{transaction.gasToken}</p>
              </div>
              <div>
                <p className="text-gray-600 font-semibold mb-2">Refund Receiver:</p>
                <p className="bg-gray-50 p-3 rounded break-all">{transaction.refundReceiver}</p>
              </div>
              <div>
                <p className="text-gray-600 font-semibold mb-2">Nonce:</p>
                <p className="bg-gray-50 p-3 rounded">{transaction.nonce}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transaction Status */}
      <div className="bg-gray-50 rounded-lg p-4 border">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Status:</span>
          <span className={`font-semibold ${
            transaction.isExecuted
              ? (transaction.isSuccessful ? 'text-green-600' : 'text-red-600')
              : 'text-yellow-600'
          }`}>
            {transaction.isExecuted ? (transaction.isSuccessful ? '✅ Executed' : '❌ Failed') : '⏳ Pending'}
          </span>
        </div>
        {!transaction.isExecuted && (
          <div className="flex items-center justify-between text-sm mt-2">
            <span className="text-gray-600">Confirmations:</span>
            <span>{transaction.confirmations.length} / {transaction.confirmationsRequired}</span>
          </div>
        )}
      </div>

      {/* STEP 3: Hash Verification - Compare to your hardware wallet */}
      {hashes && (
        <div className="border-2 border-blue-300 rounded-lg overflow-hidden">
          <div className="bg-blue-50 p-4 border-b-2 border-blue-300">
            <h3 className="text-lg font-bold text-blue-900 mb-1">Hardware Wallet Verification</h3>
            <p className="text-sm text-blue-800">
              Compare these hashes with what appears on your hardware wallet screen
            </p>
          </div>

          <div className="p-6 space-y-4">
            <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-4">
              <p className="font-semibold text-yellow-900 mb-2">⚠️ Critical Step</p>
              <p className="text-sm text-yellow-900">
                Your device may show one or more of these hashes. Verify they match character-by-character.
                If any hash doesn't match, DO NOT SIGN!
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Message Hash:</p>
                <div className="bg-gray-900 p-3 rounded-lg">
                  <p className="font-mono text-green-400 text-xs break-all">
                    {hashes.messageHash}
                  </p>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Unique per transaction. Often shown on Ledger Nano S and similar smaller devices.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Safe Transaction Hash:</p>
                <div className="bg-gray-900 p-3 rounded-lg">
                  <p className="font-mono text-green-400 text-xs break-all">
                    {hashes.safeTxHash}
                  </p>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Unique per transaction per Safe. Shown on some devices.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Domain Separator Hash:</p>
                <div className="bg-gray-900 p-3 rounded-lg">
                  <p className="font-mono text-green-400 text-xs break-all">
                    {hashes.domainHash}
                  </p>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Unique per Safe. EIP-712 domain separator (rarely shown alone).
                </p>
              </div>
            </div>

            {!hashesMatch && (
              <div className="bg-red-50 border-2 border-red-400 rounded-lg p-4">
                <p className="font-semibold text-red-900 mb-2">⚠️ HASH MISMATCH WARNING</p>
                <p className="text-sm text-red-900">
                  Our calculated Safe Transaction Hash does not match what the Safe API provided.
                  This could indicate the API is compromised or returning incorrect data. DO NOT SIGN!
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
