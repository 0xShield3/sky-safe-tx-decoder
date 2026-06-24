import { HashRouter, Routes, Route, Link } from 'react-router-dom';
import Home from './routes/Home';
import SafeTransactions from './routes/SafeTransactions';
import TransactionAnalysis from './routes/TransactionAnalysis';
import Settings from './routes/Settings';
import { AddressBookProvider } from './address-book/AddressBookContext';
import { AddressBookBar } from './address-book/AddressBookBar';
import { UnsavedSafePrompt } from './address-book/UnsavedSafePrompt';
import { SafeRouteProvider } from './safe-route/SafeRouteProvider';
import './globals.css';

export default function App() {
  return (
    <AddressBookProvider>
      <HashRouter>
        <div className="antialiased min-h-screen flex flex-col">
          <header className="border-b">
            <div className="container mx-auto px-4 py-4 flex items-start justify-between gap-4">
              <Link to="/" className="block hover:opacity-80 transition-opacity">
                <h1 className="text-2xl font-bold">Safe Transaction Decoder</h1>
                <p className="text-sm text-gray-600 mt-1">
                  Independently verify Safe multisig transaction hashes and enhanced decoding for protocol-specific
                  actions
                </p>
              </Link>
              <Link to="/settings" className="text-sm text-blue-600 hover:underline whitespace-nowrap mt-1">
                Settings
              </Link>
            </div>
          </header>
          <AddressBookBar />
          <UnsavedSafePrompt />
          <main className="container mx-auto px-4 py-8 flex-1">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/settings" element={<Settings />} />
              {/* Layout route — every /safe/:network/:address/* page gets
                  network, safeAddress, chainId via context (and the network
                  contract registry is loaded automatically). */}
              <Route path="/safe/:network/:address" element={<SafeRouteProvider />}>
                <Route index element={<SafeTransactions />} />
                <Route path="tx/:nonce" element={<TransactionAnalysis />} />
              </Route>
            </Routes>
          </main>
          <footer className="border-t mt-auto">
            <div className="container mx-auto px-4 py-4 text-sm text-gray-600 text-center">
              Don't trust, verify! • Open source
            </div>
          </footer>
        </div>
      </HashRouter>
    </AddressBookProvider>
  );
}
