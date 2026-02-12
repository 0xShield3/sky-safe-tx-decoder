/**
 * Custom decoder for Sky Protocol LockstakeEngine contract
 *
 * Contract: 0xCe01C90dE7FD1bcFa39e237FE6D8D9F569e8A6a3 (Ethereum mainnet)
 * Docs: https://docs.sky.money/
 */

import type { Address, Hex } from 'viem'
import { decodeFunctionData, parseAbi } from 'viem'
import type { CustomDecoder, DecodedFunction, DecodedTransactionData } from './types.js'

/**
 * LockstakeEngine ABI (functions we support)
 */
const LOCKSTAKE_ENGINE_ABI = parseAbi([
  // Core urn management
  'function open(uint256 index)',
  'function hope(address owner, uint256 index, address usr)',
  'function nope(address owner, uint256 index, address usr)',

  // Deposit/Withdraw
  'function lock(address owner, uint256 index, uint256 wad, uint16 ref)',
  'function free(address owner, uint256 index, address to, uint256 wad)',
  'function freeNoFee(address owner, uint256 index, address to, uint256 wad)',

  // Delegation and farming
  'function selectVoteDelegate(address owner, uint256 index, address voteDelegate)',
  'function selectFarm(address owner, uint256 index, address farm, uint16 ref)',

  // Borrow/Repay
  'function draw(address owner, uint256 index, address to, uint256 wad)',
  'function wipe(address owner, uint256 index, uint256 wad)',
  'function wipeAll(address owner, uint256 index)',

  // Rewards
  'function getReward(address owner, uint256 index, address farm, address to)',

  // Batch operations
  'function multicall(bytes[] data) returns (bytes[] results)',
])

/**
 * LockstakeEngine contract decoder
 */
export class LockstakeEngineDecoder implements CustomDecoder {
  readonly contractAddress: Address = '0xCe01C90dE7FD1bcFa39e237FE6D8D9F569e8A6a3'
  readonly contractName = 'LockstakeEngine'
  readonly network = 'ethereum'

  canDecode(to: Address, data: Hex): boolean {
    return to.toLowerCase() === this.contractAddress.toLowerCase() && data.length > 10
  }

  decode(data: Hex): DecodedTransactionData {
    // Try to decode as multicall first
    if (this.isMulticall(data)) {
      return this.decodeMulticall(data)
    }

    // Decode single function call
    const decoded = this.decodeSingleFunction(data)
    return {
      main: decoded,
      isMulticall: false,
    }
  }

  getSupportedFunctions(): string[] {
    return [
      // Urn management
      'open',
      'hope',
      'nope',
      // Deposit/Withdraw
      'lock',
      'free',
      'freeNoFee',
      // Delegation and farming
      'selectVoteDelegate',
      'selectFarm',
      // Borrow/Repay
      'draw',
      'wipe',
      'wipeAll',
      // Rewards
      'getReward',
      // Batch operations
      'multicall'
    ]
  }

  /**
   * Check if data is a multicall
   */
  private isMulticall(data: Hex): boolean {
    // multicall selector is 0xac9650d8
    return data.startsWith('0xac9650d8')
  }

