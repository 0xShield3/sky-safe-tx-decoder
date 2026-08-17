# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Added

- **PAS Configurator decoder** (`0xb7E61Df6CAb0A51E9A5dab1A7DD3f942dDe5b929`,
  Ethereum mainnet), covering both of the contract's state-changing functions:
  `setRateLimit` and `callControllerAction`. The ABI is transcribed from the
  source verified on Sourcify — exact match on creation and runtime bytecode,
  `src/Configurator.sol:Configurator`, solc 0.8.24+commit.e11b9ed9, not a proxy.

  This decoder is not about types. The Configurator is verified, so the Sourcify
  fallback already decodes it correctly in the web UI. It is about meaning:

  - **Rate-limit keys are resolved by keccak preimage.** PAS keys are hashes,
    not right-padded ASCII, so `bytes32ToLabel` returns `(not ASCII)` for every
    one of them and a raw decoding gives a signer 32 opaque bytes. Names are
    recomputed and byte-matched, including the `abi.encode` composition used for
    address-, pair-, and domain-scoped keys. An unmatched key is reported as
    unresolved with its full `bytes32` — never guessed.
  - **Amounts are scaled by the key's denomination, not the target contract's.**
    `LIMIT_USDE_MINT` is denominated in USDC rather than USDe, so reading it as
    18 decimals misstates the amount by a factor of 10^12. Keys whose scale
    follows a token they are scoped to are left as raw integers with the scale
    stated as undetermined.
  - **Per-second refill rates are rendered per day**, which is the figure a
    signer can sanity-check.
  - **`type(uint256).max` is labelled UNLIMITED** rather than printed as 78
    digits, and re-pinning an unlimited key is flagged.
  - **Direction is not claimed.** Whether a call raises or lowers a limit, and
    whether it is within the ceiling, depends on the limit's current on-chain
    value and is absent from the calldata. The decoder says so and names the
    reads that settle it, rather than inferring a direction it cannot know.
  - **`callControllerAction` shows `keccak256(data)`** — the value BeamState
    authorises on — and declines to decode the inner calldata, since no ABI for
    an arbitrary controller is trustworthy at this layer.

  The CLI has no Sourcify fallback ([#19]), so there this is the only path to
  any PAS decoding at all.

- **PAS contracts added to the Ethereum registry** so they are labelled during
  review: PAS Configurator, PAS BeamState
  (`0x1A1879E66547F90bfF87D45A5b0335950E019E02`), and the Grove RateLimits
  contract (`0xE016Ae733A77Ba77E7907aAA749394Fc5e75C0e1`).

[#19]: https://github.com/0xShield3/sky-safe-tx-decoder/issues/19

## [0.3.1] — 2026-08-12

Beacon proxy support, wider decoder coverage on Sourcify, and a changed default
for how token amounts are displayed.

> **Read this before upgrading.** Despite the patch version, this release
> **changes a default**. An ERC-20 amount that previously read `1000000` now
> reads `1` by default on a call to a known token. The raw integer is still
> shown, and it is still the value that matches the signed bytes — but the
> figure your eye lands on has changed. See "Amount scale" below.

### Added

- **Beacon proxies are followed.** The Sourcify fallback resolved only the
  EIP-1967 implementation slot. A beacon proxy leaves that slot empty and names
  a beacon which reports the implementation, so calls to one showed as
  undecodable even when the implementation was fully verified. Both layouts now
  resolve, and the provenance line names every contract trusted to produce the
  ABI — `Proxy → beacon 0x… → implementation 0x…`. Resolution is bounded to one
  hop and cannot loop.
- **The Sourcify badge links to the verified sources**, so the ABI behind a
  decoding can be inspected rather than taken on trust. It points at the
  implementation when a proxy was followed, since the proxy's sources do not
  contain the decoded function.
- **A pending state for calls awaiting a Sourcify answer.** Previously a call
  showed the verdict "Sourcify has no verified ABI for it either" while the
  lookup was still running. It now says it is still checking, per call, and the
  selector and full calldata stay on screen throughout.
- **All three protocol decoders are listed** on the home page and in the README.
  SPBEAM and StUsdsRateSetter shipped in 0.3.0 without ever being advertised.
- **The Sourcify fallback is documented**, including its trust assumptions.

### Changed

- **Amount scale.** On a call to a token in the built-in registry, the amount
  picker now starts on that token's decimals instead of `raw`. It applies only
  to `transfer`, `approve`, `increaseAllowance` and `decreaseAllowance`, only
  when the call target *is* the token, and only to that function's amount
  parameter matched by position. It never applies to a router or aggregator
  call, to `transferFrom`, or to any ERC-4626 vault function. Decimals are
  hardcoded and were each verified against the deployed contract's `decimals()`
  and `symbol()`; they are never read from the chain, so no RPC can change the
  number you read. The raw integer is unchanged and every scale remains
  selectable.
- **The call target is shown above the decoded parameters** on a direct call,
  matching how nested MultiSend calls and the raw view already read. The target
  is what gives an amount its meaning, so it now appears before the amount.
- **Trust assumptions are stated more precisely.** The re-encode check pins the
  bytes, not their interpretation. The previous wording implied a hostile ABI
  could only relabel a parameter name; it can also change the displayed function
  name and argument types at the cost of a cheap 4-byte selector collision,
  which can change a rendered value. Documented in the README and in the source.

### Fixed

- **An undecodable call could show a spinner instead of a warning, forever.** A
  transaction whose data is an empty `multiSend("")` left the tool waiting on a
  Sourcify lookup it never started, so the block telling a signer to verify the
  raw data against an independent source never appeared. Found by security
  review before release.
- **The competing-transaction selectors showed a truncated `safeTxHash`** — ten
  characters and an ellipsis, in both the web UI and the CLI prompt. That
  selector is how a signer tells two transactions on one nonce apart, and
  lookalike hashes differ in the middle. Both now show the full hash.
- **`sky-safe --version` reported `0.1.5`** regardless of the installed version.
  It now reads the real version, so it cannot drift again.
- **An unsupported `--network` pointed at `sky-safe networks`**, a command that
  was never registered. The error now lists the supported networks.

## [0.3.0] — 2026-08-05

New protocol decoders, a Sourcify decoding fallback with proxy resolution, a
transaction lifecycle timeline, and hardening of the decoded-data verification.

### Added

- **SPBEAM and StUsdsRateSetter decoders.** Human-readable decoding for two Sky
  rate-setting contracts the Safe Transaction Service does not decode. Rates
  show basis points and percentage; ilk identifiers show their ASCII label
  alongside the full `bytes32`. Each decoding is re-encoded and byte-compared
  against the raw calldata before it is shown.
- **Sourcify ABI fallback.** When the Safe API returns no decoded data, the tool
  fetches the contract's verified ABI from Sourcify and decodes with it,
  re-encode-verified before display. It **follows EIP-1967 proxies to their
  implementation**, so proxied calls (for example Aave `supply(...)`) decode
  rather than showing as undecodable. Controlled by a Settings toggle, on by
  default; turning it off makes no request to Sourcify.
- **Transaction lifecycle timeline.** The detail view shows when a transaction
  was proposed, each signature, and whether it was rejected, superseded, or
  executed — with the signer/executor for each and the local time zone. The
  transaction list shows a compact version of the same.
- **My Safes management.** Add, edit, and remove personal Safe shortcuts in
  Settings, with clearer CSV templates.

### Changed

- **Decoded-data verification is now three-state.** A proven mismatch between a
  decoding and the signed bytes is shown in red as a stop-signing signal; a
  decoding that could not be checked is shown separately in amber as "not
  verified", rather than both appearing the same. This stops a "could not
  check" state from reading like tampering.
- **Undecodable calls show their bytes.** A call that neither the Safe API, a
  built-in decoder, nor Sourcify can decode now shows the function selector and
  the full calldata, instead of an empty "Decoded" pane. This applies to the
  top-level call and to each nested MultiSend call.
- **The Safe API "fallback" label is treated as "not decoded".** When the Safe
  service cannot decode a call it returns `method: "fallback"`; the tool no
  longer re-encode-checks that as a real function (which produced a false
  mismatch on legitimate calls) and instead routes it to the undecodable view.
- **Decoded-data verification is hardened against malformed API responses.**
  Parameter types are validated one at a time and parameter names are never
  parsed, so a hostile `dataDecoded` cannot inject a parameter that is encoded
  but not displayed.

### Fixed

- A Safe address pasted or linked in non-checksummed form now loads, instead of
  failing with "failed to load". The address is normalised to its checksum
  before the Safe API is queried.
- The Decoded pane no longer shows a previous transaction's decoding when
  switching between two transactions that share a nonce.
- Array parameters (for example `uint256[]`) are no longer reported as a
  verification mismatch on transactions that are correct.
- The CLI now labels the `To` address with built-in contract tags (SPBEAM,
  LockstakeEngine, USDS, and others), which were previously never applied.
- Corrected the checksum of a pinned contract address.

[0.3.0]: https://github.com/0xShield3/sky-safe-tx-decoder/releases/tag/v0.3.0
