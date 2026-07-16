type JsonObject = Record<string, unknown>;

function tryParseObject(value: string): JsonObject | null {
  if (!value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as JsonObject) : null;
  } catch {
    return null;
  }
}

export function buildAnalystModelInput(params: {
  task: string;
  researchText: string;
  research?: JsonObject | null;
  liveData?: JsonObject | null;
  portfolioImpact?: boolean;
}): string {
  const research = params.research && typeof params.research === 'object'
    ? params.research
    : tryParseObject(params.researchText);
  const walletContextAvailable =
    !!params.liveData &&
    typeof params.liveData.wallet_context === 'object' &&
    params.liveData.wallet_context !== null;

  return JSON.stringify(
    {
      task: params.task,
      current_date: new Date().toISOString().slice(0, 10),
      current_source_set_only: true,
      prior_report_language_allowed: false,
      instructions: [
        'Base the analysis only on the provided research payload and live source state.',
        'If liveData.research_brief exists, treat it as the topic contract. Evaluate whether the research answered its query, scope, must_answer, and avoid_drift constraints.',
        'If liveData.prediction_market_understanding exists, use it as the resolved entity contract: subject, underlying, official domains, ambiguity, and avoidTerms should override narrower side-topic interpretations from individual sources.',
        'If liveData.prediction_market_metrics exists, treat every numeric field and formula in it as authoritative deterministic math. Do not independently estimate, round into a contradictory figure, or describe a sub-100% required increase as a doubling.',
        'For sports winner markets, bind every percentage or price to the exact team, outcome, and metric stated in the source. A probability of reaching the final is not a probability of winning the tournament. Preserve the model stage/as-of context and do not present a pre-match projection as post-match current odds.',
        'For prediction-question research, analyze only the underlying real-world topic. Internal provider, platform, contract, listed-price, liquidity, and trade-routing metadata are not evidence and must not appear in the analysis unless the user explicitly asks about them.',
        'Treat publication time, event time, forecast as-of time, and retrieval/access time as different fields. Accessing an old article today does not make its forecast current.',
        'For creator, channel, subscriber, follower, or audience milestone topics, prefer the freshest official platform metric available over older article baselines when both exist.',
        'If liveData.source_diagnostics indicates medium or high drift risk, flag that explicitly and do not let a narrow retrieved article redefine the user topic.',
        'Do not inherit framing from earlier report language or user assumptions.',
        'Do not introduce dates later than current_date.',
        'If liveData.current_events.framing_signals exist, preserve them exactly and keep conflict status separate from route status.',
        params.portfolioImpact
          ? walletContextAvailable
            ? 'Use liveData.wallet_context as private exposure context. Classify what the user actually holds (stablecoins, volatile crypto, DeFi, Gateway, mixed) and assess impact through those asset classes. For every relevant holding or position, classify the impact as direct, indirect, or no clear material effect from the current evidence. For every personalized impact, identify an actual holding or position, a source-backed event finding, the transmission channel, expected direction, time horizon, and confidence. If the event evidence is unclear or thin, still explain the plausible direct/indirect/no-effect channel, but mark confidence low and do not overstate. Reject any personalized claim that names an asset not present in the snapshot as if the user holds it.'
            : 'portfolio_impact is true but wallet_context_available is false. Do not infer or invent holdings, exposure mix, asset classes, balances, or personalized sensitivities. Keep the analysis general and note that the portfolio snapshot was unavailable if personalization would otherwise be required.'
          : 'Ignore liveData.wallet_context for report framing unless portfolio_impact is true.',
        'Do not expose full wallet addresses, raw balances, or PnL unless the task explicitly asks for a balance/portfolio breakdown.',
      ],
      portfolio_impact: params.portfolioImpact === true,
      wallet_context_available: walletContextAvailable,
      research: research ?? params.researchText,
      liveData: params.liveData ?? null,
    },
    null,
    2,
  );
}

