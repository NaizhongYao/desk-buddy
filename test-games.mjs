import assert from 'node:assert/strict';
import { compile, execute } from './dist/runtime.mjs';
import { examples, virtualSketch } from './dist/examples.mjs';
import { Display } from './dist/display.mjs';
import { lessons } from './dist/circuit.mjs';
import { readFile } from 'node:fs/promises';

const games = ['dino_jump', 'star_catch', 'clap_mole'];
const tags = { dino_jump: 'GAME_DINO', star_catch: 'GAME_STAR', clap_mole: 'GAME_MOLE' };
const titles = { dino_jump: 'DINO', star_catch: 'STAR', clap_mole: 'MOLE' };

for (const name of games) {
  const code = examples[name];
  assert.ok(code, name + ' missing');
  assert.ok(code.includes('#include <ESP_I2S.h>'));
  assert.ok(code.includes('Wire.begin(5, 4)'));
  assert.ok(code.includes('PIN_MIC_SCK = 21'));
  assert.ok(code.includes('PIN_MIC_WS = 20'));
  assert.ok(code.includes('PIN_MIC_SD = 10'));
  assert.ok(code.includes(tags[name]));
  const demo = virtualSketch(code);
  assert.match(demo, new RegExp(titles[name]));
  assert.ok(demo.includes('analogRead(10)'));
  assert.ok(!demo.includes('ESP_I2S'));
  const program = compile(demo);
  const display = new Display();
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 1200);
  try {
    await execute(program, {
      call(n, a) {
        if (n === 'Wire.begin' || n === 'display.begin') return 1;
        if (n === 'display.clearDisplay') { display.pixels.fill(0); return 0; }
        if (n === 'display.display') return 0;
        if (n.startsWith('display.')) {
          const f = n.slice(8);
          if (f === 'drawPixel') display.pixel(...a);
          else if (f === 'drawLine') display.line(...a);
          else if (f === 'drawRect') display.rect(...a);
          else if (f === 'fillRect') display.rect(...a, true);
          else if (f === 'drawCircle') display.circle(...a);
          else if (f === 'fillCircle') display.circle(...a, true);
          else if (f === 'setCursor') [display.x, display.y] = a;
          else if (f === 'setTextSize') display.size = a[0];
          else if (f === 'setTextColor') display.color = a[0];
          else if (f === 'print') display.print(a[0]);
          else if (f === 'println') display.print(a[0] ?? '', true);
          return 0;
        }
        if (n === 'analogRead') return 90 + (a[0] % 30);
        if (n.startsWith('Serial.') || n === 'pinMode' || n === 'digitalWrite' || n === 'tone' || n === 'noTone') return 0;
        throw new Error('尚不支持 ' + n);
      }
    }, ac.signal);
  } catch (e) {
    if (e.message !== 'STOPPED') throw e;
  } finally {
    clearTimeout(t);
  }
  const pixels = display.pixels.reduce((s, v) => s + v, 0);
  assert.ok(pixels > 20, name + ' drew nothing');
}

const html = await readFile(new URL('./dist/index.html', import.meta.url), 'utf8');
assert.match(html, /value="dino_jump">声音跳跳/);
assert.match(html, /value="star_catch">音量接星星/);
assert.match(html, /value="clap_mole">拍手打地鼠/);
assert.deepEqual(
  lessons[2].examples.slice(-3),
  ['dino_jump', 'star_catch', 'clap_mole']
);

console.log('PASS: three voice games compile, draw, and appear in the example list');
