import { defaults, footprint, holeMap, rowOf } from './breadboard.mjs';

export const definitions=[
 {id:'oled',name:'0.96 寸 OLED',detail:'128 × 64 屏幕',color:'#12618d',model:0,pos:[24,12],pins:[['GND',-3.81,11.9],['VCC',-1.27,11.9],['SCL',1.27,11.9],['SDA',3.81,11.9]]},
 {id:'esp',name:'ESP32-C3',detail:'SuperMini 主控',color:'#253139',model:1,pos:[-26,10],pins:[...['5V','G','3.3','4','3','2','1','0'].map((n,i)=>[n,7.62,8.89-i*2.54]),...['5','6','7','8','9','10','20','21'].map((n,i)=>[n,-7.62,8.89-i*2.54])]},
 {id:'amp',name:'MAX98357A',detail:'功放 · tone() 走电脑喇叭',color:'#982972',model:2,pos:[-26,-28],pins:[...['LRC','BCLK','DIN','GAIN','SD','GND','Vin'].map((n,i)=>[n,(i-3)*2.54,-8.35]),['-',-2.05,10],['+',2.05,10]]},
 {id:'mic',name:'MSM3526',detail:'麦克风 · analogRead() 走电脑麦克风',color:'#d1a60b',model:3,pos:[0,-26],pins:[...['L/R','WS','SCK'].map((n,i)=>[n,-4.4,-2.54+i*2.54]),...['GND','VDD','SD'].map((n,i)=>[n,4.4,-2.54+i*2.54])]},
 {id:'speaker',name:'喇叭',detail:'8Ω 0.5W · 虚拟运行走电脑喇叭',color:'#606b73',model:4,pos:[33,-24],pins:[['-',20,20],['+',23,20]]}
];
export const pinIds=new Set(definitions.flatMap(d=>d.pins.map(p=>d.id+':'+p[0])));

