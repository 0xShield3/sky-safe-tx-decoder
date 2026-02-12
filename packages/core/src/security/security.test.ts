/**
 * Tests for security checks
 */

import { describe, it, expect } from 'vitest';
import { encodeFunctionData, concat, toHex, pad } from 'viem';
import { checkDelegateCall, isTrustedForDelegateCall } from './delegate-call.js';
import { checkGasTokenAttack } from './gas-token.js';
import { checkOwnerModifications } from './owner-checks.js';
import { analyzeSecurity } from './analyzer.js';
import { MULTISEND_CALL_ONLY, ZERO_ADDRESS } from './constants.js';
import type { SafeTransactionData } from '../types.js';

describe('Delegate Call Detection', () => {
  it('should detect trusted delegate call (MultiSendCallOnly)', () => {
    const result = checkDelegateCall(1, MULTISEND_CALL_ONLY[0]);

    expect(result.isDelegateCall).toBe(true);
    expect(result.isTrusted).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it('should detect untrusted delegate call', () => {
    const result = checkDelegateCall(1, '0x1234567890123456789012345678901234567890');

    expect(result.isDelegateCall).toBe(true);
    expect(result.isTrusted).toBe(false);
    expect(result.warning).toBeDefined();
    expect(result.warningLevel).toBe('critical');
    expect(result.warning).toContain('untrusted delegate call');
  });

  it('should return no warning for regular call', () => {
    const result = checkDelegateCall(0, '0x1234567890123456789012345678901234567890');

    expect(result.isDelegateCall).toBe(false);
    expect(result.isTrusted).toBe(false);
    expect(result.warning).toBeUndefined();
  });

  it('should check if address is trusted (case insensitive)', () => {
    const lowerCase = MULTISEND_CALL_ONLY[0].toLowerCase();
    const upperCase = MULTISEND_CALL_ONLY[0].toUpperCase();

    expect(isTrustedForDelegateCall(lowerCase as any)).toBe(true);
    expect(isTrustedForDelegateCall(upperCase as any)).toBe(true);
  });
});

describe('Gas Token Attack Detection', () => {
  it('should detect critical risk (custom gas token + refund receiver + non-zero gas price)', () => {
    const result = checkGasTokenAttack(
      '1000000000', // 1 gwei
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
      '0x1234567890123456789012345678901234567890'
    );

    expect(result.riskLevel).toBe('critical');
    expect(result.usesCustomGasToken).toBe(true);
    expect(result.usesCustomRefundReceiver).toBe(true);
    expect(result.hasNonZeroGasPrice).toBe(true);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain('custom gas token');
    expect(result.warnings[1]).toContain('non-zero');
  });

  it('should detect high risk (custom gas token + refund receiver, zero gas price)', () => {
    const result = checkGasTokenAttack(
      '0',
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
      '0x1234567890123456789012345678901234567890'
    );

    expect(result.riskLevel).toBe('high');
    expect(result.usesCustomGasToken).toBe(true);
    expect(result.usesCustomRefundReceiver).toBe(true);
    expect(result.hasNonZeroGasPrice).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('custom gas token');
  });

  it('should detect medium risk (only custom gas token)', () => {
    const result = checkGasTokenAttack(
      '0',
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
      ZERO_ADDRESS
    );

    expect(result.riskLevel).toBe('medium');
    expect(result.usesCustomGasToken).toBe(true);
    expect(result.usesCustomRefundReceiver).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('custom gas token');
  });

  it('should detect low risk (only custom refund receiver)', () => {
    const result = checkGasTokenAttack(
      '0',
      ZERO_ADDRESS,
      '0x1234567890123456789012345678901234567890'
    );

    expect(result.riskLevel).toBe('low');
    expect(result.usesCustomGasToken).toBe(false);
    expect(result.usesCustomRefundReceiver).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('custom refund receiver');
  });

  it('should detect no risk (zero address for both)', () => {
    const result = checkGasTokenAttack('0', ZERO_ADDRESS, ZERO_ADDRESS);

    expect(result.riskLevel).toBe('none');
    expect(result.usesCustomGasToken).toBe(false);
    expect(result.usesCustomRefundReceiver).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });
});

describe('Owner/Threshold Modification Detection', () => {
  it('should detect addOwnerWithThreshold (direct call)', () => {
    const data = encodeFunctionData({
      abi: [{
        name: 'addOwnerWithThreshold',
        type: 'function',
        inputs: [
          { name: 'owner', type: 'address' },
          { name: '_threshold', type: 'uint256' },
        ],
      }],
      functionName: 'addOwnerWithThreshold',
      args: ['0x1234567890123456789012345678901234567890', 2n],
    });

    const result = checkOwnerModifications(data);

    expect(result.modifiesOwners).toBe(true);
    expect(result.modifications).toHaveLength(1);
    expect(result.modifications[0].functionName).toBe('addOwnerWithThreshold');
    expect(result.modifications[0].isNested).toBe(false);
    expect(result.warningLevel).toBe('critical');
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('addOwnerWithThreshold');
  });

  it('should detect removeOwner (direct call)', () => {
    const data = encodeFunctionData({
      abi: [{
        name: 'removeOwner',
        type: 'function',
        inputs: [
          { name: 'prevOwner', type: 'address' },
          { name: 'owner', type: 'address' },
          { name: '_threshold', type: 'uint256' },
        ],
      }],
      functionName: 'removeOwner',
      args: [
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
        1n,
      ],
    });

    const result = checkOwnerModifications(data);

    expect(result.modifiesOwners).toBe(true);
    expect(result.modifications[0].functionName).toBe('removeOwner');
    expect(result.modifications[0].isNested).toBe(false);
    expect(result.warningLevel).toBe('critical');
  });

  it('should detect swapOwner (direct call)', () => {
    const data = encodeFunctionData({
      abi: [{
        name: 'swapOwner',
        type: 'function',
        inputs: [
          { name: 'prevOwner', type: 'address' },
          { name: 'oldOwner', type: 'address' },
          { name: 'newOwner', type: 'address' },
        ],
      }],
      functionName: 'swapOwner',
      args: [
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
        '0x3333333333333333333333333333333333333333',
      ],
    });

    const result = checkOwnerModifications(data);

    expect(result.modifiesOwners).toBe(true);
    expect(result.modifications[0].functionName).toBe('swapOwner');
    expect(result.modifications[0].isNested).toBe(false);
  });

  it('should detect changeThreshold (direct call)', () => {
    const data = encodeFunctionData({
      abi: [{
        name: 'changeThreshold',
        type: 'function',
        inputs: [{ name: '_threshold', type: 'uint256' }],
      }],
      functionName: 'changeThreshold',
      args: [3n],
    });

    const result = checkOwnerModifications(data);

    expect(result.modifiesOwners).toBe(true);
    expect(result.modifications[0].functionName).toBe('changeThreshold');
    expect(result.modifications[0].isNested).toBe(false);
  });

  it('should not detect owner modifications in regular transaction', () => {
    // Regular ERC20 transfer
    const data = encodeFunctionData({
      abi: [{
        name: 'transfer',
        type: 'function',
        inputs: [
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
        ],
      }],
      functionName: 'transfer',
      args: ['0x1234567890123456789012345678901234567890', 1000000000000000000n],
    });

    const result = checkOwnerModifications(data);

    expect(result.modifiesOwners).toBe(false);
    expect(result.modifications).toHaveLength(0);
    expect(result.warningLevel).toBe('info');
    expect(result.warning).toBeUndefined();
  });

  it('should detect owner modifications in MultiSend (nested)', () => {
    // First, encode an addOwnerWithThreshold call
    const addOwnerCall = encodeFunctionData({
      abi: [{
        name: 'addOwnerWithThreshold',
        type: 'function',
        inputs: [
          { name: 'owner', type: 'address' },
          { name: '_threshold', type: 'uint256' },
        ],
      }],
      functionName: 'addOwnerWithThreshold',
      args: ['0x1234567890123456789012345678901234567890', 2n],
    });

    // Pack it into MultiSend format: operation(1 byte) + to(20 bytes) + value(32 bytes) + dataLength(32 bytes) + data
    // MultiSend uses tightly packed encoding (no padding between fields)
    const targetAddress = '0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d'; // Safe address (self-call)
    const operation = toHex(0, { size: 1 }); // 1 byte operation (0 = Call)
    const value = pad(toHex(0n), { size: 32 }); // 32 bytes value
    const dataLength = pad(toHex(BigInt((addOwnerCall.length - 2) / 2)), { size: 32 }); // 32 bytes data length

    // Concatenate tightly packed transaction
    const packedTransaction = concat([
      operation,
      targetAddress as `0x${string}`,
      value,
      dataLength,
      addOwnerCall,
    ]);

    // Encode as multiSend call
    const data = encodeFunctionData({
      abi: [{
        name: 'multiSend',
        type: 'function',
        inputs: [{ name: 'transactions', type: 'bytes' }],
      }],
      functionName: 'multiSend',
      args: [packedTransaction],
    });

    const result = checkOwnerModifications(data);

    expect(result.modifiesOwners).toBe(true);
    expect(result.modifications.length).toBeGreaterThan(0);
    expect(result.modifications[0].functionName).toBe('addOwnerWithThreshold');
    expect(result.modifications[0].isNested).toBe(true);
    expect(result.warningLevel).toBe('critical');
  });

  it('should handle empty data', () => {
    const result = checkOwnerModifications('0x' as any);

    expect(result.modifiesOwners).toBe(false);
    expect(result.modifications).toHaveLength(0);
  });
});

describe('Security Analyzer (combined checks)', () => {
  it('should analyze safe transaction (no issues)', () => {
    const txData: SafeTransactionData = {
      to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
      value: '0',
      data: '0xa9059cbb00000000000000000000000012345678901234567890123456789012345678900000000000000000000000000000000000000000000000000000000000000064', // transfer
      operation: 0, // Call
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: ZERO_ADDRESS,
      refundReceiver: ZERO_ADDRESS,
      nonce: '1',
    };

    const result = analyzeSecurity(txData);

    expect(result.overallRisk).toBe('none');
    expect(result.requiresCarefulReview).toBe(false);
    expect(result.delegateCall.isDelegateCall).toBe(false);
    expect(result.gasToken.riskLevel).toBe('none');
    expect(result.ownerModification.modifiesOwners).toBe(false);
  });

  it('should analyze unsafe transaction (untrusted delegate call)', () => {
    const txData: SafeTransactionData = {
      to: '0x1234567890123456789012345678901234567890', // Untrusted
      value: '0',
      data: '0x',
      operation: 1, // DelegateCall
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: ZERO_ADDRESS,
      refundReceiver: ZERO_ADDRESS,
      nonce: '1',
    };

    const result = analyzeSecurity(txData);

    expect(result.overallRisk).toBe('critical');
    expect(result.requiresCarefulReview).toBe(true);
    expect(result.delegateCall.isDelegateCall).toBe(true);
    expect(result.delegateCall.isTrusted).toBe(false);
    expect(result.delegateCall.warningLevel).toBe('critical');
  });

  it('should analyze unsafe transaction (gas token attack)', () => {
    const txData: SafeTransactionData = {
      to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      value: '0',
      data: '0x',
      operation: 0,
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '1000000000',
      gasToken: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
      refundReceiver: '0x1234567890123456789012345678901234567890',
      nonce: '1',
    };

    const result = analyzeSecurity(txData);

    expect(result.overallRisk).toBe('critical');
    expect(result.requiresCarefulReview).toBe(true);
    expect(result.gasToken.riskLevel).toBe('critical');
  });

  it('should analyze unsafe transaction (owner modification)', () => {
    // Encode addOwnerWithThreshold call
    const addOwnerData = encodeFunctionData({
      abi: [{
        name: 'addOwnerWithThreshold',
        type: 'function',
        inputs: [
          { name: 'owner', type: 'address' },
          { name: '_threshold', type: 'uint256' },
        ],
      }],
      functionName: 'addOwnerWithThreshold',
      args: ['0x1234567890123456789012345678901234567890', 2n],
    });

    const txData: SafeTransactionData = {
      to: '0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d', // Self (Safe address)
      value: '0',
      data: addOwnerData,
      operation: 0,
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: ZERO_ADDRESS,
      refundReceiver: ZERO_ADDRESS,
      nonce: '1',
    };

    const result = analyzeSecurity(txData);

    expect(result.overallRisk).toBe('critical');
    expect(result.requiresCarefulReview).toBe(true);
    expect(result.ownerModification.modifiesOwners).toBe(true);
    expect(result.ownerModification.warningLevel).toBe('critical');
  });

  it('should analyze transaction with multiple issues', () => {
    // Encode addOwnerWithThreshold call
    const addOwnerData = encodeFunctionData({
      abi: [{
        name: 'addOwnerWithThreshold',
        type: 'function',
        inputs: [
          { name: 'owner', type: 'address' },
          { name: '_threshold', type: 'uint256' },
        ],
      }],
      functionName: 'addOwnerWithThreshold',
      args: ['0x5555555555555555555555555555555555555555', 2n],
    });

    const txData: SafeTransactionData = {
      to: '0x1234567890123456789012345678901234567890', // Untrusted
      value: '0',
      data: addOwnerData,
      operation: 1, // DelegateCall (untrusted)
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '1000000000',
      gasToken: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
      refundReceiver: '0x9999999999999999999999999999999999999999',
      nonce: '1',
    };

    const result = analyzeSecurity(txData);

    expect(result.overallRisk).toBe('critical');
    expect(result.requiresCarefulReview).toBe(true);
    expect(result.delegateCall.isTrusted).toBe(false);
    expect(result.gasToken.riskLevel).toBe('critical');
    expect(result.ownerModification.modifiesOwners).toBe(true);
  });

  it('should analyze unsafe transaction (enableModule)', () => {
    const enableModuleData = encodeFunctionData({
      abi: [{
        name: 'enableModule',
        type: 'function',
        inputs: [{ name: 'module', type: 'address' }],
      }],
      functionName: 'enableModule',
      args: ['0x1234567890123456789012345678901234567890'],
    });

    const txData: SafeTransactionData = {
      to: '0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d',
      value: '0',
      data: enableModuleData,
      operation: 0,
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: ZERO_ADDRESS,
      refundReceiver: ZERO_ADDRESS,
      nonce: '1',
    };

    const result = analyzeSecurity(txData);

    expect(result.overallRisk).toBe('high');
    expect(result.requiresCarefulReview).toBe(true);
    expect(result.moduleGuard.hasModuleOperation).toBe(true);
    expect(result.moduleGuard.hasGuardOperation).toBe(false);
    expect(result.moduleGuard.warningLevel).toBe('high');
    expect(result.moduleGuard.detections[0].functionName).toBe('enableModule');
  });

  it('should analyze unsafe transaction (setGuard)', () => {
    const setGuardData = encodeFunctionData({
      abi: [{
        name: 'setGuard',
        type: 'function',
        inputs: [{ name: 'guard', type: 'address' }],
      }],
      functionName: 'setGuard',
      args: ['0x9999999999999999999999999999999999999999'],
    });

    const txData: SafeTransactionData = {
      to: '0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d',
      value: '0',
      data: setGuardData,
      operation: 0,
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: ZERO_ADDRESS,
      refundReceiver: ZERO_ADDRESS,
      nonce: '1',
    };

    const result = analyzeSecurity(txData);

    expect(result.overallRisk).toBe('high');
    expect(result.requiresCarefulReview).toBe(true);
    expect(result.moduleGuard.hasModuleOperation).toBe(false);
    expect(result.moduleGuard.hasGuardOperation).toBe(true);
    expect(result.moduleGuard.warningLevel).toBe('high');
    expect(result.moduleGuard.detections[0].functionName).toBe('setGuard');
    expect(result.moduleGuard.warnings![0]).toContain('denial of service');
  });

  it('should detect enableModule in MultiSend (nested)', () => {
    // First, encode an enableModule call
    const enableModuleCall = encodeFunctionData({
      abi: [{
        name: 'enableModule',
        type: 'function',
        inputs: [{ name: 'module', type: 'address' }],
      }],
      functionName: 'enableModule',
      args: ['0x1234567890123456789012345678901234567890'],
    });

    // Pack it into MultiSend format
    const targetAddress = '0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d'; // Safe address (self-call)
    const operation = toHex(0, { size: 1 }); // 1 byte operation (0 = Call)
    const value = pad(toHex(0n), { size: 32 }); // 32 bytes value
    const dataLength = pad(toHex(BigInt((enableModuleCall.length - 2) / 2)), { size: 32 }); // 32 bytes data length

    // Concatenate tightly packed transaction
    const packedTransaction = concat([
      operation,
      targetAddress as `0x${string}`,
      value,
      dataLength,
      enableModuleCall,
    ]);

    // Encode as multiSend call
    const data = encodeFunctionData({
      abi: [{
        name: 'multiSend',
        type: 'function',
        inputs: [{ name: 'transactions', type: 'bytes' }],
      }],
      functionName: 'multiSend',
      args: [packedTransaction],
    });

    const txData: SafeTransactionData = {
      to: MULTISEND_CALL_ONLY[0], // MultiSendCallOnly
      value: '0',
      data,
      operation: 1, // DelegateCall
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: ZERO_ADDRESS,
      refundReceiver: ZERO_ADDRESS,
      nonce: '1',
    };

    const result = analyzeSecurity(txData);

    expect(result.overallRisk).toBe('high');
    expect(result.requiresCarefulReview).toBe(true);
    expect(result.moduleGuard.hasModuleOperation).toBe(true);
    expect(result.moduleGuard.detections.length).toBeGreaterThan(0);
    expect(result.moduleGuard.detections[0].functionName).toBe('enableModule');
    expect(result.moduleGuard.detections[0].isNested).toBe(true);
    expect(result.delegateCall.isTrusted).toBe(true); // MultiSendCallOnly is trusted
  });
});
