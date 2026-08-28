// Summarise a run produced by protocol/concurrency-protocol.sh.
// Prints the per-digest census and the divergence count. The canonical render is the MODE —
// the digest the majority of renders produced — not a value hardcoded here, so the summary
// is still correct on a host whose canonical render differs from this one's.
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
const rows = lines.map((l) => {
  const c = l.split('\t');
  return { batch: c[0], pid: c[1], pos: c[2], sha: c[3], peak: c[4] };
});
if (rows.length === 0) { console.log('VOID: the run produced no rows — nothing was measured'); process.exit(1); }

const counts = new Map();
for (const r of rows) counts.set(r.sha, (counts.get(r.sha) ?? 0) + 1);
const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
const [canonical, canonN] = ranked[0];
const divergent = rows.length - canonN;

console.log(`N = ${rows.length} renders across ${new Set(rows.map((r) => r.batch)).size} batches, ${new Set(rows.map((r) => r.pid)).size} processes`);
console.log(`canonical (modal) digest: ${canonical}  x${canonN}`);
console.log(`divergent: ${divergent} of ${rows.length} = ${((divergent / rows.length) * 100).toFixed(2)} %`);
console.log(`distinct digests: ${ranked.length}`);
for (const [sha, n] of ranked.slice(1)) {
  const where = rows.filter((r) => r.sha === sha).map((r) => `b${r.batch}/pid${r.pid}/pos${r.pos}`);
  console.log(`  ${sha.slice(0, 8)}…  x${n}  ${where.join(' ')}`);
}
const peaks = new Set(rows.map((r) => r.peak));
console.log(`peaks observed: ${[...peaks].join(', ')} — ${peaks.size === 1 ? 'identical across every render, divergent ones included' : 'more than one peak'}`);
if (divergent === 0) {
  console.log('\nZero divergences. On an idle machine this is the expected outcome and says');
  console.log('nothing either way — see the scope section of README.md before concluding anything.');
}