  /**
   * Decode multicall and nested calls
   */
  private decodeMulticall(data: Hex): DecodedTransactionData {
    try {
      const decoded = decodeFunctionData({
        abi: LOCKSTAKE_ENGINE_ABI,
        data,
      })

      // args[0] is bytes[] array of encoded calls (parseAbi ensures type safety)
      const encodedCalls = decoded.args[0] as readonly Hex[]

      const nestedCalls: DecodedFunction[] = []
      for (const encodedCall of encodedCalls) {
        const decoded = this.decodeSingleFunction(encodedCall)
        nestedCalls.push(decoded)
      }

      return {
        main: {
          name: 'multicall',
          signature: 'multicall(bytes[])',
          parameters: [{
            name: 'data',
            type: 'bytes[]',
            value: `${encodedCalls.length} calls`,
          }],
          explanation: `Batch execution of ${encodedCalls.length} function call(s) in a single transaction.`,
          riskLevel: 'none',
        },
        nested: nestedCalls,
        isMulticall: true,
      }
    } catch (error) {
      throw new Error(`Failed to decode multicall: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Decode a single function call
   */
  private decodeSingleFunction(data: Hex): DecodedFunction {
    const selector = data.slice(0, 10)

    try {
      const { functionName, args } = decodeFunctionData({
        abi: LOCKSTAKE_ENGINE_ABI,
        data,
      })

      if (!args) {
        throw new Error(`No arguments found for function ${functionName}`)
      }

      switch (functionName) {
        case 'lock':
          return this.decodeLock(args)
        case 'free':
          return this.decodeFree(args)
        case 'freeNoFee':
          return this.decodeFreeNoFee(args)
        case 'draw':
          return this.decodeDraw(args)
        case 'wipe':
          return this.decodeWipe(args)
        case 'wipeAll':
          return this.decodeWipeAll(args)
        case 'open':
          return this.decodeOpen(args)
        case 'hope':
          return this.decodeHope(args)
        case 'nope':
          return this.decodeNope(args)
        case 'selectVoteDelegate':
          return this.decodeSelectVoteDelegate(args)
        case 'selectFarm':
          return this.decodeSelectFarm(args)
        case 'getReward':
          return this.decodeGetReward(args)
        default:
          return this.decodeUnsupported(functionName, args)
      }
    } catch (error) {
      // Function not in our ABI - warn about it
      return {
        name: 'unknown',
        signature: selector,
        parameters: [],
        explanation: `⚠️ Function with selector ${selector} is not recognized or not supported by this decoder.`,
        warnings: ['This function is not in the supported LockstakeEngine function list.'],
        riskLevel: 'high',
      }
    }
  }

  /**
   * Decode lock() function
   * function lock(address owner, uint256 index, uint256 wad, uint16 ref)
   */
  private decodeLock(args: readonly unknown[]): DecodedFunction {
    const [owner, index, wad, ref] = args as [Address, bigint, bigint, number]

    const wadFormatted = this.formatSKYAmount(wad)

    return {
      name: 'lock',
      signature: 'lock(address,uint256,uint256,uint16)',
      parameters: [
        { name: 'owner', type: 'address', value: owner },
        { name: 'index', type: 'uint256', value: index },
        { name: 'wad', type: 'uint256', value: wad },
        { name: 'ref', type: 'uint16', value: BigInt(ref) },
      ],
      explanation: `Deposit ${wadFormatted} SKY into urn #${index} owned by ${owner}.${
        ref > 0 ? ` Using referral code ${ref}.` : ''
      } This will delegate the SKY to the chosen delegate (if any) and stake it to the chosen farm (if any).`,
      riskLevel: 'low',
    }
  }

  /**
   * Decode free() function
   * Withdraws SKY from the urn with an exit fee deducted
   */
  private decodeFree(args: readonly unknown[]): DecodedFunction {
    const [owner, index, to, wad] = args as [Address, bigint, Address, bigint]
    const wadFormatted = this.formatSKYAmount(wad)

    return {
      name: 'free',
      signature: 'free(address,uint256,address,uint256)',
      parameters: [
        { name: 'owner', type: 'address', value: owner },
        { name: 'index', type: 'uint256', value: index },
        { name: 'to', type: 'address', value: to },
        { name: 'wad', type: 'uint256', value: wad },
      ],
      explanation: `Withdraw ${wadFormatted} SKY from urn #${index} owned by ${owner}, sending to ${to}. An exit fee will be deducted and the remaining SKY will be burned. If the urn is staked to a farm, it will be unstaked first. If delegated to a vote delegate, the SKY will be freed from delegation.`,
      riskLevel: 'low',
    }
  }

  /**
   * Decode freeNoFee() function
   * Admin-only function to withdraw SKY without exit fee
   */
  private decodeFreeNoFee(args: readonly unknown[]): DecodedFunction {
    const [owner, index, to, wad] = args as [Address, bigint, Address, bigint]
    const wadFormatted = this.formatSKYAmount(wad)

    return {
      name: 'freeNoFee',
      signature: 'freeNoFee(address,uint256,address,uint256)',
      parameters: [
        { name: 'owner', type: 'address', value: owner },
        { name: 'index', type: 'uint256', value: index },
        { name: 'to', type: 'address', value: to },
        { name: 'wad', type: 'uint256', value: wad },
      ],
      explanation: `[ADMIN ONLY] Withdraw ${wadFormatted} SKY from urn #${index} owned by ${owner}, sending to ${to} WITHOUT exit fee. This is an admin-authorized function that bypasses the normal fee mechanism.`,
      warnings: ['⚠️ This is an admin-only function. Only authorized addresses can execute this.'],
      riskLevel: 'medium',
    }
  }

