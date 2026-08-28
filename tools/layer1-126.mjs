// `pnpm layer1:126` — layer 1 on @strudel/core 1.2.6, as an OPTIONAL ARM.
//
// Layer 1 pins 1.2.5 and layer 2 pins 1.2.6, which weakens the within-system comparison: a
// reader is entitled to ask whether the two layers are talking about the same engine. This
// arm answers it by running the identical layer-1 code against 1.2.6 and comparing with the
// same reference file.
//
// It DOES NOT change the default pin. layer1/package.json is snapshotted, mutated, and
// restored in a finally block, and the restore is verified two ways — the manifest must be
// byte-identical to the snapshot, and the INSTALLED tree must be back at 1.2.5. `pnpm layer1`
// after this must print exactly what it printed before it.
//
// 1.2.6 needs the @kabelsalat/web exports patch to import in Node at all (see claim 8); that
// patch is already in the root manifest, so nothing is toggled to get it.
//
// Arms, in the order they run:
//
//   A126-INSTALLED  SIGHTING — the installed tree really reports 1.2.6. Read from the
//                   installed package.json in a FRESH process, never from the manifest we
//                   just wrote: a manifest states an intention, an install states a fact.
//   A126-DIGESTS    the arm's green — verify:layer1 against the committed reference, exit 0.
//   A126-REF        NEGATIVE CONTROL, cheap — the same live 1.2.6 run against a corrupted
//                   COPY of the reference must go red (exit 1). The committed reference is
//                   never touched.
//   A126-VOID       the checker must refuse an empty reference (exit 2) rather than report
//                   "no mismatches" over a comparison it never made.
//   A126-FRAC       NEGATIVE CONTROL, real — with fraction.js sabotaged (value-preserving
//                   n/d -> 2n/2d) the 1.2.6 digests must MOVE and the check must go red.
//                   A126-REF proves the comparison can fail; this proves the DIGESTS can,
//                   i.e. that they are computed by this tree and not copied from anywhere.
//   A126-FRAC-RESTORE  revert puts the markers back to 0 and the check back to green.
//   RESTORE         layer1/package.json byte-identical, installed tree back at 1.2.5,
//                   verify:layer1 green on the restored tree.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const L1PKG = join(ROOT, 'layer1', 'package.json');
const ROOTPKG = join(ROOT, 'package.json');
const L1SNAPSHOT = readFileSync(L1PKG);
const ROOTSNAPSHOT = readFileSync(ROOTPKG);
const TARGET = '1.2.6';
const BASE = '1.2.5';

const arms = [];
const record = (a) => { arms.push(a); return a.pass; };

const run = (cmd, args, opts = {}) => {
  try {
    return { code: 0, out: execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }) };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};
const node = (script, args = [], env = {}) => run(process.execPath, [join(ROOT, script), ...args], { env: { ...process.env, ...env } });
const pnpmInstall = () => run('pnpm', ['install', '--silent']);

// Resolve in a FRESH CHILD PROCESS, then read the version off the installed package.json.
// Node caches resolution per process, so an in-process read after a reinstall can still name
// the previous store entry — which reads exactly like an install that did not happen.
const installedVersion = (pkg) => {
  const r = run(process.execPath, [join(ROOT, 'tools', 'resolve-chain.mjs'), 'layer1/package.json', pkg]);
  if (r.code !== 0) throw new Error(`resolve failed for ${pkg}: ${r.out.trim().split('\n').pop()}`);
  return JSON.parse(readFileSync(join(r.out.trim(), 'package.json'), 'utf8')).version;
};

