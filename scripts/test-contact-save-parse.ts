import assert from 'node:assert/strict';
import { parseContactSaveMessage, looksLikeContactSaveMessage } from '../lib/contact-save-parse';

const cases: Array<{ input: string; name: string; address: string | null }> = [
  { input: 'save jack as jack.arc', name: 'jack', address: 'jack.arc' },
  { input: 'save vendor as jack.arc', name: 'vendor', address: 'jack.arc' },
  { input: 'save jack.arc as vendor', name: 'vendor', address: 'jack.arc' },
  { input: 'save contact jack.arc as vendor', name: 'vendor', address: 'jack.arc' },
  { input: 'add contact alice alice.arc', name: 'alice', address: 'alice.arc' },
  { input: 'bob is bob.arc', name: 'bob', address: 'bob.arc' },
  { input: 'save alice', name: 'alice', address: null },
];

for (const testCase of cases) {
  const parsed = parseContactSaveMessage(testCase.input);
  assert.ok(parsed, `expected parse for: ${testCase.input}`);
  assert.equal(parsed.name, testCase.name, testCase.input);
  assert.equal(parsed.address, testCase.address, testCase.input);
  assert.equal(looksLikeContactSaveMessage(testCase.input), true, testCase.input);
}

assert.equal(parseContactSaveMessage('show my contacts'), null);
assert.equal(looksLikeContactSaveMessage('pay jack 5 usdc'), false);

console.log('contact-save-parse checks passed');
