// F1 — what renderPatternAudio hands back, and the positive arm without which that is
// uninformative.
//
// "It resolves to undefined" says nothing unless the render actually SUCCEEDED. A render
// with no registered sounds also resolves to undefined — and produces a structurally perfect,
// entirely silent WAV of exactly the right length. So this control proves the bytes are a
// real, non-silent, correctly-sized RIFF/WAVE first, and only then reports the return value.
//
// Emits JSON on the last line so tools/controls.mjs can grade it.
import { renderSubject, CLICKS, SUBJECT_MINI, SPEC } from '../sink.mjs';

const R = SPEC.render;
const r = await renderSubject();
const b = r.bytes;
const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
const txt = (o, n) => String.fromCharCode(...b.slice(o, o + n));
const u32 = (o) => dv.getUint32(o, true);
const u16 = (o) => dv.getUint16(o, true);

const expectedFrames = ((R.end - R.begin) / R.cps) * R.sampleRate;
const dataFrames = u32(40) / (u16(22) * 2);

const out = {
  subject: SUBJECT_MINI,
  clicks: CLICKS,
  bytes: b.length,
  riffWave: `${txt(0, 4)}/${txt(8, 4)}`,
  channels: u16(22),
  sampleRate: u32(24),
  expectedFrames,
  dataFrames,
  peak: Number(r.peak.toFixed(6)),
  sha256: r.sha,
  returnedIsUndefined: r.returned === undefined,
};

console.log(`POSITIVE ARM  anchor clicks: ${out.clicks} | bytes: ${out.bytes}`);
console.log(`POSITIVE ARM  ${out.riffWave} | channels: ${out.channels} | sampleRate: ${out.sampleRate} | expected frames: ${out.expectedFrames} | data frames: ${out.dataFrames}`);
console.log(`POSITIVE ARM  peak amplitude: ${out.peak.toFixed(6)} ${out.peak > 0.001 ? '(NON-SILENT — the render succeeded)' : '(SILENT — this control is VOID)'}`);
console.log(`OBSERVATION   renderPatternAudio resolved to: ${out.returnedIsUndefined ? 'undefined' : JSON.stringify(r.returned)}`);
console.log(`OBSERVATION   bytes reached the caller via: ${out.clicks ? 'document anchor .click() — intercepted at URL.createObjectURL' : '(nothing)'}`);
console.log('JSON ' + JSON.stringify(out));
