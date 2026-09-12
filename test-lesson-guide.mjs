import assert from 'node:assert/strict';
import { placement, autoWires, boardEdges, freeOnNet, footprint } from './dist/breadboard.mjs';
import { lessons, checkCircuit, getLessonProgress, diagnoseWrongWire } from './dist/circuit.mjs';

const lesson = lessons[0];
const parts = lesson.parts.map((id) => placement(id));
const graph = (wires) => [...wires, ...boardEdges(parts)];

const four = autoWires(parts, lesson.wires.map((w) => [w[0], w[1]]));
assert.equal(four.length, 4);
const ok = getLessonProgress(1, graph(four), ['esp', 'oled']);
assert.equal(ok.done, 4, '接对四根线后进度应为 4');
assert.equal(ok.completed, true, '第1课应完成');
assert.equal(ok.errors.length, 0);

const none = getLessonProgress(1, graph([]), ['esp', 'oled']);
assert.equal(none.done, 0);
assert.equal(none.completed, false);

const swapped = autoWires(parts, [['oled:SCL', 'esp:5'], ['oled:SDA', 'esp:4'], ['oled:GND', 'esp:G'], ['oled:VCC', 'esp:3.3']]);
const bad = getLessonProgress(1, graph(swapped), ['esp', 'oled']);
assert.equal(bad.completed, false);
assert.ok(bad.errors.some((e) => /SCL|SDA/.test(e)), 'SCL/SDA 接反应有错误：' + bad.errors.join(';'));

const vccGnd = autoWires(parts, [['oled:VCC', 'esp:G']]);
const power = checkCircuit(graph(vccGnd), ['esp', 'oled']);
assert.ok(power.errors.some((e) => /VCC/.test(e)), 'VCC 接地应报错');

const moved = [placement('esp', 2), placement('oled', 20)];
const holeA = freeOnNet('oled:GND', moved, []);
const holeB = freeOnNet('esp:G', moved, []);
assert.ok(holeA && holeB);
const defaultA = freeOnNet('oled:GND', parts, []);
assert.notEqual(holeA, defaultA, 'OLED 换行后，指导孔位必须跟着变');
const pinHole = footprint('oled', 20).find((e) => e.a === 'oled:GND').b;
assert.equal(pinHole.startsWith('bb:'), true);
assert.ok(holeA.startsWith('bb:'));

const wrongMsg = diagnoseWrongWire(graph(autoWires(parts, [['oled:GND', 'esp:4']])), lesson, holeA, freeOnNet('esp:4', parts, []));
assert.ok(!wrongMsg || /GND|4/.test(wrongMsg));

console.log('PASS: lesson guide uses live holes and reports wrong wires');
