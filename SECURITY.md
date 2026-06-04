# Security

This tool is a hardware-wallet-companion verifier for Safe multisig signers.
The threat model assumes a high-assurance user: someone about to sign a
non-trivial on-chain transaction. The integrity of the binary that performs
the verification is therefore part of the trust boundary, not outside it.

This document covers how to run the tool with the strongest available
verification of what you're executing.

## Threat model

The most realistic attacks against a signing helper are:

1. **Malicious package publish.** An attacker compromises the npm account or
   the publish pipeline and ships a tampered version of `@shield3/sky-safe-cli`
   (or one of its dependencies) that quietly alters what the signer sees.
2. **Compromised transitive dependency.** Any of the ~400 transitive
   dependencies could ship a `preinstall` or `postinstall` script that runs
   with the user's privileges during `npm install`.
3. **Time-of-use mismatch.** The signer reads the source on GitHub but
   executes a different binary from npm.

The mitigations below address each.

## Recommended: build from source

For any signing operation where the consequences matter, build the tool
yourself from a git tag rather than installing from npm:

```bash
# 1. Clone the repository
git clone https://github.com/0xShield3/sky-safe-tx-decoder
cd sky-safe-tx-decoder

# 2. Check out a signed git tag (replace v0.2.0 with the version you want)
git fetch --tags
git checkout v0.2.0

# 3. Verify the tag's GPG signature against a maintainer's public key
git tag -v v0.2.0


# 4. Install with the locked dependency tree and no install scripts
pnpm install --frozen-lockfile

# 5. Build
pnpm build

# 6. Run from the local build
node packages/cli/dist/index.js verify --address 0x... --nonce ...
```

What this gives you that `npx` does not:

- **Source you can read** — the code that runs is the code in the working tree
  you just inspected.
- **GPG-verified provenance** — `git tag -v` confirms the tag was signed by
  a known maintainer, so the binary is tied to a specific reviewed commit.
- **No install scripts** — the project's `.npmrc` sets `ignore-scripts=true`,
  so no dependency can execute code during `pnpm install`. (This is a defense
  in depth on top of the frozen lockfile.)
- **Frozen lockfile** — `--frozen-lockfile` refuses to install if the lockfile
  would be modified, so a compromised registry can't silently substitute a
  different transitive version.

## Acceptable: pinned `npx`

If you accept npm registry trust, always pin the version explicitly:

```bash
npx @shield3/sky-safe-cli@0.1.5 verify --address 0x... --nonce ...
```

Never run `npx @shield3/sky-safe-cli ...` without a version — that resolves
to whatever the registry serves at request time, including a malicious
publish that has not yet been detected.

When a new version is released, read the release notes, check the diff
between the version you have and the new one, and bump the pin
intentionally.

## Installation policies enforced in this repo

The `.npmrc` at the repository root enforces two policies for anyone
installing dev dependencies here:

- **`ignore-scripts=true`** — refuses to execute `pre`/`postinstall` scripts
  from any package, including transitive ones. Build scripts for trusted
  packages can be approved explicitly via `pnpm approve-builds`.
- **`minimum-release-age=10080`** (7 days, in minutes) — refuses to install
  any package version published within the last 7 days. Most malicious
  publishes are detected and yanked within hours; the soak window catches
  the common attack pattern without slowing routine work meaningfully.
  Requires pnpm ≥ 10.

Downstream consumers of the published packages do not inherit these settings
automatically — set them in your own `.npmrc` if you want the same
guarantees during install of `@shield3/sky-safe-cli`.

## Reporting a security issue

Open an issue at https://github.com/0xShield3/sky-safe-tx-decoder/issues for
non-sensitive reports. For coordinated disclosure of an actively exploitable
issue, email the maintainers privately before opening a public issue.
