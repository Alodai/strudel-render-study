# Draft upstream report 2 of 3 — NOT SENT

**Target — CONFIRMED:** <https://codeberg.org/uzu/strudel/issues> (declared in
`@strudel/webaudio`'s own `bugs.url`; issues open, 424 outstanding, not archived, updated
2026-08-26). `packages/webaudio/package.json` in that repo publishes `@strudel/webaudio@1.3.0`,
the exact version tested.
**Affects:** `@strudel/webaudio@1.3.0`, `renderPatternAudio`.

## Title
`renderPatternAudio` cannot be used outside a browser: it returns nothing and delivers the WAV only via a DOM download — and it does not register synth sounds, so a naive call renders silence

## Body

Two separate issues in one function, filed together because the second is what you hit while
working around the first.

### 1. The rendered audio is unreachable to the caller

`renderPatternAudio` builds an `OfflineAudioContext`, calls `startRendering()`, encodes a WAV — and
then hands it exclusively to a DOM anchor:

```js
.then((u) => { const f = new Blob([ke(u)]), p = URL.createObjectURL(f),
  d = document.createElement("a"); … d.click(); … })     // resolves to undefined
```

The promise resolves to `undefined`. There is no return value, no callback, and no event carrying
the bytes, so the only way to obtain a render is to be in a browser and accept a file download.
This makes offline/headless re-derivation of Strudel audio impossible without either driving a
browser or reimplementing the scheduling loop.

**Measured** (Node 22.17.1, `node-web-audio-api@2.1.0` supplying Web Audio, DOM sink intercepted so
the bytes could be inspected):

```
anchor clicks: 1 | blob captured: true | bytes: 352844
RIFF/WAVE: "RIFF/WAVE" | channels: 2 | sampleRate: 44100 | data frames: 88200
peak amplitude: 0.363281  (non-silent — the render itself succeeded)

renderPatternAudio resolved to: undefined
```

Note the engine itself works fine headless — the obstacle is purely the delivery mechanism.

**Suggested fix:** resolve with the encoded bytes (and/or the `AudioBuffer`), and make the download
opt-in — e.g. `renderPatternAudio(..., { download: true })`. That is backward compatible for the
REPL and makes the function usable programmatically.

### 2. It does not register synth sounds, and the failure is silent-but-successful

`renderPatternAudio` does not call `registerSynthSounds()`. Calling it on a fresh context therefore
logs `[webaudio] error: sound sine not found! Is it loaded?` per voice, drops every voice, and then
**completes normally**, producing a structurally valid WAV of the correct length containing pure
silence:

```
[webaudio] error: sound sine not found! Is it loaded?
RIFF/WAVE ok, channels 2, sampleRate 44100, data frames 88200 (correct)
peak amplitude: 0.000000          <- entirely silent
```

Exit is clean and the file looks right by every structural measure, so an automated caller cannot
distinguish this from a successful render without inspecting the samples. (This cost us a
measurement: our first run reported a "successful" render that was silence.)

**Suggested fix:** either register the default sounds inside `renderPatternAudio`, or fail loudly —
if every hap was dropped for want of a registered sound, that should be an error, not a silent
2-second silence.

### Environment
`@strudel/core@1.2.6`, `@strudel/mini@1.2.6`, `@strudel/webaudio@1.3.0`, `superdough@1.3.0`,
Node 22.17.1, darwin-arm64, `node-web-audio-api@2.1.0` providing the Web Audio globals.
(Reaching this point also required working around `@kabelsalat/web`'s missing `exports` map, which
blocks `@strudel/core@1.2.6` from importing in Node at all — reported separately to the kabelsalat
tracker.)
