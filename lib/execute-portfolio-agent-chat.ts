import { isAgentHealthy } from './a2a-health';
import { PORTFOLIO_AGENT_PRICE_LABEL, PORTFOLIO_AGENT_RUN_URL } from './agentRunConfig';
import { canonicalRedisSessionId } from './chatSessionRedis';
import {
  formatPaidPortfolioAgentChatBody,
  type FormatPortfolioChatOptions,
} from './format-portfolio-chat';
import {
  executeDcwPaidAgentViaX402,
  type ExecutionPaymentEntry,
} from './paidAgentX402';

export type ExecutePortfolioAgentForChatResult = {
  text: string;
  paid: boolean;
  paymentEntry?: ExecutionPaymentEntry;
};

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return String(err);
}

/**
 * Prefer the paid Portfolio agent (x402). Fall back to a free local snapshot
 * when the agent is unhealthy or payment/run fails.
 */
export async function executePortfolioAgentForChat(input: {
  userWalletAddress: string;
  sessionId: string;
  fallback: () => Promise<string>;
  formatOptions?: FormatPortfolioChatOptions;
  logPrefix?: string;
}): Promise<ExecutePortfolioAgentForChatResult> {
  const logPrefix = input.logPrefix ?? '[portfolio-agent-chat]';
  try {
    if (await isAgentHealthy('portfolio')) {
      const paid = await executeDcwPaidAgentViaX402<Record<string, unknown>>({
        userWalletAddress: input.userWalletAddress.trim(),
        agent: 'portfolio',
        price: PORTFOLIO_AGENT_PRICE_LABEL,
        url: PORTFOLIO_AGENT_RUN_URL,
        requestId: `portfolio_chat_${canonicalRedisSessionId(input.sessionId)}_${Date.now()}`,
      });
      const data = paid.data ?? {};
      const errMsg = typeof data.error === 'string' ? data.error.trim() : '';
      const failed =
        paid.status < 200 ||
        paid.status >= 300 ||
        data.success === false ||
        Boolean(errMsg);
      if (!failed) {
        return {
          text: formatPaidPortfolioAgentChatBody(
            data,
            PORTFOLIO_AGENT_PRICE_LABEL,
            input.formatOptions,
          ),
          paid: true,
          paymentEntry: paid.paymentEntry,
        };
      }
      console.warn(`${logPrefix} paid portfolio agent returned failure`, {
        status: paid.status,
        error: errMsg || null,
      });
    }
  } catch (err) {
    console.warn(`${logPrefix} paid portfolio agent failed:`, errorMessage(err));
  }

  return {
    text: await input.fallback(),
    paid: false,
  };
}
