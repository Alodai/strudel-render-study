// Resolve and import @strudel/core, reporting which file the resolver landed on and whether
// the import succeeded. Used as arms A/B/C of the F2 control.
const resolved = import.meta.resolve('@kabelsalat/web').split('/').slice(-2).join('/');
let result;
try {
  const m = await import('@strudel/core');
  result = { ok: true, exports: Object.keys(m).length };
} catch (e) {
  result = { ok: false, error: `${e.constructor.name}: ${String(e.message).split('\n')[0]}` };
}
console.log('JSON ' + JSON.stringify({ resolved, ...result }));