// 课程定义
export const lessons = [
  {
    id: 1,
    name: '第1课：点亮眼睛',
    description: '连接 OLED 屏幕，让小伙伴眨眨眼',
    parts: ['esp', 'oled'],
    wires: [
      ['oled:GND','esp:G','地线 GND','把 OLED 的 GND 接到 ESP32 的 G。'],
      ['oled:VCC','esp:3.3','电源 VCC','把 OLED 的 VCC 接到 ESP32 的 3.3。'],
      ['oled:SCL','esp:4','时钟 SCL','把 OLED 的 SCL 接到 ESP32 的 4。'],
      ['oled:SDA','esp:5','数据 SDA','把 OLED 的 SDA 接到 ESP32 的 5。']
    ],
    examples: ['connectivity', 'eyes', 'move', 'text', 'clock', 'heart', 'progress', 'bounce', 'counter', 'led'],
    completionCheck: (wires, active) => {
      const check = checkCircuit(wires, active, 5, 4);
      return check.ready && active.includes('oled');
    }
  },
  {
    id: 2,
    name: '第2课：让它说话',
    description: '加上功放和喇叭，播放音调',
    parts: ['esp', 'oled', 'amp', 'speaker'],
    wires: [
      ['oled:GND','esp:G','OLED 地线','OLED 的 GND 接到 ESP32 的 G。'],
      ['oled:VCC','esp:3.3','OLED 电源','OLED 的 VCC 接到 ESP32 的 3.3。'],
      ['oled:SCL','esp:4','OLED 时钟','OLED 的 SCL 接到 ESP32 的 4。'],
      ['oled:SDA','esp:5','OLED 数据','OLED 的 SDA 接到 ESP32 的 5。'],
      ['amp:GND','esp:G','功放地线','功放的 GND 接到 ESP32 的 G。'],
      ['amp:Vin','esp:3.3','功放电源','功放的 Vin 接到 ESP32 的 3.3。'],
      ['amp:LRC','esp:7','LRC 信号','功放的 LRC 接到 ESP32 的 7。'],
      ['amp:BCLK','esp:8','BCLK 信号','功放的 BCLK 接到 ESP32 的 8。'],
      ['amp:DIN','esp:9','DIN 信号','功放的 DIN 接到 ESP32 的 9。']
    ],
    examples: ['connectivity', 'speaker'],
    completionCheck: (wires, active) => {
      const check = checkCircuit(wires, active, 5, 4);
      return check.ready && active.includes('amp') && active.includes('speaker');
    }
  },
  {
    id: 3,
    name: '第3课：让它听声音',
    description: '加上麦克风，感知周围的声音',
    parts: ['esp', 'oled', 'amp', 'speaker', 'mic'],
    wires: [
      ['oled:GND','esp:G','OLED 地线','OLED 的 GND 接到 ESP32 的 G。'],
      ['oled:VCC','esp:3.3','OLED 电源','OLED 的 VCC 接到 ESP32 的 3.3。'],
      ['oled:SCL','esp:4','OLED 时钟','OLED 的 SCL 接到 ESP32 的 4。'],
      ['oled:SDA','esp:5','OLED 数据','OLED 的 SDA 接到 ESP32 的 5。'],
      ['amp:GND','esp:G','功放地线','功放的 GND 接到 ESP32 的 G。'],
      ['amp:Vin','esp:3.3','功放电源','功放的 Vin 接到 ESP32 的 3.3。'],
      ['amp:LRC','esp:7','LRC 信号','功放的 LRC 接到 ESP32 的 7。'],
      ['amp:BCLK','esp:8','BCLK 信号','功放的 BCLK 接到 ESP32 的 8。'],
      ['amp:DIN','esp:9','DIN 信号','功放的 DIN 接到 ESP32 的 9。'],
      ['mic:GND','esp:G','麦克风地线','麦克风的 GND 接到 ESP32 的 G。'],
      ['mic:VDD','esp:3.3','麦克风电源','麦克风的 VDD 接到 ESP32 的 3.3。'],
      ['mic:WS','esp:20','WS 信号','麦克风的 WS 接到 ESP32 的 20。'],
      ['mic:SCK','esp:21','SCK 信号','麦克风的 SCK 接到 ESP32 的 21。'],
      ['mic:SD','esp:10','SD 信号','麦克风的 SD 接到 ESP32 的 10。']
    ],
    examples: ['connectivity', 'microphone', 'voice_light', 'dino_jump', 'star_catch', 'clap_mole'],
    completionCheck: (wires, active) => {
      const check = checkCircuit(wires, active, 5, 4);
      return check.ready && active.includes('mic');
    }
  }
];

// 兼容旧代码
export const lessonWires = lessons[0].wires;

export function connected(wires,a,b){const seen=new Set([a]),q=[a];while(q.length){const c=q.pop();if(c===b)return true;for(const w of wires){const next=w.a===c?w.b:w.b===c?w.a:null;if(next&&!seen.has(next)){seen.add(next);q.push(next);}}}return false;}

export function pinLabel(id) {
  if (!id) return '未知针脚';
  if (id.startsWith('bb:')) return '孔 ' + id.slice(3);
  if (id.startsWith('rail:')) return id.slice(5) + ' 电源轨';
  const [part, pin] = id.split(':');
  const name = definitions.find((d) => d.id === part)?.name || part;
  return name + ' ' + pin;
}

export function neighborsOf(wires, start) {
  const seen = new Set([start]);
  const q = [start];
  while (q.length) {
    const c = q.pop();
    for (const w of wires) {
      const next = w.a === c ? w.b : w.b === c ? w.a : null;
      if (next && !seen.has(next)) {
        seen.add(next);
        q.push(next);
      }
    }
  }
  return seen;
}

