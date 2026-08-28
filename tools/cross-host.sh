#!/usr/bin/env bash
# Run layer 1 on linux-x64 in Docker and compare against results/layer1-digests.txt.
#
# The point of layer 1 is that it is host-independent, and that is a claim about hosts, so it
# needs a second one. This uses node:22-bookworm-slim on linux/amd64 — a different OS, libc,
# architecture target and Node build from the darwin-arm64 host of record.
#
# On Apple silicon the amd64 image is CPU-EMULATED. That is sound *here* and would not be for
# layer 2: layer 1 executes no floating point at all — hap times are exact Fractions over
# BigInt, serialised as n/d and never through valueOf() — so emulation cannot be the variable,
# while OS, libc, arch target and Node build genuinely differ. Layer 2 is about timing under
# contention, which emulation confounds directly, which is why there is no cross-host layer 2.
#
#   bash tools/cross-host.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

OUT="$(docker run --rm --platform linux/amd64 -v "$ROOT":/study:ro -w /work node:22-bookworm-slim bash -c '
set -e
cp -r /study/layer1 /work/layer1 && cp -r /study/patterns /work/patterns
cd /work/layer1
cat > package.json <<J
{ "type": "module", "dependencies": { "@strudel/core": "1.2.5", "@strudel/mini": "1.2.5" }, "overrides": { "fraction.js": "5.3.4" } }
J
npm install --silent --no-audit --no-fund >/dev/null 2>&1
echo "# glibc $(ldd --version | head -1 | grep -oE "[0-9]+\.[0-9]+$")"
echo "# fraction.js $(node -e "console.log(require(\"/work/layer1/node_modules/fraction.js/package.json\").version)") @strudel/core $(node -e "console.log(require(\"/work/layer1/node_modules/@strudel/core/package.json\").version)")"
cd /work && node layer1/run.mjs 2>/dev/null | grep -E "^(#|p[0-9])"
')"

echo "$OUT"
echo
# Compare digest lines against the reference. A comparison that finds no lines to compare
# would report "no mismatches" exactly like a clean one, so the count is asserted first.
REF="$ROOT/results/layer1-digests.txt"
n=0; bad=0
while IFS= read -r line; do
  name=$(printf '%s' "$line" | cut -f1)
  sha=$(printf '%s' "$line" | cut -f3)
  want=$(grep "^${name}	" "$REF" | cut -f3)
  n=$((n + 1))
  if [ "$sha" = "$want" ]; then echo "$name  MATCH     $sha"
  else echo "$name  MISMATCH  linux=$sha  reference=$want"; bad=$((bad + 1)); fi
done < <(printf '%s\n' "$OUT" | grep -E '^p[0-9]')

[ "$n" -gt 0 ] || { echo "VOID: the container produced no digest lines — nothing was compared"; exit 2; }
echo "compared $n patterns, $bad mismatched"
[ "$bad" -eq 0 ] || exit 1
