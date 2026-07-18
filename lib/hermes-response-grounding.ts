import { formatAgentFlowCapabilityReply } from './agentflowProduct';

export type HermesGroundingDecision =
  | { ok: true }
  | { ok: false; reason: string; replacement: string };

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const NON_LATIN_SCRIPT_PATTERNS = [
  /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u, // Han
  /[\u3040-\u30FF]/u, // Japanese kana
  /[\uAC00-\uD7AF]/u, // Hangul
  /[\u0400-\u04FF]/u, // Cyrillic
  /[\u0600-\u06FF]/u, // Arabic
  /[\u0900-\u097F]/u, // Devanagari
  /[\u0E00-\u0E7F]/u, // Thai
] as const;

const FABRICATED_RUNTIME_EXPLANATION =
  /\b(?:locali[sz]ation\s+test|test\s+mixin|phrases?\s+for\s+different\s+audiences|legacy\s+research\s+docs?|research\s+pipeline\s+(?:is\s+)?(?:still\s+)?warming|discarded\s+locali[sz]ation|Chinese\s+phrase\s+in\s+a\s+test)\b/i;

const GENERIC_HERMES_CONTEXT_LEAK =
  /\b(?:the\s+chat\s+service|AgentFlow)\s+CLI\b|\bCLI\s+config\s*\+\s*skills\s*\+\s*cron\b/i;

function scriptPresence(text: string): boolean[] {
  return NON_LATIN_SCRIPT_PATTERNS.map((pattern) => pattern.test(text));
}

export function hasUnexpectedLanguageSwitch(userMessage: string, assistantText: string): boolean {
  const responseScripts = scriptPresence(assistantText);
  if (!responseScripts.some(Boolean)) return false;

  if (
    /\b(?:translate|say|write|reply|answer)(?:\s+this|\s+that|\s+it)?(?:\s+for\s+me)?[\s\S]{0,40}\b(?:Chinese|Mandarin|Japanese|Korean|Russian|Arabic|Hindi|Thai)\b/i.test(
      userMessage,
    ) ||
    /\bin\s+(?:Chinese|Mandarin|Japanese|Korean|Russian|Arabic|Hindi|Thai)\b/i.test(
      userMessage,
    )
  ) {
    return false;
  }

  const userScripts = scriptPresence(userMessage);
  return responseScripts.some((present, index) => present && !userScripts[index]);
}

export function isAgentFlowCapabilityQuestionVariant(message: string): boolean {
  const normalized = message.trim().toLowerCase().replace(/\s+/g, ' ');
  return /^(?:what can (?:(?:you|u|agentflow) )?do|what do (?:you|u|agentflow) do|what can i do with agentflow)(?: here| for me| today| right now)?[?.!]*$/i.test(
    normalized,
  );
}

export function isTopiclessDeepDiveRequest(message: string): boolean {
  const normalized = message.trim().toLowerCase().replace(/\s+/g, ' ');
  return /^(?:(?:yeah|yes|sure|ok(?:ay)?)\s+)?(?:(?:go|do)\s+)?(?:a\s+)?deep\s+dive(?:\s+into)?(?:\s+(?:anything|anything you want|whatever|something|any topic))?[?.!]*$/i.test(
    normalized,
  );
}

export function isHallucinationChallenge(message: string): boolean {
  return /\b(?:hallucinat(?:e|ed|ing|ion)|(?:you\s+)?made\s+(?:that|this)\s+up|(?:you\s+)?invented\s+(?:that|this)|(?:that|this|what\s+you\s+said)\s+(?:is|was)\s+not\s+(?:true|real|supported)|unsupported\s+claim|why\s+did\s+you\s+(?:say|claim|make\s+up)|random\s+chinese|why\s+(?:is|was)\s+(?:there|that)\s+chinese)\b/i.test(
    message,
  );
}

export function buildKnownLanguageLeakReply(message: string): string | null {
  if (/随时都可以切换主题/u.test(message)) {
    return '“随时都可以切换主题” means “you can switch topics at any time.” It was an unsupported language switch and should not have appeared in the English reply.';
  }
  if (/我看出来你想深入了解/u.test(message)) {
    return '“我看出来你想深入了解” means “I can tell you want to understand this more deeply.” It was an unsupported language switch and should not have appeared in the English reply.';
  }
  return null;
}

