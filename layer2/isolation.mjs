// ATTRIBUTION ARM. An OfflineAudioContext driven DIRECTLY — no Strudel, no superdough, no
// pattern engine. A fixed, hardcoded 10-voice schedule with envelopes, matching the shape of
// the Strudel render (2 s, 44100 Hz, stereo). Nothing here is random.
//
//   node layer2/isolation.mjs            plain OscillatorNode -> GainNode
//   node layer2/isolation.mjs worklet    voices routed THROUGH a live AudioWorkletNode
//   WK_GAIN=0.5 node layer2/isolation.mjs worklet     <- the sighting probe
//
// The worklet arm exists because a harness with no AudioWorklet cannot observe a worklet
// race, and superdough loads worklets. A transparent worklet produces the same bytes as no
// worklet at all — which is also exactly what a worklet that never engaged would produce.
// WK_GAIN is how you tell those two apart: 0.5 must halve the peak, 0.0 must silence it.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { OfflineAudioContext, OscillatorNode, GainNode, AudioWorkletNode } from 'node-web-audio-api';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKLET = process.argv[2] === 'worklet';
const SR = 44100, DUR = 2, CH = 2;

// 10 events over 2 cycles — mirrors `c3 e3 g3 [b3 a3]` at cps=1, midi -> Hz, fixed.
const NOTES = [
  [0.00, 0.25, 130.8128], [0.25, 0.25, 164.8138], [0.50, 0.25, 195.9977],
  [0.75, 0.125, 246.9417], [0.875, 0.125, 220.0000],
  [1.00, 0.25, 130.8128], [1.25, 0.25, 164.8138], [1.50, 0.25, 195.9977],
  [1.75, 0.125, 246.9417], [1.875, 0.125, 220.0000],
];

const ctx = new OfflineAudioContext(CH, SR * DUR, SR);
let bus = ctx.destination;
if (WORKLET) {
  await ctx.audioWorklet.addModule(pathToFileURL(join(HERE, 'worklet-proc.js')).href);
  const wk = new AudioWorkletNode(ctx, 'gain-proc');
  if (process.env.WK_GAIN) wk.parameters.get('g').value = Number(process.env.WK_GAIN);
  wk.connect(ctx.destination);
  bus = wk;
}
for (const [t, d, hz] of NOTES) {
  const osc = new OscillatorNode(ctx, { type: 'sine', frequency: hz });
  const g = new GainNode(ctx, { gain: 0 });
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.3, t + 0.005);
  g.gain.linearRampToValueAtTime(0, t + d);
  osc.connect(g); g.connect(bus);
  osc.start(t); osc.stop(t + d);
}
const buf = await ctx.startRendering();

// Interleave to int16 exactly as Strudel's WAV encoder does, then digest the PCM.
const L = buf.getChannelData(0), Rc = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
const pcm = Buffer.alloc(L.length * CH * 2);
let peak = 0;
for (let i = 0, o = 0; i < L.length; i++) {
  for (const s of [L[i], Rc[i]]) {
    peak = Math.max(peak, Math.abs(s));
    const v = Math.max(-1, Math.min(1, s));
    pcm.writeInt16LE((v < 0 ? v * 0x8000 : v * 0x7fff) | 0, o); o += 2;
  }
}
console.log(`${process.pid}\t1\t${createHash('sha256').update(pcm).digest('hex')}\t${peak.toFixed(6)}\tframes=${buf.length}\tworklet=${WORKLET}`);
