# The layer-1 digest normalises rationals, and used not to

An instrument defect in v1.0.2, its fix in v1.0.3, what happens to the control arm that had
been reporting it correctly for two releases while being read the wrong way up — and the
temporal arm added in v1.0.4, without which the very path the fix touched had no red over it.

## The defect

`layer1/digest.mjs` serialised each hap time straight off the `Fraction`:

```js
export const rat = (f) => `${f.s < 0 ? '-' : ''}${f.n}/${f.d}`;
```

That **inherits** canonical form from `fraction.js` instead of **imposing** it here. The digest
was therefore an identity test on the *serialised representation* — "did fraction.js store
these the same way?" — while every sentence written about it, in this repository and in the
paper, read it as an equality test on the *pattern's rational times* — "are these the same
times?".

The two are indistinguishable for exactly as long as the upstream library happens to reduce,
which `fraction.js@5.3.4` does. Nothing was wrong with any published digest. What was wrong is
that the property they were being cited for was not the property being measured, and the
distance between the two was an upstream implementation detail this repository does not
control.

## The repository already contained the proof, pointing the other way

`patches/fraction.js@5.3.4.patch` doubles both terms after `newFraction` reduces —
value-preserving `n/d → 2n/2d`, representation only. Under v1.0.2 that moved **all three
digests**, and `pnpm controls`' `L1-FRAC` arm demanded exactly that: `verify:layer1 turns RED`.

The arm was firing correctly. It was described as *"the layer-1 digest can see a change in
`fraction.js`"*, which sounds like sensitivity and is actually the defect stated as a feature.
A digest that moves when a library re-writes `1/4` as `2/8` cannot be a claim about times.

## The fix

`rat()` now reduces by gcd before formatting, so canonical form is decided in this repository:

```js
const gcd = (a, b) => { while (b) { const t = a % b; a = b; b = t; } return a; };
export const rat = (f) => {
  const n = f.n < 0n ? -f.n : f.n;
  const d = f.d < 0n ? -f.d : f.d;
  if (d === 0n) throw new Error(`rat(): zero denominator in ${f.n}/${f.d} — this is not a Fraction`);
  const g = gcd(n, d) || 1n;
  return `${f.s < 0 ? '-' : ''}${n / g}/${d / g}`;
};
```

All BigInt; still no floating point anywhere on the path. `gcd(0, d) = d`, so a zero numerator
serialises as `0/1`. A zero **denominator** throws rather than being normalised quietly:
`fraction.js` refuses to construct one, so meeting one here means the value did not come from
where this function assumes.

## What changed, measured

| | v1.0.2 | v1.0.3 | v1.0.4 |
|---|---|---|---|
| `pnpm layer1`, unmutated | `90a5e26c…` `4d4b0d1e…` `f92aa8de…` | **identical, byte for byte** | identical |
| `pnpm cross-host` (emulated `linux-x64`) | 0 mismatched | 0 mismatched, re-run under the change | 0 mismatched |
| representation change (`n/d → 2n/2d`) | **3 mismatched, exit 1** | **0 mismatched, exit 0** | 0 mismatched, exit 0 |
| **temporal change (p1 re-partitioned)** | not run | **not run** | **1 mismatched, exit 1** — `ff808b12…` |
| value change (p1 `a3 → a4`) | 1 mismatched, exit 1 | 1 mismatched, exit 1 | 1 mismatched, exit 1 |

The first row is the one that decides whether this ships: `fraction.js` was already reducing,
so the fix is a **no-op in normal operation**, and `results/layer1-digests.txt` is not edited.
Had it moved a digest, the instruction was to stop and report rather than update the
references — the three values are the reference, and a fix that quietly restates them is not a
fix.

## The control arm inverts, and the replacement is a triple

`L1-FRAC` now requires **GREEN**: *the digest is insensitive to how a rational is stored*. Its
sighting matters more than it did before, not less — an unchanged digest is precisely what a
patch that never installed would also produce, and the check's own output cannot tell them
apart. So `L1-FRAC-INSTALLED` asserts the marker is in the **installed** `fraction.mjs`, beside
its `newFraction` anchor, before the green counts for anything.

But a green arm cannot be the only arm, or the digest could be insensitive to everything. Two
arms turn the check **red**, and they are red about different things:

| arm | the mutation | required |
|---|---|---|
| `L1-FRAC` | **representation** — `fraction.js` stores `2n/2d` for the same rationals | **GREEN**, exit 0 |
| `L1-TIME` | **time** — p1 re-partitioned: `c3 e3 g3 [b3 a3]` → `c3 e3 [g3 b3] a3` | **RED**, exit 1 |
| `L1-SEM` | **value** — one note of p1: `[b3 a3]` → `[b3 a4]` | **RED**, exit 1 |

