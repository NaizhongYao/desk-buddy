import assert from 'node:assert/strict';
import { mergeFloat32, downsample, encodeWav, wavToBase64, isWav } from './dist/asr.mjs';

const a = new Float32Array([1, 2]);
const b = new Float32Array([3]);
const merged = mergeFloat32([a, b]);
assert.equal(merged.length, 3);
assert.equal(merged[2], 3);

const same = downsample(new Float32Array([1, 2, 3, 4]), 16000, 16000);
assert.equal(same.length, 4);
assert.equal(same[0], 1);

const half = downsample(new Float32Array([1, 1, 3, 3]), 32000, 16000);
assert.equal(half.length, 2);
assert.equal(half[0], 1);
assert.equal(half[1], 3);

const wav = encodeWav(new Float32Array(1600).fill(0.25), 16000);
assert.equal(isWav(wav), true);
assert.equal(wav.byteLength, 44 + 1600 * 2);
const u8 = new Uint8Array(wav);
assert.equal(String.fromCharCode(...u8.subarray(0, 4)), 'RIFF');
assert.equal(String.fromCharCode(...u8.subarray(8, 12)), 'WAVE');
assert.equal(isWav(new Uint8Array(10)), false);
assert.equal(isWav(new Uint8Array(44)), false);

const b64 = wavToBase64(wav);
assert.ok(typeof b64 === 'string' && b64.length > 40);
const back = Buffer.from(b64, 'base64');
assert.equal(back.toString('ascii', 0, 4), 'RIFF');

console.log('PASS: wav container, downsample, no raw pcm');