export function checkCircuit(wires, active, sda = 5, scl = 4) {
  const errors = [];

  for (const [a, b] of [['esp:G', 'esp:3.3'], ['esp:G', 'esp:5V'], ['esp:3.3', 'esp:5V']]) {
    if (connected(wires, a, b)) {
      errors.push('⚠️ 电源短接：' + a.split(':')[1] + ' 与 ' + b.split(':')[1] + ' 不能连接！');
    }
  }

  if (!active.includes('esp')) errors.push('⚠️ 请先放入 ESP32 主控板。');

  if (active.includes('oled')) {
    if (connected(wires, 'oled:VCC', 'esp:5V')) {
      errors.push('⚠️ OLED 的 VCC 接到了 5V！应该接 3.3V。');
    }
    if (connected(wires, 'oled:VCC', 'esp:G')) {
      errors.push('⚠️ OLED 的 VCC 接到了地线 G！应该接 3.3V。');
    }
    if (connected(wires, 'oled:GND', 'esp:3.3') || connected(wires, 'oled:GND', 'esp:5V')) {
      errors.push('⚠️ OLED 的 GND 接到了电源！应该接地线 G。');
    }
  }

  const powered = active.includes('oled') && connected(wires, 'oled:GND', 'esp:G') && connected(wires, 'oled:VCC', 'esp:3.3');
  const bus = Number.isInteger(sda) && Number.isInteger(scl) && sda !== scl && connected(wires, 'oled:SDA', 'esp:' + sda) && connected(wires, 'oled:SCL', 'esp:' + scl);

  if (active.includes('oled') && powered && !bus) {
    if (connected(wires, 'oled:SCL', 'esp:' + sda) && connected(wires, 'oled:SDA', 'esp:' + scl)) {
      errors.push('⚠️ OLED 的 SCL 和 SDA 接反了！SCL 应接 GPIO4，SDA 应接 GPIO5。');
    } else if (connected(wires, 'oled:SCL', 'esp:' + sda)) {
      errors.push('⚠️ OLED 的 SCL 接到了 GPIO' + sda + '。应接到 GPIO4。');
    } else if (connected(wires, 'oled:SDA', 'esp:' + scl)) {
      errors.push('⚠️ OLED 的 SDA 接到了 GPIO' + scl + '。应接到 GPIO5。');
    }
  }

  const pins = [...new Set(wires.flatMap((w) => [w.a, w.b]))].filter((x) => x.startsWith('esp:') && !/esp:(G|3\.3|5V)$/.test(x));
  for (let i = 0; i < pins.length; i++) {
    for (let j = i + 1; j < pins.length; j++) {
      if (connected(wires, pins[i], pins[j]) && !errors.length) {
        errors.push('⚠️ 两个不同的 ESP32 引脚被接到一起：' + pins[i].split(':')[1] + ' 和 ' + pins[j].split(':')[1] + '。');
      }
    }
  }

  return { errors, powered, bus, ready: powered && bus && !errors.length };
}

export function checkWire(wires, wireSpec) {
  const [a, b] = wireSpec;
  return connected(wires, a, b);
}

export function diagnoseWrongWire(net, lesson, from, to) {
  if (!from || !to || from === to) return '';
  const fromPins = [...neighborsOf(net, from)].filter((id) => !id.startsWith('bb:') && !id.startsWith('rail:'));
  const toPins = [...neighborsOf(net, to)].filter((id) => !id.startsWith('bb:') && !id.startsWith('rail:'));
  const pairs = [];
  for (const a of fromPins) for (const b of toPins) if (a !== b) pairs.push([a, b]);
  if (!pairs.length) return '';
  const needed = lesson.wires.map((w) => [w[0], w[1]]);
  const isNeeded = pairs.some(([a, b]) => needed.some(([x, y]) => (a === x && b === y) || (a === y && b === x)));
  if (isNeeded) return '';
  const [a, b] = pairs[0];
  const matchA = needed.find((w) => w[0] === a || w[1] === a);
  if (matchA) {
    const expect = matchA[0] === a ? matchA[1] : matchA[0];
    return '⚠️ ' + pinLabel(a) + ' 现在接到了 ' + pinLabel(b) + '。这一课应接到 ' + pinLabel(expect) + '。';
  }
  return '⚠️ ' + pinLabel(a) + ' 接到了 ' + pinLabel(b) + '。这不是当前这一课要接的线。';
}

