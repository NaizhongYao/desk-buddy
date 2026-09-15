export function mergeFloat32(chunks = []) {
  let n = 0;
  for (const c of chunks) n += c.length;
  const out = new Float32Array(n);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export function downsample(input, fromRate, toRate = 16000) {
  const src = input || new Float32Array(0);
  const from = Number(fromRate) || 0;
  const to = Number(toRate) || 16000;
  if (!src.length || from <= 0 || to <= 0) return new Float32Array(0);
  if (from === to) return src;
  const ratio = from / to;
  const outLen = Math.max(0, Math.floor(src.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(src.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += src[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

export function encodeWav(float32, sampleRate = 16000) {
  const samples = float32 || new Float32Array(0);
  const rate = Math.max(1, Math.floor(Number(sampleRate) || 16000));
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buf);
  const write = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + n * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, n * 2, true);
  let p = 44;
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    p += 2;
  }
  return buf;
}

export function isWav(buf) {
  if (!buf || buf.byteLength < 44) return false;
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const tag = (i, n) => String.fromCharCode(...u8.subarray(i, i + n));
  return tag(0, 4) === 'RIFF' && tag(8, 4) === 'WAVE';
}

export function wavToBase64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  const chunk = 0x8000;
  let bin = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