const setCore = (version) => {
  const j = JSON.parse(readFileSync(L1PKG, 'utf8'));
  j.dependencies['@strudel/core'] = version;
  j.dependencies['@strudel/mini'] = version;
  writeFileSync(L1PKG, JSON.stringify(j, null, 2) + '\n');
  return pnpmInstall();
};
const setPatch = (key, patchPath) => {
  const j = JSON.parse(readFileSync(ROOTPKG, 'utf8'));
  if (patchPath) j.pnpm.patchedDependencies[key] = patchPath;
  else delete j.pnpm.patchedDependencies[key];
  writeFileSync(ROOTPKG, JSON.stringify(j, null, 2) + '\n');
  return pnpmInstall();
};
const fracMarkers = () => {
  const r = run(process.execPath, [join(ROOT, 'tools', 'resolve-chain.mjs'), 'layer1/package.json', '@strudel/core', 'fraction.js']);
  if (r.code !== 0) throw new Error(`resolve failed for fraction.js: ${r.out.trim().split('\n').pop()}`);
  const f = join(r.out.trim(), 'dist', 'fraction.mjs');
  const text = readFileSync(f, 'utf8');
  // SIGHTING: a count of 0 from the wrong file reads exactly like a clean tree.
  if (!text.includes('newFraction')) throw new Error(`SIGHTING FAILED: no newFraction in ${f}`);
  return (text.match(/STRUDEL_STUDY_FRACSAB/g) || []).length;
};

const H = (t) => console.log(`\n${'─'.repeat(78)}\n${t}\n${'─'.repeat(78)}`);
const TMP = mkdtempSync(join(tmpdir(), 'layer1-126-'));