export function responseClaimsPredictionMarketsUnavailable(text: string): boolean {
  return (
    /\bprediction\s+markets?\b/i.test(text) &&
    /\b(?:aren'?t|are not|not)\s+available\b/i.test(text) &&
    /\b(?:this wallet|on arc|in (?:this|the) (?:app|wallet|chat)|for (?:this|your) wallet)\b/i.test(
      text,
    )
  );
}

export function buildHermesCorrectionReply(message: string): string | null {
  const translation = buildKnownLanguageLeakReply(message);
  if (translation) return translation;

  if (responseClaimsUnsupportedProductEntity(message)) {
    if (/\bZeitgeist\b/i.test(message)) {
      return 'AgentFlow prediction-market execution currently uses AchMarket on Arc. I do not have grounded support for Zeitgeist as an AgentFlow execution provider.';
    }
    return 'AgentFlow’s in-chat vault actions currently support the Lunex USDC Vault and Lunex EURC Vault. Pool Labs and Gamma are not supported AgentFlow vault providers.';
  }

  if (responseClaimsPredictionMarketsUnavailable(message)) {
    return 'Prediction markets are available in AgentFlow chat via AchMarket on Arc. Ask “show prediction markets” to browse live markets, or tell me whether you want positions or how they work.';
  }

  if (isHallucinationChallenge(message)) {
    return 'That answer was generated without a supporting AgentFlow tool result, so it should not have been presented as fact. Tell me which claim you want checked and I’ll use the grounded product data.';
  }

  if (isTopiclessDeepDiveRequest(message)) {
    return 'What should the deep dive be about: your portfolio, a market, an external topic, or an AgentFlow workflow?';
  }

  return null;
}

function responseClaimsUnsupportedProductEntity(text: string): boolean {
  if (/\bPool\s*Labs?\b|\bZeitgeist\b/i.test(text)) return true;
  return (
    /\bGamma\b/i.test(text) &&
    /\b(?:vault|provider|deposit|withdraw|yield|position)\b/i.test(text)
  );
}

export function responseContainsFabricatedRuntimeExplanation(text: string): boolean {
  return FABRICATED_RUNTIME_EXPLANATION.test(text);
}

export function validateHermesResponseGrounding(
  userMessage: string,
  assistantText: string,
  toolsStarted: string[],
): HermesGroundingDecision {
  const text = assistantText.trim();
  if (!text) return { ok: true };

  if (hasUnexpectedLanguageSwitch(userMessage, text)) {
    return {
      ok: false,
      reason: 'unexpected_language_switch',
      replacement:
        'I generated an unexpected language switch, so I discarded that draft. What would you like to do instead?',
    };
  }

  if (toolsStarted.length === 0 && responseClaimsUnsupportedProductEntity(text)) {
    const vaultContext = /\b(?:vault|provider|deposit|withdraw|Pool\s*Labs?|Gamma)\b/i.test(
      `${userMessage} ${text}`,
    );
    return {
      ok: false,
      reason: 'unsupported_product_entity',
      replacement: vaultContext
        ? 'AgentFlow’s in-chat vault actions currently support the Lunex USDC Vault and Lunex EURC Vault. I do not have grounded support for the other provider named in that draft.'
        : formatAgentFlowCapabilityReply(),
    };
  }

  if (toolsStarted.length === 0 && responseClaimsPredictionMarketsUnavailable(text)) {
    return {
      ok: false,
      reason: 'false_prediction_market_unavailability',
      replacement:
        'Prediction markets are available in AgentFlow chat via AchMarket on Arc. Ask “show prediction markets” to browse live markets, or tell me whether you want positions or how they work.',
    };
  }

  if (responseContainsFabricatedRuntimeExplanation(text)) {
    return {
      ok: false,
      reason: 'fabricated_runtime_explanation',
      replacement:
        'That explanation was not backed by a tool or runtime record, so I discarded it. There is no verified localization-test or legacy-document source behind that draft.',
    };
  }

  if (
    toolsStarted.length === 0 &&
    (/\bAgentFlow\s+can\s+do\s+(?:these\s+)?\d+\s+things\b/i.test(text) ||
      GENERIC_HERMES_CONTEXT_LEAK.test(text))
  ) {
    return {
      ok: false,
      reason: 'ungrounded_capability_dump',
      replacement: formatAgentFlowCapabilityReply(),
    };
  }

  return { ok: true };
}

export function filterUntrustedHermesHistory(messages: ChatMessage[]): ChatMessage[] {
  let latestUser = '';
  const filtered: ChatMessage[] = [];

  for (const message of messages) {
    if (message.role === 'user') {
      latestUser = message.content;
      filtered.push(message);
      continue;
    }

    if (
      responseContainsFabricatedRuntimeExplanation(message.content) ||
      hasUnexpectedLanguageSwitch(latestUser, message.content) ||
      responseClaimsUnsupportedProductEntity(message.content) ||
      responseClaimsPredictionMarketsUnavailable(message.content)
    ) {
      continue;
    }
    filtered.push(message);
  }

  return filtered;
}

export function removeLatestAssistantTurn(messages: ChatMessage[]): ChatMessage[] {
  let latestAssistantIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') {
      latestAssistantIndex = index;
      break;
    }
  }
  if (latestAssistantIndex < 0) return [...messages];

  const turnStart =
    latestAssistantIndex > 0 && messages[latestAssistantIndex - 1]?.role === 'user'
      ? latestAssistantIndex - 1
      : latestAssistantIndex;
  return [
    ...messages.slice(0, turnStart),
    ...messages.slice(latestAssistantIndex + 1),
  ];
}
