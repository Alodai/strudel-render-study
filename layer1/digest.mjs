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
export const rat = (f) => `${f.s < 0 ? '-' : ''}${f.n}/${f.d}`;

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
