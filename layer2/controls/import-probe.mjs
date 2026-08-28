// One arm of the F2 control: report which @kabelsalat/web entry point the resolver lands on,
// and whether @strudel/core imports. Run once per arm, in its own process.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveDir } from '../../tools/resolve-chain.mjs';

let resolved = '(unresolvable)';
let hasExportsField = null;
try {
  const dir = resolveDir('layer2/package.json', ['@strudel/core', '@kabelsalat/web']);
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  hasExportsField = !!manifest.exports;
  // What Node will load for a bare `import '@kabelsalat/web'`: the exports map when present,
  // otherwise "main".
  resolved = hasExportsField ? manifest.exports['.'].import : manifest.main;
} catch (e) {
  resolved = `(${e.code ?? 'ERROR'})`;
}

let result;
try {
  const m = await import('@strudel/core');
  result = { ok: true, exports: Object.keys(m).length };
} catch (e) {
  result = { ok: false, error: `${e.constructor.name}: ${String(e.message).split('\n')[0]}` };
}
console.log('JSON ' + JSON.stringify({ resolved, hasExportsField, ...result }));
