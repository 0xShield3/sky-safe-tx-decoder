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

## Stack

- React 18 + Vite
- React Router v7
- TailwindCSS
- @shield3/sky-safe-core

## License

AGPL-3.0-only