let transcript = '';
try {
  H(`ARM — layer 1 on @strudel/core ${TARGET} (the default pin, ${BASE}, is restored at the end)`);
  console.log(`installing @strudel/core@${TARGET} and @strudel/mini@${TARGET} into layer1 …`);
  const inst = setCore(TARGET);
  if (inst.code !== 0) throw new Error(`install failed:\n${inst.out}`);

  const vCore = installedVersion('@strudel/core');
  const vMini = installedVersion('@strudel/mini');
  record({
    id: 'A126-INSTALLED', desc: `SIGHTING — the installed tree reports ${TARGET}`,
    expect: `@strudel/core and @strudel/mini both ${TARGET} in the installed tree`,
    obs: `core ${vCore}, mini ${vMini}`, pass: vCore === TARGET && vMini === TARGET,
  });
  if (vCore !== TARGET) throw new Error(`the arm never ran on ${TARGET} — installed core is ${vCore}`);

  const live = node('layer1/run.mjs');
  transcript = live.out.split('\n').filter((l) => /^(#|p\d\t)/.test(l)).join('\n') + '\n';
  process.stdout.write('\n' + transcript);

  const green = node('tools/verify-layer1.mjs');
  process.stdout.write(green.out);
  record({
    id: 'A126-DIGESTS', desc: `layer-1 digests on ${TARGET} equal the committed reference`,
    expect: 'verify:layer1 exit 0, 0 mismatched', obs: `exit ${green.code}`, pass: green.code === 0,
  });

  // ── NEGATIVE CONTROL 1: the comparison can fail. Corrupt a COPY, never the reference. ──
  H('NEGATIVE CONTROL — the comparison must be observed failing');
  const refText = readFileSync(join(ROOT, 'results', 'layer1-digests.txt'), 'utf8');
  const badRef = join(TMP, 'corrupted-reference.txt');
  writeFileSync(badRef, refText.replace('sha256=90a5e26c', 'sha256=deadbeef'));
  if (readFileSync(badRef, 'utf8') === refText) throw new Error('the corruption changed nothing — the control would be vacuous');
  const red = node('tools/verify-layer1.mjs', [], { LAYER1_REF: badRef });
  process.stdout.write(red.out);
  record({
    id: 'A126-REF', desc: 'MUTATION — one reference digest corrupted to deadbeef…',
    expect: 'the same live run turns RED (exit 1, 1 mismatched)',
    obs: `exit ${red.code}${/1 mismatched/.test(red.out) ? ', 1 mismatched' : ''}`,
    pass: red.code === 1 && /1 mismatched/.test(red.out),
  });

  const emptyRef = join(TMP, 'empty-reference.txt');
  writeFileSync(emptyRef, '');
  const voidRun = node('tools/verify-layer1.mjs', [], { LAYER1_REF: emptyRef });
  record({
    id: 'A126-VOID', desc: 'a reference with nothing in it is refused, not reported clean',
    expect: 'exit 2 — VOID', obs: `exit ${voidRun.code}: ${voidRun.out.trim().split('\n').pop()}`, pass: voidRun.code === 2,
  });

  // ── NEGATIVE CONTROL 2: the DIGESTS can move. This is the one that matters. ──
  H(`NEGATIVE CONTROL — the ${TARGET} digests must be computed, not inherited`);
  console.log('applying patches/fraction.js@5.3.4.patch — value-preserving n/d -> 2n/2d …');
  setPatch('fraction.js@5.3.4', 'patches/fraction.js@5.3.4.patch');
  const onM = fracMarkers();
  record({
    id: 'A126-FRAC-INSTALLED', desc: 'SIGHTING — the sabotage reached the installed 1.2.6 tree',
    expect: 'marker count > 0', obs: `STRUDEL_STUDY_FRACSAB × ${onM}`, pass: onM > 0,
  });
  const sab = node('tools/verify-layer1.mjs');
  process.stdout.write(sab.out);
  record({
    id: 'A126-FRAC', desc: `MUTATION — fraction.js prints 2n/2d under ${TARGET}`,
    expect: 'verify:layer1 turns RED (exit 1)',
    obs: `exit ${sab.code}${sab.code === 1 ? ' — check failed, as required' : ''}`, pass: sab.code === 1,
  });

  console.log('\nreverting fraction.js …');
  setPatch('fraction.js@5.3.4', null);
  const offM = fracMarkers();
  const back = node('tools/verify-layer1.mjs');
  record({
    id: 'A126-FRAC-RESTORE', desc: `revert restores the ${TARGET} tree and its digests`,
    expect: 'marker count 0 and verify:layer1 exit 0', obs: `markers ${offM}, exit ${back.code}`,
    pass: offM === 0 && back.code === 0,
  });
} finally {
  H(`RESTORE — layer1 back to the default pin, ${BASE}`);
  writeFileSync(L1PKG, L1SNAPSHOT);
  writeFileSync(ROOTPKG, ROOTSNAPSHOT);
  const r = pnpmInstall();
  const identical = readFileSync(L1PKG).equals(L1SNAPSHOT) && readFileSync(ROOTPKG).equals(ROOTSNAPSHOT);
  let v = 'unreadable', frac = -1;
  try { v = installedVersion('@strudel/core'); } catch {}
  try { frac = fracMarkers(); } catch {}
  const after = node('tools/verify-layer1.mjs');
  record({
    id: 'RESTORE', desc: 'the default pin and the default tree are back as they were',
    expect: `byte-identical manifests, installed core ${BASE}, 0 sabotage markers, verify:layer1 exit 0`,
    obs: `identical=${identical}, install exit ${r.code}, core ${v}, FRACSAB ${frac}, verify exit ${after.code}`,
    pass: identical && r.code === 0 && v === BASE && frac === 0 && after.code === 0,
  });

  H('SUMMARY');
  const w = Math.max(...arms.map((a) => a.id.length));
  for (const a of arms) console.log(`${a.pass ? 'PASS' : 'FAIL'}  ${a.id.padEnd(w)}  ${a.desc}\n      ${' '.repeat(w)}  expected: ${a.expect}\n      ${' '.repeat(w)}  observed: ${a.obs}`);
  const failed = arms.filter((a) => !a.pass);
  console.log(`\n${arms.length} arms, ${arms.length - failed.length} passed, ${failed.length} failed`);
  if (transcript.trim()) console.log(`\nTRANSCRIPT (@strudel/core ${TARGET})\n${transcript}`);
  if (failed.length) { console.log('FAILED: ' + failed.map((a) => a.id).join(', ')); process.exitCode = 1; }
}
