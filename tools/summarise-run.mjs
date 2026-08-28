// Summarise a run produced by protocol/concurrency-protocol.sh.
// Prints the per-digest census and the divergence count. The canonical render is the MODE —
// the digest the majority of renders produced — not a value hardcoded here, so the summary
// is still correct on a host whose canonical render differs from this one's.
//
// Every line is either a render or it is not, and which it is is ASSERTED rather than guessed:
// a render row is `batch<TAB>pid<TAB>position<TAB>sha256<TAB>peak` — optionally followed by the
// `no`/`YES` divergent column — whose digest is 64 hex characters. Anything that is not that is
// not a render and is rejected by name. Files written by tools/derive-batches.mjs carry one
// literal column-header line; that is the only non-render, non-comment line accepted, it is
// reported rather than dropped quietly, and any other unparsable line aborts the summary
// instead of being counted or skipped. Every input line is accounted for in the output: a
// silent filter and a silent miscount are equally invisible from the output.
import { readFileSync } from 'node:fs';

// The exact header line emitted by tools/derive-batches.mjs. Nothing else is accepted as one.
const HEADER = 'batch\tpid\tposition\tsha256\tpeak\tdivergent';
const RENDER = /^(\d+)\t(\d+)\t(\d+)\t([0-9a-f]{64})\t([0-9.]+)(?:\t(?:no|YES))?$/;

const file = process.argv[2];
if (!file) { console.error('usage: node tools/summarise-run.mjs <run.tsv>'); process.exit(2); }

const fail = (msg) => { console.error(`REJECTED: ${file}: ${msg}`); process.exit(1); };

const rows = [];
let comments = 0, blanks = 0, header = null;

readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
  const n = i + 1;
  if (!line.trim()) { blanks += 1; return; }
  if (line.startsWith('#')) { comments += 1; return; }

  const m = line.match(RENDER);
  if (m) { rows.push({ batch: m[1], pid: m[2], pos: m[3], sha: m[4], peak: m[5], line: n }); return; }

  if (line === HEADER) {
    if (header !== null) fail(`line ${n}: a second column-header line (the first was line ${header})`);
    if (rows.length > 0) fail(`line ${n}: a column-header line after ${rows.length} render rows`);
    header = n;
    return;
  }

  // Not a render, and not the one header this format has. It may be a mangled render row, a
  // file of some other shape, or a column layout that puts the digest somewhere else — the
  // tool cannot tell, so it refuses rather than counting it or dropping it.
  const cols = line.split('\t');
  fail(`line ${n} is not a render and not the known column header: ${JSON.stringify(line.slice(0, 120))}\n` +
       `          ${cols.length} columns; column 4 = ${JSON.stringify(cols[3] ?? '')} is not a 64-hex sha256`);
});

console.log(`lines: ${rows.length} renders, ${header === null ? 'no column header' : `1 column header (line ${header})`}, ` +
            `${comments} comment, ${blanks} blank — every line accounted for`);
if (rows.length === 0) {
  console.log('VOID: the run produced no rows — nothing was measured');
  process.exit(1);
}

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
  console.log('\nZero divergences. This run observed nothing. That neither confirms nor refutes');
  console.log('what is reported here, and it is not evidence about how loaded this machine was —');
  console.log('see the scope section of README.md before concluding anything.');
}
