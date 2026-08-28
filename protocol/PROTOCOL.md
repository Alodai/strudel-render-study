# The protocol, in numbers

Everything below is a number or a command. No adjectives.

## The unit

One **render** is: `renderPatternAudio(note(mini("c3 e3 g3 [b3 a3]")).s("sine"), 1, 0, 2, 44100, 32, false, "study")`

| parameter | value |
|---|---|
| pattern | `c3 e3 g3 [b3 a3]` (mini-notation), `.s("sine")` |
| cps | 1 |
| span | begin 0, end 2 — 2 cycles, 2 seconds |
| sample rate | 44100 Hz |
| bit depth argument | 32 |
| channels in the emitted WAV | 2 |
| frames in the emitted WAV | 88200 |
| bytes in the emitted WAV | 352844 |
| digest | sha256 over the **whole WAV file**, header included |
| peak | max abs int16 sample / 32768, over bytes 44..end |

The pattern contains no `rand`, `irand`, `perlin`, `shuffle`, `degrade`, or wall-clock
reference. It is declared in `patterns/patterns.json`; every harness reads that file rather
than inlining the string.

## The run

| parameter | default | env var |
|---|---|---|
| processes launched concurrently per batch | 8 | `WIDTH` |
| batches, each started together and waited on before the next | 8 | `BATCHES` |
| renders performed inside each process, sequentially | 3 | `RENDERS` |
| **N per run** | **192** | |
| distinct OS processes per run | 64 | |

Each process is a fresh `node layer2/render-n.mjs 3`. Processes do not communicate. Each
emits one row per render: batch, pid, position within the process, digest, peak.

8-way is the width at which divergence first appeared during exploration. It is held **fixed**
across every subject — Strudel, the direct-`OfflineAudioContext` arms, the pool-mutation arm —
so that the subject is the only thing that varies between arms.

`bash protocol/concurrency-protocol.sh strudel` is the whole of it. `pnpm layer2` runs that.

## How load was measured, and what it read

`uptime`, parsed for the three load averages, printed **before the first batch and after the
last** and written into the run file as comment lines:

```
# load before: 14.54 21.80 24.68
# load after:  17.35 22.08 24.73
```

These are the standard Unix 1/5/15-minute run-queue averages for the **whole machine**, not
for this run's processes. The host of record routinely carries other work, which is why the
figure is recorded rather than controlled: it is the independent variable, and a run whose
load is not reported cannot be compared with another run.

The load figures for runs A and B come from notes taken at the time; the protocol script was
written afterwards and now records them in the file. Runs 1 and 2 carry theirs in their own
headers.

## What makes a run valid

The script counts the rows it recorded and compares that with `WIDTH × BATCHES × RENDERS`. If
they differ it prints `VOID`, exits 1, and the run must not be reported. A process that dies,
or output that a filter swallows, otherwise leaves a **shorter** run that still looks
perfectly healthy — and "0 divergences" out of an unknown number is not 0 out of N.

Rows are selected by a `ROW\t` sentinel that only this harness emits, not by a shape like
"looks like a hex digest": `@strudel/core`, `superdough` and `@strudel/webaudio` all write
banners to stdout, and a shape filter would silently drop a malformed result rather than
surface it.

## The arms, and what differs between them

| arm | command | subject | N |
|---|---|---|---|
| Strudel | `pnpm layer2` | `renderPatternAudio` → superdough → `node-web-audio-api` | 192 |
| direct, no worklet | `pnpm isolation` | `OfflineAudioContext` + `OscillatorNode`/`GainNode` only | 48 |
| direct, live worklet | `pnpm isolation:worklet` | as above, voices routed through an `AudioWorkletNode` | 48 |
| pool reuse disabled | `pnpm pool:apply` then `pnpm layer2` | Strudel, with `getNodeFromPool` never reusing | 192 |

The two direct arms use a hardcoded 10-voice schedule with the same duration, sample rate and
channel count, mirroring `c3 e3 g3 [b3 a3]` at cps 1 with MIDI converted to Hz. They exist to
separate "offline rendering in this library is non-deterministic under load" from "Strudel's
use of it is", and the worklet arm exists because a harness without a worklet cannot observe
a worklet race while superdough loads worklets.

## Reading the result

`node tools/summarise-run.mjs <file>` reports N, the modal digest, the divergence count and
rate, every alternative with the batch/pid/position where it occurred, and the set of peaks
observed. It takes the canonical render to be the **mode of the run** rather than a value
hardcoded in the tool, so it stays correct on a host whose canonical render is not this
one's.

When the count is zero it says so in words: on an idle machine zero is the expected outcome
and is not a negative result. See the scope section of `../README.md`.
