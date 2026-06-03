# @shield3/safe-tx-ui

Web interface for Safe transaction hash verification and security analysis.

## Development

```bash
pnpm install
pnpm --filter @shield3/safe-tx-ui dev
# Open http://localhost:5173
```

## Building

```bash
pnpm --filter @shield3/safe-tx-ui build
```

Outputs a static SPA to `dist/`.

## Deployment

### Cloudflare Pages

`wrangler.toml` is included. Set `name` to your project, then:

```bash
pnpm --filter @shield3/safe-tx-ui build
cd packages/ui
npx wrangler login              # one-time
npx wrangler pages deploy dist
```

`public/_redirects` provides the SPA fallback and `public/_headers` sets asset
content types; both are copied into `dist/` at build time.

### IPFS

```bash
pnpm --filter @shield3/safe-tx-ui build
ipfs add -r dist/
```

Or use [Fleek](https://fleek.co), [Pinata](https://pinata.cloud), or IPFS Desktop.

### Other static hosts

Upload the `dist/` folder to Vercel, Netlify, or any static file host.

No server or environment variables required - all API calls are made client-side.

## Stack

- React 18 + Vite
- React Router v7
- TailwindCSS
- @shield3/safe-tx-core

## License

AGPL-3.0-only
