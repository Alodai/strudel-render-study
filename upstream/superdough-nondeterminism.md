# Draft upstream report 3 of 3 — NOT SENT

**Target — CONFIRMED:** <https://codeberg.org/uzu/strudel/issues> (declared in `superdough`'s own
`bugs.url`; issues open, 424 outstanding, not archived, updated 2026-08-26). `packages/superdough`
in that repo publishes `superdough@1.3.0`, the version tested.
**Affects:** `superdough@1.3.0` via `@strudel/webaudio@1.3.0`'s `renderPatternAudio`.

## Title
Offline render is not deterministic under host load: same pattern, same process, 9 of 192 renders produced different audio (6 distinct digests)

## Body

Rendering an identical, fully deterministic pattern — no `rand`, no `irand`, no wall-clock — through
`renderPatternAudio` into an `OfflineAudioContext` does not always produce the same bytes. It is
reliable when the machine is idle and becomes unreliable under load.

### Measurement

Pattern `note(mini('c3 e3 g3 [b3 a3]')).s('sine')`, cps 1, span 0–2 s, 44100 Hz stereo. Digest is
sha256 over the WAV bytes.

| condition | n | divergent |
|---|---|---|
| serial, one render per process, idle | 20 | **0** |
| serial, two renders per process, idle | 20 pairs | **0** |
| serial, forced GC pressure (`--max-old-space-size=64`, `=40`) | 36 | **0** |
| **8-way concurrent, 64 processes × 3 renders** (run A) | **192** | **9 (4.69 %)** |
| **the same protocol repeated** (run B, WAVs captured) | **192** | **6 (3.13 %)** |
| **pooled** | **384** | **15 (3.91 %)** |

The two runs are statistically consistent (Fisher exact p = 0.60). **13 distinct outputs** have been
observed for this one pattern on this one machine. Every render was non-silent and every one had an
identical peak of `0.363281`, so nothing structural distinguishes a good render from a bad one.

Divergence is **not** confined to the first render of a process — out of 64 renders at each
position, positions 1/2/3 diverged **4 / 2 / 3** times. Alternative outputs **recur** across separate
runs (one digest appeared 4× within run A; another reappeared in both runs), which points to a
discrete race with a bounded outcome set rather than floating-point drift.

### What the wrong renders sound like: a voice that is never released

All six divergent outputs of run B, each against the canonical render captured in the same run.
They are **not homogeneous** — severity ranges over an order of magnitude:

| digest | first differing frame | samples differing | max delta | RMS ratio |
|---|---|---|---|---|
| `997707bd` | 83712 / 88200 | 5.09 % | 37.4 % FS | 1.0098 |
| `ce355222` | 83584 | 5.23 % | 38.2 % FS | 1.0165 |
| `292b6540` | 67200 | 23.81 % | 52.2 % FS | 1.0634 |
| `796cfed2` | 56320 | 36.14 % | 43.7 % FS | 1.0866 |
| `7dd76746` | 45056 | 48.91 % | 50.0 % FS | 1.1621 |
| `e61af896` | 39552 | 55.15 % | 52.8 % FS | 1.2247 |

Severity spans an order of magnitude — 5.09 % to 55.15 % of samples (median 29.98 %) at RMS ratios
1.0098 to 1.2247 (median 1.0750) — so no single row should be quoted as representative. Two things
hold across **all six**: every divergent render carries **more** energy than the canonical one
(RMS ratio > 1 in every case, never < 1), and divergence always begins partway through — between
frame 39552 and 83712 of 88200, i.e. 0.90 s to 1.90 s — and then runs to the end. The opening is
always byte-identical. That is the signature of a voice that keeps sounding, not one that is dropped.

The worst case (`e61af896`) in detail — identical length, identical peak, byte-identical for the
first 0.75 s:

| window | canonical RMS | divergent RMS | ratio |
|---|---|---|---|
| 0.00–0.75 s | 0.109973 / 0.108241 / 0.112876 | identical | 1.000 |
| 0.75–1.00 s | 0.121954 | 0.142016 | 1.165 |
| 1.00–1.25 s | 0.110639 | 0.156243 | 1.412 |
| 1.25–1.50 s | 0.108241 | 0.156332 | 1.444 |
| 1.50–1.75 s | 0.112876 | 0.156406 | 1.386 |
| 1.75–2.00 s | 0.121964 | 0.156401 | 1.282 |

First differing sample: **frame 39552 of 88200**. 55.15 % of samples differ, max delta 52.8 % of full
scale. Overall RMS ratio **1.2247** — the divergent render carries *more* energy, flat at ~0.1564
after 1 s. That is consistent with a voice that keeps sounding rather than one that is dropped.

### Two candidate causes tested and **eliminated** — please don't start where we did

1. **Not `node-web-audio-api`.** An `OfflineAudioContext` driven directly with a fixed 10-voice
   schedule and no Strudel produced **1 digest in 96 concurrent renders** at load 26.9, *higher* than
   the load at which Strudel diverged. Two arms — plain `OscillatorNode`/`GainNode`, and voices
   routed through an `AudioWorkletNode` proved live (gain 0.5 halved the peak exactly, gain 0
   silenced it). So this is not a generic property of offline rendering in that library.
2. **Not the node pool in `nodePools.mjs`.** The `WeakRef`/`deref()` reuse path looked like the
   obvious suspect — it is the one place with a documented race (*"helps to prevent race conditions
   between node termination and node re-use"*) and a GC-dependent input. We patched
   `getNodeFromPool` to never reuse a pooled node and re-ran the identical 192-render protocol:
   **4 of 192 still diverged** (Fisher exact vs 9/192, p = 0.26 — no significant reduction, and the
   mutant run was at *higher* load, 30.5 → 81.0). Disabling pool reuse does not fix it.

   Related negative result: `OfflineAudioContext.currentTime` stays `0` for the whole scheduling
   phase and only advances after `startRendering()`, so `isNodeAlive`'s `now < end + 0.45` test is
   constant during offline scheduling and cannot be the varying input.

**We have not identified the cause.** The evidence points at something in superdough's own
scheduling/voice handling that is sensitive to wall-clock timing during the async scheduling loop,
but we could not narrow it further.

### Why this matters beyond the REPL
`OfflineAudioContext` renders are the basis of any reproducibility or archival claim about a piece.
A render that silently differs under load — with no error, correct length, and an identical peak —
cannot be verified by any structural check.

### Environment
`@strudel/core@1.2.6`, `@strudel/mini@1.2.6`, `@strudel/webaudio@1.3.0`, `superdough@1.3.0`,
Node 22.17.1, darwin-arm64 (M-series, 2 s renders), `node-web-audio-api@2.1.0` supplying Web Audio.
Reproducing this needs the workarounds in the two sibling reports (`@kabelsalat/web` `exports` map;
`registerSynthSounds()` called manually).
