# strudel-render-study

A two-layer reproducibility study of [Strudel](https://strudel.cc), run on Strudel's own code.

**Layer 1 — the pattern layer.** Query a pattern to haps, serialise the exact rationals,
digest. Deterministic, host-independent, and **exactly reproducible**: you get the digests in
this repository or something is wrong.

**Layer 2 — the signal layer.** Render the same pattern to audio through Strudel's own
`renderPatternAudio`, many times, concurrently. On this host it is **not** reproducible.
Across four runs of 192 renders each, 26 of 768 produced different audio, and 15 distinct
outputs have been observed for one fully deterministic pattern.

This repository is the companion artefact to the ICLC 2027 submission's *Running it on
Strudel* section. It contains the patterns, the harness, the protocol, the per-batch results,
the controls, and both arms of the one experiment that tried to name a cause and failed.

---

## Scope — read this before any number below

**Layer 1 is exactly reproducible.** `pnpm layer1` must print the three digests in
`results/layer1-digests.txt`, on any host, every time. `pnpm verify:layer1` checks it and
exits non-zero if not. If your digests differ, that is a real disagreement worth reporting —
it is not expected variance, and there is no tolerance to widen.

**Layer 2 is not reproducible, and it is not reproducible in the weaker sense either: it is
a stochastic observation, not a fixed result.** What is claimed is that on one host, under
8-way concurrency, a fully deterministic pattern rendered through Strudel's own offline path
sometimes produced different bytes. What is **not** claimed is a rate you should expect to
reproduce.

Concretely, running `pnpm layer2` yourself:

* You should **not** expect the same six digests, the same count, or the same rate.
* On a **loaded** machine you should expect to observe divergence at *some* rate. The four
  runs here span 2.60 % to 4.69 % on one machine, and that spread is itself the point.
* On an **idle** machine you should expect **zero**, and zero is exactly what serial runs
  produced here (20/20, 20 pairs, 36 under forced GC pressure — all identical).
* **If you see zero, that is not a refutation.** It is the expected outcome of the condition
  you ran under. It means your machine was not contended enough during the run, and the only
  honest conclusion is that this particular run observed nothing. The summariser says so in
  those words when the count is zero, so a clean run cannot be mistaken for a negative result.
* Correspondingly, seeing divergence once does not establish a rate. Rates here are reported
  per run, with the load average of that run, and never pooled into a single headline number.

**No confidence interval is given, deliberately.** A binomial interval assumes independent
trials. These renders are not independent: they are concurrent processes on one machine
contending for the same resources, which is the mechanism under study. Presenting a
`k/N ± ...` would be arithmetic applied to an assumption known to be false. Instead the
**per-batch, per-process, per-position rows are published** in `results/`, so a reader who
wants to model the dependence structure has the data to do it. That analysis is not done here.

**What was measured, and on what.**

| | |
|---|---|
| host of record | `darwin-arm64` (Apple silicon), macOS, Node 22.17.1 |
| the four layer-2 runs | 192 renders each, 8-way concurrency, load average 13.7–35.3 at start |
| layer 1 also confirmed on | `linux-x64`, Node 22.23.2, glibc 2.36 — identical digests |
| layer 2 on a second host | **not run** — see below |

Layer 2 was **not** measured cross-host. The available second host was CPU-emulated, which
confounds precisely the variable layer 2 is about; and reaching Strudel's renderer there would
have meant replicating more scaffolding, moving further from Strudel's own code. Layer 1 is
sound on an emulated host for the opposite reason: it executes no floating point at all, so
emulation cannot be the variable, while OS, libc, arch target and Node build genuinely differ.
That asymmetry — the same host does not license a layer-2 claim, and an emulated host does not
disqualify a layer-1 one — is the methodological point, so it is stated rather than buried.

**The cause is unidentified.** Three candidate mechanisms were tested and are recorded so
nobody restarts there:

| candidate | status | evidence |
|---|---|---|
| `node-web-audio-api` itself | **set aside** | 96 concurrent direct `OfflineAudioContext` renders, with and without a live `AudioWorkletNode`, at *higher* load: 1 digest each arm |
| superdough's `WeakRef` node pool | **weakened, not eliminated** | pool reuse disabled: 4 of 192 still diverged. Fewer than the 9 of the run it was compared against, but at higher load, and the runs here range 5–9 anyway |
| `isNodeAlive`'s clock | **set aside** | `OfflineAudioContext.currentTime` measured at `0` throughout scheduling, so `now < end + 0.45` is constant and cannot be the varying input |

"Weakened, not eliminated" is the honest reading of the pool arm and it is weaker than the
earlier phrasing of this result: with four unmutated runs now spanning 5–9 divergences out of
192, a mutated run of 4 is at the edge of that spread rather than clearly outside it. **Both
arms ship** (`pnpm pool:apply` / `pnpm pool:revert`) so the experiment can be repeated rather
than believed.

**On `renderPatternAudio`'s interface.** It is described here, not judged. It builds an
`OfflineAudioContext`, calls `startRendering()`, encodes a WAV, and delivers it by creating an
object URL, attaching it to an anchor and clicking it; the promise resolves to `undefined`.
That is a reasonable shape for the REPL it was written for, where a file download is the
intended outcome. The bytes are recoverable outside a browser by supplying the DOM surface it
reaches for and intercepting `URL.createObjectURL`, which is what `layer2/sink.mjs` does.
Strudel is not modified. One consequence is worth knowing before writing a harness of your
own: `renderPatternAudio` does not call `registerSynthSounds()`, so a naive call drops every
voice and still produces a structurally perfect, correctly-sized, entirely silent WAV — which
is why every arm here checks the peak.

---

## Claim → procedure → control

| # | claim | procedure | control |
|---|---|---|---|
| 1 | Layer-1 digests are exact and stable | `pnpm layer1` — query each pattern over `[0,4)`, serialise `whole`/`part` bounds as exact BigInt rationals, sort to a total order, sha256 | 4 mutation arms (`L1-M1..M4`) each move the digest; a positive arm (`L1-P`) re-queries unmutated and reproduces it. `M4` reverses row order alone, proving the sort is load-bearing |
| 2 | The layer-1 digest can see a change in `fraction.js` | `pnpm controls` applies `patches/fraction.js@5.3.4.patch`, a value-preserving `n/d → 2n/2d`, and re-runs the check | `L1-FRAC` — the check must turn **RED** (exit 1) under the patch and green again after revert; `L1-FRAC-INSTALLED` proves the patch reached the installed tree before the red is believed |
| 3 | Layer-1 digests are identical across hosts | Same command on `darwin-arm64`/Node 22.17.1 and `linux-x64`/Node 22.23.2/glibc 2.36 | Layer 1 executes no floating point, so emulation cannot be the variable; a one-note change on the second host moved `p1` alone and left `p2`/`p3` identical |
| 4 | Strudel's renderer returns nothing and delivers via a DOM click | `layer2/controls/f1-sink.mjs` intercepts `URL.createObjectURL` and records the resolved value | `L2-F1-POS` — the bytes must be valid RIFF/WAVE with exactly `(end−begin)/cps × sampleRate` frames and a non-silent peak. The arm was **observed failing first**: the first attempt reported `peak 0.000000` because sounds were unregistered, and the finding would have been reported over a render that never happened |
| 5 | Layer-2 renders diverge under concurrency | `pnpm layer2` — 8 batches × 8 concurrent processes × 3 renders, digest each WAV, one row per render | The protocol **aborts** if it records fewer rows than it launched, so a short run cannot be read as a clean one; the summariser names the modal digest rather than hardcoding one; every peak is published beside every digest |
| 6 | The divergence is not floating-point noise | `tools/compare-wav.mjs` on the two WAVs in `audio/` | Byte-identical header and opening, first difference at frame 39552 of 88200, 55.15 % of samples differing, max delta 52.8 % of full scale — recomputable from the shipped files |
| 7 | It is not a generic property of the audio library | `pnpm isolation` and `pnpm isolation:worklet` — an `OfflineAudioContext` driven directly with a fixed 10-voice schedule, no Strudel | `L2-WK-SIGHTED` — a transparent worklet produces the same bytes as no worklet, which is also what a worklet that never engaged would produce. `WK_GAIN=0.5` must halve the peak exactly and `0.0` must silence it, or the arm is void |
| 8 | `@strudel/core@1.2.6` cannot import in Node as published | `pnpm controls` toggles the `@kabelsalat/web` patch and probes the import three times | `L2-F2-A/B/C` — as-published FAILS, `+exports` only PASSES, reverted FAILS again; `L2-F2-POS` proves `dist/index.js` really has 0 export statements and `dist/index.mjs` has one naming `SalatRepl`, so "no exports map" is the explanation and not a guess |
| 9 | Disabling superdough's node-pool reuse does not remove the divergence | `pnpm pool:apply`, then the same 192-render protocol | `L2-POOL-B` requires the marker present in the **installed** file and a still-non-silent render; `L2-POOL-A` requires marker count 0 after revert. Both read the installed file, never the manifest |
| 10 | Every mutation and restore in this repo is reversible | `pnpm controls` snapshots `package.json` and restores it in a `finally` | `RESTORE` — the manifest must be byte-identical to the snapshot, the reinstall must succeed, and **both** mutation markers must count 0 in the installed trees |

---

## Running it

Requires Node ≥ 22 (`node-web-audio-api` needs it) and pnpm.

```sh
pnpm install
pnpm layer1        # exact — must match results/layer1-digests.txt
pnpm verify:layer1 # the above as a check, exit 0/1
pnpm controls      # every arm, PASS/FAIL, exits non-zero if any fails
pnpm layer2        # the concurrency protocol, N=192 — stochastic, read Scope first
pnpm versions      # regenerate results/versions.md from the installed tree
```

`pnpm controls` reinstalls several times (it toggles patches) and takes a couple of minutes;
`pnpm controls:fast` skips those arms. `OUT=results/mine.tsv pnpm layer2` writes and
summarises a run; `BATCHES=2 pnpm layer2` runs a shorter one.

## What is here

```
patterns/patterns.json     the three patterns, as data — every harness reads this file
layer1/                    the pattern-layer digest, its controls, its dependency set
layer2/                    the render harness, the DOM-sink recovery, the isolation arms
protocol/                  the concurrency protocol, one shape for every subject
patches/                   diffs against installed packages — nothing is vendored
results/measured/          the runs the paper cites, one row per render, with batch derived
results/this-repo/         two further runs, produced by this repository as it stands
audio/                     one canonical and one divergent render, for checking the comparison
upstream/                  three unsent draft reports to the Strudel and kabelsalat trackers
tools/                     the checkers, the summariser, the WAV comparison
```

## Layer 1 — the result

```
p1  c3 e3 g3 [b3 a3]          90a5e26c296287cab14ebe64b2b41d4d503b040d8309c1bb6570ce86c4a0a7d6
p2  <c3 e3> g3*3 [a3 b3 c4]   4d4b0d1e8775f3617520c9c2f04f7360fac2a3b5d29df2c36e531be6835593da
p3  c3(3,8) e3(5,8,2)         f92aa8de573977d783beae803e9ce239051185aaaed1a2b515df746ea1ff09d0
```

Identical on `darwin-arm64`/Node 22.17.1 and `linux-x64`/Node 22.23.2/glibc 2.36. Hap times
are exact `Fraction`s over `BigInt` and are serialised as `n/d`, never through `valueOf()`;
verified reduced (`[a3 a3]*3` yields `1/3`, `1/2`, not `2/6`, `3/6`).

## Layer 2 — the result

Four runs of the identical protocol on the host of record, unmutated tree. `results/` carries
one row per render: batch, pid, position within the process, digest, peak.

| run | file | load before → after | N | divergent | rate | distinct alternatives |
|---|---|---|---|---|---|---|
| A | `measured/layer2-runA-192.tsv` | 35.3 → 55.1 * | 192 | 9 | 4.69 % | 5 |
| B | `measured/layer2-runB-192.tsv` | 16.2 → … * | 192 | 6 | 3.13 % | 6 |
| 1 | `this-repo/layer2-run1-192.tsv` | 17.4 → 20.1 | 192 | 6 | 3.13 % | 5 |
| 2 | `this-repo/layer2-run2-192.tsv` | 14.5 → 17.4 | 192 | 5 | 2.60 % | 4 |
| | **all four** | | **768** | **26** | **3.39 %** | **14 distinct alternatives, 15 outputs in all** |

\* Runs A and B predate this repository's protocol script, which now writes the load average
into the run file itself. Their load figures come from the notes taken at the time and are
**not** recoverable from the shipped TSVs; runs 1 and 2 carry theirs in their own header
lines. Treat the two starred figures as reported rather than as data in this repository.

Read the pooled row as a description of these 768 renders on this machine, not as an estimate
of a parameter — see Scope.

**It is not the first render of a process.** Divergences occur at positions 1, 2 and 3 alike;
the per-row `position` column is there so this is checkable rather than asserted.

**Alternative outputs recur** — across separate runs and across processes — which points at a
discrete race with a bounded outcome set rather than floating-point drift: drift would not
repeat a digest. 6 of the 15 alternatives occur in more than one run (`997707bd` in four of
the five), and `9d9c38ce` occurred four times inside run A alone. The full matrix is
`results/digest-census.md`, generated by `pnpm census`.

The set is **not** demonstrably closed. Runs 1 and 2 each contributed outputs never seen
before, so the claim is that at least 15 distinct outputs exist for this pattern, not that
these are all of them.

**What the wrong renders sound like:** `results/this-repo/divergent-characterisation.md`.
Every one carries *more* energy than the canonical render and every one is byte-identical for
its opening 0.9–1.9 s — the signature of a voice that keeps sounding, not one that is dropped.
One render is a documented exception to the "identical peak" summary and is written up there.

**The comparison arms.**

| arm | file | n | distinct digests |
|---|---|---|---|
| direct `OfflineAudioContext`, no Strudel | `measured/isolation-nwa-48.tsv` | 48 | **1** |
| ... routed through a live `AudioWorkletNode` | `measured/isolation-nwa-worklet-48.tsv` | 48 | **1** |
| serial renders under forced small heaps | `measured/gc-arm-36-serial.txt` | 36 | **1** |
| superdough with pool reuse disabled | `measured/layer2-poolarmB-192.tsv` | 192 | 5 (4 divergent) |

## A comparison the paper draws, which this repository does not contain

The ICLC paper contrasts this against its own frozen render artefact, which reproduced
192/192 under the same protocol on the same host at comparable load. That artefact is a
**separate, separately cited object**; it is not vendored here, was not modified, and is not
re-run by anything in this repository. `results/measured/artefact-reproduce-192.txt` is the
log of that run, included as evidence for the contrast and clearly not as part of this
artefact's own reproducible surface. Nothing in this repository can regenerate it.

## Upstream

`upstream/` holds three draft reports — to the kabelsalat tracker for the missing `exports`
map, and to the Strudel tracker for `renderPatternAudio`'s interface and for the render
divergence. **They have not been sent.** They are included because a study that found these
things and told nobody would be a worse artefact, and because the drafts contain the minimal
reproductions in the form a maintainer would want them.

## Versions

`results/versions.md`, generated by `pnpm versions` from the installed tree.
`pnpm-lock.yaml` pins everything. In short: `@strudel/core`/`@strudel/mini` 1.2.5 for layer 1
and 1.2.6 for layer 2, `@strudel/webaudio` 1.3.0, `superdough` 1.3.0, `node-web-audio-api`
2.1.0, `fraction.js` 5.3.4 (pinned by override — `@strudel/core` declares `^5.2.1`, which
admitted 7 versions), `@kabelsalat/web` 0.4.1 patched.

Layer 1 pins 1.2.5 because 1.2.6 cannot be imported in Node as published (claim 8); layer 2
uses 1.2.6 with the one-field patch, because that is the version whose renderer was measured.

## Licence and citation

Apache-2.0. See `LICENSE` and `CITATION.cff`.

Strudel, superdough and kabelsalat are the work of the Strudel contributors and are not
included here — only patches against their published packages. Strudel and superdough are
AGPL-3.0; `patches/superdough@1.3.0.patch` is a one-line diff against `superdough@1.3.0` and
is licensed under that package's own terms, not this repository's.