  /**
   * Decode draw() function
   * Borrows USDS against SKY collateral
   */
  private decodeDraw(args: readonly unknown[]): DecodedFunction {
    const [owner, index, to, wad] = args as [Address, bigint, Address, bigint]

    return {
      name: 'draw',
      signature: 'draw(address,uint256,address,uint256)',
      parameters: [
        { name: 'owner', type: 'address', value: owner },
        { name: 'index', type: 'uint256', value: index },
        { name: 'to', type: 'address', value: to },
        { name: 'wad', type: 'uint256', value: wad },
      ],
      explanation: `Borrow ${this.formatUSDS(wad)} against the SKY collateral locked in urn #${index} owned by ${owner}, sending the USDS to ${to}. This increases the debt position and must maintain safe collateralization ratio.`,
      riskLevel: 'high',
    }
  }

  /**
   * Decode wipe() function
   * Repays USDS debt
   */
  private decodeWipe(args: readonly unknown[]): DecodedFunction {
    const [owner, index, wad] = args as [Address, bigint, bigint]

    return {
      name: 'wipe',
      signature: 'wipe(address,uint256,uint256)',
      parameters: [
        { name: 'owner', type: 'address', value: owner },
        { name: 'index', type: 'uint256', value: index },
        { name: 'wad', type: 'uint256', value: wad },
      ],
      explanation: `Repay ${this.formatUSDS(wad)} debt for urn #${index} owned by ${owner}. The USDS will be taken from the transaction sender and used to reduce the urn's outstanding debt.`,
      riskLevel: 'low',
    }
  }

  /**
   * Decode wipeAll() function
   * Repays all USDS debt for an urn
   */
  private decodeWipeAll(args: readonly unknown[]): DecodedFunction {
    const [owner, index] = args as [Address, bigint]

    return {
      name: 'wipeAll',
      signature: 'wipeAll(address,uint256)',
      parameters: [
        { name: 'owner', type: 'address', value: owner },
        { name: 'index', type: 'uint256', value: index },
      ],
      explanation: `Repay ALL outstanding debt for urn #${index} owned by ${owner}. The exact amount of USDS needed (including accrued interest) will be calculated and taken from the transaction sender, completely clearing the urn's debt position.`,
      riskLevel: 'low',
    }
  }

  /**
   * Decode open() function
   * Creates a new urn for the sender
   */
  private decodeOpen(args: readonly unknown[]): DecodedFunction {
    const [index] = args as [bigint]

    return {
      name: 'open',
      signature: 'open(uint256)',
      parameters: [
        { name: 'index', type: 'uint256', value: index },
      ],
      explanation: `Create a new urn #${index} for the transaction sender. This deploys a new urn contract (collateralized debt position) that can be used to lock SKY, delegate voting power, stake to farms, and borrow USDS.`,
      riskLevel: 'none',
    }
  }

  /**
   * Decode hope() function
   * Grants permission to manage an urn
   */
  private decodeHope(args: readonly unknown[]): DecodedFunction {
    const [owner, index, usr] = args as [Address, bigint, Address]

    return {
      name: 'hope',
      signature: 'hope(address,uint256,address)',
      parameters: [
        { name: 'owner', type: 'address', value: owner },
        { name: 'index', type: 'uint256', value: index },
        { name: 'usr', type: 'address', value: usr },
      ],
      explanation: `Grant permission to ${usr} to manage urn #${index} owned by ${owner}. This allows the authorized address to perform operations like lock, free, draw, wipe, and change delegates/farms on behalf of the owner.`,
      warnings: [`⚠️ Granting urn permissions allows ${usr} to control collateral and debt. Only authorize trusted addresses.`],
      riskLevel: 'high',
    }
  }

  /**
   * Decode nope() function
   * Revokes permission to manage an urn
   */
  private decodeNope(args: readonly unknown[]): DecodedFunction {
    const [owner, index, usr] = args as [Address, bigint, Address]

    return {
      name: 'nope',
      signature: 'nope(address,uint256,address)',
      parameters: [
        { name: 'owner', type: 'address', value: owner },
        { name: 'index', type: 'uint256', value: index },
        { name: 'usr', type: 'address', value: usr },
      ],
      explanation: `Revoke permission from ${usr} to manage urn #${index} owned by ${owner}. This removes their ability to perform operations on this urn.`,
      riskLevel: 'low',
    }
  }

