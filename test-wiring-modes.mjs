import assert from 'node:assert/strict';
import { defaults, placement, autoWires, validPlacement } from './dist/breadboard.mjs';
import { checkCircuit, lessonWires } from './dist/circuit.mjs';

const FULL = [
  ['esp:G', 'rail:R-'],
  ['esp:3.3', 'rail:R+'],
  ['oled:GND', 'rail:R-'],
  ['oled:VCC', 'rail:R+'],
  ['oled:SCL', 'esp:4'],
  ['oled:SDA', 'esp:5'],
  ['amp:GND', 'rail:L-'],
  ['amp:Vin', 'rail:L+'],
  ['amp:LRC', 'esp:7'],
  ['amp:BCLK', 'esp:8'],
  ['amp:DIN', 'esp:9'],
  ['mic:GND', 'rail:R-'],
  ['mic:VDD', 'rail:R+'],
  ['mic:WS', 'esp:20'],
  ['mic:SCK', 'esp:21'],
  ['mic:SD', 'esp:10'],
  ['rail:L-', 'rail:R-'],
  ['rail:L+', 'rail:R+'],
];

const parts = [];
for (const id of ['esp', 'oled', 'amp', 'mic', 'speaker']) {
  if (id !== 'speaker') assert.ok(validPlacement(parts, id, defaults[id]), id + ' 默认行位无效');
  parts.push(placement(id));
}

const wires = autoWires(parts, FULL);
console.log('ready wires', wires.length, '/', FULL.length);
assert.equal(wires.length, FULL.length);

const ids = parts.map((p) => p.id);
const graph = [...wires, ...(await import('./dist/breadboard.mjs')).boardEdges(parts)];
const result = checkCircuit(graph, ids);
console.log('checkCircuit', result);
assert.equal(result.errors.length, 0, result.errors.join('; '));
assert.equal(result.ready, true, 'OLED 应通过电源和总线检查');

const custom = [placement('esp'), placement('oled')];
const four = autoWires(custom, lessonWires.map((w) => [w[0], w[1]]));
assert.equal(four.length, 4);
const customGraph = [...four, ...(await import('./dist/breadboard.mjs')).boardEdges(custom)];
assert.equal(checkCircuit(customGraph, ['esp', 'oled']).ready, true);

console.log('PASS: wiring modes');
