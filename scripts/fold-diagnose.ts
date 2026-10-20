// Why can't the middle shrink? Read-only diagnosis of an autobiographical
// store: the summary pyramid per level, which levels have a mergeable run,
// quarantines and gaps, and what the picker's best plan is made of.
// No membrane is given, so no provider call is possible; previewContext is a
// dry run and nothing is ticked.
//
// Opens the store at <dataDir>/sessions/<sessionId> IN PLACE unless --copy is
// given. In-place needs the host stopped (the store is locked while it runs).
//
//   cd <connectome-host checkout> && bun <this> <recipe.json> <dataDir> <sessionId> [--copy]
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const copy = args.includes('--copy');
const [recipePath, dataDir, sid] = args.filter((a) => !a.startsWith('--'));
if (!recipePath || !dataDir || !sid) throw new Error('usage: fold-diagnose.ts <recipe.json> <dataDir> <sessionId> [--copy]');
const hostDir = process.cwd();
const host = (rel: string) => import(join(hostDir, rel));
const pkg = (name: string) => import(Bun.resolveSync(name, hostDir));
const [{ loadRecipe }, { buildFrameworkStrategy }, { loadExtensions }, { JsStore }, { ContextManager }] = await Promise.all([
  host('src/recipe.ts'), host('src/framework-strategy.ts'), host('src/extensions.ts'), pkg('@animalabs/chronicle'), pkg('@animalabs/context-manager'),
]);

const recipe = await loadRecipe(resolve(recipePath));
const strategyExts = Object.fromEntries(Object.entries(recipe.extensions ?? {}).filter(([, e]: [string, any]) => e?.kind === 'strategy'));
const registry = await loadExtensions({ ...recipe, extensions: strategyExts });
const strategy: any = buildFrameworkStrategy(recipe, recipe.agent.model, recipe.agent.timezone ?? 'UTC', registry);
const budget = { maxTokens: recipe.agent.contextBudgetTokens, reserveForResponse: recipe.agent.maxTokens ?? 16384 };

let path = join(dataDir, 'sessions', sid);
let work: string | null = null;
if (copy) {
  work = mkdtempSync(join(tmpdir(), 'fold-diag-'));
  cpSync(path, join(work, 's'), { recursive: true });
  path = join(work, 's');
}
const fmt = (n: number) => n.toLocaleString('en-US');
try {
  const store = JsStore.open({ path });
  try {
    const cm = await ContextManager.open({ store, strategy, namespace: `agents/${recipe.agent.name}` });
    try {
      const summaries: any[] = strategy.summaries ?? [];
      const k = strategy.config?.mergeThreshold ?? 6;
      console.log(`strategy ${strategy.name}; ${summaries.length} summaries; merge threshold ${k}; span base ${strategy.config?.mergeMaxSourceSpanMessages ?? 1500}`);
      console.log('\nlevel  total  unmerged  unmerged-tokens  gaps  mergeable-now');
      const levels = [...new Set(summaries.map((s) => s.level))].sort((a, b) => a - b);
      for (const L of levels) {
        const at = summaries.filter((s) => s.level === L);
        const un = at.filter((s) => !s.mergedInto);
        const gaps = at.filter((s) => s.classifierGap).length;
        const tok = un.reduce((a, s) => a + (s.tokens ?? 0), 0);
        let mergeable = '?';
        try { mergeable = strategy.contiguousMergeCandidates(un, k) ? 'yes' : 'no'; } catch (e) { mergeable = `err ${String(e).slice(0, 40)}`; }
        console.log(`L${L}`.padEnd(7) + String(at.length).padStart(5) + String(un.length).padStart(10) + fmt(tok).padStart(17) + String(gaps).padStart(6) + `  ${mergeable}`);
      }
      const debt = strategy.getCompressionDebt?.();
      console.log('\ncompression debt:', JSON.stringify(debt));
      const mq = strategy.getMergeQuarantineStatus?.();
      if (mq?.count) {
        console.log(`merge quarantine: ${mq.count}`);
        for (const r of mq.records) console.log('  ', JSON.stringify(r).slice(0, 300));
      }

      const p: any = cm.previewContext(budget, undefined, { render: true });
      const prev: any = p ?? strategy._lastPreview ?? {};
      console.log(`\npreview: final ${fmt(prev.finalTokens ?? 0)} / budget ${fmt(prev.budgetTokens ?? 0)}  fits=${prev.fits}  head ${fmt(prev.headTokens ?? 0)} tail ${fmt(prev.tailTokens ?? 0)} middle ${fmt(prev.middleTokens ?? 0)} over ${prev.middleChunkCount} chunks, deepest L${prev.deepestLevel}`);
      // resolutions: chunk -> level used. Count chunks per level and their tokens where the strategy knows them.
      const res: Record<string, number> = prev.resolutions ?? {};
      const byLevel = new Map<number, number>();
      for (const lvl of Object.values(res)) byLevel.set(lvl as number, (byLevel.get(lvl as number) ?? 0) + 1);
      console.log('middle items by resolution level used (0 = shown raw):', JSON.stringify(Object.fromEntries([...byLevel].sort((a, b) => a[0] - b[0]))));
      void p;
    } finally {
      await cm.close?.();
    }
  } finally {
    store.close?.();
  }
} finally {
  if (work) rmSync(work, { recursive: true, force: true });
}
