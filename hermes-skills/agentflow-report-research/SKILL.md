---
name: agentflow-report-research
description: Use when generating AgentFlow research reports, especially when the first search pass is too thin, too narrow, or drifts off-topic. Plans fast report retrieval, decomposes broad or ambiguous requests into focused subqueries, checks source sufficiency, and produces a clean evidence brief for the writer without turning every report into a slow deep-research run.
---

# AgentFlow Report Research

This skill is for AgentFlow's default report path.

Goal:
- Improve source coverage for fast reports.
- Keep latency controlled.
- Decompose only when needed.
- Preserve the exact user topic.

## Core rule

Do not treat every report like deep research.

Use one of three retrieval plans:

1. `direct`
- Use for simple factual or tightly scoped requests.
- Run the main query with minimal expansion.
- Use 0-2 subqueries.

2. `light`
- Default mode.
- Use when a small amount of decomposition will improve coverage.
- Use 2-4 focused subqueries.

3. `standard`
- Use only when the request is broad, ambiguous, comparison-heavy, or likely to become thin without fuller coverage.
- Use 4-6 focused subqueries.

## When to decompose

Decompose when one or more of these are true:
- The topic is broad: markets, industries, protocols, adoption, regulation, outlooks.
- The topic has multiple entities, drivers, or moving parts.
- The first pass returns too few distinct source domains.
- Retrieved evidence is repetitive, low-authority, or clearly off-topic.
- The request is a comparison, forecast, impact analysis, or prediction-market question.

Do not decompose just because the user said "report."

## Topic contract

The user's topic is the contract.

You must preserve:
- The named entity or entities
- The timeframe
- The geography if relevant
- The comparison frame if present
- The real-world event behind a prediction market

Do not let one retrieved article, vendor page, or homonym redefine the subject.

## Subquery design

Every subquery must be:
- short
- self-contained
- search-ready
- about one angle only

Good subquery lanes:
- current status
- official update
- metrics / data
- risks / counterevidence
- market drivers
- regulation
- timeline / milestone status

Bad subqueries:
- vague rewrites of the same sentence
- opinionated framing
- internal AgentFlow metadata
- contract addresses unless the user explicitly asked for onchain contract research

## Prediction-market mode

For prediction-market reports, break the work into lanes like:
- exact real-world subject
- current evidence for each listed outcome
- timing / resolution window
- official or primary sources
- strongest contrary evidence

Do not research the market provider itself unless it is materially relevant.

## Coverage check

After retrieval, check:
- distinct source domains
- authority mix
- freshness
- duplication
- unresolved ambiguity

If coverage is weak, run one more targeted pass only for the missing lane.

Do not restart the whole workflow unless the topic contract is broken.

## Writer handoff

Return a compact evidence brief for the writer with:
- topic
- retrieval plan used: `direct`, `light`, or `standard`
- the subqueries actually used
- strongest facts
- weak or missing areas
- top sources
- caveats / unresolved questions

The writer should receive a cleaner evidence pack, not raw search exhaust.
