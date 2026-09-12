import assert from 'node:assert/strict';
import {
  GROUPS,
  RECIPE_NAMES,
  allowedInStart,
  canPlace,
  defaultProgram,
  insertAt,
  insertBlock,
  listSprites,
  listUnits,
  moveBlock,
  newBlock,
  recipe,
  removeBlock,
  sanitizeText,
  spriteTitle,
  validateProgram,
} from './dist/blocks.mjs';
import { generateSketch, PIN, executeBlocks } from './dist/blocks-gen.mjs';

function sketch(name) {
  return generateSketch(recipe(name));
}

assert.equal(RECIPE_NAMES[0][0], 'blank');
assert.equal(defaultProgram().units.length, 0);
assert.equal(defaultProgram().stage.length, 0);

assert.equal(spriteTitle('circle'), '圆');
assert.equal(spriteTitle('circle2'), '圆2');
assert.equal(spriteTitle('number'), '数字');
assert.equal(spriteTitle('number2'), '数字2');

const bounce = sketch('bounceBall');
assert.match(bounce, /void setup\(\)/);
assert.match(bounce, /void loop\(\)/);
assert.match(bounce, new RegExp(`Wire\\.begin\\(${PIN.sda}, ${PIN.scl}\\)`));
assert.match(bounce, /display\.begin\(SSD1306_SWITCHCAPVCC, 0x3C\)/);
assert.match(bounce, /fillCircle\(circle_x, circle_y, circle_r/);
assert.match(bounce, /circle_vx/);
assert.match(bounce, /stepSprites/);
assert.match(bounce, /drawSprites/);
assert.match(bounce, /#include <ESP_I2S\.h>/);
assert.match(bounce, /beep\(440/);

const text = sketch('text');
assert.match(text, /display\.print\("HELLO"\)/);

const beep = sketch('beep');
assert.match(beep, /#include <ESP_I2S\.h>/);
assert.match(beep, new RegExp(`i2s\\.setPins\\(${PIN.ampBclk}, ${PIN.ampLrc}, ${PIN.ampDin}`));
assert.match(beep, /beep\(1000, 350\)/);

const clap = sketch('clap');
assert.match(clap, /micPeak/);
assert.match(clap, /pinMode\(8, OUTPUT\)/);
assert.match(clap, /digitalWrite\(8, LOW\)/);
assert.match(clap, /micLevel\(\) > 40/);

const push = sketch('soundPush');
assert.match(push, /micLevel\(\) \/ 5/);
assert.match(push, /circle_x - circle_r > 127/);

const catchBox = sketch('catchBox');
assert.match(catchBox, /fillRect\(rect_x, rect_y, rect_w, rect_h/);
assert.match(catchBox, /hit_circle_rect/);
assert.match(catchBox, /score \+= 1/);

assert.equal(sanitizeText('你好Hello!'), 'HELLO!');
assert.equal(sanitizeText('abc_123'), 'ABC123');

const p = recipe('bounceBall');
assert.equal(listUnits(p).length, 1);
assert.ok(listSprites(p).some((s) => s.type === 'circle'));
const unit = listUnits(p)[0];
const before = unit.body.length;
insertBlock(p, { unitId: unit.id }, newBlock('wait', p));
assert.equal(unit.body.length, before + 1);
removeBlock(p, unit.body[unit.body.length - 1].id);
assert.equal(unit.body.length, before);

const second = newBlock('spriteCircle', p);
insertBlock(p, null, second);
assert.equal(listUnits(p).length, 2);
assert.equal(listUnits(p)[1].sprite.name, 'circle2');
assert.equal(spriteTitle(listUnits(p)[1].sprite.name), '圆2');

for (const [id] of RECIPE_NAMES) {
  const code = sketch(id);
  assert.match(code, /void setup\(\)/, id);
  assert.match(code, /void loop\(\)/, id);
  assert.match(code, /Wire\.begin\(5, 4\)/, id);
}

let drew = 0;
const ac = new AbortController();
const host = {
  display: { pixels: { fill() { drew++; } }, print() { drew++; }, color: 1, size: 1, x: 0, y: 0, rect() { drew++; }, circle() { drew++; }, line() {} },
  refresh() { drew++; ac.abort(); },
  delay: async () => {},
};
try {
  await executeBlocks(recipe('bounceBall'), host, ac.signal);
} catch (e) {
  if (e.message !== 'STOPPED') throw e;
}
assert.ok(drew > 0, '网页解释应画出圆');

const dirty = validateProgram({
  v: 2,
  start: [{ k: 'sprite', type: 'text', name: 'text', text: 'hi 中文', x: 999, y: -4, size: 9 }],
  body: [{ k: 'wait', sec: 99 }, { k: 'beep', pitch: 'ultra', sec: 0.01 }],
});
assert.equal(dirty.units[0].sprite.text, 'HI');
assert.equal(dirty.units[0].sprite.x, 127);
assert.equal(dirty.units[0].sprite.y, 0);
assert.equal(dirty.units[0].sprite.size, 3);
assert.equal(dirty.units[0].body[0].sec, 5);
assert.equal(dirty.units[0].body[1].pitch, 'mid');

const moveGroup = GROUPS.find((g) => g.id === 'move');
const senseGroup = GROUPS.find((g) => g.id === 'sense');
const controlGroup = GROUPS.find((g) => g.id === 'control');
assert.ok(moveGroup.items.some((i) => i.k === 'bounce'));
assert.ok(moveGroup.items.some((i) => i.k === 'wrap'));
assert.ok(!senseGroup.items.some((i) => i.k === 'bounce' || i.k === 'wrap'));
assert.ok(!controlGroup.items.some((i) => i.k === 'if'));
assert.equal(allowedInStart({ k: 'sprite' }), true);
assert.equal(allowedInStart({ k: 'move' }), false);
assert.equal(allowedInStart({ k: 'led' }), false);
assert.equal(allowedInStart({ k: 'bounce' }), false);
assert.equal(allowedInStart({ k: 'wait' }), false);

const zone = recipe('bounceBall');
const waitInSprite = newBlock('wait', zone);
assert.equal(canPlace(zone, waitInSprite, { zone: 'units', index: 0 }), false);
assert.equal(canPlace(zone, newBlock('move', zone), { zone: 'units', index: 0 }), false);
assert.equal(canPlace(zone, newBlock('move', zone), { zone: 'stage', index: 0 }), false);
insertAt(zone, { zone: 'unit', unitId: zone.units[0].id, index: zone.units[0].body.length }, waitInSprite);
assert.ok(zone.units[0].body.some((b) => b.id === waitInSprite.id));
assert.throws(() => insertAt(zone, { zone: 'stage', index: 0 }, newBlock('move', zone)));
assert.throws(() => insertAt(zone, { zone: 'units', index: 0 }, newBlock('move', zone)));

const ledOnStage = recipe('blank');
insertAt(ledOnStage, { zone: 'stage', index: 0 }, newBlock('ledOn', ledOnStage));
assert.equal(ledOnStage.stage[0].k, 'led');
assert.throws(() => insertBlock(ledOnStage, null, newBlock('move', ledOnStage)));

const edgeProg = recipe('blank');
insertBlock(edgeProg, null, newBlock('spriteCircle', edgeProg));
const rightHit = newBlock('ifEdge', edgeProg);
rightHit.who = 'circle';
rightHit.edge = 'right';
insertBlock(edgeProg, { unitId: edgeProg.units[0].id }, rightHit);
const onlyRight = newBlock('bounce', edgeProg);
insertBlock(edgeProg, { id: rightHit.id, slot: 'in' }, onlyRight);
assert.equal(onlyRight.edge, 'right');
const rightCode = generateSketch(edgeProg);
assert.match(rightCode, /circle_x \+ circle_r >= 127/);
assert.doesNotMatch(rightCode, /circle_x - circle_r <= 0/);
assert.doesNotMatch(rightCode, /circle_y - circle_r <= 0/);

const moved = validateProgram({
  v: 2,
  start: [
    { k: 'sprite', type: 'circle', name: 'circle', x: 16, y: 32, r: 6 },
    { k: 'wait', sec: 0.2 },
    { k: 'ifEdge', who: 'current', edge: 'any', body: [{ k: 'bounce', who: 'current' }] },
  ],
  body: [],
});
assert.equal(moved.units.length, 1);
assert.equal(moved.units[0].sprite.k, 'sprite');
assert.ok(moved.units[0].body.some((b) => b.k === 'wait'));
const movedEdge = moved.units[0].body.find((b) => b.k === 'ifEdge');
assert.equal(movedEdge.who, 'circle');
assert.equal(movedEdge.body[0].who, 'circle');
assert.equal(movedEdge.body[0].edge, 'any');

const miss = generateSketch({
  v: 3,
  units: [{ sprite: { k: 'sprite', type: 'circle', name: 'circle', x: 16, y: 32, r: 6 }, body: [{ k: 'move', who: 'rect', dir: 'right', amount: { k: 'num', v: 3 } }] }],
  stage: [],
});
assert.doesNotMatch(miss, /rect_vx/);
assert.match(miss, /circle_vx = \(3\)/);

const droppedIf = validateProgram({
  v: 3,
  units: [],
  stage: [{ k: 'if', op: 'gt', a: { k: 'num', v: 1 }, b: { k: 'num', v: 0 }, body: [], elseBody: [] }],
});
assert.equal(droppedIf.stage.length, 0);

const wrapCode = sketch('soundPush');
assert.match(wrapCode, /circle_x - circle_r > 127/);
assert.doesNotMatch(wrapCode, /circle_y - circle_r > 63/);

const counted = validateProgram({
  v: 3,
  units: [{ sprite: { k: 'sprite', type: 'number', name: 'number', x: 4, y: 2, value: { k: 'index' }, size: 2 }, body: [] }],
  stage: [],
});
assert.equal(counted.units[0].sprite.value.k, 'index');
const counterCode = sketch('counter');
assert.match(counterCode, /display\.print\(times\)/);
assert.match(counterCode, /times\+\+/);

const placed = generateSketch({
  v: 3,
  units: [{
    sprite: { k: 'sprite', type: 'rect', name: 'rect', x: 10, y: 10, w: 16, h: 16, fill: true },
    body: [
      { k: 'place', who: 'rect', where: 'right' },
      { k: 'place', who: 'rect', where: 'bottom' },
    ],
  }],
  stage: [],
});
assert.match(placed, /rect_x = 127 - \(rect_w\)/);
assert.match(placed, /rect_y = 63 - \(rect_h\)/);
assert.doesNotMatch(placed, /rect_x = 80/);
assert.doesNotMatch(placed, /rect_y = 48/);

const lineCode = generateSketch({
  v: 3,
  units: [{
    sprite: { k: 'sprite', type: 'line', name: 'line', x1: 8, y1: 8, x2: 40, y2: 20, thick: 3 },
    body: [{ k: 'bounce', who: 'line', edge: 'any' }],
  }],
  stage: [],
});
assert.match(lineCode, /line_x1/);
assert.match(lineCode, /line_ox1/);
assert.match(lineCode, /for \(int t = 0; t < 3; t\+\+\)/);
assert.doesNotMatch(lineCode, /line_x =/);
assert.doesNotMatch(lineCode, /line_w/);

const helloW = generateSketch({
  v: 3,
  units: [{
    sprite: { k: 'sprite', type: 'text', name: 'text', text: 'HELLO', x: 8, y: 8, size: 2 },
    body: [{ k: 'place', who: 'text', where: 'right' }],
  }],
  stage: [],
});
assert.match(helloW, /6 \* text_size \* 5/);

const fight = generateSketch({
  v: 3,
  units: [{
    sprite: { k: 'sprite', type: 'circle', name: 'circle', x: 16, y: 32, r: 6 },
    body: [
      { k: 'move', who: 'circle', dir: 'right', amount: { k: 'num', v: 3 } },
      { k: 'bounce', who: 'circle', edge: 'any' },
    ],
  }],
  stage: [],
});
const [fightSetup, fightLoop] = fight.split('void loop');
assert.match(fightSetup, /circle_vx = \(3\)/);
assert.doesNotMatch(fightLoop, /circle_vx = \(3\)/);

const oneSprite = recipe('blank');
oneSprite.units.push({ id: 'u1', sprite: newBlock('spriteCircle', oneSprite), body: [] });
const touch = newBlock('ifTouch', oneSprite);
assert.equal(touch.a, 'circle');
assert.equal(touch.b, '');

assert.ok(moveGroup.items.some((i) => i.k === 'place' && i.label.includes('瞬移')));

const numberSized = validateProgram({
  v: 3,
  units: [{ sprite: { k: 'sprite', type: 'number', name: 'number', x: 4, y: 2, value: { k: 'score' }, size: 3 }, body: [] }],
});
assert.equal(numberSized.units[0].sprite.size, 3);

const lineThick = validateProgram({
  v: 3,
  units: [{ sprite: { k: 'sprite', type: 'line', name: 'line', x1: 0, y1: 0, x2: 10, y2: 10, thick: 4 }, body: [] }],
});
assert.equal(lineThick.units[0].sprite.thick, 4);

let lineDrew = 0;
const ac2 = new AbortController();
try {
  await executeBlocks({
    v: 3,
    units: [{
      sprite: { k: 'sprite', type: 'line', name: 'line', x1: 8, y1: 8, x2: 40, y2: 20, thick: 2 },
      body: [{ k: 'move', who: 'line', dir: 'right', amount: { k: 'num', v: 2 } }, { k: 'bounce', who: 'line', edge: 'any' }],
    }],
    stage: [],
  }, {
    display: { pixels: { fill() { lineDrew++; } }, print() {}, color: 1, size: 1, x: 0, y: 0, rect() {}, circle() {}, line() { lineDrew++; } },
    refresh() { lineDrew++; ac2.abort(); },
    delay: async () => {},
  }, ac2.signal);
} catch (e) {
  if (e.message !== 'STOPPED') throw e;
}
assert.ok(lineDrew > 0, '线角色应能在网页里画出来');

const order = recipe('blank');
insertBlock(order, null, newBlock('spriteCircle', order));
const waitA = newBlock('wait', order);
const waitB = newBlock('wait', order);
const waitC = newBlock('wait', order);
waitA.sec = 0.1;
waitB.sec = 0.2;
waitC.sec = 0.3;
const u0 = order.units[0];
insertAt(order, { zone: 'unit', unitId: u0.id, index: 0 }, waitA);
insertAt(order, { zone: 'unit', unitId: u0.id, index: 0 }, waitB);
insertAt(order, { zone: 'unit', unitId: u0.id, index: 1 }, waitC);
assert.equal(u0.body.map((b) => b.sec).join(','), '0.2,0.3,0.1');
assert.equal(moveBlock(order, waitA.id, { zone: 'unit', unitId: u0.id, index: 0 }), true);
assert.equal(u0.body.map((b) => b.sec).join(','), '0.1,0.2,0.3');
assert.equal(moveBlock(order, waitA.id, { zone: 'units', index: 0 }), false);

const nestMove = recipe('blank');
insertBlock(nestMove, null, newBlock('spriteCircle', nestMove));
const edge = newBlock('ifEdge', nestMove);
edge.who = 'circle';
edge.edge = 'left';
insertAt(nestMove, { zone: 'unit', unitId: nestMove.units[0].id, index: 0 }, edge);
const bounceIn = newBlock('bounce', nestMove);
bounceIn.who = 'circle';
bounceIn.edge = 'any';
insertAt(nestMove, { zone: 'unit', unitId: nestMove.units[0].id, index: 1 }, bounceIn);
assert.equal(moveBlock(nestMove, bounceIn.id, { zone: 'unit', unitId: nestMove.units[0].id, parentId: edge.id, slot: 'in', index: 0 }), true);
assert.equal(nestMove.units[0].body.length, 1);
assert.equal(edge.body[0].id, bounceIn.id);
assert.equal(edge.body[0].edge, 'left');
assert.equal(moveBlock(nestMove, edge.id, { parentId: edge.id, slot: 'in', index: 0 }), false);

const two = recipe('blank');
insertBlock(two, null, newBlock('spriteCircle', two));
insertBlock(two, null, newBlock('spriteCircle', two));
assert.equal(two.units[0].sprite.name, 'circle');
assert.equal(two.units[1].sprite.name, 'circle2');
const mv = newBlock('move', two);
insertAt(two, { zone: 'unit', unitId: two.units[1].id, index: 0 }, mv);
assert.equal(mv.who, 'circle2');
const hit2 = newBlock('ifTouch', two);
insertAt(two, { zone: 'unit', unitId: two.units[1].id, index: 1 }, hit2);
assert.equal(hit2.a, 'circle2');
assert.equal(hit2.b, 'circle');

const nestedWho = validateProgram({
  v: 3,
  units: [
    {
      sprite: { k: 'sprite', type: 'circle', name: 'circle', x: 16, y: 32, r: 6 },
      body: [{ k: 'ifEdge', who: 'current', edge: 'any', body: [{ k: 'bounce', who: 'current', edge: 'any' }] }],
    },
    { sprite: { k: 'sprite', type: 'circle', name: 'circle2', x: 80, y: 32, r: 6 }, body: [] },
  ],
  stage: [],
});
assert.equal(nestedWho.units[0].body[0].who, 'circle');
assert.equal(nestedWho.units[0].body[0].body[0].who, 'circle');

const bounceThenTurn = generateSketch({
  v: 3,
  units: [{
    sprite: { k: 'sprite', type: 'circle', name: 'circle', x: 16, y: 32, r: 6 },
    body: [
      { k: 'move', who: 'circle', dir: 'right', amount: { k: 'num', v: 3 } },
      { k: 'bounce', who: 'circle', edge: 'any' },
      { k: 'ifSound', op: 'gt', thresh: 40, body: [{ k: 'move', who: 'circle', dir: 'up', amount: { k: 'num', v: 2 } }], elseBody: [] },
    ],
  }],
  stage: [],
});
const [turnSetup, turnLoop] = bounceThenTurn.split('void loop');
assert.match(turnSetup, /circle_vx = \(3\)/);
assert.doesNotMatch(turnLoop, /circle_vx = \(3\)/);
assert.match(turnLoop, /circle_vy = -\(2\)/);

const eyesWait = generateSketch({
  v: 3,
  units: [
    {
      sprite: { k: 'sprite', type: 'circle', name: 'circle', x: 24, y: 24, r: 6 },
      body: [{ k: 'wait', sec: 0.5 }, { k: 'move', who: 'circle', dir: 'right', amount: { k: 'num', v: 1 } }],
    },
    {
      sprite: { k: 'sprite', type: 'circle', name: 'circle2', x: 80, y: 24, r: 6 },
      body: [{ k: 'wait', sec: 0.5 }, { k: 'move', who: 'circle2', dir: 'left', amount: { k: 'num', v: 1 } }],
    },
  ],
  stage: [],
});
assert.match(eyesWait, /sleep_u0/);
assert.match(eyesWait, /sleep_u1/);
assert.match(eyesWait, /run_u0\(\)/);
assert.match(eyesWait, /run_u1\(\)/);
assert.doesNotMatch(eyesWait, /delay\(500\)/);

const ledWait = sketch('led');
assert.match(ledWait, /sleep_st/);
assert.match(ledWait, /run_st\(\)/);
assert.doesNotMatch(ledWait, /delay\(400\)/);

let frames = 0;
const seenX = [];
const ac3 = new AbortController();
try {
  await executeBlocks({
    v: 3,
    units: [
      {
        sprite: { k: 'sprite', type: 'circle', name: 'circle', x: 16, y: 32, r: 6, fill: true },
        body: [{ k: 'wait', sec: 5 }, { k: 'move', who: 'circle', dir: 'right', amount: { k: 'num', v: 3 } }],
      },
      {
        sprite: { k: 'sprite', type: 'circle', name: 'circle2', x: 80, y: 32, r: 6, fill: true },
        body: [{ k: 'move', who: 'circle2', dir: 'left', amount: { k: 'num', v: 3 } }],
      },
    ],
    stage: [],
  }, {
    display: {
      pixels: { fill() {} },
      print() {},
      color: 1,
      size: 1,
      x: 0,
      y: 0,
      rect() {},
      circle(x) { seenX.push(x); },
      line() {},
    },
    refresh() {
      frames++;
      if (frames > 4) ac3.abort();
    },
    delay: async () => {},
  }, ac3.signal);
} catch (e) {
  if (e.message !== 'STOPPED') throw e;
}
const later = seenX.slice(-2);
assert.ok(later.some((x) => x < 80 && x > 40), '一个角色在等待时，另一个仍应移动');
assert.ok(later.some((x) => x === 16), '等待中的角色还不该开始移动');

const stageGate = recipe('led');
const nestedIf = newBlock('ifSound', stageGate);
insertAt(stageGate, { zone: 'stage', index: 0 }, nestedIf);
assert.equal(canPlace(stageGate, newBlock('move', stageGate), { zone: 'stage', parentId: nestedIf.id, slot: 'in', index: 0 }), false);

console.log('blocks gen ok', RECIPE_NAMES.map(([id]) => id).join(', '));
