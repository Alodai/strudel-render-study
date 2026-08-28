# Layer 1 on `@strudel/core` 1.2.6

Layer 1's default pin is **1.2.5**; layer 2 renders through **1.2.6**. That split is
deliberate — 1.2.6 cannot be imported in Node as published (claim 8), and layer 2 needs the
version whose renderer was measured — but it weakens the within-system comparison, because a
reader is entitled to ask whether the two layers are talking about the same engine.

This is that question answered, as an **optional arm**. It does not move the default pin.

```sh
pnpm layer1:126
```

`tools/layer1-126.mjs` installs `@strudel/core@1.2.6` and `@strudel/mini@1.2.6` into `layer1`,
runs the identical layer-1 code, compares against the same `results/layer1-digests.txt`, runs
its controls, and restores the 1.2.5 tree. The `@kabelsalat/web` exports patch that
1.2.6 needs is already in the root manifest, so nothing is toggled to obtain it.

## Result — the three digests are unchanged, byte for byte

```
# host darwin-arm64 node v22.17.1
# span [0, 4) cycles
p1	haps=20	sha256=90a5e26c296287cab14ebe64b2b41d4d503b040d8309c1bb6570ce86c4a0a7d6	"c3 e3 g3 [b3 a3]"
p2	haps=28	sha256=4d4b0d1e8775f3617520c9c2f04f7360fac2a3b5d29df2c36e531be6835593da	"<c3 e3> g3*3 [a3 b3 c4]"
p3	haps=32	sha256=f92aa8de573977d783beae803e9ce239051185aaaed1a2b515df746ea1ff09d0	"c3(3,8) e3(5,8,2)"

p1  MATCH     live=90a5e26c296287ca…  reference=90a5e26c296287ca…
p2  MATCH     live=4d4b0d1e8775f361…  reference=4d4b0d1e8775f361…
p3  MATCH     live=f92aa8de573977d7…  reference=f92aa8de573977d7…
checked 3 patterns, 0 mismatched
```

| | layer 1, default | layer 1, this arm | layer 2 |
|---|---|---|---|
| `@strudel/core` / `@strudel/mini` | 1.2.5 | **1.2.6** | 1.2.6 |
| `fraction.js` | 5.3.4 (pinned by override) | 5.3.4 (same override) | 5.3.4 |
| `@kabelsalat/web` | not in the tree | 0.4.1, patched | 0.4.1, patched |
| p1 / p2 / p3 | reference | **identical** | n/a — layer 2 is the signal layer |

So the layer-1 claim and the layer-2 measurement are about the same pattern engine, and the
1.2.5 pin is a packaging accommodation rather than a semantic one.

## The environment × release grid, with the unmeasured cell marked

Six cells; **five carry evidence and one does not**. It is drawn as a grid so the hole is
visible, not so a full matrix can be inferred from a filled corner.

| environment | `@strudel/core` 1.2.5 | `@strudel/core` 1.2.6 |
|---|---|---|
| `darwin-arm64`, native — host of record | ✅ **run here** — `pnpm layer1` / `pnpm verify:layer1` | ✅ **run here** — `pnpm layer1:126`, 11 arms, both controls fired |
| `linux-x64`, **emulated** — `node:22-bookworm-slim` on `linux/amd64` | ✅ **run here** — `pnpm cross-host` | ⬜ **UNMEASURED** — not run, and no digest is claimed for it |
| `linux-x64`, **native** | 📄 **reported** — transcript, `pnpm verify:transcript` | 📄 **reported** — see below |

Read the three markers as three different things, because they are:

* ✅ **run here** — produced by a command in this repository, on the host of record, with its
  controls in the same run.
