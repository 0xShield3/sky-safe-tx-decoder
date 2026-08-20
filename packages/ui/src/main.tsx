import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

/**
 * Mount the app, installing the development-only Safe API mock first when this
 * is a development build.
 *
 * The `import.meta.env.DEV` guard is what keeps the mock out of production:
 * Vite replaces the expression with `false`, the branch is eliminated, and the
 * dynamic import is never emitted as a chunk. See src/dev/mockSafeApi.ts.
 *
 * The mock is installed before render so the first fetch is already
 * intercepted.
 */
async function start() {
  if (import.meta.env.DEV) {
    const { installMockSafeApi } = await import('./dev/mockSafeApi');
    installMockSafeApi();
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void start();