export function buildWriterModelInput(params: {
  task: string;
  researchText: string;
  analysisText: string;
  research?: JsonObject | null;
  analysis?: JsonObject | null;
  liveData?: JsonObject | null;
  portfolioImpact?: boolean;
}): string {
  const research = params.research ?? tryParseObject(params.researchText);
  const analysis = params.analysis ?? tryParseObject(params.analysisText);
  const walletContextAvailable =
    !!params.liveData &&
    typeof params.liveData.wallet_context === 'object' &&
    params.liveData.wallet_context !== null;

  return JSON.stringify(
    {
      task: params.task,
      current_date: new Date().toISOString().slice(0, 10),
      current_source_set_only: true,
      prior_report_language_allowed: false,
      regenerate_from_latest_retrieved_sources: true,
      instructions: [
        'Write only from the provided research, analysis, and live source state.',
        'If liveData.research_brief exists, structure the answer around that topic contract: query, scope, must_answer, and avoid_drift.',
        'If liveData.prediction_market_understanding exists, keep the final report anchored to that resolved entity. Use the underlying driver when present, favor expected official domains, and explicitly call out unresolved ambiguity instead of drifting to a homonym topic.',
        'If liveData.prediction_market_metrics exists, copy its threshold math faithfully. State the current baseline, target, required percentage increase, and equivalent price using its formula and assumption; do not recalculate those values or call a sub-100% increase a doubling.',
        'For sports winner markets, bind every percentage or price to the exact team, outcome, and metric stated in the source. Never relabel a probability of reaching the final as a title probability. Preserve whether a model is pre-match or post-match and its as-of stage; if newer results make a model stale, label it as historical context rather than current odds.',
        'For prediction-question research, write only about the underlying real-world topic. Do not mention an internal provider, platform, contract, listed price, liquidity value, or trade-routing metadata unless the user explicitly asks about it.',
        'Treat publication time, event time, forecast as-of time, and retrieval/access time as different fields. Never label an older forecast current merely because its page was accessed today.',
        'For creator, channel, subscriber, follower, or audience milestone topics, prefer the freshest official platform metric available over older article baselines when both exist.',
        'If liveData.source_diagnostics says source diversity is insufficient or drift risk is medium/high, include a concise Coverage Limits note and avoid a confident full-scope conclusion.',
        'Never let a single retrieved source or narrow side topic become the report frame unless the user explicitly asked for that angle.',
        'Do not reuse or preserve stale wording from earlier reports.',
        'Do not introduce dates later than current_date.',
        'Use a Perplexity-style structure: direct answer first, evidence bullets, uncertainty, then numbered sources with real URLs.',
        'Never cite source registry candidates or retrieval tools as sources; cite only actual retrieved publishers, APIs, or article URLs.',
        'If liveData.current_events.framing_signals exist, keep the broader conflict status and each route status aligned with those signals.',
        params.portfolioImpact
          ? walletContextAvailable
            ? 'When portfolio_impact is true and wallet_context_available is true, include a concise portfolio-relevant section keyed to liveData.wallet_context. Each impact bullet must connect (1) an actual holding or position, (2) a source-backed event finding, and (3) a concrete transmission channel, with direction, time horizon, confidence, and an impact label: direct, indirect, or no clear material effect. If the report event has unclear or thin evidence, still explain how it may affect or may not affect each relevant exposure, but mark the channel low-confidence instead of omitting personalization or inventing certainty. Cite the external event source; treat the private wallet snapshot as the authority for what the user holds. Do not expose raw balances, full wallet addresses, or PnL unless explicitly requested.'
            : 'When portfolio_impact is true but wallet_context_available is false, do not invent holdings, asset mix, wallet exposure, or portfolio sensitivities. Keep the report general and, if needed, say the portfolio snapshot was unavailable for personalization.'
          : 'When portfolio_impact is false, do not include any portfolio-oriented section and do not reference the user wallet, holdings, or positions.',
        'For stablecoin-heavy portfolios when portfolio_impact is true, focus on peg, issuer/reserve, redemption/liquidity, regulation, rates/Treasuries, on/off-ramp, and Gateway/settlement risks rather than generic BTC/ETH volatility. Do not say stablecoin value is volatile from a geopolitical event unless the evidence specifically connects the event to peg, issuer, reserve, redemption, liquidity, sanctions, or payment-rail stress.',
        'Portfolio-aware writing is descriptive by default: describe options factually without pushing the user to move funds.',
        'Use neutral phrasing such as "Vaults are available for stablecoin yield"; do not write "you could move your Gateway reserve into vaults" unless the user explicitly asks for a recommendation.',
        'Avoid unsolicited "you should", "you could", "I recommend", "consider moving", "consider depositing", or "consider allocating" language about user funds.',
        'Only recommend specific moves when the task explicitly asks what the user should do, what you would do, or asks for a recommendation; include caveats and say the user decides whether to act.',
        'Treat Gateway reserve as x402 and agent-to-agent payment liquidity, not as automatically deployable investment capital.',
      ],
      portfolio_impact: params.portfolioImpact === true,
      wallet_context_available: walletContextAvailable,
      research: research ?? params.researchText,
      analysis: analysis ?? params.analysisText,
      liveData: params.liveData ?? null,
    },
    null,
    2,
  );
}
