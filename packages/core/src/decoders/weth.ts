/**
 * Template custom decoder for the Wrapped Ether (WETH9) contract.
 *
 * Contract: 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 (Ethereum mainnet)
 * Source:   https://etherscan.io/address/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2#code
 *
 * ---------------------------------------------------------------------------
 * This file is intended as a REFERENCE IMPLEMENTATION. WETH is a tiny, widely
 * understood contract, which makes it a good teaching example for writing your
 * own protocol decoder. To support a different contract, copy this file and:
 *
 *   1. Change `contractAddress`, `contractName`, and `network`.
 *   2. Replace the ABI with the functions you care about.
 *   3. Write one `decode<Fn>()` helper per function, returning a human-readable
 *      `explanation` and an appropriate `riskLevel`.
 *   4. Export it from `src/index.ts` and register it (see README).
 *
 * A decoder only ever sees the transaction *calldata* — it does not see the
 * ETH `value` sent with the call. Where `value` matters (e.g. `deposit()`),
 * the explanation says so explicitly.
 * ---------------------------------------------------------------------------
 */

import type { Address, Hex } from 'viem'
import { decodeFunctionData, formatEther, maxUint256, parseAbi } from 'viem'
import type { CustomDecoder, DecodedFunction, DecodedTransactionData } from './types.js'

/**
 * WETH9 ABI (only the state-changing functions worth decoding).
 *
 * `parseAbi` turns these human-readable signatures into the typed ABI that
 * viem's `decodeFunctionData` needs.
 */
const WETH_ABI = parseAbi([
  // Wrap / unwrap
  'function deposit() payable',
  'function withdraw(uint256 wad)',

  // ERC-20 transfers and approvals
  'function transfer(address dst, uint256 wad) returns (bool)',
  'function approve(address guy, uint256 wad) returns (bool)',
  'function transferFrom(address src, address dst, uint256 wad) returns (bool)',
])

/**
 * Wrapped Ether (WETH9) contract decoder.
 */
export class WethDecoder implements CustomDecoder {
  readonly contractAddress: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
  readonly contractName = 'WETH'
  readonly network = 'ethereum'

  /**
   * Only decode calls sent to the WETH contract. We accept calldata of length
   * >= 10 (a bare 4-byte selector, e.g. `deposit()`) rather than > 10, because
   * some WETH functions take no arguments.
   */
  canDecode(to: Address, data: Hex): boolean {
    return to.toLowerCase() === this.contractAddress.toLowerCase() && data.length >= 10
  }

  decode(data: Hex): DecodedTransactionData {
    return {
      main: this.decodeSingleFunction(data),
      isMulticall: false,
    }
  }

  getSupportedFunctions(): string[] {
    return ['deposit', 'withdraw', 'transfer', 'approve', 'transferFrom']
  }

  /**
   * Decode a single function call and dispatch to the per-function helper.
   */
  private decodeSingleFunction(data: Hex): DecodedFunction {
    const selector = data.slice(0, 10)

    try {
      const { functionName, args } = decodeFunctionData({ abi: WETH_ABI, data })

      switch (functionName) {
        case 'deposit':
          return this.decodeDeposit()
        case 'withdraw':
          return this.decodeWithdraw(args)
        case 'transfer':
          return this.decodeTransfer(args)
        case 'approve':
          return this.decodeApprove(args)
        case 'transferFrom':
          return this.decodeTransferFrom(args)
        default:
          return this.decodeUnsupported(functionName, args)
      }
    } catch {
      // Selector is not in our ABI — surface it loudly rather than guessing.
      return {
        name: 'unknown',
        signature: selector,
        parameters: [],
        explanation: `⚠️ Function with selector ${selector} is not recognized or not supported by this decoder.`,
        warnings: ['This function is not in the supported WETH function list.'],
        riskLevel: 'high',
      }
    }
  }

  /**
   * deposit() — wrap ETH into WETH.
   *
   * Takes no calldata arguments: the amount wrapped is the ETH `value` sent
   * with the transaction, which a decoder cannot see from calldata alone.
   */
  private decodeDeposit(): DecodedFunction {
    return {
      name: 'deposit',
      signature: 'deposit()',
      parameters: [],
      explanation:
        'Wrap ETH into WETH. The amount wrapped equals the ETH value sent with this transaction (check the transaction `value` field). The sender receives an equal amount of WETH.',
      riskLevel: 'none',
    }
  }

