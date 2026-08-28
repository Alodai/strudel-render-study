// Recovering Strudel's rendered bytes outside a browser.
//
// `renderPatternAudio` (@strudel/webaudio) builds an OfflineAudioContext, calls
// startRendering(), encodes a WAV, and then delivers it by creating an object URL,
// attaching it to an anchor element and clicking it. It resolves to `undefined`.
//
// That is a description of what the function does, not a complaint about it: it is written
// for the REPL, where a download is the intended outcome. To measure the bytes from Node we
// supply the DOM surface it reaches for and intercept `URL.createObjectURL`, which is the
// point the encoded WAV passes through. Nothing in Strudel is modified.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as nwa from 'node-web-audio-api';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SPEC = JSON.parse(readFileSync(join(HERE, '..', 'patterns', 'patterns.json'), 'utf8'));

// node-web-audio-api supplies the Web Audio constructors as module exports; Strudel expects
// them as globals.
for (const [k, v] of Object.entries(nwa)) {
  if (k !== 'default' && /^[A-Z]/.test(k) && typeof globalThis[k] === 'undefined') globalThis[k] = v;
}

let SINK = null;
export let CLICKS = 0;

globalThis.window = { addEventListener() {}, location: { href: 'file:///' } };
globalThis.document = {
  createElement: () => ({
    set href(v) { this._h = v; },
    get href() { return this._h; },
    click() { CLICKS++; },
    style: {},
  }),
  body: { appendChild() {}, removeChild() {} },
  addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
};
const realCreate = URL.createObjectURL.bind(URL);
URL.createObjectURL = (blob) => { SINK = blob; return realCreate(blob); };
URL.revokeObjectURL = () => {};

const { note } = await import('@strudel/core');
const { mini } = await import('@strudel/mini');
const { renderPatternAudio } = await import('@strudel/webaudio');
export const superdough = await import('superdough');

// renderPatternAudio does not register the built-in synth sounds itself. Without this every
// voice is dropped and the render completes normally, producing a structurally valid WAV of
// the correct length containing silence — which is why every arm here has a peak check.
await superdough.registerSynthSounds();

const R = SPEC.render;
const SUBJECT = Object.entries(SPEC.patterns).find(([, d]) => d.layer2Subject);
if (!SUBJECT) throw new Error('patterns.json declares no layer2Subject');
export const SUBJECT_NAME = SUBJECT[0];
export const SUBJECT_MINI = SUBJECT[1].mini;

export function peakOf(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let peak = 0;
  for (let o = 44; o + 1 < bytes.length; o += 2) peak = Math.max(peak, Math.abs(dv.getInt16(o, true)) / 32768);
  return peak;
}

/** One render of the declared subject pattern. Returns the recovered WAV bytes and its sha256. */
export async function renderSubject() {
  SINK = null;
  const returned = await renderPatternAudio(
    note(mini(SUBJECT_MINI)).s(R.sound), R.cps, R.begin, R.end, R.sampleRate, R.bitDepth, false, 'study',
  );
  if (!SINK) throw new Error('no blob reached the sink — the interception did not fire');
  const bytes = new Uint8Array(await SINK.arrayBuffer());
  return { returned, bytes, peak: peakOf(bytes), sha: createHash('sha256').update(bytes).digest('hex') };
}
