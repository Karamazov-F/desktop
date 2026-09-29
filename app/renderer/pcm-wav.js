/* Capture microphone audio as 16 kHz mono PCM WAV. No ffmpeg. */
(function () {
  function encodeWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeStr = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, samples.length * 2, true);
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
    return new Uint8Array(buffer);
  }

  function lowPass(input, fromRate, toRate) {
    if (!input.length || !(fromRate > toRate)) return input;
    const cutoff = toRate * 0.45;
    const dt = 1 / fromRate;
    const rc = 1 / (2 * Math.PI * cutoff);
    const alpha = dt / (rc + dt);
    const out = new Float32Array(input.length);
    let y = input[0] || 0;
    out[0] = y;
    for (let i = 1; i < input.length; i++) {
      y += alpha * (input[i] - y);
      out[i] = y;
    }
    return out;
  }

  function resample(input, fromRate, toRate) {
    if (!input.length) return input;
    const filtered = lowPass(input, fromRate, toRate);
    if (fromRate === toRate) return filtered;
    const ratio = fromRate / toRate;
    const length = Math.max(1, Math.round(filtered.length / ratio));
    const out = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const pos = i * ratio;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const a = filtered[idx] || 0;
      const b = filtered[Math.min(idx + 1, filtered.length - 1)] || a;
      out[i] = a + (b - a) * frac;
    }
    return out;
  }

  function merge(chunks) {
    let len = 0;
    for (const chunk of chunks) len += chunk.length;
    const out = new Float32Array(len);
    let off = 0;
    for (const chunk of chunks) {
      out.set(chunk, off);
      off += chunk.length;
    }
    return out;
  }

  function create() {
    let ctx = null;
    let stream = null;
    let processor = null;
    let mute = null;
    let source = null;
    let chunks = [];

    async function release(encode) {
      const rate = ctx ? ctx.sampleRate : 16000;
      const recorded = chunks;
      chunks = [];
      if (processor) {
        processor.onaudioprocess = null;
        try {
          processor.disconnect();
        } catch (_) {}
      }
      if (source) {
        try {
          source.disconnect();
        } catch (_) {}
      }
      if (mute) {
        try {
          mute.disconnect();
        } catch (_) {}
      }
      processor = null;
      source = null;
      mute = null;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }
      if (ctx) {
        const closing = ctx;
        ctx = null;
        try {
          await closing.close();
        } catch (_) {}
      }
      if (!encode) return new Uint8Array(0);
      const pcm = resample(merge(recorded), rate, 16000);
      return encodeWav(pcm, 16000);
    }

    async function start() {
      chunks = [];
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        ctx = new AudioCtx();
        source = ctx.createMediaStreamSource(stream);
        processor = ctx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (event) => {
          chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
        };
        mute = ctx.createGain();
        mute.gain.value = 0;
        source.connect(processor);
        processor.connect(mute);
        mute.connect(ctx.destination);
        if (ctx.state === "suspended") await ctx.resume();
      } catch (err) {
        try {
          await release(false);
        } catch (_) {}
        throw err;
      }
    }

    return { start, stop: release };
  }

  const api = { create, encodeWav, resample, lowPass };
  if (typeof module === "object" && module.exports) module.exports = api;
  const root = typeof globalThis !== "undefined" ? globalThis : window;
  root.PetPcm = api;
})();