**That triple is the claim, and no one arm carries it.** Read singly each says much less than
it appears to. `L1-FRAC` green alone is also what a digest insensitive to *everything* would
produce. `L1-SEM` red alone proves the digest sees a changed **note** — it says nothing about a
changed **time**, and time is precisely the path `rat()`'s gcd normalisation touches. From
v1.0.3 to v1.0.4 that path therefore had a green arm over it and no red one, which by this
artefact's own standing rule means it had **not been observed failing**. `L1-TIME` is the arm
that closes that gap. Together the three read: *the digest tracks the pattern's rational times
and its values, and not the spelling either is stored in.*

### `L1-SEM` — the value arm

```
L1-SEM — mutating p1 in patterns/patterns.json: "[b3 a3]" -> "[b3 a4]" …
p1  MISMATCH  live=966ab061e82d5b22…  reference=90a5e26c296287ca…
p2  MATCH     live=4d4b0d1e8775f361…  reference=4d4b0d1e8775f361…
p3  MATCH     live=f92aa8de573977d7…  reference=f92aa8de573977d7…
checked 3 patterns, 1 mismatched                                     exit 1
```

Three details make it an arm rather than an assertion. It mutates **`patterns/patterns.json`**,
the file every harness reads, so it exercises the shipped path end to end instead of an
in-process rebuild of it. It **sights the mutation first** — the string present exactly once,
the write readable back — because a red from a mutation that did not land is a red about
something else. And it asserts **which** pattern moved and to what (`966ab061…`, with p2 and p3
holding), because a red naming p2 would be a different event wearing the same exit code.

### `L1-TIME` — the temporal arm, added in v1.0.4

The mutation re-partitions p1 without changing what is played:

```
L1-TIME — mutating p1 in patterns/patterns.json: "c3 e3 g3 [b3 a3]" -> "c3 e3 [g3 b3] a3" …
p1  MISMATCH  live=ff808b1237143162…  reference=90a5e26c296287ca…
p2  MATCH     live=4d4b0d1e8775f361…  reference=4d4b0d1e8775f361…
p3  MATCH     live=f92aa8de573977d7…  reference=f92aa8de573977d7…
checked 3 patterns, 1 mismatched                                     exit 1
```

The same five notes, in the same order, over the same four cycles. What moves is where the
rational boundaries between them fall: `g3` and `b3` become a subdivided step and `a3` becomes
a whole one. It carries the same sightings as `L1-SEM` — the string present exactly once, the
write readable back, `p1` named and `p2`/`p3` held — and two more of its own:

* **`L1-TIME-HAPS` asserts the hap count is unchanged at 20.** Without it, a red would be
  consistent with the digest noticing that there are now a different *number* of events, which
  is a structural change, not a temporal one. The arm has to be the times and only the times.
* **`L1-TIME-BLOB` requires the working file to equal `HEAD:patterns/patterns.json` before
  anything is written.** Restore is from the **committed blob**, and verified by content — the
  file byte-identical to the blob and `verify:layer1` back to exit 0. Restoring a *dirty* file
  from `HEAD` would silently discard an edit, so if the working file and the blob differ the
  arm refuses to mutate at all and reports `L1-TIME` as failed rather than taking that risk.

## What is *not* available as an arm, and why that is stated rather than hidden

The natural third arm would be to change a rational's **value** inside `fraction.js` and watch
the digest move — sensitivity proved at the same layer where insensitivity was proved. It is
not available. Two forms were built as patches against the same line the representation patch
touches, so the arms differ in exactly one thing, and both were run with the marker confirmed
present in the installed tree:

| patch | marker in installed tree | result |
|---|---|---|
| `patches/fraction.js@5.3.4.valmut-n-plus-1.patch` — `f.n += 1n` | × 1, anchor sighted | **exit 134**, `JavaScript heap out of memory` after ~65 s |
| `patches/fraction.js@5.3.4.valmut-d-subset.patch` — `f.d *= 2n` where `n` is odd | × 1, anchor sighted | **exit 134**, `JavaScript heap out of memory` after ~55 s |

Both printed the `# host` and `# span` header lines and then **no digest line at all**, so both
died inside `queryArc` rather than producing a different digest. That is the observation and it
is where it stops: corrupting the arithmetic Strudel's query loop advances on does not yield a
wrong answer, it yields no answer. Why it allocates unboundedly is a hypothesis this repository
has not tested and does not assert.

**Both patches ship** so the observation is re-derivable, and neither is applied by default.
**They are unkind to run**: each takes about a minute to reach a 4 GB heap and die. That is the
failure mode, not a bug in the patch.

The honest scope statement, therefore: sensitivity to a change in the *pattern's* values is
proved (`L1-SEM`), and so is sensitivity to a change in the *pattern's* times (`L1-TIME`);
insensitivity to how those times are *stored* is proved the other way up (`L1-FRAC`). What is
not provable by any arm that could be built here is sensitivity to a change in a value produced
*inside* `fraction.js`, because that library is load-bearing for termination and not only for
arithmetic.
