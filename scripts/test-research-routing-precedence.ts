import assert from 'node:assert/strict';
import { hasExplicitResearchReportRequest } from '../lib/research-routing-precedence';

const researchRequests = [
  "Make research report on the bitcoin's last 24h transactions",
  'research bitcoin transaction volume over the last 24h',
  'write a report on recent bitcoin transactions',
  'make a research report on Ethereum vs bitcoin',
];

for (const message of researchRequests) {
  assert.equal(
    hasExplicitResearchReportRequest(message),
    true,
    `Expected explicit research precedence for: ${message}`,
  );
}

const agentPayHistoryRequests = [
  'show my last 24h transactions',
  'list recent transfers',
  'what payments have i sent',
];

for (const message of agentPayHistoryRequests) {
  assert.equal(
    hasExplicitResearchReportRequest(message),
    false,
    `Expected AgentPay history request to remain eligible for fast-path routing: ${message}`,
  );
}

console.log('Research routing precedence regression checks passed.');