* 📄 **reported** — measured on a host this repository cannot reach, and recorded. The 1.2.5
  cell ships its transcript (`measured/layer1-native-linux-x64.txt`) and a checker; the 1.2.6
  cell is a reported observation with its verification described but no transcript here —
  `layer1/node_modules/@strudel/core/package.json` read as 1.2.6, and the check observed
  failing (corrupting p1's reference: `checked 3 patterns, 1 mismatched`, exit 1; `0
  mismatched`, exit 0 after restore).
* ⬜ **UNMEASURED** — nobody ran it. Every digest in the grid is the same three values, and
  that pattern is exactly what invites a reader to fill the hole by inference. Do not: layer 1
  is exactly reproducible, so this cell is cheap to run and worth nothing until someone does.

## The controls were observed firing, and they control different things

One control here would not be enough, because three different things can be wrong: the
comparison can be blind, the digests can be inherited rather than computed, and the digest can
be tracking the *spelling* of a rational rather than its value.

**`A126-REF` — the comparison can fail.** One reference digest corrupted to `deadbeef…`, in a
throwaway **copy** (`verify-layer1.mjs` takes `LAYER1_REF`; the committed reference is never
edited):

```
p1  MISMATCH  live=90a5e26c296287ca…  reference=deadbeef296287ca…
p2  MATCH     p3  MATCH
checked 3 patterns, 1 mismatched            exit 1
```

**`A126-SEM` — the digests can move, on this tree.** A green comparison against a reference is
also what a run that read the reference and printed it back would produce. So one note of p1 is
changed in `patterns/patterns.json` — `a3 → a4` — under 1.2.6:

```
p1  MISMATCH  live=966ab061e82d5b22…  reference=90a5e26c296287ca…
p2  MATCH     p3  MATCH
checked 3 patterns, 1 mismatched            exit 1
```

Same digest the 1.2.5 tree produces for that mutation, which is itself part of the result: the
two releases agree on the mutant as well as on the reference.

**`A126-FRAC` — and they move for the right reason.** Since v1.0.3 `rat()` reduces by gcd, so a
value-preserving `n/d → 2n/2d` inside `fraction.js` must change **nothing** — under 1.2.6 as
under 1.2.5:

```
p1  MATCH     p2  MATCH     p3  MATCH
checked 3 patterns, 0 mismatched            exit 0            (STRUDEL_STUDY_FRACSAB × 1)
```

The marker count is what makes that green worth reading: an unchanged digest is exactly what a
patch that never installed would also produce. See `layer1-normalisation.md` for why this arm
requires green rather than red, and what it used to require.

**`A126-INSTALLED` — the arm really ran on 1.2.6.** The version is read from the **installed**
`package.json`, resolved in a fresh child process, never from the manifest the script just
wrote: a manifest states an intention and an install states a fact, and Node caches resolution
per process, so an in-process read after a reinstall can still name the previous store entry.
If it does not report 1.2.6 the run **aborts** rather than reporting a green over a tree that
was never on 1.2.6.

**`A126-VOID`** requires an empty reference to be refused with exit 2. A comparison with
nothing on one side reports "no mismatches" exactly like a clean one.

## The runner itself was observed failing

Eleven passing arms are not evidence that the runner can report a failure. Mutating the one
line that chooses the version — `setCore(TARGET)` → `setCore(BASE)`, so the script installs
1.2.5 while claiming 1.2.6 — from a committed base:

```
FAIL  A126-INSTALLED  SIGHTING — the installed tree reports 1.2.6
                      expected: @strudel/core and @strudel/mini both 1.2.6 …
                      observed: core 1.2.5, mini 1.2.5
PASS  RESTORE         the default pin and the default tree are back as they were

2 arms, 1 passed, 1 failed
FAILED: A126-INSTALLED
Error: the arm never ran on 1.2.6 — installed core is 1.2.5
                                            exit 1
```

Note what the red demonstrates beyond the exit code: the sighting arm **stops the run**, so
the nine arms behind it never report at all. A green from `A126-DIGESTS` cannot be produced by
a tree that is not on 1.2.6.

The mutation was reverted by marker count and by byte comparison against the committed blob
(the mutation carried a one-off marker comment; count back to 0, `cmp` against `git show HEAD:tools/layer1-126.mjs` clean), not by reading a `git diff` — a pathspec that
matches nothing makes `git diff --quiet` exit 0 over a file that still holds the mutant.

## What this arm does not touch

* **The default pin does not move.** `layer1/package.json` stays at 1.2.5 and `pnpm layer1`
  after this arm is byte-identical to `pnpm layer1` before it — checked, not assumed.
* **`results/layer1-digests.txt` is not edited**, by this arm or by its controls.
* **No layer-2 measurement is re-run or re-recorded.** This is a pattern-layer arm.

`RESTORE` asserts the first of those three from inside the runner: byte-identical manifests,
`patterns/patterns.json` unmutated, the installed tree back at 1.2.5, zero sabotage markers,
and `verify:layer1` green — and it is the one arm that still reports when the run aborts, which
is why it passes in the red-proof above.
