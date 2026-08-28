// `pnpm layer1` — query, canonically order, digest. Deterministic and exact.
import { serialiseHaps, digest, buildPatterns, SPAN, SPEC } from './digest.mjs';

const patterns = await buildPatterns();
console.log(`# host ${process.platform}-${process.arch} node ${process.version}`);
console.log(`# span [${SPAN[0]}, ${SPAN[1]}) cycles`);
for (const [name, p] of Object.entries(patterns)) {
  const ser = serialiseHaps(p.build(), ...SPAN);
  const haps = ser.trimEnd().split('\n').length;
  console.log(`${name}\thaps=${haps}\tsha256=${digest(ser)}\t${JSON.stringify(SPEC.patterns[name].mini)}`);
}
