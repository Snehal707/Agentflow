import { getAddress } from 'viem';
import { adminDb } from '../db/client';
import {
  getCircleClient,
  getOrCreateUserAgentWallet,
  waitForTransaction,
} from './dcw';
import { acquireExecutionGuard } from './execution-guard';
import type { GuardLock } from './execution-guard';

const ARC_USDC = '0x3600000000000000000000000000000000000000' as const;
const ARC_EURC = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as const;

export type AgentPayCurrency = 'USDC' | 'EURC';

const EXPLORER_TX_BASE =
  process.env.ARC_EXPLORER_TX_URL?.trim() || 'https://testnet.arcscan.app/tx';

export function explorerLinkTx(txHash: string): string {
  const base = EXPLORER_TX_BASE.replace(/\/+$/, '');
  const h = String(txHash).trim();
  return `${base}/${h}`;
}

export function extractTxId(tx: unknown): string | null {
  const obj = tx as { data?: { transaction?: { id?: string }; id?: string } };
  return obj?.data?.transaction?.id ?? obj?.data?.id ?? null;
}

function resolveAgentPayTokenAddress(currency: AgentPayCurrency): `0x${string}` {
  return currency === 'EURC' ? ARC_EURC : ARC_USDC;
}

async function createTokenTransferTransaction(params: {
  walletId: string;
  destinationAddress: string;
  amount: number;
  tokenAddress: `0x${string}`;
}): Promise<unknown> {
  const dcw = getCircleClient();
  return dcw.createTransaction({
    walletId: params.walletId,
    tokenAddress: params.tokenAddress,
    blockchain: 'ARC-TESTNET',
    amount: [params.amount.toFixed(6)],
    destinationAddress: params.destinationAddress,
    fee: {
      type: 'level',
      config: {
        feeLevel: 'HIGH',
      },
    },
  });
}

export async function executeUsdcTransfer(params: {
  payerEoa: string;
  toAddress: string;
  amountUsdc: number;
  remark: string | null;
  actionType: string;
  idempotencyKey?: string;
  existingGuard?: GuardLock | null;
  currency?: AgentPayCurrency;
}): Promise<{ txHash: `0x${string}` }> {
  const currency: AgentPayCurrency = params.currency === 'EURC' ? 'EURC' : 'USDC';
  const payer = getAddress(params.payerEoa);
  const payee = getAddress(params.toAddress);
  const guard =
    params.existingGuard ??
    (await acquireExecutionGuard({
      walletAddress: payer,
      amount: params.amountUsdc,
      recipients: [payee],
      idempotencyKey: params.idempotencyKey,
      route: `agentpay:${params.actionType}`,
      requireConfirmation: true,
    }));
  try {
  if (payer === payee) {
    throw new Error('Cannot send to the same wallet');
  }
  const userAgent = await getOrCreateUserAgentWallet(payer);
  if (!userAgent?.wallet_id?.trim()) {
    throw new Error(
      'Agent wallet not ready. Complete AgentFlow wallet setup (user agent wallet) before sending.',
    );
  }
  const tx = await createTokenTransferTransaction({
    walletId: userAgent.wallet_id,
    destinationAddress: payee,
    amount: params.amountUsdc,
    tokenAddress: resolveAgentPayTokenAddress(currency),
  });

  const txId = extractTxId(tx);
  if (!txId) {
    throw new Error('[agentpay] Missing Circle transaction id');
  }

  const polled = await waitForTransaction(txId, 'agentpay');
  if (polled.state !== 'COMPLETE' || !polled.txHash) {
    throw new Error(
      `[agentpay] Transfer failed: ${polled.errorReason ?? polled.state ?? 'unknown'}`,
    );
  }

  const hash = polled.txHash as `0x${string}`;
  const fromDcw = getAddress(userAgent.address as `0x${string}`);

  const { error } = await adminDb.from('transactions').insert({
    from_wallet: fromDcw,
    to_wallet: payee,
    amount: params.amountUsdc,
    arc_tx_id: hash,
    agent_slug: 'agentpay',
    action_type: params.actionType,
    status: 'complete',
    remark: params.remark
      ? `${currency !== 'USDC' ? `[${currency}] ` : ''}${params.remark}`.slice(0, 500)
      : currency !== 'USDC'
        ? `[${currency}]`
        : null,
  });

  if (error) {
    throw new Error(`[agentpay] Ledger insert failed: ${error.message}`);
  }

    return { txHash: hash };
  } finally {
    if (!params.existingGuard) {
      await guard.release();
    }
  }
}

export async function executeOwnerWalletUsdcTransfer(params: {
  fromWalletId: string;
  fromAddress: string;
  toAddress: string;
  amountUsdc: number;
  remark: string | null;
  actionType: string;
  agentSlug: string;
  label?: string;
}): Promise<{ txHash: `0x${string}` }> {
  const fromDcw = getAddress(params.fromAddress);
  const payee = getAddress(params.toAddress);
  if (fromDcw === payee) {
    throw new Error('Cannot send to the same wallet');
  }
  if (!Number.isFinite(params.amountUsdc) || params.amountUsdc <= 0) {
    throw new Error('Transfer amount must be greater than zero');
  }

  const tx = await createTokenTransferTransaction({
    walletId: params.fromWalletId,
    destinationAddress: payee,
    amount: params.amountUsdc,
    tokenAddress: ARC_USDC,
  });

  const txId = extractTxId(tx);
  if (!txId) {
    throw new Error('[agentpay] Missing Circle transaction id');
  }

  const polled = await waitForTransaction(txId, params.label ?? 'agent-owner-payment');
  if (polled.state !== 'COMPLETE' || !polled.txHash) {
    throw new Error(
      `[agentpay] Owner wallet transfer failed: ${polled.errorReason ?? polled.state ?? 'unknown'}`,
    );
  }

  const hash = polled.txHash as `0x${string}`;
  const { error } = await adminDb.from('transactions').insert({
    from_wallet: fromDcw,
    to_wallet: payee,
    amount: params.amountUsdc,
    arc_tx_id: hash,
    agent_slug: params.agentSlug,
    action_type: params.actionType,
    status: 'complete',
    remark: params.remark ? params.remark.slice(0, 500) : null,
  });

  if (error) {
    throw new Error(`[agentpay] Ledger insert failed: ${error.message}`);
  }

  return { txHash: hash };
}
