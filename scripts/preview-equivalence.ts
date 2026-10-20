// Store-level equivalence: render the context with the host's built-in
// autobiographical strategy and with the autobiogap extension's strategy,
// each on its own disposable copy of the same store snapshot, and compare.
// No membrane is given, so no provider call is possible.
//
//   cd <connectome-host checkout> && bun <this> <autobiogap recipe.json> <dataDir> <sessionId>
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [recipePath, dataDir, sid] = process.argv.slice(2);
if (!recipePath || !dataDir || !sid) throw new Error('usage: preview-equivalence.ts <recipe.json> <dataDir> <sessionId>');
const hostDir = process.cwd();
const host = (rel: string) => import(join(hostDir, rel));
const pkg = (name: string) => import(Bun.resolveSync(name, hostDir));
const [{ loadRecipe }, { buildFrameworkStrategy }, { loadExtensions }, { JsStore }, { ContextManager }] = await Promise.all([
  host('src/recipe.ts'), host('src/framework-strategy.ts'), host('src/extensions.ts'), pkg('@animalabs/chronicle'), pkg('@animalabs/context-manager'),
]);

const recipe = await loadRecipe(resolve(recipePath));
const model = recipe.agent.model;
const tz = recipe.agent.timezone ?? 'UTC';
const budget = { maxTokens: recipe.agent.contextBudgetTokens, reserveForResponse: recipe.agent.maxTokens ?? 16384 };

// The recipe under test is the autobiogap one. The extension leg goes through
// the host's own path: loadExtensions on the recipe's declared bundle, then
// buildFrameworkStrategy with that registry. The built-in leg is the same
// recipe with strategy.type set back to 'autobiographical'.
if (recipe.agent.strategy?.type !== 'autobiogap') throw new Error('recipe strategy.type must be "autobiogap" (the candidate recipe)');
// Only the strategy-kind entries: module extensions (keychain etc.) aren't
// needed to render, and loading them would want their env and credentials.
const strategyExts = Object.fromEntries(Object.entries(recipe.extensions ?? {}).filter(([, e]: [string, any]) => e?.kind === 'strategy'));
const registry = await loadExtensions({ ...recipe, extensions: strategyExts });
const factory = registry.strategies.get('autobiogap');
if (!factory) throw new Error('the recipe\'s extensions did not register "autobiogap" (check the kind:"strategy" entry and its path)');
const asBuiltin = { ...recipe, agent: { ...recipe.agent, strategy: { ...recipe.agent.strategy, type: 'autobiographical' } } };
const strategies: Record<string, () => any> = {
  builtin: () => buildFrameworkStrategy(asBuiltin, model, tz),
  // negative control: same extension, one knob changed; must render differently
  control: () => factory({ config: { ...recipe.agent.strategy, type: 'autobiogap', summaryParticipant: recipe.agent.strategy?.summaryParticipant ?? recipe.agent.name, recentWindowTokens: Math.round((recipe.agent.strategy?.recentWindowTokens ?? 30000) / 2) }, model, timeZone: tz }),
  autobiogap: () => buildFrameworkStrategy(recipe, model, tz, registry),
};

const work = mkdtempSync(join(tmpdir(), 'autobiogap-eq-'));
const sha = (v: unknown) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');
try {
  const snap = join(work, 'snapshot');
  cpSync(join(dataDir, 'sessions', sid), snap, { recursive: true });
  const out: Record<string, any> = {};
  for (const [name, make] of Object.entries(strategies)) {
    const copy = join(work, name);
    cpSync(snap, copy, { recursive: true });
    const t0 = performance.now();
    const store = JsStore.open({ path: copy });
    try {
      const cm = await ContextManager.open({ store, strategy: make(), namespace: `agents/${recipe.agent.name}` });
      try {
        const p = cm.previewContext(budget, undefined, { render: true });
        const msgs = p.entries;
        out[name] = { p, msgs, ms: Math.round(performance.now() - t0) };
      } finally { await cm.close?.(); }
    } finally { store.close?.(); }
  }
  const a = out.builtin, b = out.autobiogap;
  console.log('preview keys:', Object.keys(a.p).join(', '));
  for (const [name, o] of Object.entries(out)) {
    console.log(`${name.padEnd(10)} entries=${o.msgs?.length ?? '?'} finalTokens=${o.p.finalTokens} tail=${o.p.tailTokens} middle=${o.p.middleTokens} sha=${sha(o.msgs ?? o.p).slice(0, 16)} ${o.ms}ms`);
  }
  console.log('control differs from builtin:', sha(out.control.p) !== sha(a.p));
  const same = sha(a.msgs ?? a.p) === sha(b.msgs ?? b.p) && sha(a.p) === sha(b.p);
  console.log(same ? 'IDENTICAL rendered context' : 'DIFFERENT rendered context');
  if (!same && a.msgs && b.msgs) {
    const n = Math.max(a.msgs.length, b.msgs.length);
    for (let i = 0; i < n; i++) if (sha(a.msgs[i]) !== sha(b.msgs[i])) { console.log('first difference at message', i, JSON.stringify(a.msgs[i])?.slice(0, 200), '\n vs', JSON.stringify(b.msgs[i])?.slice(0, 200)); break; }
  }
  for (const k of Object.keys(a.p)) if (k !== 'messages' && sha(a.p[k]) !== sha(b.p[k])) console.log('  other field differs:', k, JSON.stringify(a.p[k])?.slice(0, 120), '|', JSON.stringify(b.p[k])?.slice(0, 120));
} finally {
  rmSync(work, { recursive: true, force: true });
}
