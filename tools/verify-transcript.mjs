// `pnpm verify:transcript <file>` — compare a RECORDED layer-1 run against the reference.
//
// `pnpm verify:layer1` runs layer 1 here and checks the result. That is the right check for a
// host you are standing on, and it cannot be the check for a host you are not: this repository
// runs on darwin-arm64 and cannot execute a native linux-x64 run. So a run performed elsewhere
// is recorded as a transcript, and this compares the transcript against the same reference the
// live check uses.
//
// Be precise about what that buys. This checks that a recorded run AGREES with the reference.
// It cannot check that the run happened, on what host, or that the file was not typed by hand —
// nothing in this repository can, and results/layer1-cross-host.md says so where the transcript
// is quoted. What it does do is make the comparison a command with an exit code instead of a
// reader's eye, and make the same command available to anyone who does have such a host: run
// `node layer1/run.mjs > mine.txt` there and compare it here.
//
//   node tools/verify-transcript.mjs results/measured/layer1-native-linux-x64.txt
//   node tools/verify-transcript.mjs --selftest      # red-proves this checker, no arguments
//
// exit 0 = every pattern matches   exit 1 = a mismatch   exit 2 = VOID, nothing was compared
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF = process.env.LAYER1_REF || join(ROOT, 'results', 'layer1-digests.txt');

/** name -> { haps, sha }. Reads `p1<TAB>haps=N<TAB>sha256=…`, ignoring comments and trailing columns. */
const parse = (text) =>
  Object.fromEntries(
    text.split('\n').filter((l) => /^p\d+\t/.test(l)).map((l) => {
      const c = l.split('\t');
      const haps = (c.find((x) => x.startsWith('haps=')) ?? '').slice(5);
      const sha = (c.find((x) => x.startsWith('sha256=')) ?? '').slice(7);
      return [c[0], { haps, sha }];
    }),
  );

function compare(transcriptPath, refPath) {
  const expected = parse(readFileSync(refPath, 'utf8'));
  const got = parse(readFileSync(transcriptPath, 'utf8'));
  const names = Object.keys(expected);
  const out = [];

  // POSITIVE ARM, both sides. A comparison with nothing on either side reports "no
  // mismatches" in exactly the words a clean one uses, so the counts are asserted first.
  if (names.length === 0) return { code: 2, out: [`VOID: the reference (${refPath}) lists no patterns`] };
  if (Object.keys(got).length === 0) return { code: 2, out: [`VOID: ${transcriptPath} contains no digest lines — nothing was compared`] };
  if (Object.keys(got).length !== names.length)
    return { code: 2, out: [`VOID: the reference lists ${names.length} patterns, the transcript carries ${Object.keys(got).length}`] };

  let bad = 0;
  for (const n of names) {
    const g = got[n];
    if (!g) { out.push(`${n}  ABSENT    the transcript does not carry ${n}`); bad++; continue; }
    // The hap count is checked too: a digest is opaque, and a transcript that agrees on the
    // digest while disagreeing on how many haps produced it is not a thing to wave through.
    const shaOk = g.sha === expected[n].sha;
    const hapsOk = g.haps === expected[n].haps;
    if (shaOk && hapsOk) out.push(`${n}  MATCH     haps=${g.haps}  ${g.sha.slice(0, 16)}…`);
    else { out.push(`${n}  MISMATCH  transcript haps=${g.haps} ${g.sha.slice(0, 16)}…  reference haps=${expected[n].haps} ${expected[n].sha.slice(0, 16)}…`); bad++; }
  }
  out.push(`compared ${names.length} patterns, ${bad} mismatched`);
  return { code: bad === 0 ? 0 : 1, out };
}

// ── self-test: this checker must be observed returning all three verdicts ────────────────
// A checker that has only ever returned 0 is not a checker. The three arms are built here
// rather than shipped as fixtures so they cannot rot away from the parser they exercise.
function selftest() {
  const dir = mkdtempSync(join(tmpdir(), 'verify-transcript-'));
  const ref = readFileSync(REF, 'utf8');
  const write = (name, text) => { const p = join(dir, name); writeFileSync(p, text); return p; };

  const clean = write('clean.txt', ref);
  const corrupt = write('corrupt.txt', ref.replace('sha256=90a5e26c', 'sha256=deadbeef'));
  const shortened = write('short.txt', ref.split('\n').filter((l) => !l.startsWith('p3')).join('\n') + '\n');
  const empty = write('empty.txt', '# a transcript with no digest lines at all\n');
  if (readFileSync(corrupt, 'utf8') === ref) { console.error('SELFTEST VOID: the corruption changed nothing'); process.exit(2); }

  const arms = [
    ['GREEN   ', clean, 0, 'a transcript equal to the reference'],
    ['RED     ', corrupt, 1, 'MUTATION — one digest corrupted to deadbeef…'],
    ['VOID-N  ', shortened, 2, 'MUTATION — a transcript short by one pattern'],
    ['VOID-0  ', empty, 2, 'MUTATION — a transcript with no digest lines'],
  ];
  let failed = 0;
  for (const [label, path, want, desc] of arms) {
    const r = compare(path, REF);
    const ok = r.code === want;
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  ${desc}\n            expected exit ${want}, got ${r.code} — ${r.out[r.out.length - 1]}`);
  }
  console.log(`\n${arms.length} arms, ${arms.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

const args = process.argv.slice(2);
if (args.includes('--selftest')) selftest();

const file = args[0];
if (!file) { console.error('usage: node tools/verify-transcript.mjs <transcript> | --selftest'); process.exit(2); }
const r = compare(file, REF);
console.log(`transcript ${file}`);
const header = readFileSync(file, 'utf8').split('\n').find((l) => l.startsWith('# host '));
if (header) console.log(header);
for (const l of r.out) console.log(l);
process.exit(r.code);
