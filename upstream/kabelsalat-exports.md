# Draft upstream report — NOT SENT

**Target — CONFIRMED:** <https://codeberg.org/froos/kabelsalat> (issues open, 58 outstanding,
not archived, updated 2026-03-23). npm holds **no** `repository`, `homepage` or `bugs` field for any
`@kabelsalat/*` package, so the tracker was established by following the archived GitHub mirror
`felixroos/kabelsalat`, whose README states the project *"permanently moved to
https://codeberg.org/froos/kabelsalat/"*. That repo was then verified to contain `packages/web`
publishing `@kabelsalat/web@0.4.1` with `exports` still absent. Two plausible guesses
(`codeberg.org/uzu/kabelsalat`, `codeberg.org/felixroos/kabelsalat`) do **not** exist — the GitHub
repo is archived and cannot take issues, so guessing would have failed twice.
**Affects:** `@kabelsalat/web@0.4.1` (current latest, published 2025).
**Downstream impact:** `@strudel/core@1.2.6` — the current release — cannot be imported in Node at all.

## Title
`@kabelsalat/web` has no `exports` map, so Node resolves `main` (an IIFE bundle) and every named import fails

## Body

`package.json` declares `"type": "module"` with `"main": "dist/index.js"` and
`"module": "dist/index.mjs"`, and **no `exports` field**.

`dist/index.js` is an IIFE browser bundle (`var kabelsalat=function(l){…`) with **0 `export`
statements**; `dist/index.mjs` is the ES module and has them. Bundlers read `module` and work.
Node reads `main`, and because `"type": "module"` is set it parses that IIFE **as an ES module** —
a module with no exports. Hence the error is a missing named export rather than a CJS failure.

### Minimal repro
```sh
mkdir t && cd t && npm init -y >/dev/null && npm pkg set type=module
npm i @strudel/core@1.2.6
node -e "import('@strudel/core').then(()=>console.log('ok'),e=>console.log(e.message))"
```
```
The requested module '@kabelsalat/web' does not provide an export named 'SalatRepl'
```

Reproduced identically on Node **18.20.3, 20.19.5, 22.17.1 and 24.11.0** (darwin-arm64).
Also reproduced verbatim on **linux-x64, Node 22.23.2, glibc 2.36** (`node:22-bookworm-slim`).
Note `@strudel/core` declares `"engines": { "node": ">=18.0.0" }`, so this is a supported target.

### Cause is isolated to the missing field
Adding **only** an `exports` map to `@kabelsalat/web/package.json`, changing nothing else:

| arm | `import.meta.resolve` | result |
|---|---|---|
| A as published | `dist/index.js` | `SyntaxError: … does not provide an export named 'SalatRepl'` |
| B `+exports` only | `dist/index.mjs` | imports OK, 881 exports |
| C reverted to A | `dist/index.js` | `SyntaxError` again |

### Note: the source manifest differs from the published one
In the repo, `packages/web/package.json` has **`main` and `module` both `src/index.js`**; the
`dist/index.js` (IIFE) / `dist/index.mjs` (ESM) split exists only in the published tarball, produced
by the vite build. So the fix belongs in the source manifest but must name the **built** paths.

### Suggested fix
```json
"exports": { ".": { "import": "./dist/index.mjs", "require": "./dist/index.js" } }
```
`dist/index.js` is an IIFE rather than CommonJS, so if a `require` path is wanted it needs a real
CJS build; otherwise publish `import` only.
