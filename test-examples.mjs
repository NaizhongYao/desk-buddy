import { compile, execute } from './dist/runtime.mjs';
import { examples } from './dist/examples.mjs';
import { Display } from './dist/display.mjs';

const names = Object.keys(examples);
const results = [];

for (const name of names) {
  const code = examples[name];
  const row = { name, compile: '?', run: '?', pixels: 0, calls: 0, error: '' };
  let program;
  try {
    program = compile(code);
    row.compile = 'OK';
  } catch (e) {
    row.compile = 'FAIL';
    row.error = e.message;
    results.push(row);
    continue;
  }

  const display = new Display();
  const ac = new AbortController();
  let calls = 0;
  const t = setTimeout(() => ac.abort(), 2500);
  try {
    await execute(program, {
      call(n, a) {
        calls++;
        if (n === 'Wire.begin') return 1;
        if (n === 'display.begin') return 1;
        if (n === 'display.clearDisplay') { display.pixels.fill(0); return 0; }
        if (n === 'display.display') return 0;
        if (n.startsWith('display.')) {
          const f = n.slice(8);
          switch (f) {
            case 'drawPixel': display.pixel(...a); break;
            case 'drawLine': display.line(...a); break;
            case 'drawRect': display.rect(...a); break;
            case 'fillRect': display.rect(...a, true); break;
            case 'drawCircle': display.circle(...a); break;
            case 'fillCircle': display.circle(...a, true); break;
            case 'setCursor': [display.x, display.y] = a; break;
            case 'setTextSize': display.size = a[0]; break;
            case 'setTextColor': display.color = a[0]; break;
            case 'print': display.print(a[0]); break;
            case 'println': display.print(a[0] ?? '', true); break;
            case 'invertDisplay': display.invert = !!a[0]; break;
          }
          return 0;
        }
        if (n === 'pinMode' || n === 'digitalWrite' || n === 'Serial.begin' || n === 'tone' || n === 'noTone') return 0;
        if (n === 'analogRead') return 180 + (calls % 40);
        if (n.startsWith('Serial.')) return 0;
        throw new Error('尚不支持 ' + n);
      }
    }, ac.signal);
    row.run = 'OK (ended)';
  } catch (e) {
    if (e.message === 'STOPPED') row.run = 'OK';
    else {
      row.run = 'FAIL';
      row.error = e.message;
    }
  } finally {
    clearTimeout(t);
  }
  row.pixels = display.pixels.reduce((s, v) => s + v, 0);
  row.calls = calls;
  results.push(row);
}

for (const r of results) {
  const status = r.compile !== 'OK' || r.run === 'FAIL' ? 'BROKEN' : (r.pixels === 0 && r.name !== 'led' ? 'BLANK' : 'PASS');
  console.log(`${status.padEnd(7)} ${r.name.padEnd(14)} compile=${r.compile} run=${r.run} pixels=${r.pixels} calls=${r.calls} ${r.error}`);
}

const broken = results.filter(r => r.compile !== 'OK' || r.run === 'FAIL');
process.exit(broken.length ? 1 : 0);