export function newPartsForLesson(lessonId) {
  const lesson = lessons.find((l) => l.id === lessonId);
  if (!lesson) return [];
  if (lessonId <= 1) return lesson.parts.slice();
  const prev = new Set((lessons.find((l) => l.id === lessonId - 1) || { parts: [] }).parts);
  return lesson.parts.filter((id) => !prev.has(id));
}

function wireKey(spec) {
  return [spec[0], spec[1]].slice().sort().join('|');
}

export function previousWiresForLesson(lessonId) {
  const lesson = lessons.find((l) => l.id === lessonId);
  if (!lesson || lessonId <= 1) return [];
  const prev = lessons.find((l) => l.id === lessonId - 1);
  const keys = new Set((prev?.wires || []).map(wireKey));
  return lesson.wires.filter((w) => keys.has(wireKey(w)));
}

export function newWiresForLesson(lessonId) {
  const lesson = lessons.find((l) => l.id === lessonId);
  if (!lesson) return [];
  if (lessonId <= 1) return lesson.wires.slice();
  const keys = new Set(previousWiresForLesson(lessonId).map(wireKey));
  return lesson.wires.filter((w) => !keys.has(wireKey(w)));
}

export function wireTouchesPart(wire, partId, parts) {
  if (!wire || !partId) return false;
  if ([wire.a, wire.b].some((p) => String(p).startsWith(partId + ':'))) return true;
  const part = (parts || []).find((p) => p.id === partId);
  const row = part ? rowOf(part) : defaults[partId];
  if (!row) return false;
  const nets = new Set();
  for (const e of footprint(partId, row)) {
    const h = holeMap.get(e.b);
    if (h) nets.add(h.net);
  }
  return [wire.a, wire.b].some((end) => {
    const h = holeMap.get(end);
    return !!(h && nets.has(h.net));
  });
}

export function keepWiresFromPreviousLessons(wires, lessonId, parts) {
  if (lessonId <= 1) return [];
  const extra = newPartsForLesson(lessonId);
  return (wires || []).filter((w) => !extra.some((id) => wireTouchesPart(w, id, parts)));
}

export function getLessonProgress(lessonId, net, active) {
  const lesson = lessons.find((l) => l.id === lessonId);
  if (!lesson) return { total: 0, done: 0, wiresDone: [], newWires: [], newDone: [], prevWires: [], prevDone: [], errors: [], completed: false };

  const check = checkCircuit(net, active, 5, 4);
  const wiresDone = lesson.wires.map((w) => checkWire(net, w.slice(0, 2)));
  const prevWires = previousWiresForLesson(lessonId);
  const newWires = newWiresForLesson(lessonId);
  const prevDone = prevWires.map((w) => checkWire(net, w.slice(0, 2)));
  const newDone = newWires.map((w) => checkWire(net, w.slice(0, 2)));
  const doneCount = wiresDone.filter(Boolean).length;
  const completed = wiresDone.every(Boolean) && lesson.parts.every((id) => active.includes(id)) && !check.errors.length;

  return {
    total: lesson.wires.length,
    done: doneCount,
    wiresDone,
    newWires,
    newDone,
    prevWires,
    prevDone,
    errors: check.errors,
    completed,
  };
}

export function validateProject(p){if(!p||p.version!==1||typeof p.code!=='string'||p.code.length>50000||!Array.isArray(p.parts)||!Array.isArray(p.wires)||p.wires.length>80||p.parts.length>5)throw Error('作品格式不正确或内容过大');let ids=new Set();for(const d of p.parts){if(!definitions.some(x=>x.id===d.id)||ids.has(d.id)||!Array.isArray(d.pos)||d.pos.length!==2||!d.pos.every(n=>Number.isFinite(n)&&Math.abs(n)<150)||!Number.isFinite(d.rotation)||Math.abs(d.rotation)>100||typeof d.flipped!=='boolean')throw Error('零件数据不正确');ids.add(d.id);}for(const w of p.wires){if(!pinIds.has(w.a)||!pinIds.has(w.b)||w.a===w.b||![w.a,w.b].every(x=>ids.has(x.split(':')[0])))throw Error('接线数据不正确');}return p;}