  /**
   * Decode selectVoteDelegate() function
   * Changes the vote delegate for governance
   */
  private decodeSelectVoteDelegate(args: readonly unknown[]): DecodedFunction {
    const [owner, index, voteDelegate] = args as [Address, bigint, Address]
    const isRemovingDelegate = voteDelegate === '0x0000000000000000000000000000000000000000'

    return {
      name: 'selectVoteDelegate',
      signature: 'selectVoteDelegate(address,uint256,address)',
      parameters: [
        { name: 'owner', type: 'address', value: owner },
        { name: 'index', type: 'uint256', value: index },
        { name: 'voteDelegate', type: 'address', value: voteDelegate },
      ],
      explanation: isRemovingDelegate
        ? `Remove vote delegation for urn #${index} owned by ${owner}. The locked SKY will no longer be delegated for governance voting.`
        : `Delegate the locked SKY in urn #${index} owned by ${owner} to vote delegate ${voteDelegate} for governance voting. If the urn has debt, it must remain safely collateralized. Cannot be changed while the urn is in auction.`,
      riskLevel: 'medium',
    }
  }

  /**
   * Decode selectFarm() function
   * Changes the staking farm for rewards
   */
  private decodeSelectFarm(args: readonly unknown[]): DecodedFunction {
    const [owner, index, farm, ref] = args as [Address, bigint, Address, number]
    const isRemovingFarm = farm === '0x0000000000000000000000000000000000000000'

    return {
      name: 'selectFarm',
      signature: 'selectFarm(address,uint256,address,uint16)',
      parameters: [
        { name: 'owner', type: 'address', value: owner },
        { name: 'index', type: 'uint256', value: index },
        { name: 'farm', type: 'address', value: farm },
        { name: 'ref', type: 'uint16', value: BigInt(ref) },
      ],
      explanation: isRemovingFarm
        ? `Unstake all locked SKY from the current farm for urn #${index} owned by ${owner}. The SKY will remain locked but will no longer earn staking rewards.`
        : `Stake the locked SKY in urn #${index} owned by ${owner} to farm ${farm} to earn staking rewards.${ref > 0 ? ` Using referral code ${ref}.` : ''} If previously staked to another farm, it will be unstaked first. Cannot be changed while the urn is in auction.`,
      riskLevel: 'medium',
    }
  }

  /**
   * Decode getReward() function
   * Claims staking rewards from a farm
   */
  private decodeGetReward(args: readonly unknown[]): DecodedFunction {
    const [owner, index, farm, to] = args as [Address, bigint, Address, Address]

    return {
      name: 'getReward',
      signature: 'getReward(address,uint256,address,address)',
      parameters: [
        { name: 'owner', type: 'address', value: owner },
        { name: 'index', type: 'uint256', value: index },
        { name: 'farm', type: 'address', value: farm },
        { name: 'to', type: 'address', value: to },
      ],
      explanation: `Claim accumulated staking rewards from farm ${farm} for urn #${index} owned by ${owner}, sending the rewards to ${to}. The urn must have been staked to this farm to earn rewards.`,
      riskLevel: 'low',
    }
  }

  /**
   * Handle unsupported but recognized functions
   */
  private decodeUnsupported(functionName: string, args: readonly unknown[]): DecodedFunction {
    return {
      name: functionName,
      signature: `${functionName}(...)`,
      parameters: args.map((arg, i) => ({
        name: `arg${i}`,
        type: 'unknown',
        value: String(arg),
      })),
      explanation: `⚠️ Function "${functionName}" is recognized but not yet fully supported by this decoder.`,
      warnings: [`Custom decoder for "${functionName}" is not yet implemented. Verify transaction carefully.`],
      riskLevel: 'medium',
    }
  }

  /**
   * Format SKY amount (18 decimals) for display
   */
  private formatSKYAmount(wad: bigint): string {
    const sky = Number(wad) / 1e18
    return sky.toLocaleString()
  }

  /**
   * Format USDS amount (18 decimals) for display
   */
  private formatUSDS(wad: bigint): string {
    const usds = Number(wad) / 1e18
    return `${usds.toLocaleString()} USDS`
  }

}
