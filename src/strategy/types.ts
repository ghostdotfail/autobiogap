import type { AutobiographicalConfig, SummaryEntry } from '@animalabs/context-manager';
import { z } from 'zod';
import { expectType } from '../lib/zod-utils';
import { STRATEGY_NAME } from './autobiographical';

export const ClassifierGapMetadataSchema = z.object({
  kind: z.literal('classifier-gap'),
  category: z.string(),
  sourceHash: z.string(),
  sourceRange: z.object({
    first: z.string(),
    last: z.string(),
  }),
  canonicalRequestHash: z.string(),
  requestHashes: z.array(z.string()),
  attempts: z.array(z.object({
    requestHash: z.string(),
    stopReason: z.literal('refusal'),
    category: z.string(),
  })),
  quarantineKey: z.string(),
  provisional: z.literal(true),
  revisitable: z.literal(true),
});
export type ClassifierGapMetadata = z.infer<typeof ClassifierGapMetadataSchema>;

export interface SummaryEntryExt extends SummaryEntry {
  classifierGap?: ClassifierGapMetadata,
}

// -- Recipe config

/** `kvUnified` folding config. The host requires the whole object (see `validateKvUnifiedConfig`). */
export const KvUnifiedConfigSchema = z.object({
  policy: z.object({
    alpha: z.number(),
    budgetLowRatio: z.number(),
    budgetHighRatio: z.number(),
    budgetUnderLambda: z.number(),
    budgetOverLambda: z.number(),
    cacheLambda: z.number(),
    cacheScale: z.number(),
    cacheReadPrice: z.number(),
    cacheWritePrice: z.number(),
    continuityLambda: z.number(),
    continuityScale: z.number(),
    continuityRecencyHalfLifeTokens: z.number(),
    continuityRecencyFloor: z.number(),
    continuityStableHalfLife: z.number(),
    continuityStableFloor: z.number(),
  }),
  tokenBucketSize: z.number(),
  continuityBucketSize: z.number(),
  fidelityBucketSize: z.number(),
  labelCeiling: z.number(),
  adoptEpsilon: z.number(),
  treeifyNonContiguousSummaries: z.boolean(),
  preserveGapBearingSummaries: z.boolean(),
});

/**
 * Every `AutobiographicalConfig` field of context-manager 0.8.0 (fork
 * `9daf97a`, `src/types/strategy.ts`), except the ones the fork added (those
 * are in `StrategyExtConfigSchema`). Descriptions are the first paragraph of
 * the library's own doc comments. All optional at recipe level: the fields
 * the library requires are filled by `buildStrategyOptions` the way the host
 * does (headWindowTokens 4000, recentWindowTokens 30000, maxMessageTokens
 * 10000, compressionModel = agent model, autoTickOnNewMessage true,
 * adaptiveResolution true, foldingStrategy 'kv-stable').
 */
