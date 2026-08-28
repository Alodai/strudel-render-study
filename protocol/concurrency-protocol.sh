#!/usr/bin/env bash
# The concurrency protocol. One shape for every subject, so that only the subject varies.
#
#   BATCHES x WIDTH concurrent processes, each performing RENDERS renders of the same
#   pattern. Every batch is started together and waited on before the next begins.
#
# Defaults reproduce the protocol the recorded results were measured under:
#   WIDTH=8   BATCHES=8   RENDERS=3   ->  N = 192
# 8-way is the width at which divergence first appeared; it is held fixed across subjects so
# the arms are comparable.
#
#   pnpm layer2                                  Strudel's renderPatternAudio, N=192
#   BATCHES=2 pnpm layer2                        a shorter run, N=48
#   OUT=results/my-run.tsv pnpm layer2           write a file and summarise it
#   STUDY_WAV_DIR=/tmp/wavs pnpm layer2          also keep one WAV per distinct render
#   pnpm isolation            OfflineAudioContext driven directly, no Strudel at all
#   pnpm isolation:worklet    ... with the voices routed through a live AudioWorkletNode
#
# The load average is printed before AND after, because it is the independent variable:
# a run whose load is not reported cannot be compared with another run. Divergence is
# contention-dependent. On an idle machine the expected outcome is zero — read the scope
# section of README.md before concluding anything from a clean run.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SUBJECT="${1:-strudel}"
WIDTH="${WIDTH:-8}"
BATCHES="${BATCHES:-8}"
RENDERS="${RENDERS:-3}"
OUT="${OUT:-}"

case "$SUBJECT" in
  strudel)           CMD=(node layer2/render-n.mjs "$RENDERS") ;;
  isolation)         CMD=(node layer2/isolation.mjs)           ; RENDERS=1 ;;
  isolation-worklet) CMD=(node layer2/isolation.mjs worklet)   ; RENDERS=1 ;;
  *) echo "unknown subject: $SUBJECT (strudel|isolation|isolation-worklet)" >&2; exit 2 ;;
esac

N=$((WIDTH * BATCHES * RENDERS))
load() { uptime | sed 's/.*averages*: //'; }
emit() { if [ -n "$OUT" ]; then cat >> "$OUT"; else cat; fi; }
[ -n "$OUT" ] && : > "$OUT"

{
  echo "# subject=$SUBJECT width=$WIDTH batches=$BATCHES renders_per_proc=$RENDERS N=$N"
  echo "# host $(uname -s)-$(uname -m) node $(node -v)"
  echo "# load before: $(load)"
} | emit

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
TAB="$(printf '\t')"

b=1
while [ "$b" -le "$BATCHES" ]; do
  i=1
  while [ "$i" -le "$WIDTH" ]; do
    # Keep ONLY this harness's sentinel rows. @strudel/core, superdough and @strudel/webaudio
    # all write banners to stdout, so the raw stream interleaves results with library chatter.
    ( "${CMD[@]}" 2>/dev/null | grep "^ROW${TAB}" | sed "s/^ROW${TAB}/${b}${TAB}/" > "$TMP/$b.$i" ) &
    i=$((i + 1))
  done
  wait
  # Emit in a stable per-batch order so two runs of the same protocol are diffable.
  cat "$TMP"/"$b".* | emit
  rm -f "$TMP"/"$b".*
  b=$((b + 1))
done
echo "# load after:  $(load)" | emit

# POSITIVE ARM. A run that produced fewer rows than it launched did not measure what it says
# it did: a process that died, or output the filter dropped, leaves a SHORTER run that still
# looks perfectly healthy. "0 divergences" out of an unknown number is not 0 out of N.
if [ -n "$OUT" ]; then
  GOT=$(grep -c "^[0-9]" "$OUT" || true)
  if [ "$GOT" -ne "$N" ]; then
    echo "VOID: launched $N renders, recorded $GOT rows — this run measured nothing. Do not report it." >&2
    exit 1
  fi
  echo "wrote $OUT  ($GOT rows, the $N launched)"
  node tools/summarise-run.mjs "$OUT"
fi
