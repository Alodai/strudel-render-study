// Turn a raw run log into a per-batch TSV.
//
// The raw logs record one line per render — pid, position within the process, digest, peak —
// but not the batch. The protocol runs WIDTH processes concurrently and `wait`s before
// starting the next batch, so a batch is a contiguous block of WIDTH x RENDERS lines and its
// processes are disjoint from every other batch's. That is a derivation, so it is ASSERTED
// rather than assumed: every batch must contain exactly WIDTH distinct pids, each appearing
// exactly RENDERS times, and no pid may appear in two batches. A log that does not satisfy
// this is rejected instead of being given a batch column it has not earned.
//
//   node tools/derive-batches.mjs <in.txt> <out.tsv> <width> <rendersPerProc> <canonicalDigest>
import { readFileSync, writeFileSync } from 'node:fs';

const [inPath, outPath, widthS, rendersS, canonical] = process.argv.slice(2);
const WIDTH = Number(widthS), RENDERS = Number(rendersS);
const PER_BATCH = WIDTH * RENDERS;

const raw = readFileSync(inPath, 'utf8').split('\n').filter((l) => l.trim());
// `<pid> pos=<n> <sha256> peak=<x>`
const rows = raw.map((l, i) => {
  const m = l.match(/^(\d+)\s+pos=(\d+)\s+([0-9a-f]{64})\s+peak=([0-9.]+)$/);
  if (!m) throw new Error(`line ${i + 1} does not parse: ${JSON.stringify(l)}`);
  return { pid: m[1], pos: Number(m[2]), sha: m[3], peak: m[4] };
});
if (rows.length === 0) throw new Error('VOID: no rows parsed');
if (rows.length % PER_BATCH !== 0) throw new Error(`${rows.length} rows is not a multiple of ${PER_BATCH}`);

const seen = new Map();
rows.forEach((r, i) => {
  r.batch = Math.floor(i / PER_BATCH) + 1;
  if (seen.has(r.pid) && seen.get(r.pid) !== r.batch) {
    throw new Error(`pid ${r.pid} appears in batches ${seen.get(r.pid)} and ${r.batch} — blocks are not batches`);
  }
  seen.set(r.pid, r.batch);
});
const batches = [...new Set(rows.map((r) => r.batch))];
for (const b of batches) {
  const inB = rows.filter((r) => r.batch === b);
  const pids = new Set(inB.map((r) => r.pid));
  if (pids.size !== WIDTH) throw new Error(`batch ${b} has ${pids.size} distinct pids, expected ${WIDTH}`);
  for (const p of pids) {
    const n = inB.filter((r) => r.pid === p).length;
    if (n !== RENDERS) throw new Error(`batch ${b} pid ${p} has ${n} renders, expected ${RENDERS}`);
  }
}

const divergent = rows.filter((r) => r.sha !== canonical).length;
const distinct = new Set(rows.map((r) => r.sha));
const out = [
  `# derived from ${inPath.split('/').pop()} — batch column derived and asserted by tools/derive-batches.mjs`,
  `# protocol: ${batches.length} batches x ${WIDTH} concurrent processes x ${RENDERS} renders = ${rows.length}`,
  `# canonical: ${canonical}`,
  `# divergent: ${divergent} of ${rows.length}    distinct digests: ${distinct.size}`,
  'batch\tpid\tposition\tsha256\tpeak\tdivergent',
  ...rows.map((r) => `${r.batch}\t${r.pid}\t${r.pos}\t${r.sha}\t${r.peak}\t${r.sha === canonical ? 'no' : 'YES'}`),
].join('\n') + '\n';
writeFileSync(outPath, out);
console.log(`${outPath}: ${rows.length} renders, ${batches.length} batches, ${divergent} divergent, ${distinct.size} distinct digests`);
