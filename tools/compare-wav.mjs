// Compare two WAV renders sample by sample. This is what makes the divergence figures in
// README.md checkable rather than quoted: run it on the two files in audio/ and you get the
// same numbers, or the numbers are wrong.
//
//   node tools/compare-wav.mjs audio/canonical-4f815a0c.wav audio/divergent-e61af896.wav
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const [aPath, bPath] = process.argv.slice(2);
if (!aPath || !bPath) { console.error('usage: compare-wav.mjs <a.wav> <b.wav>'); process.exit(2); }

const read = (p) => {
  const buf = readFileSync(p);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const riff = buf.toString('latin1', 0, 4), wave = buf.toString('latin1', 8, 12);
  if (riff !== 'RIFF' || wave !== 'WAVE') throw new Error(`${p} is not a RIFF/WAVE file`);
  const channels = dv.getUint16(22, true), sampleRate = dv.getUint32(24, true);
  const dataBytes = dv.getUint32(40, true);
  const n = dataBytes / 2;                                  // int16 samples, interleaved
  const s = new Int16Array(n);
  for (let i = 0; i < n; i++) s[i] = dv.getInt16(44 + i * 2, true);
  return { p, buf, channels, sampleRate, frames: n / channels, s, sha: createHash('sha256').update(buf).digest('hex') };
};

const A = read(aPath), B = read(bPath);
const rms = (s, from = 0, to = s.length) => {
  let acc = 0; for (let i = from; i < to; i++) acc += (s[i] / 32768) ** 2;
  return Math.sqrt(acc / (to - from));
};
const peak = (s) => { let m = 0; for (const v of s) m = Math.max(m, Math.abs(v) / 32768); return m; };

console.log(`A  ${A.p}\n   sha256 ${A.sha}\n   ${A.channels}ch ${A.sampleRate}Hz ${A.frames} frames  peak ${peak(A.s).toFixed(6)}  rms ${rms(A.s).toFixed(6)}`);
console.log(`B  ${B.p}\n   sha256 ${B.sha}\n   ${B.channels}ch ${B.sampleRate}Hz ${B.frames} frames  peak ${peak(B.s).toFixed(6)}  rms ${rms(B.s).toFixed(6)}`);

if (A.sha === B.sha) { console.log('\nThe two files are byte-identical.'); process.exit(0); }
if (A.s.length !== B.s.length) { console.log(`\nLengths differ: ${A.s.length} vs ${B.s.length} samples.`); process.exit(0); }

console.log(`\nheader bytes 0..43 identical: ${A.buf.subarray(0, 44).equals(B.buf.subarray(0, 44))}`);
let first = -1, differing = 0, maxDelta = 0;
for (let i = 0; i < A.s.length; i++) {
  const d = Math.abs(A.s[i] - B.s[i]);
  if (d) { if (first < 0) first = i; differing++; maxDelta = Math.max(maxDelta, d); }
}
const firstFrame = Math.floor(first / A.channels);
console.log(`first differing sample:  frame ${firstFrame} of ${A.frames}  (${(firstFrame / A.sampleRate).toFixed(3)} s)`);
console.log(`samples differing:       ${differing} of ${A.s.length} = ${((differing / A.s.length) * 100).toFixed(2)} %`);
console.log(`max |delta|:             ${maxDelta} = ${((maxDelta / 32768) * 100).toFixed(3)} % of full scale`);
console.log(`peaks:                   A ${peak(A.s).toFixed(6)}  B ${peak(B.s).toFixed(6)}  ${peak(A.s) === peak(B.s) ? '(equal)' : '(DIFFERENT)'}`);
console.log(`RMS ratio B/A:           ${(rms(B.s) / rms(A.s)).toFixed(4)}  ${rms(B.s) > rms(A.s) ? '— B carries MORE energy' : '— B carries LESS energy'}`);

console.log('\nper 0.25 s window          A rms      B rms     ratio');
const W = Math.floor(A.sampleRate * 0.25) * A.channels;
for (let w = 0; w * W < A.s.length; w++) {
  const from = w * W, to = Math.min(from + W, A.s.length);
  const ra = rms(A.s, from, to), rb = rms(B.s, from, to);
  console.log(`  ${(w * 0.25).toFixed(2)}–${((w + 1) * 0.25).toFixed(2)} s          ${ra.toFixed(6)}  ${rb.toFixed(6)}   ${(rb / ra).toFixed(3)}`);
}
