import assert from 'node:assert/strict';
import {holes,internal,boardEdges,placement,footprint,validPlacement,occupied} from './dist/breadboard.mjs';
import {connected,checkCircuit,lessonWires,definitions} from './dist/circuit.mjs';
import {holeMap} from './dist/breadboard.mjs';
assert.equal(holes.length,400);assert.equal(new Set(holes.map(h=>h.id)).size,400);
assert.ok(connected(internal,'bb:a1','bb:e1'));
assert.ok(!connected(internal,'bb:a1','bb:a2'));
assert.ok(!connected(internal,'bb:e1','bb:f1'));
assert.ok(connected(internal,'bb:L+1','bb:L+25'));
assert.ok(!connected(internal,'bb:L+1','bb:R+1'));
assert.ok(!connected(internal,'bb:L+1','bb:L-1'));
const parts=['esp','oled','amp','mic','speaker'].map(id=>placement(id));
let placed=[];for(const p of parts){assert.ok(validPlacement(placed,p.id,p.row));placed.push(p);}
assert.ok(!validPlacement(parts,'esp',28));assert.ok(!validPlacement(parts,'esp',12));
const edges=boardEdges(parts),wire=[];
for(const [a,b]of lessonWires){const holesFor=pin=>{const hole=footprint(pin.split(':')[0]).find(e=>e.a===pin).b;return holes.find(h=>h.id!==hole&&!occupied(parts,wire).has(h.id)&&connected(internal,hole,h.id)).id;};wire.push({a:holesFor(a),b:holesFor(b)});}
assert.ok(checkCircuit([...edges,...wire],parts.map(p=>p.id)).ready);
assert.ok(!checkCircuit([...edges,...wire.slice(1)],parts.map(p=>p.id)).ready);
assert.ok(!checkCircuit([...boardEdges(parts.map(p=>p.id==='oled'?placement('oled',13):p)),...wire],parts.map(p=>p.id)).ready);
assert.equal(checkCircuit(edges,parts.map(p=>p.id)).errors.length,0);
for(const id of ['esp','oled','amp']){const p=placement(id),d=definitions.find(d=>d.id===id);for(const e of footprint(id)){const pin=d.pins.find(v=>v[0]===e.a.split(':')[1]),h=holeMap.get(e.b),x=p.pos[0]+pin[1]*Math.cos(p.rotation)-pin[2]*Math.sin(p.rotation),y=p.pos[1]+pin[1]*Math.sin(p.rotation)+pin[2]*Math.cos(p.rotation);assert.ok(Math.hypot(x-h.x,y-h.y)<.001,`${e.a} must align exactly with ${e.b}`);}}
assert.ok(connected(edges,'speaker:+','amp:+'));assert.ok(connected(edges,'speaker:-','amp:-'));
assert.ok(!connected(edges,'speaker:+','bb:a30'));assert.equal(footprint('speaker').length,0);
console.log('PASS: exact header-to-hole alignment and direct speaker screw-terminal wiring');
console.log('PASS: 400 holes, strip isolation, rail isolation, five footprints, overlap, bounds, OLED circuit and movement');