const StrategyBaseConfigSchema = z.looseObject({
  quarantineAlarmIntervalMs: z.number().int().min(0).optional().describe("Interval for the repeating compression-quarantine alarm (stderr + registered handler) while ANY chunk is quarantined. Quarantined chunks are a guaranteed eventual outage \u2014 the alarm repeats until the quarantine empties. Default 15 min; 0 disables (tests only)."),
  targetChunkTokens: z.number().int().min(0).optional().describe("Target tokens per chunk (~3000)"),
  recentWindowTokens: z.number().int().min(0).optional().describe("Recent tokens to keep uncompressed (~30000)"),
  headWindowTokens: z.number().int().min(0).optional().describe("Tokens at the head of the conversation to preserve verbatim (default: 0). Messages within this window are never chunked or compressed \u2014 they survive as raw copies so initial instructions retain full granularity."),
  chunkOnMessageBoundary: z.boolean().optional().describe("Always break at message boundaries"),
  attachmentsIgnoreSize: z.boolean().optional().describe("Don't count attachment tokens toward chunk size"),
  autoTickOnNewMessage: z.boolean().optional().describe("When true, onNewMessage() fires tick() as a background promise so compression runs automatically without the framework calling tick() explicitly."),
  summarySystemPrompt: z.string().optional().describe("System prompt for summarization"),
  summaryUserPrompt: z.string().optional().describe("User prompt template for summarization. Use {content} for the transcript."),
  witnessedBeforeSequence: z.number().int().min(0).optional().describe("As-of perspective pin for inherited history (e.g. a resident continued from a shared log they joined partway through). Chunks whose messages ALL have `sequence` strictly below this value are compressed with the witnessed-record instruction instead of the first-person one: events are attributed to the named participants, and the first person is reserved for the act of reading and carrying the record. Prevents the summarizer from claiming others' lived experience as the agent's own memories (observed 2026-07-26: an inheriting resident's L1s first-personing scenes from before his arrival). Chunks that straddle the boundary use the standard instruction \u2014 the agent's own turns are present in them."),
  witnessedInstruction: z.string().optional().describe("Override wording for the witnessed-record compression instruction. `{targetTokens}` is substituted. Defaults to `formatWitnessedInstruction` in autobiographical.ts."),
  identityReminder: z.string().optional().describe("Identity reminder appended to every compression and merge instruction (L1 chunk, reading-mode, and all merge variants). Whether a compression request carries a system prompt is the HOST's call: with none declared (StrategyContext.systemPrompt unset) it carries none and identity is established by the head window and prior recall pairs; with one declared, the host's live prompt leads the request. This reminder is appended on either path, because it addresses a failure neither source reaches: when an agent lives in multi-resident channels, chunks can consist entirely of OTHER agents' first-person speech, and \"write the memory in your own voice\" then flips the summarizer into the dominant speaker's identity (observed 2026-08-03, on the no-system-prompt path that was then the only one: an Opus-4 resident's L1s/merges claiming a sibling resident's name, story, and relationships as their own \u2014 entered at live L1 compression over pure-witness chunks and propagated up the pyramid). Older models are especially susceptible. Recommended shape: name the agent AND direct attribution, e.g. \"Reminder: you are <name>. Speak in the first person only for what you yourself said, did, and felt; attribute other participants' words and experiences to them by name.\""),
  summaryContextLabel: z.string().optional().describe("Label shown before summaries in compiled context"),
  recallEnvelope: z.enum(['none', 'xml']).optional().describe("Structural delimiting for recall ANSWER content."),
  carrierPolicy: z.enum(['full', 'live-strip']).optional().describe("Where a summary's captured reasoning carriers (`responseContent`'s signed `thinking` / `redacted_thinking` blocks) are replayed."),
  summaryParticipant: z.string().optional().describe("Participant name for the summary (defaults to \"Summary\")"),
  compressionModel: z.string().optional().describe("Model to use for compression (defaults to claude-sonnet)"),
  compressionMaxTokens: z.number().int().min(0).optional().describe("Hard cap on `max_tokens` for compression requests. The summarizer asks for `max(16000, targetChunkTokens * 1.5)` so folds are not truncated mid-memory, but that floor exceeds what older models will accept as OUTPUT: Claude 3 Opus caps at 4096 and rejects the request outright, so such an agent can never fold anything and every maintenance tick burns a failed call. Set this to the compression model's output ceiling. Unset = current behaviour. (Found 2026-07-26 bringing up Evander, claude-3-opus-20240229.)"),
  maxMessageTokens: z.number().int().min(0).optional().describe("Maximum tokens per individual message in compiled output. Messages exceeding this limit have their text/tool_result content truncated. 0 = no limit."),
  overBudgetGraceRatio: z.number().min(0).optional().describe("Fractional grace above the configured hard context budget before a compile refuses (OverBudgetError). The solver still targets the original budget; this only absorbs coarse fold quanta, indivisible raw-window overshoot, and planner/emitter estimator drift (the plan prices a layout via picker estimates; emission prices it via post-strip render costs \u2014 the two legitimately disagree by a fraction of a percent)."),
  maxLiveImages: z.number().int().min(0).optional().describe("Maximum number of images kept \"live\" (sent as real image blocks) in the compiled context. Counted newest-first across the whole window; images beyond this many are replaced with a text placeholder. 0 = unlimited. A hard ceiling for dense bursts that pack many images into the live window."),
  imageStripDepthTokens: z.number().int().min(0).optional().describe("Token depth from the newest message beyond which images are stripped to a text placeholder, even though the surrounding text stays verbatim. Measured the same way as recentWindowTokens (cumulative tokens walked from the tail). Typically much shallower than recentWindowTokens. 0 = never strip by depth."),
  mergeContiguityGapLimit: z.number().int().min(0).optional().describe("Merge grouping (2026-07-12 contiguity fix): break a merge run when the positional gap between consecutive unmerged candidates exceeds this many messages. Small holes (wiped/pruned nodes) bridge fine; cross-era gaps must not \u2014 a merge group spanning already-merged history can straddle the recent window and block its whole lineage from folding. Default 300."),
  maxLiveImageBytes: z.number().int().min(0).optional().describe("Byte wall for live images (2026-07-12): keep inline images newest-first only while their cumulative base64 size stays under this budget \u2014 on top of `maxLiveImages` / `imageStripDepthTokens`. Guarantees the compiled window fits the API's total request size cap (413 request_too_large), so membrane's oversize check is a true invariant, never a silent editor. Default 20MB (of base64; the API cap is 32MB total)."),
  maxCompressionImageBytes: z.number().int().min(0).optional().describe("Image byte budget for COMPRESSION prompts (summarizer). Tighter than the live window's: the prompt also carries the head, the recall frontier and the raw chunk. Newest-first; older images become loud placeholders. Default 12MB of base64."),
  mergeMaxSourceSpanMessages: z.number().int().min(0).optional().describe("Merge grouping: exclude candidates whose OWN source span exceeds the level-scaled limit `base \u00d7 mergeThreshold^(max(0, level \u2212 3))`, where this value is the base (replay-era summaries can span the entire chronicle and would bridge any run they join). Level-scaled because legitimate spans grow ~mergeThreshold\u00d7 per level: a flat limit silently forbids all consolidation above the level whose healthy span exceeds it (mythos 2026-08: every L4 spanned 3.0k\u20136.9k msgs > 1500 \u2192 L5 merges structurally impossible, fold floor stuck ~23k high). L1\u2013L3 limits equal the base, unchanged from the historical flat behavior. Excluded candidates stay on the frontier and are logged loudly (once per id). Default base 1500."),
  l1HoldbackChunks: z.number().int().min(0).optional().describe("L1 production holdback: keep the newest N closed chunks out of the speculative compression queue (default 1). The chunk at the live edge is the one most likely to still be in motion \u2014 summarize it only once a newer chunk has closed behind it. Speculative production of everything older proceeds ahead of need as usual. A picker `produce` op (real fold demand) bypasses the holdback. 0 = compress at close (old behavior)."),
  diarySystemPrompt: z.string().optional().describe("@deprecated Use summarySystemPrompt"),
  diaryUserPrompt: z.string().optional().describe("@deprecated Use summaryUserPrompt"),
  hierarchical: z.boolean().optional().describe("Enable hierarchical 3-level compression. Set to false for single-level legacy compression."),
  mergeThreshold: z.number().int().min(0).optional().describe("Number of unmerged summaries before merging to the next level (default: 6)"),
  mergeAttemptLimit: z.number().int().min(0).optional().describe("Bounded retry policy for L_n merges whose LLM response was rejected by the terminal-disposition gate (refusal / max_tokens truncation / tool_use / abort / empty / malformed \u2014 anything that is not a complete `end_turn` + nonempty text). Each rejected attempt increments a persisted counter on the merge-queue entry; when the counter reaches this limit the merge is dequeued into the durable merge quarantine (never silently retried in a loop, never canonized). Default: 5."),
  compressionMergeSourceOnly: z.boolean().optional().describe("Legacy first-choice target-only merge request. Default false."),
  compressionMergeSourceOnlyFallback: z.boolean().optional().describe("Use target-only merge request only on the final persisted merge attempt. Default false."),
  summaryTargetTokens: z.number().int().min(0).optional().describe("Token target for each summary at any level (default: 2000)"),
  l3BudgetTokens: z.number().int().min(0).optional().describe("Token budget for L3 summaries in select() (default: 30000)"),
  l2BudgetTokens: z.number().int().min(0).optional().describe("Token budget for L2 summaries in select() (default: 30000)"),
  l1BudgetTokens: z.number().int().min(0).optional().describe("Token budget for L1 summaries in select() (default: 30000)"),
  compressionRecallBudgetTokens: z.number().int().min(0).optional().describe("Cap on the total tokens of recall-pair prior-summary content included in each LLM request that builds recall pairs:"),
  compressionCacheMarkers: z.boolean().optional().describe("Prompt-cache breakpoints on compression/merge requests (issue #37)."),
  compressionCacheTtl: z.enum(['5m', '1h']).optional().describe("Cache TTL for compression-lane breakpoints. Mint cadence is typically minutes-to-hours in steady state \u2014 beyond the 5-minute TTL, where markers cost more than they save \u2014 so the lane defaults to '1h' (write premium 2x vs 1.25x, break-even reuse probability 0.53 vs 0.22). Back-to-back drains work under either."),
  compressionSourceOnly: z.boolean().optional().describe("Residence-scoped direct source-only L1 compression (2026-08-25)."),
  compressionSourceOnlyFallback: z.boolean().optional().describe("Final bounded source-only L1 attempt after canonical + recall variants."),
  compressionSplitFallback: z.boolean().optional().describe("Split-stitch rung (2026-09-05, princess): when every L1 rung (canonical, recall expansions, source-only-final) is refused, fold the chunk in halves recursively at message boundaries with the same instruction/model, source-only, and install the stitched pieces as ONE L1 over the chunk (per-piece ranges/hashes recorded on the entry as `stitched`). Off by default. Enters after the source-only-final rung when `compressionSourceOnlyFallback` is on, or directly after the canonical attempt when `compressionSourceOnly` is on (the canonical request is then already source-only shaped, so the rung begins by splitting it)."),
  compressionSplitPlaceholder: z.boolean().optional().describe("With compressionSplitFallback: allow a one-line bracketed operator placeholder for a SINGLE message that refuses in every form (names the message id; the message stays in the record). Without it, such a chunk falls through to quarantine. Off by default."),
  compressionSplitMaxCallsPerChunk: z.number().int().min(0).optional().describe("Split-stitch: max sub-calls per chunk (default 40)."),
  compressionSplitMaxCallsPer10Min: z.number().int().min(0).optional().describe("Split-stitch: max sub-calls per strategy instance per 10-minute sliding window (default 80). In-memory only: resets on process restart; not a durable quota."),
  compressionRefusalCurveFallbacks: z.number().int().min(0).optional().describe("Maximum number of same-model recall-curve variants attempted after an L1 canonical request is explicitly refused. Each variant expands exactly one already-authored frontier summary into its persisted direct children. Default: 3. Set to 0 to disable fallback (canonical is still attempted)."),
  compressionContextBudgetTokens: z.number().int().min(0).optional().describe("Total model context budget used to admit refusal-curve compression requests, including the request input and the configured output reserve. The canonical request remains unchanged and is always attempted first; only fallback variants are gated. Before authoritative canonical usage exists, admission uses a conservative complete normalized-request bound. After canonical refusal reports complete provider input usage, admission uses provider-total input plus a positive serialized expansion delta, then adds the output reserve. Zero, partial, or unknown usage contracts retain the conservative bound. Default: 200000."),
  minChunkCharsForLLM: z.number().int().min(0).optional().describe("Minimum substantive text (non-whitespace chars across a chunk's messages) below which L1 compression skips the LLM call and stores a mechanical stub summary instead (default: 200)."),
  positionedRecallPairs: z.boolean().optional().describe("When true (default), each selected summary emits as its own positioned Q/A recall pair, sorted chronologically by source range. When false, all selected summaries are concatenated into one Q/A pair between head and tail (legacy behavior pre-2026-05-10)."),
  recallHeaderTemplate: z.string().optional().describe("Template for the per-pair recall question header. Substitutions: {id}    \u2014 summary id (e.g. \"L1-3\") {level} \u2014 summary level (1, 2, or 3) {first} \u2014 first source message id {last}  \u2014 last source message id Default: '[Recall {id}]'."),
  toolResultMaxLastN: z.union([z.number().int().min(0), z.record(z.string(), z.number().int().min(0))]).optional().describe("Per-tool retention limit: keep at most the last N `tool_result` blocks for each tool name. Older results get their content replaced with a brief marker referencing the tool name and how many newer results exist."),
  toolUseInputMaxTokens: z.number().int().min(0).optional().describe("Truncate `tool_use` block inputs whose serialized JSON exceeds this many tokens. The truncated input becomes `{ \"_truncated\": true, \"_originalTokens\": N }` plus a head slice of the original input keys for context. Default: 0 (no truncation)."),
  maxSpeculativeL1s: z.number().int().min(0).optional().describe("Cap on the number of speculative L1 summaries the strategy will hold (queued + unmerged). When `count(unmerged L1s) + count(queued chunks)` exceeds this cap, `onNewMessage`'s auto-tick is held back. Chunks still form and queue, but compression is deferred until a manual `tick()` or `compile()` triggers it."),
  enforceBudget: z.boolean().optional().describe("When false, the rendering pipeline emits the full ideal context (head window + all selected summaries + all recent messages) without truncating to fit `budget.maxTokens`. The caller's API will reject if the result exceeds the model's context window \u2014 the philosophy is \"surface the overage rather than silently lose content.\""),
  adaptiveResolution: z.boolean().optional().describe("Enable picker-driven adaptive resolution. When true, `select()` uses the FoldingStrategy + Picker to choose per-message resolution under token-budget pressure rather than the threshold-driven `checkMergeThreshold` path. Default: false (existing hierarchical behavior preserved)."),
  foldingStrategy: z.enum(['flat-profile', 'oldest-first', 'kv-stable', 'kv-unified']).optional().describe("Folding strategy name when adaptiveResolution is on. One of: 'flat-profile' (default) \u2014 level-equalizing 'oldest-first' \u2014 chronological 'kv-stable' \u2014 the KV-stable context controller: the rev 5.0 single-path solve \u2014 a relevance-ideal cut reconciled against the carried frontier under a perturbation trust region (exact kvCost; no \u03bb, no emergency path). Built per-compile from the live PickerInputs. See docs/adaptive-resolution-design.md \u00a713. Custom strategies can be plugged in by the host application."),
  kvUnified: KvUnifiedConfigSchema.optional().describe("Explicit, fail-closed kv-unified policy. Every field is required when foldingStrategy is `kv-unified`; there are no live defaults."),
  kvStableReachTokens: z.number().int().min(0).optional().describe("Trust region P (tokens) for `foldingStrategy: 'kv-stable'` \u2014 bounds how much prefix re-read (exact kvCost) an ordinary turn may take; the solver adopts the relevance-ideal cut within it, amortizes bigger repairs across turns (suffix adoption), and exceeds it only with a recorded override (bootstrap / infeasible / quality-gap \u2014 logged as `[kv-escalation]`). See docs/adaptive-resolution-design.md \u00a713. Default: the hard budget (a rendered layout never exceeds it, so the default never binds)."),
  kvStableQualityGapRatio: z.number().min(0).optional().describe("Quality-gap override threshold for `foldingStrategy: 'kv-stable'` (design \u00a713.4): a plan within the trust region is rejected \u2014 and the relevance-ideal cut adopted, paying the perturbation \u2014 when its salience-weighted misallocation loss exceeds the ideal's by more than this fraction of the ideal's. Also bounds how misallocated a dead-band hold may be before the solver self-heals. Default 0.35."),
  compressionSlackRatio: z.number().min(0).optional().describe("Slack ratio (hysteresis) for the picker. The picker folds until total tokens \u2264 budget * (1 - slack), and stays quiet while between slack and budget. Default 0.1."),
  speculativeProduction: z.boolean().optional().describe("Enable bottom-up speculative pre-production of higher-level summaries. When a new L_k summary is produced, if N siblings exist that would share an L_{k+1} parent, the L_{k+1} is enqueued for production immediately (no picker request needed). Default true when adaptiveResolution is on."),
  productionBudgetTokens: z.number().int().min(0).optional().describe("Standing production target (tokens): keep the summary forest deep enough that a compile would fit under THIS budget, even while the live compile budget is higher. Each adaptive compile runs an extra shadow pick against this budget \u2014 pure CPU, no LLM call, no state commit \u2014 and enqueues the folds it demands through the normal drain queues. Once the forest has converged, the live budget can be lowered to the target in one move: no fold-storm, a single KV invalidation (\"produce first, fold once\"). If the target is unreachable even fully folded (head + tail + max-depth summaries still exceed it), every compile warns loudly \u2014 a descent to that budget would hard-fail with OverBudgetError. Shadow demand is speculative and never bypasses the `l1HoldbackChunks` window. Must be positive; no effect unless lower than the live compile budget."),
  logEffectiveConfig: z.boolean().optional().describe("Emit a one-shot effective-config report when the strategy INITIALIZES: one structured line on stderr (`event: 'config:effective'`) carrying every resolved key with the layer that supplied it \u2014 'library-default', 'caller', 'knowledge-enforced', or whatever a host names its own layers. A strategy that is constructed and never initialized emits nothing, and a subclass instance reports the strategy it actually is. Default false; nothing is emitted unless this is explicitly on. The same map is always available programmatically as `strategy.configProvenance`."),
  persistMintPreimages: z.boolean().optional().describe("Persist the exact request that authored each minted summary, keyed by the `provenance.requestHash` the summary already carries (see `SummaryEntry.provenance` and `src/mint-preimage.ts`). Without it the hash keys an `llm-calls` log this library does not write, so provenance survives only as long as the host's harness logs do."),
});
expectType<Partial<AutobiographicalConfig>>({} as z.infer<typeof StrategyBaseConfigSchema>);

