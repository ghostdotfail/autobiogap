// Equivalence check: the host's built-in autobiographical strategy vs this
// extension's factory, both built from Fabula's recipe; compares resolved
// effective config. Run from a connectome-host checkout on fabula/prod:
//   cd ~/connectome-local/connectome-host && bun ../autobiogap/scripts/equivalence.ts
// Pass the recipe path (built-in or autobiogap form). Expected: diffs 0, and the negative control
// (raw config, no options mapping) shows a nonzero diff.
import { join, resolve } from 'node:path';
const { buildFrameworkStrategy } = await import(join(process.cwd(), 'src/framework-strategy.ts'));
const register = (await import(resolve(import.meta.dir, '../src/register.ts'))).default;
if (!process.argv[2]) throw new Error('usage: equivalence.ts <recipe.json> (run from a connectome-host checkout)');
const recipe = JSON.parse(await Bun.file(process.argv[2]).text());
// Accept either the built-in recipe or the autobiogap candidate: compare both forms.
recipe.agent.strategy = { ...recipe.agent.strategy, type: 'autobiographical' };
const model = recipe.agent.model;
const builtin: any = buildFrameworkStrategy(recipe, model, 'America/Los_Angeles');
let factory: any;
await register({ registerStrategy: (_t: string, f: any) => { factory = f; }, registerModule() {} } as any, {});
const extConfig = { ...recipe.agent.strategy, type: 'autobiogap', summaryParticipant: recipe.agent.name };
const ext: any = factory({ config: extConfig, model, timeZone: 'America/Los_Angeles' });
const a = builtin.unreportedEffectiveConfig?.effective ?? builtin.config;
const b = ext.unreportedEffectiveConfig?.effective ?? ext.config;
const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
const diffs = keys.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
console.log('builtin', builtin.constructor.name, builtin.name, '| ext', ext.constructor.name, ext.name);
console.log('keys', keys.length, 'diffs', diffs.length);
for (const k of diffs) console.log('  ', k, JSON.stringify(a[k])?.slice(0, 80), '≠', JSON.stringify(b[k])?.slice(0, 80));
// negative control: raw config without the options mapping
const { AutobiographicalStrategy: ExtStrat } = await import(resolve(import.meta.dir, '../src/strategy/index.ts'));
const bad: any = new ExtStrat(recipe.agent.strategy);
const c = bad.unreportedEffectiveConfig?.effective ?? bad.config;
console.log('negative control (raw config, no mapping) diffs:', keys.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(c[k])).join(', '));
