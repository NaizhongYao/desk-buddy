import { analyze, PITCH, allBodies, listSprites, listUnits, validateProgram, walk } from './blocks.mjs';

const PIN = {
  sda: 5,
  scl: 4,
  led: 8,
  ampBclk: 8,
  ampLrc: 7,
  ampDin: 9,
  micSck: 21,
  micWs: 20,
  micSd: 10,
};

function ms(sec) {
  return Math.max(50, Math.round(Number(sec) * 1000));
}

function ident(name) {
  return String(name || 'current').replace(/[^A-Za-z0-9_]/g, '_') || 'sp';
}

function amountC(node) {
  if (node?.k === 'sound') return '(micLevel() / 5)';
  return String(Math.trunc(Number(node?.v) || 0));
}

function cString(text) {
  return JSON.stringify(String(text || ''));
}

function resolveWho(who, sprites) {
  if (!who || who === 'current') return '';
  return sprites.some((s) => s.name === who) ? who : '';
}

function textChars(s) {
  if (s.type === 'text') return Math.max(1, String(s.text || '').length);
  if (s.type === 'number') return 4;
  return 1;
}

function jsBox(s) {
  if (!s) return null;
  if (s.type === 'circle') return { x: s.x - s.r, y: s.y - s.r, r: s.x + s.r, b: s.y + s.r, w: 2 * s.r, h: 2 * s.r };
  if (s.type === 'rect') return { x: s.x, y: s.y, r: s.x + s.w, b: s.y + s.h, w: s.w, h: s.h };
  if (s.type === 'text' || s.type === 'number') {
    const w = 6 * (s.size || 1) * textChars(s);
    const h = 8 * (s.size || 1);
    return { x: s.x, y: s.y, r: s.x + w, b: s.y + h, w, h };
  }
  const L = Math.min(s.x1, s.x2);
  const R = Math.max(s.x1, s.x2);
  const T = Math.min(s.y1, s.y2);
  const B = Math.max(s.y1, s.y2);
  return { x: L, y: T, r: R, b: B, w: R - L, h: B - T };
}

function shiftLine(s, dx, dy) {
  s.x1 += dx;
  s.x2 += dx;
  s.y1 += dy;
  s.y2 += dy;
}

function placeSprite(s, where) {
  if (!s) return;
  if (where === 'start') {
    if (s.type === 'line') {
      s.x1 = s.ox1 ?? s.ox;
      s.y1 = s.oy1 ?? s.oy;
      s.x2 = s.ox2;
      s.y2 = s.oy2;
    } else {
      s.x = s.ox;
      s.y = s.oy;
    }
    return;
  }
  if (s.type === 'circle') {
    if (where === 'left') s.x = s.r;
    else if (where === 'right') s.x = 127 - s.r;
    else if (where === 'top') s.y = s.r;
    else s.y = 63 - s.r;
    return;
  }
  if (s.type === 'line') {
    const box = jsBox(s);
    if (where === 'left') shiftLine(s, 0 - box.x, 0);
    else if (where === 'right') shiftLine(s, 127 - box.r, 0);
    else if (where === 'top') shiftLine(s, 0, 0 - box.y);
    else shiftLine(s, 0, 63 - box.b);
    return;
  }
  const box = jsBox(s);
  if (where === 'left') s.x = 0;
  else if (where === 'right') s.x = 127 - box.w;
  else if (where === 'top') s.y = 0;
  else s.y = 63 - box.h;
}

function bbox(sp) {
  if (sp.type === 'circle') return { x: `${sp.n}_x - ${sp.n}_r`, y: `${sp.n}_y - ${sp.n}_r`, r: `${sp.n}_x + ${sp.n}_r`, b: `${sp.n}_y + ${sp.n}_r` };
  if (sp.type === 'rect') return { x: `${sp.n}_x`, y: `${sp.n}_y`, r: `${sp.n}_x + ${sp.n}_w`, b: `${sp.n}_y + ${sp.n}_h` };
  if (sp.type === 'text' || sp.type === 'number') {
    const w = `6 * ${sp.n}_size * ${textChars(sp)}`;
    const h = `8 * ${sp.n}_size`;
    return { x: `${sp.n}_x`, y: `${sp.n}_y`, r: `${sp.n}_x + ${w}`, b: `${sp.n}_y + ${h}` };
  }
  const L = `(${sp.n}_x1 < ${sp.n}_x2 ? ${sp.n}_x1 : ${sp.n}_x2)`;
  const R = `(${sp.n}_x1 > ${sp.n}_x2 ? ${sp.n}_x1 : ${sp.n}_x2)`;
  const T = `(${sp.n}_y1 < ${sp.n}_y2 ? ${sp.n}_y1 : ${sp.n}_y2)`;
  const B = `(${sp.n}_y1 > ${sp.n}_y2 ? ${sp.n}_y1 : ${sp.n}_y2)`;
  return { x: L, y: T, r: R, b: B };
}

