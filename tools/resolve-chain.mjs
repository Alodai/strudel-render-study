// pnpm's strict linker puts only DIRECT dependencies in a package's node_modules. Every
// package this study inspects — @kabelsalat/web, fraction.js — is transitive, so it is
// resolvable from its own parent and not from the workspace package that depends on the
// parent. Resolution therefore has to be walked link by link.
//
// Two traps live here, both met while building this repo:
//
//  1. `require.resolve('<pkg>/package.json')` FAILS on a package whose exports map does not
//     list "./package.json" — and adding an exports map is exactly what one of the patches
//     does. So the same call succeeds unpatched and throws patched, which reads like a
//     broken arm. The package root is therefore found by resolving the ENTRY and walking up
//     to the package.json that names the package.
//  2. Node caches module resolution per process. After a reinstall, a cached path still
//     points at the previous store entry — indistinguishable from a revert that did not
//     happen. Callers that reinstall must run this as a CLI, in a fresh child process.
//
//   node tools/resolve-chain.mjs <fromPkgJson> <pkg>[ <pkg>...]
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, isAbsolute, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const nameAt = (dir) => {
  try { return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name; }
  catch { return null; }
};

function packageRootFrom(entry, pkg) {
  let dir = dirname(entry);
  const { root } = parse(dir);
  while (true) {
    if (nameAt(dir) === pkg) return dir;
    if (dir === root) throw new Error(`could not find the package root of ${pkg} above ${entry}`);
    dir = dirname(dir);
  }
}

/** Directory of the last package in `chain`, resolved hop by hop from `fromPkgJson`. */
export function resolveDir(fromPkgJson, chain) {
  let base = isAbsolute(fromPkgJson) ? fromPkgJson : join(ROOT, fromPkgJson);
  let dir;
  for (const pkg of chain) {
    const require = createRequire(base);
    try {
      dir = dirname(require.resolve(`${pkg}/package.json`));   // fast path
      if (nameAt(dir) !== pkg) dir = packageRootFrom(require.resolve(pkg), pkg);
    } catch {
      dir = packageRootFrom(require.resolve(pkg), pkg);        // exports map hides package.json
    }
    base = join(dir, 'package.json');
  }
  if (!dir) throw new Error('empty resolution chain');
  return dir;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [from, ...chain] = process.argv.slice(2);
  console.log(resolveDir(from, chain));
}
