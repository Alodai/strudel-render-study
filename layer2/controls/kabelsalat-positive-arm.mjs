// F2 positive arm. "No exports map" is only the explanation if the file Node actually lands
// on genuinely has no exports. Read both published builds and count export statements.
// The patch this repository ships changes package.json only — neither dist file is touched.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(join(process.cwd(), 'layer2', 'package.json'));
const pkgDir = dirname(require.resolve('@kabelsalat/web/package.json'));
const iife = readFileSync(join(pkgDir, 'dist', 'index.js'), 'utf8');
const mjs = readFileSync(join(pkgDir, 'dist', 'index.mjs'), 'utf8');
const out = {
  pkgDir,
  iifeHead: iife.slice(0, 34),
  iifeExports: (iife.match(/^export[ {]/gm) || []).length,
  mjsExports: (mjs.match(/^export[ {]/gm) || []).length,
  mjsNamesSalatRepl: /SalatRepl/.test(mjs),
};
console.log(`POSITIVE ARM  dist/index.js starts: ${JSON.stringify(out.iifeHead)}`);
console.log(`POSITIVE ARM  export-statement count  index.js: ${out.iifeExports} | index.mjs: ${out.mjsExports} | index.mjs names SalatRepl: ${out.mjsNamesSalatRepl}`);
console.log('JSON ' + JSON.stringify(out));