export function generateSketch(input) {
  const info = analyze(input);
  const p = info.program;
  const sprites = listSprites(p).map((s) => ({ ...s, n: ident(s.name) }));
  const bothI2s = info.amp && info.mic;
  const lines = [];
  const push = (s = '') => lines.push(s);

  push('#include <Wire.h>');
  push('#include <Adafruit_GFX.h>');
  push('#include <Adafruit_SSD1306.h>');
  if (info.amp || info.mic) push('#include <ESP_I2S.h>');
  push('');
  push('Adafruit_SSD1306 display(128, 64, &Wire, -1);');
  if (info.amp || info.mic) push('I2SClass i2s;');
  if (bothI2s) push('int i2sMode = 0;');
  push('int score = 0;');
  push('int times = 0;');
  for (const s of sprites) {
    if (s.type === 'circle') {
      push(`int ${s.n}_x = ${s.x}, ${s.n}_y = ${s.y}, ${s.n}_r = ${s.r};`);
      push(`int ${s.n}_ox = ${s.x}, ${s.n}_oy = ${s.y};`);
      push(`int ${s.n}_vx = 0, ${s.n}_vy = 0;`);
    } else if (s.type === 'rect') {
      push(`int ${s.n}_x = ${s.x}, ${s.n}_y = ${s.y}, ${s.n}_w = ${s.w}, ${s.n}_h = ${s.h};`);
      push(`int ${s.n}_ox = ${s.x}, ${s.n}_oy = ${s.y};`);
      push(`int ${s.n}_vx = 0, ${s.n}_vy = 0;`);
    } else if (s.type === 'text') {
      push(`int ${s.n}_x = ${s.x}, ${s.n}_y = ${s.y}, ${s.n}_size = ${s.size};`);
      push(`int ${s.n}_ox = ${s.x}, ${s.n}_oy = ${s.y};`);
      push(`int ${s.n}_vx = 0, ${s.n}_vy = 0;`);
    } else if (s.type === 'number') {
      push(`int ${s.n}_x = ${s.x}, ${s.n}_y = ${s.y}, ${s.n}_size = ${s.size};`);
      push(`int ${s.n}_ox = ${s.x}, ${s.n}_oy = ${s.y};`);
      push(`int ${s.n}_vx = 0, ${s.n}_vy = 0;`);
    } else {
      push(`int ${s.n}_x1 = ${s.x1}, ${s.n}_y1 = ${s.y1}, ${s.n}_x2 = ${s.x2}, ${s.n}_y2 = ${s.y2};`);
      push(`int ${s.n}_ox1 = ${s.x1}, ${s.n}_oy1 = ${s.y1}, ${s.n}_ox2 = ${s.x2}, ${s.n}_oy2 = ${s.y2};`);
      push(`int ${s.n}_vx = 0, ${s.n}_vy = 0;`);
    }
  }
  const touches = [];
  walkAll(p, (b) => {
    if (b.k === 'ifTouch') touches.push(ident(b.a) + '_' + ident(b.b));
  });
  for (const t of [...new Set(touches)]) push(`int hit_${t} = 0;`);
  push('');

  if (info.amp) {
    push('void ensureAmp() {');
    if (bothI2s) {
      push('  if (i2sMode == 1) return;');
      push('  i2s.end();');
    }
    push(`  i2s.setPins(${PIN.ampBclk}, ${PIN.ampLrc}, ${PIN.ampDin}, -1, -1);`);
    push('  i2s.begin(I2S_MODE_STD, 16000, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO);');
    if (bothI2s) push('  i2sMode = 1;');
    push('}');
    push('void beep(int hz, int ms) {');
    push('  ensureAmp();');
    push('  int n = 16 * ms;');
    push('  for (int i = 0; i < n; i++) {');
    push('    int16_t s = ((i * hz / 500) % 2) ? 9000 : -9000;');
    push('    i2s.write((uint8_t*)&s, 2);');
    push('  }');
    push('}');
    push('');
  }

  if (info.mic) {
    push('int micPeak() {');
    if (bothI2s) {
      push('  if (i2sMode != 2) {');
      push('    i2s.end();');
      push(`    i2s.setPins(${PIN.micSck}, ${PIN.micWs}, -1, ${PIN.micSd}, -1);`);
      push('    i2s.begin(I2S_MODE_STD, 16000, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO);');
      push('    i2sMode = 2;');
      push('    delay(20);');
      push('  }');
    }
    push('  int16_t buf[256];');
    push('  int got = i2s.readBytes((char*)buf, sizeof(buf));');
    push('  if (got < 64) return 0;');
    push('  int peak = 0;');
    push('  int samples = got / 2;');
    push('  for (int i = 0; i < samples; i++) {');
    push('    int v = buf[i];');
    push('    if (v < 0) v = -v;');
    push('    if (v > peak) peak = v;');
    push('  }');
    push('  return peak;');
    push('}');
    push('int micLevel() {');
    push('  int n = micPeak() / 80;');
    push('  if (n < 0) n = 0;');
    push('  if (n > 100) n = 100;');
    push('  return n;');
    push('}');
    push('');
  }

  if (sprites.length) {
    push('void drawSprites() {');
    push('  display.clearDisplay();');
    push('  display.setTextColor(SSD1306_WHITE);');
    for (const s of sprites) {
      if (s.type === 'circle') push(`  display.${s.fill ? 'fillCircle' : 'drawCircle'}(${s.n}_x, ${s.n}_y, ${s.n}_r, SSD1306_WHITE);`);
      else if (s.type === 'rect') push(`  display.${s.fill ? 'fillRect' : 'drawRect'}(${s.n}_x, ${s.n}_y, ${s.n}_w, ${s.n}_h, SSD1306_WHITE);`);
      else if (s.type === 'text') {
        push(`  display.setTextSize(${s.n}_size);`);
        push(`  display.setCursor(${s.n}_x, ${s.n}_y);`);
        push(`  display.print(${cString(s.text)});`);
      } else if (s.type === 'number') {
        push(`  display.setTextSize(${s.n}_size);`);
        push(`  display.setCursor(${s.n}_x, ${s.n}_y);`);
        if (s.value?.k === 'sound') push('  display.print(micLevel());');
        else if (s.value?.k === 'index') push('  display.print(times);');
        else if (s.value?.k === 'num') push(`  display.print(${Math.trunc(s.value.v || 0)});`);
        else push('  display.print(score);');
      } else {
        const t = Math.max(1, s.thick || 1);
        if (t <= 1) push(`  display.drawLine(${s.n}_x1, ${s.n}_y1, ${s.n}_x2, ${s.n}_y2, SSD1306_WHITE);`);
        else {
          push(`  for (int t = 0; t < ${t}; t++) {`);
          push(`    display.drawLine(${s.n}_x1, ${s.n}_y1 + t, ${s.n}_x2, ${s.n}_y2 + t, SSD1306_WHITE);`);
          push('  }');
        }
      }
    }
    push('  display.display();');
    push('}');
    push('');
    push('void stepSprites() {');
    for (const s of sprites) {
      if (s.type === 'line') {
        push(`  ${s.n}_x1 += ${s.n}_vx; ${s.n}_y1 += ${s.n}_vy;`);
        push(`  ${s.n}_x2 += ${s.n}_vx; ${s.n}_y2 += ${s.n}_vy;`);
      } else {
        push(`  ${s.n}_x += ${s.n}_vx;`);
        push(`  ${s.n}_y += ${s.n}_vy;`);
      }
    }
    push('}');
    push('');
  }

  function sp(who) {
    const name = resolveWho(who, sprites);
    if (!name) return null;
    return sprites.find((s) => s.name === name) || null;
  }

  function wantEdge(edge, side) {
    return !edge || edge === 'any' || edge === side;
  }

  function edgeCond(s, edge, kind) {
    if (!s) return 'false';
    const box = bbox(s);
    const hit = {
      left: `${box.x} <= 0`,
      right: `${box.r} >= 127`,
      top: `${box.y} <= 0`,
      bottom: `${box.b} >= 63`,
    };
    const exit = {
      left: `${box.r} < 0`,
      right: `${box.x} > 127`,
      top: `${box.b} < 0`,
      bottom: `${box.y} > 63`,
    };
    const table = kind === 'exit' ? exit : hit;
    if (edge === 'any') return `(${table.left} || ${table.right} || ${table.top} || ${table.bottom})`;
    return table[edge] || 'false';
  }

  const { skip: skipMove, start: startMoves } = bounceStartMoves(p);

  function emitMove(b, pad) {
    const s = sp(b.who);
    if (!s) return;
    const a = amountC(b.amount);
    if (b.dir === 'left') push(pad + `${s.n}_vx = -(${a}); ${s.n}_vy = 0;`);
    else if (b.dir === 'right') push(pad + `${s.n}_vx = (${a}); ${s.n}_vy = 0;`);
    else if (b.dir === 'up') push(pad + `${s.n}_vy = -(${a}); ${s.n}_vx = 0;`);
    else push(pad + `${s.n}_vy = (${a}); ${s.n}_vx = 0;`);
  }

  function emitBounce(b, pad) {
    const s = sp(b.who);
    if (!s) return;
    const e = b.edge;
    const box = bbox(s);
    if (s.type === 'circle') {
      if (wantEdge(e, 'right')) push(pad + `if (${s.n}_x + ${s.n}_r >= 127) { ${s.n}_vx = -abs(${s.n}_vx); ${s.n}_x = 127 - ${s.n}_r; }`);
      if (wantEdge(e, 'left')) push(pad + `if (${s.n}_x - ${s.n}_r <= 0) { ${s.n}_vx = abs(${s.n}_vx); ${s.n}_x = ${s.n}_r; }`);
      if (wantEdge(e, 'bottom')) push(pad + `if (${s.n}_y + ${s.n}_r >= 63) { ${s.n}_vy = -abs(${s.n}_vy); ${s.n}_y = 63 - ${s.n}_r; }`);
      if (wantEdge(e, 'top')) push(pad + `if (${s.n}_y - ${s.n}_r <= 0) { ${s.n}_vy = abs(${s.n}_vy); ${s.n}_y = ${s.n}_r; }`);
      return;
    }
    if (s.type === 'line') {
      push(pad + '{');
      push(pad + `  int L = ${box.x}; int R = ${box.r}; int T = ${box.y}; int Btm = ${box.b};`);
      if (wantEdge(e, 'right')) push(pad + `  if (R >= 127) { int d = R - 127; ${s.n}_x1 -= d; ${s.n}_x2 -= d; ${s.n}_vx = -abs(${s.n}_vx); }`);
      if (wantEdge(e, 'left')) push(pad + `  if (L <= 0) { int d = -L; ${s.n}_x1 += d; ${s.n}_x2 += d; ${s.n}_vx = abs(${s.n}_vx); }`);
      if (wantEdge(e, 'bottom')) push(pad + `  if (Btm >= 63) { int d = Btm - 63; ${s.n}_y1 -= d; ${s.n}_y2 -= d; ${s.n}_vy = -abs(${s.n}_vy); }`);
      if (wantEdge(e, 'top')) push(pad + `  if (T <= 0) { int d = -T; ${s.n}_y1 += d; ${s.n}_y2 += d; ${s.n}_vy = abs(${s.n}_vy); }`);
      push(pad + '}');
      return;
    }
    const w = s.type === 'rect' ? `${s.n}_w` : `6 * ${s.n}_size * ${textChars(s)}`;
    const h = s.type === 'rect' ? `${s.n}_h` : `8 * ${s.n}_size`;
    if (wantEdge(e, 'right')) push(pad + `if (${s.n}_x + ${w} >= 127) { ${s.n}_vx = -abs(${s.n}_vx); ${s.n}_x = 127 - (${w}); }`);
    if (wantEdge(e, 'left')) push(pad + `if (${s.n}_x <= 0) { ${s.n}_vx = abs(${s.n}_vx); ${s.n}_x = 0; }`);
    if (wantEdge(e, 'bottom')) push(pad + `if (${s.n}_y + ${h} >= 63) { ${s.n}_vy = -abs(${s.n}_vy); ${s.n}_y = 63 - (${h}); }`);
    if (wantEdge(e, 'top')) push(pad + `if (${s.n}_y <= 0) { ${s.n}_vy = abs(${s.n}_vy); ${s.n}_y = 0; }`);
  }

  function emitWrap(b, pad) {
    const s = sp(b.who);
    if (!s) return;
    const e = b.edge;
    const box = bbox(s);
    if (s.type === 'circle') {
      if (wantEdge(e, 'right')) push(pad + `if (${s.n}_x - ${s.n}_r > 127) ${s.n}_x = -${s.n}_r;`);
      if (wantEdge(e, 'left')) push(pad + `if (${s.n}_x + ${s.n}_r < 0) ${s.n}_x = 127 + ${s.n}_r;`);
      if (wantEdge(e, 'bottom')) push(pad + `if (${s.n}_y - ${s.n}_r > 63) ${s.n}_y = -${s.n}_r;`);
      if (wantEdge(e, 'top')) push(pad + `if (${s.n}_y + ${s.n}_r < 0) ${s.n}_y = 63 + ${s.n}_r;`);
      return;
    }
    if (s.type === 'line') {
      push(pad + '{');
      push(pad + `  int L = ${box.x}; int R = ${box.r}; int T = ${box.y}; int Btm = ${box.b}; int w = R - L; int h = Btm - T;`);
      if (wantEdge(e, 'right')) push(pad + `  if (L > 127) { int d = -w - L; ${s.n}_x1 += d; ${s.n}_x2 += d; }`);
      if (wantEdge(e, 'left')) push(pad + `  if (R < 0) { int d = 127 - L; ${s.n}_x1 += d; ${s.n}_x2 += d; }`);
      if (wantEdge(e, 'bottom')) push(pad + `  if (T > 63) { int d = -h - T; ${s.n}_y1 += d; ${s.n}_y2 += d; }`);
      if (wantEdge(e, 'top')) push(pad + `  if (Btm < 0) { int d = 63 - T; ${s.n}_y1 += d; ${s.n}_y2 += d; }`);
      push(pad + '}');
      return;
    }
    const w = s.type === 'rect' ? `${s.n}_w` : `6 * ${s.n}_size * ${textChars(s)}`;
    const h = s.type === 'rect' ? `${s.n}_h` : `8 * ${s.n}_size`;
    if (wantEdge(e, 'right')) push(pad + `if (${s.n}_x > 127) ${s.n}_x = -(${w});`);
    if (wantEdge(e, 'left')) push(pad + `if (${s.n}_x + ${w} < 0) ${s.n}_x = 127;`);
    if (wantEdge(e, 'bottom')) push(pad + `if (${s.n}_y > 63) ${s.n}_y = -(${h});`);
    if (wantEdge(e, 'top')) push(pad + `if (${s.n}_y + ${h} < 0) ${s.n}_y = 63;`);
  }

  function emitPlace(b, pad) {
    const s = sp(b.who);
    if (!s) return;
    if (b.where === 'start') {
      if (s.type === 'line') push(pad + `${s.n}_x1 = ${s.n}_ox1; ${s.n}_y1 = ${s.n}_oy1; ${s.n}_x2 = ${s.n}_ox2; ${s.n}_y2 = ${s.n}_oy2;`);
      else push(pad + `${s.n}_x = ${s.n}_ox; ${s.n}_y = ${s.n}_oy;`);
      return;
    }
    if (s.type === 'circle') {
      if (b.where === 'left') push(pad + `${s.n}_x = ${s.n}_r;`);
      else if (b.where === 'right') push(pad + `${s.n}_x = 127 - ${s.n}_r;`);
      else if (b.where === 'top') push(pad + `${s.n}_y = ${s.n}_r;`);
      else push(pad + `${s.n}_y = 63 - ${s.n}_r;`);
      return;
    }
    if (s.type === 'line') {
      const box = bbox(s);
      push(pad + '{');
      push(pad + `  int L = ${box.x}; int R = ${box.r}; int T = ${box.y}; int Btm = ${box.b};`);
      if (b.where === 'left') push(pad + `  int d = -L; ${s.n}_x1 += d; ${s.n}_x2 += d;`);
      else if (b.where === 'right') push(pad + `  int d = 127 - R; ${s.n}_x1 += d; ${s.n}_x2 += d;`);
      else if (b.where === 'top') push(pad + `  int d = -T; ${s.n}_y1 += d; ${s.n}_y2 += d;`);
      else push(pad + `  int d = 63 - Btm; ${s.n}_y1 += d; ${s.n}_y2 += d;`);
      push(pad + '}');
      return;
    }
    const w = s.type === 'rect' ? `${s.n}_w` : `6 * ${s.n}_size * ${textChars(s)}`;
    const h = s.type === 'rect' ? `${s.n}_h` : `8 * ${s.n}_size`;
    if (b.where === 'left') push(pad + `${s.n}_x = 0;`);
    else if (b.where === 'right') push(pad + `${s.n}_x = 127 - (${w});`);
    else if (b.where === 'top') push(pad + `${s.n}_y = 0;`);
    else push(pad + `${s.n}_y = 63 - (${h});`);
  }

  function emitList(list, pad, loops, zone, sm) {
    for (const b of list || []) {
      if (b.k === 'sprite') continue;
      if (b.k === 'wait') {
        if (sm) {
          sm.pc += 1;
          push(pad + `sleep_${sm.id} = millis() + ${ms(b.sec)};`);
          push(pad + `pc_${sm.id} = ${sm.pc};`);
          push(pad + 'return;');
          push(pad + `case ${sm.pc}:;`);
        } else {
          push(pad + `delay(${ms(b.sec)});`);
        }
        continue;
      }
      if (b.k === 'move') {
        if (zone === 'loop' && skipMove.has(b.id)) continue;
        emitMove(b, pad);
      } else if (b.k === 'bounce') emitBounce(b, pad);
      else if (b.k === 'wrap') emitWrap(b, pad);
      else if (b.k === 'place') emitPlace(b, pad);
      else if (b.k === 'beep') push(pad + `beep(${PITCH[b.pitch] || 1000}, ${ms(b.sec)});`);
      else if (b.k === 'quiet') {
        if (info.amp && bothI2s) {
          push(pad + 'i2s.end();');
          push(pad + 'i2sMode = 0;');
        }
      } else if (b.k === 'led') push(pad + `digitalWrite(${PIN.led}, ${b.on ? 'LOW' : 'HIGH'});`);
      else if (b.k === 'scoreAdd') push(pad + `score += ${b.n};`);
      else if (b.k === 'repeat') {
        if (sm && listHasWait(b.body)) {
          const ri = sm.ri(b);
          push(pad + `for (${ri} = 0; ${ri} < ${b.times}; ${ri}++) {`);
          emitList(b.body, pad + '  ', loops.concat(ri), zone, sm);
          push(pad + '}');
        } else {
          const v = 'i' + loops.length;
          push(pad + `for (int ${v} = 0; ${v} < ${b.times}; ${v}++) {`);
          emitList(b.body, pad + '  ', loops.concat(v), zone, sm);
          push(pad + '}');
        }
      } else if (b.k === 'ifSound') {
        push(pad + `if (micLevel() ${b.op === 'lt' ? '<' : '>'} ${b.thresh}) {`);
        emitList(b.body, pad + '  ', loops, zone, sm);
        if (b.elseBody?.length) {
          push(pad + '} else {');
          emitList(b.elseBody, pad + '  ', loops, zone, sm);
        }
        push(pad + '}');
      } else if (b.k === 'ifEdge' || b.k === 'ifExit') {
        const s = sp(b.who);
        push(pad + `if (${edgeCond(s, b.edge, b.k === 'ifExit' ? 'exit' : 'hit')}) {`);
        emitList(b.body, pad + '  ', loops, zone, sm);
        push(pad + '}');
      } else if (b.k === 'ifTouch') {
        const a = sp(b.a);
        const c = sp(b.b);
        if (a && c) {
          const A = bbox(a);
          const B = bbox(c);
          const key = ident(a.n) + '_' + ident(c.n);
          const ov = `(${A.x} < ${B.r} && ${A.r} > ${B.x} && ${A.y} < ${B.b} && ${A.b} > ${B.y})`;
          push(pad + `if (${ov} && !hit_${key}) {`);
          emitList(b.body, pad + '  ', loops, zone, sm);
          push(pad + `}`);
          push(pad + `hit_${key} = ${ov};`);
        }
      }
    }
  }

  function makeSm(id, list) {
    const repeats = [];
    function collect(arr) {
      for (const b of arr || []) {
        if (b.k === 'repeat' && listHasWait(b.body)) repeats.push(b);
        collect(b.body);
        collect(b.elseBody);
      }
    }
    collect(list);
    const map = new Map();
    repeats.forEach((b, i) => map.set(b, `ri_${id}_${i}`));
    return { id, pc: 0, ri: (b) => map.get(b), vars: [...map.values()] };
  }

  const actors = listUnits(p).map((u, i) => ({ id: 'u' + i, list: u.body || [] }));
  actors.push({ id: 'st', list: p.stage || [] });
  for (const a of actors) {
    if (!a.list.length) continue;
    if (!listHasWait(a.list)) continue;
    const sm = makeSm(a.id, a.list);
    a.sm = sm;
    push(`unsigned long sleep_${a.id} = 0;`);
    push(`int pc_${a.id} = 0;`);
    for (const v of sm.vars) push(`int ${v} = 0;`);
    push(`void run_${a.id}() {`);
    push(`  if (millis() < sleep_${a.id}) return;`);
    push(`  switch (pc_${a.id}) {`);
    push('    case 0:');
    emitList(a.list, '    ', [], 'loop', sm);
    push(`    pc_${a.id} = 0;`);
    push('    return;');
    push('  }');
    push('}');
    push('');
  }

  push('void setup() {');
  push(`  Wire.begin(${PIN.sda}, ${PIN.scl});`);
  push('  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);');
  if (info.led) {
    push(`  pinMode(${PIN.led}, OUTPUT);`);
    push(`  digitalWrite(${PIN.led}, HIGH);`);
  }
  if (info.amp && !bothI2s) push('  ensureAmp();');
  if (info.mic && !bothI2s) {
    push(`  i2s.setPins(${PIN.micSck}, ${PIN.micWs}, -1, ${PIN.micSd}, -1);`);
    push('  i2s.begin(I2S_MODE_STD, 16000, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO);');
  }
  for (const m of startMoves) emitMove(m, '  ');
  if (sprites.length) push('  drawSprites();');
  push('}');
  push('');
  push('void loop() {');
  push('  times++;');
  for (const a of actors) {
    if (!a.list.length) continue;
    if (a.sm) push(`  run_${a.id}();`);
    else emitList(a.list, '  ', [], 'loop', null);
  }
  if (sprites.length) {
    push('  stepSprites();');
    push('  drawSprites();');
  }
  push('  delay(16);');
  push('}');
  push('');
  return lines.join('\n');
}

