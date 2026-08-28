// Layer 1 — the pattern layer. Query a pattern to haps, serialise canonically using EXACT
// rationals (never a float, never valueOf()), sort to a total order, sha256.
//
// This layer is EXACTLY REPRODUCIBLE. A reader who runs it gets the digests in
// results/layer1-digests.txt, or something is wrong.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SPEC = JSON.parse(readFileSync(join(HERE, '..', 'patterns', 'patterns.json'), 'utf8'));
export const SPAN = [SPEC.span.begin, SPEC.span.end];

// Fraction -> string. `n` and `d` are BigInt; `s` is the sign. No floating point is
// produced or consumed anywhere on this path — that is what makes layer 1 host-independent.
//
// The gcd reduction is not decoration, and leaving it out was an instrument defect. Reading
// `f.n`/`f.d` straight off the object INHERITS canonical form from fraction.js instead of
// IMPOSING it here, which makes the digest an identity test on the serialised representation
// rather than an equality test on the pattern's rational times. The two are indistinguishable
// for as long as the upstream library happens to reduce — and patches/fraction.js@5.3.4.patch
// is the proof they are not the same thing: a value-preserving n/d -> 2n/2d moved all three
// digests. It no longer does. Canonical form is decided here, by this repository, so a digest
// answers "are these the same times?" and not "did fraction.js store them the same way?".
//
// gcd(0, d) = d, so a zero numerator serialises as `0/1`. A zero DENOMINATOR is not something
// to normalise quietly: fraction.js refuses to construct one, so meeting one here means the
// value did not come from where this function assumes, and that must be loud.
const gcd = (a, b) => { while (b) { const t = a % b; a = b; b = t; } return a; };
export const rat = (f) => {
  const n = f.n < 0n ? -f.n : f.n;
  const d = f.d < 0n ? -f.d : f.d;
  if (d === 0n) throw new Error(`rat(): zero denominator in ${f.n}/${f.d} — this is not a Fraction`);
  const g = gcd(n, d) || 1n;
  return `${f.s < 0 ? '-' : ''}${n / g}/${d / g}`;
};

// Object key order is not guaranteed across engines; sort it so the digest is not
// hostage to insertion order.
const stableValue = (v) =>
  JSON.stringify(v, (_, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]))
      : x,
  );

export function serialiseHaps(pattern, begin, end) {
  const rows = pattern.queryArc(begin, end).map((h) =>
    [
      h.whole ? rat(h.whole.begin) : '~',
      h.whole ? rat(h.whole.end) : '~',
      rat(h.part.begin),
      rat(h.part.end),
      stableValue(h.value),
    ].join('\t'),
  );
  // queryArc returns haps UNSORTED. The sort is load-bearing, not cosmetic —
  // control arm M4 proves it by reversing the rows and watching the digest move.
  rows.sort();
  return rows.join('\n') + '\n';
}

export const digest = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

export async function buildPatterns() {
  const { note } = await import('@strudel/core');
  const { mini } = await import('@strudel/mini');
  const out = {};
  for (const [name, def] of Object.entries(SPEC.patterns)) {
    out[name] = { mini: def.mini, build: () => note(mini(def.mini)) };
  }
  return out;
}
