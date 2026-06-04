/**
 * SafeRouteProvider — context for Safe-aware routes (/safe/:network/:address/...).
 *
 * Responsibilities:
 *   - Pull network + safeAddress from route params, expose them via context
 *   - Resolve chainId from the network config
 *   - Call loadNetworkContracts(network) whenever the network changes, so any
 *     descendant that renders an <Address> picks up built-in labels (USDC,
 *     WETH, LockstakeEngine, etc.) without each route remembering to do it
 *
 * Consumers (Address, ParamValue, analyzeSecurity callers) read from
 * useSafeRoute() instead of re-extracting from useParams + threading props.
 *
 * Renders <Outlet /> so this can be used as a react-router layout route.
 */

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { getNetwork, loadNetworkContracts } from '@shield3/sky-safe-core';

export interface SafeRouteValue {
  network: string;
  safeAddress: `0x${string}`;
  chainId: number;
}

const SafeRouteContext = createContext<SafeRouteValue | null>(null);

export function SafeRouteProvider({ children }: { children?: ReactNode }) {
  const params = useParams<{ network: string; address: string }>();
  const network = params.network!;
  const safeAddress = params.address! as `0x${string}`;

  // Swap the per-network built-in contract registry whenever the network
  // changes. Centralizes a call that previously had to be made manually
  // in every Safe-aware route's useEffect.
  useEffect(() => {
    loadNetworkContracts(network);
  }, [network]);

  const value = useMemo<SafeRouteValue>(
    () => ({
      network,
      safeAddress,
      // chainId is derived; getNetwork throws on unknown networks, but we
      // tolerate the throw here by defaulting to 0 so the UI can still render
      // an error state inside the child route.
      chainId: (() => {
        try {
          return getNetwork(network).chainId;
        } catch {
          return 0;
        }
      })(),
    }),
    [network, safeAddress]
  );

  return (
    <SafeRouteContext.Provider value={value}>
      {children ?? <Outlet />}
    </SafeRouteContext.Provider>
  );
}

/**
 * Read the active Safe route context. Throws if used outside a
 * SafeRouteProvider — fail loudly so missing wraps are obvious.
 */
export function useSafeRoute(): SafeRouteValue {
  const ctx = useContext(SafeRouteContext);
  if (!ctx) {
    throw new Error('useSafeRoute must be used inside a SafeRouteProvider');
  }
  return ctx;
}

/**
 * Optional accessor for components that may render inside or outside a Safe
 * route (e.g. <Address> rendered on the home page). Returns null when no
 * Safe context is mounted.
 */
export function useOptionalSafeRoute(): SafeRouteValue | null {
  return useContext(SafeRouteContext);
}
