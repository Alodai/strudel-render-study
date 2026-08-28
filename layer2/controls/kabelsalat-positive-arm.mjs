// F2 positive arm. "No exports map" is the explanation only if the file Node actually lands
// on genuinely has no exports. Read both published builds and count export statements.
// The patch this repository ships changes package.json alone — neither dist file is touched.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveDir } from '../../tools/resolve-chain.mjs';

const pkgDir = resolveDir('layer2/package.json', ['@strudel/core', '@kabelsalat/web']);
const iife = readFileSync(join(pkgDir, 'dist', 'index.js'), 'utf8');
const mjs = readFileSync(join(pkgDir, 'dist', 'index.mjs'), 'utf8');
const out = {
  pkgDir,
  iifeHead: iife.slice(0, 34),
  iifeExports: (iife.match(/^export[ {]/gm) || []).length,
  mjsExports: (mjs.match(/^export[ {]/gm) || []).length,
  mjsNamesSalatRepl: /SalatRepl/.test(mjs),
  hasExportsField: !!JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).exports,
};
console.log(`POSITIVE ARM  dist/index.js starts: ${JSON.stringify(out.iifeHead)}`);
console.log(`POSITIVE ARM  export-statement count  index.js: ${out.iifeExports} | index.mjs: ${out.mjsExports} | index.mjs names SalatRepl: ${out.mjsNamesSalatRepl}`);
console.log('JSON ' + JSON.stringify(out));
