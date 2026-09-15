import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), 'dist');
const app = readFileSync(join(root, 'app.mjs'), 'utf8');
const scene = readFileSync(join(root, 'board-scene.mjs'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');

assert.match(app, /function wiringFrozen\(\)\{return wiringMode!=='custom';\}/);
assert.match(app, /table\.highlight\(taskIds,pending,netIds\)/);
assert.match(app, /if\(wiringFrozen\(\)\) return;\s*if\(!holeMap\.has\(id\)\)return;/);
assert.match(app, /table\.setFrozen\(mode!=='custom'\)/);
assert.match(app, /btn\.disabled=wiringFrozen\(\)/);
assert.match(app, /if\(!table\|\|wiringFrozen\(\)\)return/);
assert.match(app, /if\(wiringFrozen\(\)\|\|!selected\)return/);
assert.doesNotMatch(app, /零件挪过以后，请按新的空孔接线/);
assert.doesNotMatch(app, /table\.highlight\(\[\],pending\)/);

assert.match(scene, /let taskLit = \[\]/);
assert.match(scene, /let frozen = false/);
assert.match(scene, /setFrozen\(on\)/);
assert.match(scene, /0xf0b429/);
assert.match(scene, /task \? 1\.22 : net \? 1\.06/);
assert.match(scene, /if \(frozen\) \{\s*panning = \{ x: e\.clientX, y: e\.clientY \}/);
assert.match(scene, /const h = mode === "top" \? nearest\(p\) : null;/);
assert.doesNotMatch(scene, /let drag = null/);
assert.doesNotMatch(scene, /drag = \{ id: selected/);
assert.doesNotMatch(scene, /callbacks\.change\(\)/);

assert.match(html, /app\.mjs\?v=20260915-2/);
assert.match(html, /零件位置是写死的，不能拖/);
assert.match(html, /金黄灯是这一步要接的两个孔/);
assert.doesNotMatch(html, /左键拖零件/);

console.log('PASS: wiring freeze, two lights, hole-first click');
