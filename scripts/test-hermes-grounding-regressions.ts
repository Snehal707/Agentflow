import assert from 'node:assert/strict';

import { shouldHandleAsAgentFlowCapabilityQuestion } from '../lib/chatRouting';
import { answerProductQuestion } from '../lib/product-rag';
import {
  buildHermesCorrectionReply,
  filterUntrustedHermesHistory,
  hasUnexpectedLanguageSwitch,
  isAgentFlowCapabilityQuestionVariant,
  isHallucinationChallenge,
  isTopiclessDeepDiveRequest,
  removeLatestAssistantTurn,
  validateHermesResponseGrounding,
} from '../lib/hermes-response-grounding';

const freshThread = { messageCount: 1, hasAssistantMessage: false };

assert.equal(isAgentFlowCapabilityQuestionVariant('what can do'), true);
assert.equal(isAgentFlowCapabilityQuestionVariant('what can u do here?'), true);
assert.equal(shouldHandleAsAgentFlowCapabilityQuestion('what can do', freshThread), true);
assert.equal(shouldHandleAsAgentFlowCapabilityQuestion('what can u do here?', freshThread), true);

assert.equal(isTopiclessDeepDiveRequest('yeah go deep dive into anything'), true);
assert.match(
  buildHermesCorrectionReply('yeah go deep dive into anything') ?? '',
  /What should the deep dive be about/i,
);

assert.equal(isHallucinationChallenge('why are you hallucinating?'), true);
assert.equal(isHallucinationChallenge('is USDT not supported?'), false);
assert.match(
  buildHermesCorrectionReply('why are you hallucinating?') ?? '',
  /without a supporting AgentFlow tool result/i,
);

const capabilityHallucination = validateHermesResponseGrounding(
  'yeah go deep dive into anyhting',
  'Right now AgentFlow can do these 10 things: vault deposits with Pool Labs and Gamma, prediction markets with Zeitgeist, and the chat service CLI config + skills + cron.',
  [],
);
assert.equal(capabilityHallucination.ok, false);
if (!capabilityHallucination.ok) {
  assert.match(capabilityHallucination.reason, /unsupported_product_entity|ungrounded_capability_dump/);
  assert.doesNotMatch(capabilityHallucination.replacement, /Pool\s*Labs?|Gamma|Zeitgeist/i);
}

const firstLanguageLeak = validateHermesResponseGrounding(
  'naah lol',
  'No problem. 随时都可以切换主题.',
  [],
);
assert.deepEqual(firstLanguageLeak.ok, false);
if (!firstLanguageLeak.ok) assert.equal(firstLanguageLeak.reason, 'unexpected_language_switch');

const secondLanguageLeak = validateHermesResponseGrounding(
  'also you mentioned Pool Labs and Gamma, what is that?',
  'Lunex EURC Vault 我看出来你想深入了解 all options.',
  [],
);
assert.deepEqual(secondLanguageLeak.ok, false);
if (!secondLanguageLeak.ok) assert.equal(secondLanguageLeak.reason, 'unexpected_language_switch');

const fabricatedExplanation = validateHermesResponseGrounding(
  'what does that phrase mean?',
  'I was testing some phrases for different audiences and accidentally left a Chinese phrase in a localization test mixin.',
  [],
);
assert.deepEqual(fabricatedExplanation.ok, false);
if (!fabricatedExplanation.ok) {
  assert.equal(fabricatedExplanation.reason, 'fabricated_runtime_explanation');
}

const unsupportedVault = validateHermesResponseGrounding(
  'what are Pool Labs and Gamma?',
  'Pool Labs and Gamma appear in legacy research docs about vault providers.',
  [],
);
assert.deepEqual(unsupportedVault.ok, false);
if (!unsupportedVault.ok) {
  assert.match(unsupportedVault.replacement, /Lunex USDC Vault.*Lunex EURC Vault/i);
}

assert.equal(
  hasUnexpectedLanguageSwitch('请用中文回答', '当然，可以切换主题。'),
  false,
  'A matching user script must remain allowed.',
);
assert.equal(
  hasUnexpectedLanguageSwitch('Reply in Chinese.', '当然，可以切换主题。'),
  false,
  'An explicit language request must remain allowed.',
);
assert.equal(
  validateHermesResponseGrounding(
    'What is Polymarket Gamma?',
    'Polymarket Gamma is used as a prediction-market research source.',
    [],
  ).ok,
  true,
  'Gamma must not be blocked when accurately described as a research source.',
);

const cleanedHistory = filterUntrustedHermesHistory([
  { role: 'user', content: 'naah lol' },
  { role: 'assistant', content: 'No problem. 随时都可以切换主题.' },
  { role: 'user', content: 'what is that?' },
  {
    role: 'assistant',
    content: 'It was part of a Chinese localization test and leaked from a test mixin.',
  },
  { role: 'user', content: 'thanks' },
  { role: 'assistant', content: "You're welcome." },
]);
assert.deepEqual(cleanedHistory, [
  { role: 'user', content: 'naah lol' },
  { role: 'user', content: 'what is that?' },
  { role: 'user', content: 'thanks' },
  { role: 'assistant', content: "You're welcome." },
]);

assert.deepEqual(
  removeLatestAssistantTurn([
    { role: 'user', content: 'tell me about a provider' },
    { role: 'assistant', content: 'A completely unknown provider is supported.' },
  ]),
  [],
  'A user-disputed assistant turn must not be fed back into Hermes.',
);

assert.match(
  buildHermesCorrectionReply('what is 随时都可以切换主题?') ?? '',
  /you can switch topics at any time/i,
);
assert.match(
  buildHermesCorrectionReply('again, 我看出来你想深入了解 whats this?') ?? '',
  /understand this more deeply/i,
);
assert.match(
  buildHermesCorrectionReply('what are Pool Labs and Gamma vaults?') ?? '',
  /Lunex USDC Vault.*Lunex EURC Vault/i,
);
assert.match(
  buildHermesCorrectionReply('does AgentFlow use Zeitgeist?') ?? '',
  /AchMarket/i,
);

const capabilityAnswer = answerProductQuestion('what can you do?');
assert.ok(capabilityAnswer);
assert.doesNotMatch(capabilityAnswer.answer, /any EVM chain|Pool\s*Labs?|Gamma|Zeitgeist/i);

const vaultAnswer = answerProductQuestion('which vaults are supported?');
assert.ok(vaultAnswer);
assert.match(vaultAnswer.answer, /Lunex USDC Vault.*Lunex EURC Vault/is);

console.log('[test-hermes-grounding-regressions] all assertions passed');
