// `pnpm controls` — every mutation and positive arm in this study, each reported PASS/FAIL.
//
// A mutation arm PASSES when it makes the check it targets go RED. That is the whole point:
// a check that has never been observed failing is not evidence of anything. So the arms that
// sabotage something are expected to break `pnpm verify:layer1`, and this runner prints the
// red they produce.
//
// Some arms toggle pnpm.patchedDependencies and reinstall. package.json is snapshotted at
// the start and restored in a finally block, and the restore is verified two ways: the file
// must be byte-identical to the snapshot, and the installed trees must carry zero mutation
// markers. Pass --fast to skip every install-based arm.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FAST = process.argv.includes('--fast');
const PKG = join(ROOT, 'package.json');
const SNAPSHOT = readFileSync(PKG);

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
const lastJson = (out) => {
  const line = out.split('\n').reverse().find((l) => l.startsWith('JSON '));
  return line ? JSON.parse(line.slice(5)) : null;
};

const pnpmInstall = () => run('pnpm', ['install', '--silent']);
const setPatch = (key, patchPath) => {
  const j = JSON.parse(readFileSync(PKG, 'utf8'));
  j.pnpm.patchedDependencies = j.pnpm.patchedDependencies ?? {};
  if (patchPath) j.pnpm.patchedDependencies[key] = patchPath;
  else delete j.pnpm.patchedDependencies[key];
  writeFileSync(PKG, JSON.stringify(j, null, 2) + '\n');
  return pnpmInstall();
};
// Resolve in a FRESH CHILD PROCESS. Node caches module resolution per process, so after a
// reinstall an in-process resolve still returns the previous store path — which reads exactly
// like a revert that did not happen. This runner reinstalls between arms, so it must not cache.
const resolveDirFresh = (fromPkgJson, chain) => {
  const r = run(process.execPath, [join(ROOT, 'tools', 'resolve-chain.mjs'), fromPkgJson, ...chain]);
  if (r.code !== 0) throw new Error(`resolve failed for ${chain.join(' -> ')}: ${r.out.trim().split('\n').pop()}`);
  return r.out.trim();
};
const markerCount = (chain, file, marker, fromPkgJson) => {
  const f = join(resolveDirFresh(fromPkgJson, chain), file);
  const text = readFileSync(f, 'utf8');
  // POSITIVE ARM: a count of 0 from a file we could not read, or from the wrong file, is
  // indistinguishable from a clean tree. Require the anchor the marker sits beside.
  const anchor = marker === 'STRUDEL_STUDY_NOPOOL' ? 'getNodeFromPool' : 'newFraction';
  if (!text.includes(anchor)) throw new Error(`SIGHTING FAILED: no ${anchor} in ${f}`);
  return (text.match(new RegExp(marker, 'g')) || []).length;
};

const H = (t) => console.log(`\n${'─'.repeat(78)}\n${t}\n${'─'.repeat(78)}`);

