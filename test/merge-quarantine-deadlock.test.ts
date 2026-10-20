import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { rmSync } from 'node:fs';
import { after, it } from 'node:test';
import { ContextManager, type StrategyContext } from '@animalabs/context-manager';
import {
  AutobiographicalStrategy,
  type Chunk,
  type SummaryEntryExt as SummaryEntry,
} from '../src/strategy';

// One refused merge must stay a local stall: its sources are parked, but L1
// production and the merges after it keep going (Fabula, 2026-10-16 → 10-18).

const paths: string[] = [];
after(() => paths.forEach((p) => rmSync(p, { recursive: true, force: true })));

// The strategy's merge-quarantine key: sha256 of JSON.stringify(sourceIds).
const sha256Json = (value: unknown) => createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');

class Probe extends AutobiographicalStrategy {
  setChunks(c: Chunk[]) { this.chunks = c; }
  setSummaries(s: SummaryEntry[]) { this.summaries = s; }
  park(ids: string[]) {
    (this as unknown as { mergeQuarantine: Map<string, unknown> }).mergeQuarantine.set(sha256Json(ids), {
      key: sha256Json(ids), level: 2, sourceIds: ids, attempts: 5, lastOutcome: 'refusal', quarantinedAt: 0,
    });
  }
  atCap() { return this.isAtSpeculativeCap(); }
  candidates(threshold: number) {
    const unmerged = this.summaries.filter((s) => s.level === 1 && !s.mergedInto && !s.classifierGap);
    return this.contiguousMergeCandidates(unmerged, threshold)?.map((s) => s.id) ?? null;
  }
  queue() { return (this as unknown as { mergeQueue: Array<{ sourceIds: string[] }> }).mergeQueue; }
  checkThreshold() { this.checkMergeThreshold(); }
}

const context = (m: ContextManager) => (m as unknown as { createStrategyContext(): StrategyContext }).createStrategyContext();

async function setup(l1Count: number) {
  const strategy = new Probe({
    compressionModel: 'm', targetChunkTokens: 100, recentWindowTokens: 0, headWindowTokens: 0,
    autoTickOnNewMessage: false, mergeThreshold: 6, maxSpeculativeL1s: 6, hierarchical: true,
    quarantineAlarmIntervalMs: 0,
  } as never);
  const path = `./test-merge-quarantine-deadlock-${paths.length}`; paths.push(path);
  const manager = await ContextManager.open({ path, strategy, membrane: { complete: async () => {
    throw new Error('no provider calls in this test');
  } } as never });
  for (let i = 0; i < l1Count; i++) manager.addMessage(i % 2 ? 'Claude' : 'User', [{ type: 'text', text: `m${i}` }]);
  const all = context(manager).messageStore.getAll();
  strategy.setChunks(all.map((m, i) => ({ index: i, startIndex: i, endIndex: i + 1, messages: [m], tokens: 10, compressed: true })) as Chunk[]);
  strategy.setSummaries(all.map((m, i) => ({
    id: `L1-${i}`, level: 1, content: `memory ${i}`, tokens: 10, sourceLevel: 0, sourceIds: [], created: i,
    sourceRange: { first: m.id, last: m.id },
  })) as unknown as SummaryEntry[]);
  return strategy;
}

const ids = (from: number, n: number) => Array.from({ length: n }, (_, i) => `L1-${from + i}`);

it('parked sources of a quarantined merge do not hold the speculative cap shut', async () => {
  const strategy = await setup(7);
  assert.equal(strategy.atCap(), true, 'control: 7 unmerged L1s > cap 6');
  strategy.park(ids(0, 6));
  assert.equal(strategy.atCap(), false, '6 parked + 1 live: under the cap, L1 production may continue');
});

it('the merge picker skips a quarantined run and offers the next one', async () => {
  const strategy = await setup(12);
  assert.deepEqual(strategy.candidates(6), ids(0, 6), 'control: oldest run first');
  strategy.park(ids(0, 6));
  assert.deepEqual(strategy.candidates(6), ids(6, 6), 'with the oldest six parked, the next six are offered');
  strategy.checkThreshold();
  assert.deepEqual(strategy.queue().map((m) => m.sourceIds), [ids(6, 6)], 'and actually enqueued');
});

it('no parent spans parked summaries: runs on either side stay separate', async () => {
  const strategy = await setup(14);
  strategy.park(ids(4, 6)); // parked in the middle: 0-3 live, 4-9 parked, 10-13 live
  const run = strategy.candidates(6);
  assert.ok(run, 'an interior run consolidates');
  assert.deepEqual(run, ids(0, 4), 'the older live run (interior, ≥2 members), not one spanning the parked hole');
});
