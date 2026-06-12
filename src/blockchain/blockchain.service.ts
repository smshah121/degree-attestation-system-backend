/* eslint-disable prettier/prettier */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ethers } from 'ethers';

const ABI = [
  {
    inputs: [
      { internalType: 'string', name: '_studentId', type: 'string' },
      { internalType: 'string', name: '_hash', type: 'string' }
    ],
    name: 'storeDegree',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { internalType: 'string', name: '_studentId', type: 'string' }
    ],
    name: 'verifyDegree',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { internalType: 'string', name: '_studentId', type: 'string' }
    ],
    name: 'getDegree',
    outputs: [
      { internalType: 'string', name: 'studentId', type: 'string' },
      { internalType: 'string', name: 'hash', type: 'string' },
      { internalType: 'uint256', name: 'timestamp', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: 'string', name: 'studentId', type: 'string' },
      { indexed: false, internalType: 'string', name: 'hash', type: 'string' },
      { indexed: false, internalType: 'uint256', name: 'timestamp', type: 'uint256' }
    ],
    name: 'DegreeStored',
    type: 'event'
  }
];
@Injectable()
export class BlockchainService implements OnModuleInit {
  private contract!: ethers.Contract;
  private provider!: ethers.JsonRpcProvider;
  private wallet!: ethers.Wallet;

  onModuleInit() {
    console.log("SEPOLIA_RPC_URL:", process.env.SEPOLIA_RPC_URL);
  console.log("CONTRACT_ADDRESS:", process.env.CONTRACT_ADDRESS);
  console.log("PRIVATE_KEY length:", process.env.PRIVATE_KEY?.length);
    this.provider = new ethers.JsonRpcProvider(
      process.env.SEPOLIA_RPC_URL
    );

    const privateKey = process.env.PRIVATE_KEY?.trim();

    this.wallet = new ethers.Wallet(privateKey!, this.provider);

  console.log("PRIVATE KEY RAW:", JSON.stringify(privateKey));
  console.log("PRIVATE KEY LENGTH:", privateKey?.length);
    this.contract = new ethers.Contract(
      process.env.CONTRACT_ADDRESS!,
      ABI,
      this.wallet
    );

    console.log('✅ Blockchain connected to Sepolia');
  }

// ── Store — only 2 params needed ──────────────
async storeDegree(
  studentId: string,
  hash: string,
): Promise<string> {
  try {
    console.log(`[BLOCKCHAIN] Storing degree ${studentId}...`);
    const tx = await this.contract.storeDegree(studentId, hash);
    const receipt = await tx.wait();
    console.log(`[BLOCKCHAIN] Stored. TX: ${receipt.hash}`);
    return receipt.hash;
  } catch (err) {
    console.error('[BLOCKCHAIN] Error:', err);
    throw err;
  }
}

// ── Verify ─────────────────────────────────────
async verifyDegree(studentId: string): Promise<boolean> {
  try {
    return await this.contract.verifyDegree(studentId);
  } catch (err) {
    console.error('[BLOCKCHAIN] Verify error:', err);
    return false;
  }
}

// ── Get — returns studentId + hash + timestamp ─
async getDegree(studentId: string) {
  try {
    const data = await this.contract.getDegree(studentId);
    return {
      studentId: data.studentId,
      hash: data.hash,
      timestamp: new Date(Number(data.timestamp) * 1000).toISOString(),
    };
  } catch (err) {
    console.error('[BLOCKCHAIN] Get error:', err);
    return null;
  }
}
}