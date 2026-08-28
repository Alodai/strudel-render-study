// Layer-1 controls. The digest must be observed CHANGING, or "identical across hosts" carries
// no information. Four mutation arms, each a minimal single-fact edit to the serialised rows,
// plus a positive arm: an unmutated re-query must reproduce the baseline exactly.
import { serialiseHaps, digest, buildPatterns, SPAN } from './digest.mjs';

const patterns = await buildPatterns();
const base = serialiseHaps(patterns.p1.build(), ...SPAN);
const B = digest(base);
const lines = base.trimEnd().split('\n');
const results = [];

const arm = (id, label, mutated) => {
  const d = digest(mutated);
  const pass = d !== B;
  results.push({ id, label, digest: d, pass, kind: 'mutation' });
  console.log(`${id.padEnd(4)}${label.padEnd(34)}${d.slice(0, 16)}…  ${pass ? 'CHANGED (control fires)' : '*** UNCHANGED — VACUOUS ***'}`);
};

console.log(`BASELINE${' '.repeat(30)}${B.slice(0, 16)}…`);
// 1. one hap's VALUE altered, everything else byte-identical
arm('M1', 'one value c3 -> c#3', lines.map((l, i) => (i === 0 ? l.replace('"c3"', '"c#3"') : l)).join('\n') + '\n');
// 2. one hap's time shifted — a change in the exact rational, not in any float
arm('M2', 'one whole.end 1/4 -> 1/5', lines.map((l, i) => (i === 0 ? l.replace(/\t1\/4\t/, '\t1/5\t') : l)).join('\n') + '\n');
// 3. one hap dropped
arm('M3', 'one hap removed', lines.slice(1).join('\n') + '\n');
// 4. same haps, different ORDER — proves the sort is load-bearing, not decorative
arm('M4', 'rows reversed (unsorted)', lines.slice().reverse().join('\n') + '\n');

// POSITIVE ARM. Without this, "CHANGED" four times is indistinguishable from a digest that
// is simply unstable.
const again = digest(serialiseHaps(patterns.p1.build(), ...SPAN));
const stable = again === B;
results.push({ id: 'P', label: 're-query, no mutation', digest: again, pass: stable, kind: 'positive' });
console.log(`P   ${'re-query, no mutation'.padEnd(34)}${again.slice(0, 16)}…  ${stable ? 'STABLE (digest is deterministic)' : '*** UNSTABLE ***'}`);

console.log('JSON ' + JSON.stringify({ baseline: B, results }));
