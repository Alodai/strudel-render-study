#!/usr/bin/env bash
# Arm B of the pool experiment, as a PATCH against the installed package — superdough is
# never vendored into this repository. `patches/superdough@1.3.0.patch` inserts one line into
# getNodeFromPool so a pooled node is never reused; the arm is OFF by default (arm A = as
# published), and this script toggles the pnpm.patchedDependencies entry that turns it on.
#
#   pnpm pool:status   what is actually installed right now
#   pnpm pool:apply    arm B  — no pool reuse
#   pnpm pool:revert   arm A  — superdough as published
#
# Every mode ends by reading the INSTALLED file, not the manifest: the manifest states an
# intent, and only the marker count says what a render will actually execute.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
KEY='superdough@1.3.0'
PATCH="patches/superdough@1.3.0.patch"
MARKER='STRUDEL_STUDY_NOPOOL'

installed_file() {
  node -e "
    const {createRequire}=require('module');
    const r=createRequire('$ROOT/layer2/package.json');
    console.log(require('path').join(require('path').dirname(r.resolve('superdough/package.json')),'nodePools.mjs'));
  "
}

# POSITIVE ARM: the file must be readable and must contain getNodeFromPool at all. A marker
# count of 0 from a file we could not read is indistinguishable from an unpatched tree.
report() {
  local f; f="$(installed_file)"
  [ -r "$f" ] || { echo "UNREADABLE $f — ABORT"; exit 1; }
  local anchors markers
  anchors=$(grep -c 'getNodeFromPool' "$f" || true)
  markers=$(grep -c "$MARKER" "$f" || true)
  [ "$anchors" -gt 0 ] || { echo "SIGHTING FAILED: no getNodeFromPool in $f — ABORT"; exit 1; }
  echo "installed:  $f"
  echo "sighting:   getNodeFromPool occurrences = $anchors (>0, so the reader can see this file)"
  echo "marker:     $MARKER occurrences = $markers"
  if [ "$markers" -gt 0 ]; then echo "ARM:        B — pool reuse DISABLED"
  else echo "ARM:        A — superdough as published"; fi
}

set_entry() {  # $1 = add | remove
  node -e "
    const fs=require('fs'); const j=JSON.parse(fs.readFileSync('package.json','utf8'));
    j.pnpm.patchedDependencies = j.pnpm.patchedDependencies || {};
    if ('$1'==='add') j.pnpm.patchedDependencies['$KEY']='$PATCH';
    else delete j.pnpm.patchedDependencies['$KEY'];
    fs.writeFileSync('package.json', JSON.stringify(j,null,2)+'\n');
  "
}

case "${1:-status}" in
  apply)
    [ -f "$PATCH" ] || { echo "missing $PATCH — ABORT"; exit 1; }
    set_entry add; pnpm install --silent; report
    grep -q "$MARKER" "$(installed_file)" || { echo "APPLY FAILED — marker absent after install"; exit 1; } ;;
  revert)
    set_entry remove; pnpm install --silent; report
    if grep -q "$MARKER" "$(installed_file)"; then echo "REVERT FAILED — marker still present"; exit 1; fi ;;
  status) report ;;
  *) echo "usage: $0 {apply|revert|status}" >&2; exit 2 ;;
esac