/** Replay captured summary reasoning carriers inside compression recall pairs. */
export const MintCarrierPolicySchema = z.enum(['full', 'strip']);
export type MintCarrierPolicy = z.infer<typeof MintCarrierPolicySchema>;

/**
 * Extended autobiographical strategy config options added by the fork created for Fabula.
 */
const StrategyExtConfigSchema = z.looseObject({
  type: z.literal(STRATEGY_NAME),
  /**
   * In-band L1 preamble: undefined uses Context Manager's default, a string
   * replaces it, and false omits the message entirely.
   */
  compressionMarker: z.union([z.string().min(1), z.literal(false)]).optional(),
  /** Number of identical normalized-request retries after a compression refusal. */
  compressionIdenticalRefusalRetries: z.number().int().min(0).optional(),
  /** Disable non-identical compression shape fallbacks (tool/no-tools, carrier stripping, plain prose). */
  compressionShapeFallbacks: z.boolean().optional(),
  mintCarrierPolicy: MintCarrierPolicySchema.optional(),
  /** Ordinary first-person L1 instruction override; `{targetTokens}` is substituted. */
  compressionInstruction: z.string().min(1).optional(),
  /** Provider refusal categories eligible for provisional classifier-gap records (default none). */
  compressionClassifierGapCategories: z.array(z.string().min(1)).readonly().optional(),
  /** Split-stitch depth floor: 1 = halves, 2 = halves then quarters; unset = legacy. */
  compressionSplitMaxDepth: z.number().optional(),
});

export type AutobiographicalConfigExt = AutobiographicalConfig & z.infer<typeof StrategyExtConfigSchema>;

/**
 * Validates the keys this fork adds or relies on, and passes every other
 * recipe strategy key through untouched (a plain object would strip them).
 */
export const StrategyConfigSchema = StrategyBaseConfigSchema.extend(StrategyExtConfigSchema.shape).loose();
