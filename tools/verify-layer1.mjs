// The layer-1 check: live digests must equal the recorded reference, exactly.
// Exit 0 = match, exit 1 = mismatch. This is the check that the fraction.js sabotage arm
// in `pnpm controls` is required to turn RED.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// The reference is results/layer1-digests.txt and that is what `pnpm verify:layer1` compares
// against. LAYER1_REF points the SAME comparison at another file, which is how an arm shows
// this check turning red without editing the committed reference: the corruption goes in a
// throwaway copy. Unset, the behaviour is exactly as before.
const REF = process.env.LAYER1_REF || join(ROOT, 'results', 'layer1-digests.txt');

const parse = (text) =>
  Object.fromEntries(
    text.split('\n').filter((l) => /^p\d\t/.test(l)).map((l) => {
      const [name, , sha] = l.split('\t');
      return [name, sha.replace(/^sha256=/, '')];
    }),
  );

const expected = parse(readFileSync(REF, 'utf8'));
const live = parse(execFileSync(process.execPath, [join(ROOT, 'layer1', 'run.mjs')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));

// POSITIVE ARM: a checker that read nothing answers "no mismatches" exactly like a clean run.
const names = Object.keys(expected);
if (names.length === 0) { console.error('VOID: reference file lists no patterns'); process.exit(2); }
if (Object.keys(live).length !== names.length) {
  console.error(`VOID: reference lists ${names.length} patterns, live run produced ${Object.keys(live).length}`);
  process.exit(2);
}

let bad = 0;
for (const n of names) {
  const ok = live[n] === expected[n];
  if (!ok) bad++;
  console.log(`${n}  ${ok ? 'MATCH   ' : 'MISMATCH'}  live=${live[n].slice(0, 16)}…  reference=${expected[n].slice(0, 16)}…`);
}
console.log(`checked ${names.length} patterns, ${bad} mismatched`);
process.exit(bad === 0 ? 0 : 1);