try {
  // ══ GROUP 1 — layer-1 digest mutation arms (no install) ══════════════════════════════
  H('GROUP 1 — layer-1 digest: four mutation arms and one positive arm');
  const l1 = node('layer1/control.mjs');
  process.stdout.write(l1.out.split('\n').filter((l) => l && !l.startsWith('JSON ')).join('\n') + '\n');
  const l1j = lastJson(l1.out);
  if (!l1j) record({ id: 'L1', group: 'layer1', desc: 'control script produced no result', expect: 'JSON result line', obs: 'none', pass: false });
  else for (const r of l1j.results) {
    record({
      id: `L1-${r.id}`, group: 'layer1', desc: r.label,
      expect: r.kind === 'mutation' ? 'digest MOVES off baseline' : 'digest is unchanged',
      obs: `${r.digest.slice(0, 12)}… ${r.kind === 'mutation' ? (r.pass ? 'moved' : 'DID NOT MOVE') : (r.pass ? 'stable' : 'UNSTABLE')}`,
      pass: r.pass,
    });
  }

  // ══ GROUP 2 — the layer-1 check itself, and a mutation that must turn it RED ══════════
  H('GROUP 2 — the layer-1 check, and the fraction.js arm that must break it');
  const clean = node('tools/verify-layer1.mjs');
  process.stdout.write(clean.out);
  record({
    id: 'L1-CHECK', group: 'layer1', desc: 'verify:layer1 on an unmutated tree',
    expect: 'exit 0 — live digests equal the recorded reference', obs: `exit ${clean.code}`, pass: clean.code === 0,
  });

  if (FAST) {
    console.log('\n--fast: skipping every install-based arm (L1-FRAC, L2-F2-A/B/C, L2-POOL-*).');
  } else {
    // fraction.js represents EVERY layer-1 time value. If the digest cannot see a change in
    // it, "all versions in the declared range agree" would be indistinguishable from a
    // harness that never reads fraction.js at all.
    console.log('\napplying patches/fraction.js@5.3.4.patch — value-preserving n/d -> 2n/2d …');
    setPatch('fraction.js@5.3.4', 'patches/fraction.js@5.3.4.patch');
    const sabMarkers = markerCount(['@strudel/core', 'fraction.js'], 'dist/fraction.mjs', 'STRUDEL_STUDY_FRACSAB', 'layer1/package.json');
    record({
      id: 'L1-FRAC-INSTALLED', group: 'layer1', desc: 'sabotage is actually present in the installed tree',
      expect: 'marker count > 0', obs: `STRUDEL_STUDY_FRACSAB × ${sabMarkers}`, pass: sabMarkers > 0,
    });
    const sabotaged = node('tools/verify-layer1.mjs');
    process.stdout.write(sabotaged.out);
    record({
      id: 'L1-FRAC', group: 'layer1', desc: 'MUTATION — fraction.js prints 2n/2d instead of n/d',
      expect: 'verify:layer1 turns RED (exit 1)', obs: `exit ${sabotaged.code}${sabotaged.code === 1 ? ' — check failed, as required' : ''}`,
      pass: sabotaged.code === 1,
    });

    console.log('\nreverting fraction.js …');
    setPatch('fraction.js@5.3.4', null);
    const backMarkers = markerCount(['@strudel/core', 'fraction.js'], 'dist/fraction.mjs', 'STRUDEL_STUDY_FRACSAB', 'layer1/package.json');
    const restored = node('tools/verify-layer1.mjs');
    record({
      id: 'L1-FRAC-RESTORE', group: 'layer1', desc: 'revert restores the tree and the digests',
      expect: 'marker count 0 and verify:layer1 exit 0', obs: `markers ${backMarkers}, exit ${restored.code}`,
      pass: backMarkers === 0 && restored.code === 0,
    });
  }

  // ══ GROUP 3 — F1: what renderPatternAudio hands back ══════════════════════════════════
  H('GROUP 3 — F1: the render succeeded, and what the function returned');
  const f1 = node('layer2/controls/f1-sink.mjs');
  process.stdout.write(f1.out.split('\n').filter((l) => l.startsWith('POSITIVE') || l.startsWith('OBSERVATION')).join('\n') + '\n');
  const f1j = lastJson(f1.out);
  if (!f1j) record({ id: 'L2-F1', group: 'layer2', desc: 'f1-sink produced no result', expect: 'JSON result line', obs: `exit ${f1.code}`, pass: false });
  else {
    record({
      id: 'L2-F1-POS', group: 'layer2', desc: 'POSITIVE ARM — the render really happened',
      expect: 'RIFF/WAVE, frames == expected, peak > 0.001',
      obs: `${f1j.riffWave}, ${f1j.dataFrames}/${f1j.expectedFrames} frames, peak ${f1j.peak}`,
      pass: f1j.riffWave === 'RIFF/WAVE' && f1j.dataFrames === f1j.expectedFrames && f1j.peak > 0.001,
    });
    record({
      id: 'L2-F1-SINK', group: 'layer2', desc: 'bytes are recoverable at the DOM sink',
      expect: 'exactly one anchor click, blob captured', obs: `clicks ${f1j.clicks}, ${f1j.bytes} bytes`,
      pass: f1j.clicks === 1 && f1j.bytes > 0,
    });
    record({
      id: 'L2-F1-RET', group: 'layer2', desc: 'renderPatternAudio resolves to undefined',
      expect: 'returned === undefined', obs: f1j.returnedIsUndefined ? 'undefined' : 'something else', pass: f1j.returnedIsUndefined,
    });
  }

  // ══ GROUP 4 — the worklet sighting probe ═════════════════════════════════════════════
  H('GROUP 4 — the attribution arm is only meaningful if its worklet is live');
  const iso = (args, env) => { const r = node('layer2/isolation.mjs', args, env); const [, , sha, peak] = r.out.trim().split('\n').pop().split('\t'); return { sha, peak: Number(peak) }; };
  const plain = iso([], {});
  const wk1 = iso(['worklet'], {});
  const wkH = iso(['worklet'], { WK_GAIN: '0.5' });
  const wk0 = iso(['worklet'], { WK_GAIN: '0.0' });
  for (const [label, v] of [['plain', plain], ['worklet g=1', wk1], ['worklet g=0.5', wkH], ['worklet g=0', wk0]])
    console.log(`${label.padEnd(16)}${v.sha.slice(0, 16)}…  peak=${v.peak.toFixed(6)}`);
  record({
    id: 'L2-WK-TRANSPARENT', group: 'layer2', desc: 'a gain-1 worklet is byte-transparent',
    expect: 'worklet g=1 digest == plain digest', obs: wk1.sha === plain.sha ? 'identical' : 'differ', pass: wk1.sha === plain.sha,
  });
  const half = Math.abs(wkH.peak - plain.peak / 2) < 1e-4;
  record({
    id: 'L2-WK-SIGHTED', group: 'layer2', desc: 'SIGHTING — the worklet is genuinely in the signal path',
    expect: 'g=0.5 halves the peak, g=0 silences it',
    obs: `${plain.peak.toFixed(6)} -> ${wkH.peak.toFixed(6)} (half: ${half}) -> ${wk0.peak.toFixed(6)}`,
    pass: half && wk0.peak === 0 && wkH.sha !== plain.sha && wk0.sha !== plain.sha,
  });

  // ══ GROUP 5 — F2: the kabelsalat exports map ══════════════════════════════════════════
  H('GROUP 5 — F2: is the absent exports map the sole cause?');
  const pos = node('layer2/controls/kabelsalat-positive-arm.mjs');
  process.stdout.write(pos.out.split('\n').filter((l) => l.startsWith('POSITIVE')).join('\n') + '\n');
  const posj = lastJson(pos.out);
  record({
    id: 'L2-F2-POS', group: 'layer2', desc: 'POSITIVE ARM — the file Node lands on really has no exports',
    expect: 'dist/index.js exports == 0, dist/index.mjs exports > 0 and names SalatRepl',
    obs: posj ? `index.js ${posj.iifeExports}, index.mjs ${posj.mjsExports}, SalatRepl ${posj.mjsNamesSalatRepl}` : 'no result',
    pass: !!posj && posj.iifeExports === 0 && posj.mjsExports > 0 && posj.mjsNamesSalatRepl,
  });

  if (!FAST) {
    const probe = () => { const r = run(process.execPath, [join(ROOT, 'layer2', 'controls', 'import-probe.mjs')], { cwd: join(ROOT, 'layer2') }); return lastJson(r.out) ?? { ok: null }; };
    const KEY = '@kabelsalat/web@0.4.1', PATCH = 'patches/@kabelsalat__web@0.4.1.patch';
    console.log('\nARM A — as published (patch removed) …'); setPatch(KEY, null); const A = probe();
    console.log('ARM B — +exports only (patch applied) …'); setPatch(KEY, PATCH); const Bm = probe();
    console.log('ARM C — reverted again …'); setPatch(KEY, null); const C = probe();
    console.log('restoring …'); setPatch(KEY, PATCH);
    for (const [id, a, want] of [['L2-F2-A', A, false], ['L2-F2-B', Bm, true], ['L2-F2-C', C, false]])
      console.log(`${id}  resolve -> ${a.resolved}  |  ${a.ok ? `IMPORT_OK exports=${a.exports}` : `IMPORT_FAIL ${a.error}`}`);
    record({ id: 'L2-F2-A', group: 'layer2', desc: 'MUTATION — patch removed, package as published', expect: 'import FAILS on the missing named export', obs: A.ok ? 'imported fine' : A.error, pass: A.ok === false && /SalatRepl/.test(A.error ?? '') });
    record({ id: 'L2-F2-B', group: 'layer2', desc: 'exports map added, nothing else changed', expect: 'import succeeds', obs: Bm.ok ? `exports=${Bm.exports}` : Bm.error, pass: Bm.ok === true });
    record({ id: 'L2-F2-C', group: 'layer2', desc: 'MUTATION reverted — back to as published', expect: 'import FAILS again', obs: C.ok ? 'imported fine' : C.error, pass: C.ok === false && /SalatRepl/.test(C.error ?? '') });

    // ══ GROUP 6 — the pool experiment's arm B is really installable ═════════════════════
    H('GROUP 6 — pool experiment: arm B applies as a patch and reverts cleanly');
    setPatch('superdough@1.3.0', 'patches/superdough@1.3.0.patch');
    const onM = markerCount(['superdough'], 'nodePools.mjs', 'STRUDEL_STUDY_NOPOOL', 'layer2/package.json');
    const armB = node('layer2/render-n.mjs', ['1']);
    const bRow = armB.out.trim().split('\n').pop().split('\t');
    console.log(`arm B installed: marker × ${onM}; a render under arm B -> ${(bRow[2] ?? '').slice(0, 16)}… peak=${bRow[3]}`);
    record({ id: 'L2-POOL-B', group: 'layer2', desc: 'arm B — pool reuse disabled', expect: 'marker present and the tree still renders non-silent', obs: `marker × ${onM}, peak ${bRow[3]}`, pass: onM === 1 && Number(bRow[3]) > 0.001 });
    setPatch('superdough@1.3.0', null);
    const offM = markerCount(['superdough'], 'nodePools.mjs', 'STRUDEL_STUDY_NOPOOL', 'layer2/package.json');
    const armA = node('layer2/render-n.mjs', ['1']);
    const aRow = armA.out.trim().split('\n').pop().split('\t');
    console.log(`arm A restored:  marker × ${offM}; a render under arm A -> ${(aRow[2] ?? '').slice(0, 16)}… peak=${aRow[3]}`);
    record({ id: 'L2-POOL-A', group: 'layer2', desc: 'arm A — superdough as published, restored', expect: 'marker count 0 and the tree still renders', obs: `marker × ${offM}, peak ${aRow[3]}`, pass: offM === 0 && Number(aRow[3]) > 0.001 });
  }
} finally {
  // ══ RESTORE — verified two ways, never assumed ═════════════════════════════════════════
  writeFileSync(PKG, SNAPSHOT);
  const r = pnpmInstall();
  const identical = readFileSync(PKG).equals(SNAPSHOT);
  let frac = -1, pool = -1;
  try { frac = markerCount(['@strudel/core', 'fraction.js'], 'dist/fraction.mjs', 'STRUDEL_STUDY_FRACSAB', 'layer1/package.json'); } catch {}
  try { pool = markerCount(['superdough'], 'nodePools.mjs', 'STRUDEL_STUDY_NOPOOL', 'layer2/package.json'); } catch {}
  record({
    id: 'RESTORE', group: 'restore', desc: 'package.json and both trees are back as they were',
    expect: 'byte-identical manifest, install ok, zero mutation markers',
    obs: `identical=${identical}, install exit ${r.code}, FRACSAB ${frac}, NOPOOL ${pool}`,
    pass: identical && r.code === 0 && frac === 0 && pool === 0,
  });

  H('SUMMARY');
  const w = Math.max(...arms.map((a) => a.id.length));
  for (const a of arms) console.log(`${a.pass ? 'PASS' : 'FAIL'}  ${a.id.padEnd(w)}  ${a.desc}\n      ${' '.repeat(w)}  expected: ${a.expect}\n      ${' '.repeat(w)}  observed: ${a.obs}`);
  const failed = arms.filter((a) => !a.pass);
  console.log(`\n${arms.length} arms, ${arms.length - failed.length} passed, ${failed.length} failed`);
  if (failed.length) { console.log('FAILED: ' + failed.map((a) => a.id).join(', ')); process.exitCode = 1; }
}
