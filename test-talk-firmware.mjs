import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./dist/firmware/desk-buddy-talk.ino', import.meta.url), 'utf8');

assert.ok(src.includes('192.168.4.1'), 'captive portal address');
assert.ok(src.includes('DeskBuddy-'), 'SoftAP name prefix');
assert.ok(src.includes('/v1/speech_to_text'), 'ASR path');
assert.ok(src.includes('/v1/chat/completions'), 'chat path');
assert.ok(src.includes('/v1/t2a_v2'), 'TTS path');
assert.ok(src.includes('asr-1.0'), 'ASR model');
assert.ok(src.includes('MiniMax-M3'), 'chat model');
assert.ok(src.includes('speech-2.6-turbo'), 'TTS model');
assert.match(src, /RIFF/);
assert.match(src, /WAVE/);
assert.ok(!/sk-[A-Za-z0-9]{8,}/.test(src), 'no hardcoded MiniMax key');
assert.ok(!src.includes('xiaozhi'), 'does not use xiaozhi cloud');

assert.match(src, /PIN_SDA\s*=\s*5/);
assert.match(src, /PIN_SCL\s*=\s*4/);
assert.match(src, /PIN_AMP_LRC\s*=\s*7/);
assert.match(src, /PIN_AMP_BCLK\s*=\s*8/);
assert.match(src, /PIN_AMP_DIN\s*=\s*9/);
assert.match(src, /PIN_MIC_WS\s*=\s*20/);
assert.match(src, /PIN_MIC_SCK\s*=\s*21/);
assert.match(src, /PIN_MIC_SD\s*=\s*10/);
assert.match(src, /PIN_BTN\s*=\s*0/);
assert.ok(src.includes('INPUT_PULLUP'), 'talk button pull-up');
assert.ok(src.includes('held >= 4000'), 'long-press forget network');
assert.ok(src.includes('pcm'), 'TTS pcm for I2S');
assert.ok(src.includes('api.minimax.cn'), 'China MiniMax host');
assert.ok(src.includes('ssid') && src.includes('apiKey'), 'portal fields');

console.log('PASS: talk firmware SoftAP, I2S pins, MiniMax paths, no hardcoded key');
