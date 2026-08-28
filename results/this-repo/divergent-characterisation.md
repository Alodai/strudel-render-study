# What the divergent renders of run 2 look like

Every row was produced by `node tools/compare-wav.mjs <canonical> <divergent>`, comparing each
divergent render of `results/this-repo/layer2-run2-192.tsv` against the canonical render
captured in the same run.

Only two WAVs ship with this repository (`audio/`), because 192 renders of 353 KB each is not
a thing to put in a git repository. The rows below were computed from renders that were not
retained. The `e61af896` row **is** checkable end to end — both its files are in `audio/` —
and it is the row the ICLC paper quotes, so the method can be verified on the number that
matters and the rest read as data.

Canonical render: `4f815a0c…`, peak `0.363281`, RMS `0.113467`, 88200 frames, 2ch 44100 Hz.

| digest | first differing frame | of 2 s | samples differing | max delta | RMS ratio | peak |
|---|---|---|---|---|---|---|
| `997707bd` | 83712 / 88200 | 1.898 s | 5.09 % | 37.4 % FS | 1.0098 | equal |
| `e280dae7` | 56064 | 1.271 s | 36.43 % | 48.2 % FS | 1.1177 | equal |
| `7ad95bdf` | 56192 | 1.274 s | 36.29 % | 54.6 % FS | 1.1024 | equal |
| `b68ae060` | 39808 | 0.903 s | 54.86 % | 54.1 % FS | 1.0456 | equal |
| `e61af896` * | 39552 | 0.897 s | 55.15 % | 52.8 % FS | 1.2247 | equal |

\* from an earlier run on the same host; both its WAVs are in `audio/`, so this row is the
one a reader can recompute.

## What holds across these, and what does not

**Holds.** Divergence always begins **partway through** — between 0.90 s and 1.90 s of a 2 s
render — and then continues to the end. The opening is always byte-identical, and the WAV
header always is too. Every render above carries **more** energy than the canonical one
(RMS ratio > 1 in all five), which is the signature of a voice that keeps sounding rather
than one that is dropped.

**Does not hold: severity is not one number.** `997707bd` differs in 5 % of samples with an
RMS ratio of 1.0098; `e61af896` differs in 55 % with a ratio of 1.2247. Quoting only the worst
case overstates the typical severity; quoting only the median hides that it reaches half the
file. Quote the range.

**Does not hold: how much differs and how much extra energy are different axes.**
`b68ae060` differs in 54.86 % of samples — nearly as much of the file as `e61af896` — with an
RMS ratio of 1.0456 against `e61af896`'s 1.2247. A wide difference is not automatically a
loud one.

## One divergent render did NOT have the canonical peak

`results/this-repo/layer2-run1-192.tsv`, batch 1, pid 99343, position 3, digest
`6d63e59e3483b7a4…`, **peak `0.321747`** — lower than the canonical `0.363281`.

This matters because a natural summary of the earlier runs was *"every render was non-silent
with an identical peak, divergent ones included, so nothing structural separates a good render
from a bad one."* That was true of every render observed at the time and it is **not true in
general**: this one render is separable by peak alone.

Its bytes were not retained — run 1 was not launched with `STUDY_WAV_DIR` — so whether it
carries more or less energy overall was **not measured**, and no claim is made about it. It did
not recur in run 2. The row is in the shipped TSV; the observation stands on that alone.
