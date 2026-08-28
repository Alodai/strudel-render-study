# Upstream reports — FILED 2026-08-28

Three reports, written for the trackers named in each, and **all three filed on 2026-08-28**.
They are kept here because a study that found these things and told nobody would be a worse
artefact, and because they carry the minimal reproductions in the form a maintainer would want.

| file | filed as | subject |
|---|---|---|
| `kabelsalat-exports.md` | [froos/kabelsalat#112](https://codeberg.org/froos/kabelsalat/issues/112) | `@kabelsalat/web@0.4.1` publishes no `exports` map, so Node resolves an IIFE bundle and `@strudel/core@1.2.6` cannot be imported in Node at all |
| `strudel-renderPatternAudio.md` | [uzu/strudel#2116](https://codeberg.org/uzu/strudel/issues/2116) | `renderPatternAudio` resolves to `undefined` and delivers only via a DOM download; and it does not call `registerSynthSounds()`, so a naive call renders a structurally perfect silence |
| `superdough-nondeterminism.md` | [uzu/strudel#2117](https://codeberg.org/uzu/strudel/issues/2117) | offline render is not deterministic under host load |

Each was written against the repository that actually publishes the package, verified rather
than guessed: npm holds no `repository` field for any `@kabelsalat/*` package, and two
plausible tracker URLs do not exist.

## The filed text is not byte-identical to these files

**What was filed is the technical content of each document without its research-trail
preamble** — the `Target — CONFIRMED:` block at the head of each file, which records how the
tracker was located and why the obvious guesses were wrong. That is an account of our own
work, addressed to this repository's reader; it is not something a maintainer of the project
needs in their inbox, so it was removed before filing.

Every claim, number, table and repro in each document was filed as it stands here. But these
files are the artefact's copies, not transcripts of the issues, so read the linked issue if
you need the exact text a maintainer received.

---

## What was corrected before filing

`superdough-nondeterminism.md` **was corrected in place before it was filed.** Two of its
generalisations did not survive a larger sample, and both were fixed in the document itself rather
than annotated beside it — because a draft that gets sent is not a historical record, and a
correction the reader meets *after* the claim is not a correction. The filed issue carries the
corrected text.

| was | is now | why |
|---|---|---|
| "every render had an identical peak of `0.363281`, so nothing structural distinguishes a good render from a bad one" | 25 of the 26 divergent renders share that peak; one (`6d63e59e…`, peak `0.321747`) does not, and is named | The generalisation was true of every render observed at the time and is false in general |
| "Disabling pool reuse does not fix it" | "did not remove the divergence, and did not produce a reduction we can distinguish from noise — the pool is not cleared as a suspect" | With four unmutated runs the range is 5–9 of 192, so the mutated run of 4 sits at the edge of that spread, not clearly outside it |
| "9 of 192 (6 distinct digests)", pooled 15/384, Fisher exact p-values | 26 of 768 across four runs, 15 distinct outputs, **no significance test at all** | Concurrent renders on one machine are not independent trials; a Fisher test or a binomial interval applies an assumption we know to be false |

Every figure in the corrected draft is recomputable from `../results/`. The draft now also points
maintainers at the public artefact and tells them to read its scope section first — on an idle
machine the expected outcome is zero divergences, and zero is not a refutation.

`kabelsalat-exports.md` and `strudel-renderPatternAudio.md` needed no correction: every claim in
them was reproduced exactly while building this repository (`exports=881`, 0 export statements in
`dist/index.js` against 1 naming `SalatRepl` in `dist/index.mjs`, the `undefined` return, the
352844-byte non-silent WAV recovered at the DOM sink, and the silent-render failure mode).

## If you are looking at a copy of these files somewhere else

An earlier, uncorrected copy of all three drafts exists in the Alodai monorepo at
`docs/papers/ICLC-2027/strudel-cross-layer/upstream/`. **This directory is the authoritative
copy.** The monorepo copy carries the two falsified claims above; it is not what was filed,
and it must not be quoted as though it were.
