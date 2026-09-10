import assert from 'node:assert/strict';
import {compile,execute} from './dist/runtime.mjs';
import {examples} from './dist/examples.mjs';
import {checkCircuit,lessonWires,validateProject} from './dist/circuit.mjs';
import {Display} from './dist/display.mjs';
for(const code of Object.values(examples))assert.ok(compile(code));
for(const code of ['void setup(){}','void setup(){bad();}void loop(){}','void setup(){delay();}void loop(){}','#include <ESP_I2S.h>\nvoid setup(){}void loop(){}','void setup(){int x=;}void loop(){}'])assert.throws(()=>compile(code));
const wires=lessonWires.map(([a,b])=>({a,b}));
assert.equal(checkCircuit(wires,['esp','oled']).ready,true);
assert.equal(checkCircuit(wires.slice(1),['esp','oled']).ready,false);
assert.equal(checkCircuit(wires,['esp','oled'],4,5).ready,false);
assert.ok(checkCircuit([...wires,{a:'esp:G',b:'esp:3.3'}],['esp','oled']).errors.length);
assert.throws(()=>validateProject({version:1,code:'',parts:[],wires:[{a:'bogus',b:'esp:G'}]}));
const d=new Display();d.circle(40,32,14,1,true);assert.equal(d.pixels[32*128+40],1);assert.equal(d.pixels[0],0);
const controller=new AbortController(),calls=[];
try{await execute(compile('void setup(){}void loop(){for(int x=0;x<3;x++){Serial.println(x);}delay(1);}'),{call(n,a){calls.push([n,...a]);if(calls.length===3)controller.abort();}},controller.signal);}catch(e){assert.equal(e.message,'STOPPED');}
assert.deepEqual(calls,[['Serial.println',0],['Serial.println',1],['Serial.println',2]]);
const stop=new AbortController();setTimeout(()=>stop.abort(),20);await assert.rejects(execute(compile('void setup(){}void loop(){while(true){}}'),{call(){}},stop.signal),/STOPPED/);
console.log('PASS: examples, syntax errors, unsupported libraries, wiring, shorts, pixels, loop execution and cancellation');
