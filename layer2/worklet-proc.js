// A transparent gain worklet. With g=1 it is a pass-through; WK_GAIN is the sighting probe
// that proves it is genuinely in the signal path (see isolation-worklet.mjs).
class GainProc extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'g', defaultValue: 1, minValue: 0, maxValue: 4 }]; }
  process(inputs, outputs, params) {
    const i = inputs[0], o = outputs[0];
    if (!i || !i.length) return true;
    for (let c = 0; c < o.length; c++) {
      const ic = i[c] || i[0], oc = o[c];
      for (let s = 0; s < oc.length; s++) oc[s] = (ic ? ic[s] : 0) * (params.g.length > 1 ? params.g[s] : params.g[0]);
    }
    return true;
  }
}
registerProcessor('gain-proc', GainProc);