  /**
   * withdraw(uint256 wad) — unwrap WETH back into ETH.
   */
  private decodeWithdraw(args: readonly unknown[]): DecodedFunction {
    const [wad] = args as [bigint]

    return {
      name: 'withdraw',
      signature: 'withdraw(uint256)',
      parameters: [{ name: 'wad', type: 'uint256', value: wad }],
      explanation: `Unwrap ${this.formatWeth(wad)} back into ETH. The WETH is burned from the sender and the equivalent ETH is returned to the sender.`,
      riskLevel: 'low',
    }
  }

  /**
   * transfer(address dst, uint256 wad) — send WETH to another address.
   */
  private decodeTransfer(args: readonly unknown[]): DecodedFunction {
    const [dst, wad] = args as [Address, bigint]

    return {
      name: 'transfer',
      signature: 'transfer(address,uint256)',
      parameters: [
        { name: 'dst', type: 'address', value: dst },
        { name: 'wad', type: 'uint256', value: wad },
      ],
      explanation: `Transfer ${this.formatWeth(wad)} to ${dst}.`,
      riskLevel: 'low',
    }
  }

  /**
   * approve(address guy, uint256 wad) — grant a spender an allowance.
   *
   * Approvals are the classic phishing vector: an unlimited approval lets the
   * spender move the entire WETH balance at any time in the future, so we flag
   * it explicitly.
   */
  private decodeApprove(args: readonly unknown[]): DecodedFunction {
    const [guy, wad] = args as [Address, bigint]
    const isUnlimited = wad === maxUint256
    const isRevoke = wad === 0n

    const amount = isUnlimited ? 'an UNLIMITED amount of' : this.formatWeth(wad)

    return {
      name: 'approve',
      signature: 'approve(address,uint256)',
      parameters: [
        { name: 'guy', type: 'address', value: guy },
        { name: 'wad', type: 'uint256', value: wad },
      ],
      explanation: isRevoke
        ? `Revoke the WETH allowance previously granted to ${guy} (set it to 0).`
        : `Approve ${guy} to spend ${amount} WETH from the sender's balance.`,
      warnings: isUnlimited
        ? [`⚠️ Unlimited approval: ${guy} can move the sender's entire WETH balance, now and in the future. Only approve trusted contracts.`]
        : undefined,
      riskLevel: isUnlimited ? 'medium' : isRevoke ? 'none' : 'low',
    }
  }

  /**
   * transferFrom(address src, address dst, uint256 wad) — move WETH on behalf
   * of `src` using a previously granted allowance.
   */
  private decodeTransferFrom(args: readonly unknown[]): DecodedFunction {
    const [src, dst, wad] = args as [Address, Address, bigint]

    return {
      name: 'transferFrom',
      signature: 'transferFrom(address,address,uint256)',
      parameters: [
        { name: 'src', type: 'address', value: src },
        { name: 'dst', type: 'address', value: dst },
        { name: 'wad', type: 'uint256', value: wad },
      ],
      explanation: `Move ${this.formatWeth(wad)} from ${src} to ${dst}, using an allowance ${src} previously granted to the sender.`,
      riskLevel: 'medium',
    }
  }

  /**
   * Recognized-but-unimplemented functions. Kept for parity with the decoder
   * interface; with the current ABI this branch is unreachable.
   */
  private decodeUnsupported(functionName: string, args: readonly unknown[]): DecodedFunction {
    return {
      name: functionName,
      signature: `${functionName}(...)`,
      parameters: args.map((arg, i) => ({ name: `arg${i}`, type: 'unknown', value: String(arg) })),
      explanation: `⚠️ Function "${functionName}" is recognized but not yet fully supported by this decoder.`,
      warnings: [`Custom decoder for "${functionName}" is not yet implemented. Verify the transaction carefully.`],
      riskLevel: 'medium',
    }
  }

  /**
   * Format a WETH amount (18 decimals) for display, e.g. "1.5 WETH".
   */
  private formatWeth(wad: bigint): string {
    return `${formatEther(wad)} WETH`
  }
}
