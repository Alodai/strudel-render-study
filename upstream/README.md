# Draft reports — NOT SENT

Three drafts, written for the trackers named in each. **None has been sent.** They are here
because a study that found these things and told nobody would be a worse artefact, and
because they carry the minimal reproductions in the form a maintainer would want.

| file | tracker | subject |
|---|---|---|
| `kabelsalat-exports.md` | codeberg.org/froos/kabelsalat | `@kabelsalat/web@0.4.1` publishes no `exports` map, so Node resolves an IIFE bundle and `@strudel/core@1.2.6` cannot be imported in Node at all |
| `strudel-renderPatternAudio.md` | codeberg.org/uzu/strudel | `renderPatternAudio` resolves to `undefined` and delivers only via a DOM download; and it does not call `registerSynthSounds()`, so a naive call renders a structurally perfect silence |
| `superdough-nondeterminism.md` | codeberg.org/uzu/strudel | offline render is not deterministic under host load |

Each was written against the repository that actually publishes the package, verified rather
than guessed: npm holds no `repository` field for any `@kabelsalat/*` package, and two
plausible tracker URLs do not exist.

---

## Correction to `superdough-nondeterminism.md` before it is sent

The draft was written from two runs of 192. This repository has since added two more, and
**two of its generalisations do not survive the larger sample.** Fix these before sending.

**1. "Every render had an identical peak of `0.363281`" — false.** One divergent render in
`results/this-repo/layer2-run1-192.tsv` (batch 1, pid 99343, position 3, digest
`6d63e59e3483b7a4…`) has peak **`0.321747`**. The claim that nothing structural separates a
good render from a bad one is therefore too strong: that one is separable by peak alone. Its
bytes were not retained, so nothing is claimed about its energy.

**2. "Not the node pool" — overstated; say "weakened, not eliminated".** The draft reports
4 of 192 under disabled pool reuse against 9 of 192 unmutated. With four unmutated runs now
available the range is 5–9 of 192, so a mutated run of 4 sits at the edge of the unmutated
spread rather than clearly inside it. The evidence does not support "disabling pool reuse
does not fix it" as flatly as written. It supports: disabling pool reuse did not remove the
divergence, and did not produce a reduction distinguishable from run-to-run variation.

**3. The figures that DO hold**, and can be strengthened: the divergence rate over four
unmutated runs of 192 on one host is 9 / 6 / 6 / 5, i.e. 26 of 768. Every characterised
divergent render carries more energy than the canonical one, and every one is byte-identical
for its opening 0.9–1.9 s. Alternative outputs recur across independent runs — `997707bd` in
four of five, `9d9c38ce` four times within one run — which is the strongest single argument
that this is a discrete race and not drift.

The drafts are left otherwise as written, so the correction is visible as a correction rather
than quietly folded in.