function walkAll(program, fn) {
  walk(program, fn);
}

function virtAmount(node, api) {
  if (node?.k === 'sound') return Math.max(0, Math.round(api.sound() / 5));
  return Math.trunc(Number(node?.v) || 0);
}

function hitEdge(s, edge, kind) {
  const box = jsBox(s);
  if (!box) return false;
  const hit = { left: box.x <= 0, right: box.r >= 127, top: box.y <= 0, bottom: box.b >= 63 };
  const exit = { left: box.r < 0, right: box.x > 127, top: box.b < 0, bottom: box.y > 63 };
  const t = kind === 'exit' ? exit : hit;
  if (edge === 'any') return t.left || t.right || t.top || t.bottom;
  return !!t[edge];
}

export async function executeBlocks(input, host, signal) {
  const p = validateProgram(input);
  const started = Date.now();
  let steps = 0;
  async function tick() {
    if (signal?.aborted) throw Error('STOPPED');
    if (++steps % 200 === 0) await new Promise((r) => setTimeout(r, 0));
    if (steps > 200000) throw Error('程序运行步数过多。请在循环中加入等待。');
  }
  const sprites = listSprites(p).map((s) => ({
    ...s,
    vx: 0,
    vy: 0,
    ox: s.x ?? s.x1,
    oy: s.y ?? s.y1,
    ox1: s.x1,
    oy1: s.y1,
    ox2: s.x2,
    oy2: s.y2,
  }));
  const hits = {};
  const { skip: skipMove, start: startMoves } = bounceStartMoves(p);
  const api = {
    millis: () => Date.now() - started,
    sound: () => Math.min(100, Math.max(0, Math.round((host.readMic?.() ?? 0) / 10))),
    score: 0,
    ...host,
    times: 0,
  };

  function findSp(who) {
    if (!who || who === 'current') return null;
    return sprites.find((s) => s.name === who) || null;
  }

  function applyMove(s, dir, amt) {
    if (!s) return;
    if (dir === 'left') { s.vx = -amt; s.vy = 0; }
    else if (dir === 'right') { s.vx = amt; s.vy = 0; }
    else if (dir === 'up') { s.vy = -amt; s.vx = 0; }
    else { s.vy = amt; s.vx = 0; }
  }

  function bounce(s, edge) {
    if (!s) return;
    const want = (side) => !edge || edge === 'any' || edge === side;
    if (s.type === 'circle') {
      if (want('right') && s.x + s.r >= 127) { s.vx = -Math.abs(s.vx); s.x = 127 - s.r; }
      if (want('left') && s.x - s.r <= 0) { s.vx = Math.abs(s.vx); s.x = s.r; }
      if (want('bottom') && s.y + s.r >= 63) { s.vy = -Math.abs(s.vy); s.y = 63 - s.r; }
      if (want('top') && s.y - s.r <= 0) { s.vy = Math.abs(s.vy); s.y = s.r; }
      return;
    }
    const box = jsBox(s);
    if (s.type === 'line') {
      if (want('right') && box.r >= 127) { shiftLine(s, 127 - box.r, 0); s.vx = -Math.abs(s.vx); }
      if (want('left') && box.x <= 0) { shiftLine(s, -box.x, 0); s.vx = Math.abs(s.vx); }
      if (want('bottom') && box.b >= 63) { shiftLine(s, 0, 63 - box.b); s.vy = -Math.abs(s.vy); }
      if (want('top') && box.y <= 0) { shiftLine(s, 0, -box.y); s.vy = Math.abs(s.vy); }
      return;
    }
    if (want('right') && s.x + box.w >= 127) { s.vx = -Math.abs(s.vx); s.x = 127 - box.w; }
    if (want('left') && s.x <= 0) { s.vx = Math.abs(s.vx); s.x = 0; }
    if (want('bottom') && s.y + box.h >= 63) { s.vy = -Math.abs(s.vy); s.y = 63 - box.h; }
    if (want('top') && s.y <= 0) { s.vy = Math.abs(s.vy); s.y = 0; }
  }

  function wrap(s, edge) {
    if (!s) return;
    const want = (side) => !edge || edge === 'any' || edge === side;
    if (s.type === 'circle') {
      if (want('right') && s.x - s.r > 127) s.x = -s.r;
      if (want('left') && s.x + s.r < 0) s.x = 127 + s.r;
      if (want('bottom') && s.y - s.r > 63) s.y = -s.r;
      if (want('top') && s.y + s.r < 0) s.y = 63 + s.r;
      return;
    }
    const box = jsBox(s);
    if (s.type === 'line') {
      if (want('right') && box.x > 127) shiftLine(s, -box.w - box.x, 0);
      if (want('left') && box.r < 0) shiftLine(s, 127 - box.x, 0);
      if (want('bottom') && box.y > 63) shiftLine(s, 0, -box.h - box.y);
      if (want('top') && box.b < 0) shiftLine(s, 0, 63 - box.y);
      return;
    }
    if (want('right') && s.x > 127) s.x = -box.w;
    if (want('left') && s.x + box.w < 0) s.x = 127;
    if (want('bottom') && s.y > 63) s.y = -box.h;
    if (want('top') && s.y + box.h < 0) s.y = 63;
  }

  function drawAll() {
    const d = api.display;
    if (!d) return;
    d.pixels.fill(0);
    for (const s of sprites) {
      if (s.type === 'circle') d.circle(s.x, s.y, s.r, 1, s.fill !== false);
      else if (s.type === 'rect') d.rect(s.x, s.y, s.w, s.h, 1, s.fill !== false);
      else if (s.type === 'text') {
        d.color = 1; d.size = s.size; d.x = s.x; d.y = s.y; d.print(s.text);
      } else if (s.type === 'number') {
        d.color = 1; d.size = s.size; d.x = s.x; d.y = s.y;
        const v = s.value?.k === 'sound' ? api.sound() : s.value?.k === 'index' ? api.times : s.value?.k === 'num' ? s.value.v : api.score;
        d.print(String(Math.trunc(v || 0)));
      } else {
        const t = Math.max(1, s.thick || 1);
        if (t <= 1) d.line(s.x1, s.y1, s.x2, s.y2, 1);
        else {
          for (let i = 0; i < t; i++) d.line(s.x1, s.y1 + i, s.x2, s.y2 + i, 1);
        }
      }
    }
    api.refresh?.();
  }

  function doOp(b, inLoop) {
    if (b.k === 'move') {
      if (inLoop && skipMove.has(b.id)) return;
      applyMove(findSp(b.who), b.dir, virtAmount(b.amount, api));
    } else if (b.k === 'bounce') bounce(findSp(b.who), b.edge);
    else if (b.k === 'wrap') wrap(findSp(b.who), b.edge);
    else if (b.k === 'place') placeSprite(findSp(b.who), b.where);
    else if (b.k === 'quiet') api.stopTone?.();
    else if (b.k === 'led') api.led?.(!!b.on);
    else if (b.k === 'scoreAdd') api.score += b.n;
  }

  function* script(list, inLoop) {
    for (const b of list || []) {
      if (b.k === 'sprite') continue;
      if (b.k === 'wait') {
        yield { wait: ms(b.sec) };
        continue;
      }
      if (b.k === 'beep') {
        yield { beep: PITCH[b.pitch] || 1000, wait: ms(b.sec) };
        continue;
      }
      if (b.k === 'repeat') {
        for (let i = 0; i < (b.times | 0); i++) yield* script(b.body, inLoop);
        continue;
      }
      if (b.k === 'ifSound') {
        const yes = b.op === 'lt' ? api.sound() < b.thresh : api.sound() > b.thresh;
        yield* script(yes ? b.body : b.elseBody, inLoop);
        continue;
      }
      if (b.k === 'ifEdge') {
        if (hitEdge(findSp(b.who), b.edge, 'hit')) yield* script(b.body, inLoop);
        continue;
      }
      if (b.k === 'ifExit') {
        if (hitEdge(findSp(b.who), b.edge, 'exit')) yield* script(b.body, inLoop);
        continue;
      }
      if (b.k === 'ifTouch') {
        const a = findSp(b.a);
        const c = findSp(b.b);
        if (!a || !c) continue;
        const A = jsBox(a);
        const B = jsBox(c);
        const ov = A.x < B.r && A.r > B.x && A.y < B.b && A.b > B.y;
        const key = a.name + '_' + c.name;
        if (ov && !hits[key]) yield* script(b.body, inLoop);
        hits[key] = ov;
        continue;
      }
      yield { op: b, inLoop };
    }
  }

  function* forever(list) {
    while (true) {
      yield* script(list, true);
      yield { frame: true };
    }
  }

  const actors = allBodies(p).filter((list) => list.length).map((list) => ({
    sleepUntil: 0,
    gen: forever(list),
    tone: 0,
  }));

  for (const m of startMoves) applyMove(findSp(m.who), m.dir, virtAmount(m.amount, api));
  drawAll();
  while (!signal?.aborted) {
    await tick();
    api.times += 1;
    const now = Date.now();
    for (const actor of actors) {
      if (now < actor.sleepUntil) continue;
      if (actor.tone) {
        api.stopTone?.();
        actor.tone = 0;
      }
      while (now >= actor.sleepUntil) {
        const n = actor.gen.next();
        if (n.done) break;
        const v = n.value;
        if (v?.frame) break;
        if (v?.beep) {
          api.playTone?.(v.beep);
          actor.tone = v.beep;
          actor.sleepUntil = now + (v.wait || 0);
          break;
        }
        if (v?.wait) {
          actor.sleepUntil = now + v.wait;
          break;
        }
        if (v?.op) doOp(v.op, v.inLoop);
      }
    }
    for (const s of sprites) {
      if (s.type === 'line') { s.x1 += s.vx; s.y1 += s.vy; s.x2 += s.vx; s.y2 += s.vy; }
      else { s.x += s.vx; s.y += s.vy; }
    }
    drawAll();
    await new Promise((r) => setTimeout(r, 16));
  }
  api.stopTone?.();
}

function listHasWait(list) {
  for (const b of list || []) {
    if (b.k === 'wait') return true;
    if (listHasWait(b.body) || listHasWait(b.elseBody)) return true;
  }
  return false;
}

function firstBounceMove(unit) {
  if (!unit?.sprite?.name) return null;
  let bouncing = false;
  function scan(list) {
    for (const b of list || []) {
      if (b.k === 'bounce') bouncing = true;
      scan(b.body);
      scan(b.elseBody);
    }
  }
  scan(unit.body);
  if (!bouncing) return null;
  return (unit.body || []).find((b) => b.k === 'move') || null;
}

function bounceStartMoves(program) {
  const skip = new Set();
  const start = [];
  for (const u of listUnits(program)) {
    const m = firstBounceMove(u);
    if (m) {
      skip.add(m.id);
      start.push(m);
    }
  }
  return { skip, start };
}

export { PIN };
