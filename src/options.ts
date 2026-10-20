/**
 * Options mapping for the strategy, copied from connectome-host's built-in
 * `autobiographical` branch in `src/framework-strategy.ts` (`fabula/prod`,
 * b6c42c3 / 48129e0a). A custom strategy type skips that branch entirely, so
 * without this the strategy would see the raw recipe block and run on library
 * defaults (no autoTick, 30k window, summaries voiced as "Claude").
 * Since connectome-host fabula/prod 80c567a/b32f4b7 the host's list no longer
 * carries the fork's keys (compressionMarker, mintCarrierPolicy, gap
 * categories, ...); they live only here now. Keep the rest in step with the
 * host's built-in branch.
 */
const PASSTHROUGH_KEYS = [
  'enforceBudget',
  'maxSpeculativeL1s',
  'compressionMarker',
  'compressionRefusalCurveFallbacks',
  'compressionIdenticalRefusalRetries',
  'compressionShapeFallbacks',
  'mintCarrierPolicy',
  'compressionInstruction',
  'compressionContextBudgetTokens',
  'compressionSourceOnly',
  'compressionSourceOnlyFallback',
  'compressionMergeSourceOnly',
  'compressionMergeSourceOnlyFallback',
  'compressionSplitFallback',
  'compressionSplitPlaceholder',
  'compressionClassifierGapCategories',
  'compressionSplitMaxDepth',
  'compressionSplitMaxCallsPerChunk',
  'compressionSplitMaxCallsPer10Min',
  'compressionRecallBudgetTokens',
  'positionedRecallPairs',
  'recallHeaderTemplate',
  'targetChunkTokens',
  'mergeThreshold',
  'mergeMaxSourceSpanMessages',
  'summaryTargetTokens',
  'productionBudgetTokens',
  'l1BudgetTokens',
  'l2BudgetTokens',
  'l3BudgetTokens',
  'toolResultMaxLastN',
  'toolUseInputMaxTokens',
  'adaptiveResolution',
  'kvStableReachTokens',
  'kvStableQualityGapRatio',
  'compressionSlackRatio',
  'overBudgetGraceRatio',
  'foldingStrategy',
  'kvUnified',
  'speculativeProduction',
  'l1HoldbackChunks',
  'summaryParticipant',
  'summarySystemPrompt',
  'summaryUserPrompt',
  'summaryContextLabel',
  'witnessedBeforeSequence',
  'witnessedInstruction',
  'identityReminder',
  // Not in the host's list: autobiogap passes it so recipes can turn on the
  // one-shot config:effective report.
  'logEffectiveConfig',
] as const;

/**
 * Same result as the host's built-in branch for `type: 'autobiographical'`.
 * `summaryParticipant` must be in the recipe's strategy block: the host fills
 * it from `recipe.agent.name`, which a strategy factory isn't given.
 */
export function buildStrategyOptions(config: Record<string, unknown>, model: string): Record<string, unknown> {
  const opts: Record<string, unknown> = {
    headWindowTokens: config.headWindowTokens ?? 4000,
    recentWindowTokens: config.recentWindowTokens ?? 30000,
    compressionModel: config.compressionModel ?? model,
    ...(config.compressionMaxTokens !== undefined ? { compressionMaxTokens: config.compressionMaxTokens } : {}),
    autoTickOnNewMessage: true,
    maxMessageTokens: config.maxMessageTokens ?? 10000,
  };
  for (const key of PASSTHROUGH_KEYS) {
    if (config[key] !== undefined) opts[key] = config[key];
  }
  if (opts.adaptiveResolution === undefined) opts.adaptiveResolution = true;
  if (opts.adaptiveResolution !== false && opts.foldingStrategy === undefined) opts.foldingStrategy = 'kv-stable';
  if (opts.summaryParticipant === undefined) {
    throw new Error(
      'autobiogap: set agent.strategy.summaryParticipant to the agent name ' +
        '(the built-in strategy takes it from agent.name; extensions are not given it)',
    );
  }
  return opts;
}
