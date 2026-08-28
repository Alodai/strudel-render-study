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
two negative controls, and restores the 1.2.5 tree. The `@kabelsalat/web` exports patch that
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

## Both controls were observed firing, and they control different things

One control here would not be enough, because two different things can be broken. The
comparison can be blind, and the digests can be inherited rather than computed.

**`A126-REF` — the comparison can fail.** One reference digest corrupted to `deadbeef…`, in a
throwaway **copy** (`verify-layer1.mjs` takes `LAYER1_REF`; the committed reference is never
edited):

```
p1  MISMATCH  live=90a5e26c296287ca…  reference=deadbeef296287ca…
p2  MATCH     p3  MATCH
checked 3 patterns, 1 mismatched            exit 1
```

**`A126-FRAC` — the digests can move.** A green comparison against a reference is also what
you would get from a run that read the reference and printed it back. So `fraction.js` is
sabotaged **under 1.2.6** with the value-preserving `n/d → 2n/2d` patch, and all three digests
must move:

```
p1  MISMATCH  live=fd03bb3b1bca172e…  reference=90a5e26c296287ca…
p2  MISMATCH  live=5f350a6c15ac3271…  reference=4d4b0d1e8775f361…
p3  MISMATCH  live=51b1f09f454a8aae…  reference=f92aa8de573977d7…
checked 3 patterns, 3 mismatched            exit 1
```

and go back after the revert (`markers 0, exit 0`).

**`A126-INSTALLED` — the arm really ran on 1.2.6.** The version is read from the **installed**
`package.json`, resolved in a fresh child process, never from the manifest the script just
wrote: a manifest states an intention and an install states a fact, and Node caches resolution
per process, so an in-process read after a reinstall can still name the previous store entry.
If it does not report 1.2.6 the run **aborts** rather than reporting a green over a tree that
was never on 1.2.6.

**`A126-VOID`** requires an empty reference to be refused with exit 2. A comparison with
nothing on one side reports "no mismatches" exactly like a clean one.

## The runner itself was observed failing

Eight passing arms are not evidence that the runner can report a failure. Mutating the one
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
the six arms behind it never report at all. A green from `A126-DIGESTS` cannot be produced by
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
the installed tree back at 1.2.5, zero sabotage markers, and `verify:layer1` green.
