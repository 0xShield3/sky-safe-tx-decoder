# @shield3/sky-safe-ui

Web interface for Safe transaction hash verification and security analysis.

## Development

```bash
pnpm install
pnpm --filter @shield3/sky-safe-ui dev
# Open http://localhost:5173
```

## Building

```bash
pnpm --filter @shield3/sky-safe-ui build
```

Outputs a static SPA to `dist/`.

## Deployment

### IPFS

```bash
pnpm --filter @shield3/sky-safe-ui build
ipfs add -r dist/
```

Or use [Fleek](https://fleek.co), [Pinata](https://pinata.cloud), or IPFS Desktop.

### Static Hosting

Upload the `dist/` folder to Vercel, Netlify, Cloudflare Pages, or any static file host.

No server or environment variables required - all API calls are made client-side.

## Simulated transactions (development only)

A decoder can only be reviewed against a transaction the app can load, and the app loads
transactions from the Safe Transaction Service by Safe address and nonce. A contract that
has never been called from a Safe therefore has nothing to inspect, and its decoder cannot
be seen rendered.

`src/dev/mockSafeApi.ts` serves fabricated transactions for one sentinel Safe address so
decoder output can be reviewed before any real transaction exists.

Start the dev server and open a fixture by its nonce:

```
http://localhost:5173/#/safe/ethereum/0xfeEDfaCeFeEdFaceFEedFACefEEDFaCEfEeDfAce/tx/0
```

| Nonce | Fixture | Shows |
| ----- | ------- | ----- |
| 0 | `pas-bare-key` | A bare key resolving from its name alone, denominated in USDS |
| 1 | `pas-unlimited-repin` | A two-operand key denominated by its resolved asset operand, re-pinned unlimited |
| 2 | `pas-aggregate-18dec` | `LIMIT_UNISWAP_V3_DEPOSIT` keyed by pool alone, metering a 1e18-normalised sum |
| 3 | `pas-pertoken-6dec` | The same key name keyed by token and pool, metering raw 6-decimal USDC |
| 4 | `pas-unresolved-key` | A key matching no known preimage: full bytes32, no scaled amount, high risk |
| 5 | `pas-controller-action` | `callControllerAction`, with the authorising keccak256 surfaced |

Nonces 2 and 3 are worth opening back to back. They share a key name and differ by a factor
of 10^12.

Every such view carries a banner stating the data is simulated. The hash check fails by
design: fixtures carry a placeholder `safeTxHash`, and the app recomputes the real one
rather than trusting it. Nothing fakes a passing verification.

### Adding a fixture

1. Add an entry to `FIXTURES` in `src/dev/fixtures/generate.mjs`, giving it an unused nonce.
2. Run `node packages/ui/src/dev/fixtures/generate.mjs`.
3. Open the new nonce. The fixture is picked up automatically; nothing else needs editing.

Fixtures follow the same shape as the files in `examples/`, so the CLI reads them too:

```bash
node packages/cli/dist/index.js verify --file packages/ui/src/dev/fixtures/pas-bare-key.json
```

### Why it cannot reach production

Nothing imports the mock statically. It is reached only through a dynamic `import()` inside
an `import.meta.env.DEV` branch in `src/main.tsx`, which Vite replaces with `false` in a
production build, so the module is never pulled into the graph and emits no chunk. The
install function also refuses to run outside a development build, and interception is scoped
to the one sentinel address, so every real Safe reaches the real service untouched.

To re-verify after changing any of this, build and confirm the marker is absent:

```bash
pnpm --filter @shield3/sky-safe-ui build
grep -c "SAFE_API_MOCK_FIXTURE" packages/ui/dist/assets/*.js   # must be 0
```

## Stack

- React 18 + Vite
- React Router v7
- TailwindCSS
- @shield3/sky-safe-core

## License

AGPL-3.0-only
