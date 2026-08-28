// N renders of the subject pattern in ONE process, each labelled with its position.
// Set STUDY_WAV_DIR to also write every distinct render to <dir>/<digest8>.wav.
//
// Emits one TSV row per render:  pid <TAB> pos <TAB> sha256 <TAB> peak
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderSubject } from './sink.mjs';

const N = Number(process.argv[2] || 1);
const DIR = process.env.STUDY_WAV_DIR || '';
if (DIR) mkdirSync(DIR, { recursive: true });

for (let i = 1; i <= N; i++) {
  const r = await renderSubject();
  if (DIR) writeFileSync(join(DIR, `${r.sha.slice(0, 8)}.wav`), r.bytes);
  console.log(`${process.pid}\t${i}\t${r.sha}\t${r.peak.toFixed(6)}`);
}
