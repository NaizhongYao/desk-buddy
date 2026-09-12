const MAX_BLOCKS = 40;
const MAX_NEST = 4;
const MAX_TEXT = 12;
const FONT_OK = /[^A-Z0-9 !?.:+\-/%]/g;

let seq = 1;
export function nid() {
  return 'b' + seq++;
}
export function syncSeq(program) {
  let max = 0;
  walk(program, (b) => {
    const n = Number(String(b.id || '').replace(/^b/, ''));
    if (Number.isFinite(n) && n > max) max = n;
  });
  for (const u of program?.units || []) {
    const n = Number(String(u.id || '').replace(/^b/, ''));
    if (Number.isFinite(n) && n > max) max = n;
  }
  seq = max + 1;
}

export const SPRITE_TYPES = ['circle', 'rect', 'text', 'number', 'line'];
export const SPRITE_LABEL = { circle: '圆', rect: '方块', text: '文字', number: '数字', line: '线' };
export const DIR_LABEL = { left: '向左', right: '向右', up: '向上', down: '向下' };
export const EDGE_LABEL = { any: '任意边缘', left: '左边', right: '右边', top: '上边', bottom: '下边' };
export const SPRITE_ACTIONS = new Set(['move', 'bounce', 'wrap', 'place', 'ifEdge', 'ifExit']);

export const GROUPS = [
  {
    id: 'sprite',
    name: '角色',
    items: [
      { k: 'spriteCircle', label: '圆' },
      { k: 'spriteRect', label: '方块' },
      { k: 'spriteText', label: '文字' },
      { k: 'spriteNumber', label: '数字' },
      { k: 'spriteLine', label: '线' },
    ],
  },
  {
    id: 'move',
    name: '运动',
    items: [
      { k: 'move', label: '移动' },
      { k: 'bounce', label: '反弹' },
      { k: 'wrap', label: '从另一边回来' },
      { k: 'place', label: '瞬移到边上' },
    ],
  },
  {
    id: 'sense',
    name: '感知',
    items: [
      { k: 'ifSound', label: '如果声音很大' },
      { k: 'ifQuiet', label: '如果声音很小' },
      { k: 'ifEdge', label: '如果碰到边缘' },
      { k: 'ifExit', label: '如果走出屏幕' },
      { k: 'ifTouch', label: '如果角色碰到角色' },
    ],
  },
  {
    id: 'led',
    name: '灯',
    items: [
      { k: 'ledOn', label: '点亮板载灯' },
      { k: 'ledOff', label: '关掉板载灯' },
    ],
  },
  {
    id: 'sound',
    name: '喇叭',
    items: [
      { k: 'beep', label: '哔一声' },
      { k: 'quiet', label: '安静' },
    ],
  },
  {
    id: 'control',
    name: '控制',
    items: [
      { k: 'wait', label: '等待' },
      { k: 'repeat', label: '重复几次' },
      { k: 'scoreAdd', label: '分数加 1' },
    ],
  },
];

export const PITCH = { low: 440, mid: 1000, high: 1600 };

export function num(v) {
  return { k: 'num', v: Number(v) || 0 };
}

function nextSpriteName(program, type) {
  const used = new Set(listSprites(program).map((s) => s.name));
  if (!used.has(type)) return type;
  for (let i = 2; i < 20; i++) {
    const n = type + i;
    if (!used.has(n)) return n;
  }
  return type + nid();
}

export function spriteTitle(name) {
  const m = String(name || '').match(/^(circle|rect|text|number|line)(\d*)$/);
  if (!m) return name || '角色';
  return SPRITE_LABEL[m[1]] + (m[2] || '');
}

export const START_KINDS = new Set(['sprite']);

export function allowedInStart(block) {
  return block?.k === 'sprite';
}

export function lastSpriteName(program) {
  const list = listSprites(program);
  return list[list.length - 1]?.name || '';
}

export function newBlock(kind, program) {
  const id = nid();
  switch (kind) {
    case 'spriteCircle':
    case 'circle':
      return { id, k: 'sprite', type: 'circle', name: nextSpriteName(program, 'circle'), x: 32, y: 32, r: 6, fill: true };
    case 'spriteRect':
    case 'rect':
      return { id, k: 'sprite', type: 'rect', name: nextSpriteName(program, 'rect'), x: 80, y: 24, w: 16, h: 16, fill: true };
    case 'spriteText':
    case 'text':
      return { id, k: 'sprite', type: 'text', name: nextSpriteName(program, 'text'), x: 16, y: 24, text: 'HELLO', size: 2 };
    case 'spriteNumber':
    case 'printNumber':
      return { id, k: 'sprite', type: 'number', name: nextSpriteName(program, 'number'), x: 8, y: 4, value: { k: 'score' }, size: 1 };
    case 'spriteLine':
    case 'line':
      return { id, k: 'sprite', type: 'line', name: nextSpriteName(program, 'line'), x1: 8, y1: 56, x2: 120, y2: 56, thick: 1 };
    case 'move':
      return { id, k: 'move', who: lastSpriteName(program), dir: 'right', amount: num(3) };
    case 'place':
      return { id, k: 'place', who: lastSpriteName(program), where: 'left' };
    case 'bounce':
      return { id, k: 'bounce', who: lastSpriteName(program), edge: 'any' };
    case 'wrap':
      return { id, k: 'wrap', who: lastSpriteName(program), edge: 'any' };
    case 'ifEdge':
      return { id, k: 'ifEdge', who: lastSpriteName(program), edge: 'any', body: [] };
    case 'ifExit':
      return { id, k: 'ifExit', who: lastSpriteName(program), edge: 'right', body: [] };
    case 'ifTouch': {
      const names = listSprites(program).map((s) => s.name);
      return { id, k: 'ifTouch', a: names[0] || '', b: names[1] || '', body: [] };
    }
    case 'ifSound':
      return { id, k: 'ifSound', op: 'gt', thresh: 40, body: [], elseBody: [] };
    case 'ifQuiet':
      return { id, k: 'ifSound', op: 'lt', thresh: 20, body: [], elseBody: [] };
    case 'scoreAdd':
      return { id, k: 'scoreAdd', n: 1 };
    case 'ledOn':
      return { id, k: 'led', on: true };
    case 'ledOff':
      return { id, k: 'led', on: false };
    case 'beep':
      return { id, k: 'beep', pitch: 'mid', sec: 0.2 };
    case 'quiet':
      return { id, k: 'quiet' };
    case 'wait':
      return { id, k: 'wait', sec: 0.05 };
    case 'repeat':
      return { id, k: 'repeat', times: 10, body: [] };
    default:
      throw Error('没有这种积木：' + kind);
  }
}

export function emptyProgram() {
  return { v: 3, units: [], stage: [] };
}

export function defaultProgram() {
  return recipe('blank');
}

export const RECIPE_NAMES = [
  ['blank', '空白档案'],
  ['bounceBall', '小球撞边'],
  ['soundPush', '声音推动'],
  ['catchBox', '碰到方块'],
  ['text', '屏幕写字'],
  ['counter', '数字计数'],
  ['led', '板载灯闪烁'],
  ['beep', '喇叭提示音'],
  ['clap', '拍手亮灯'],
];

function addUnit(p, kind, extra) {
  const sprite = Object.assign(newBlock(kind, p), extra || {});
  const unit = { id: nid(), sprite, body: [] };
  p.units.push(unit);
  return unit;
}

function addBody(unit, p, kind, extra) {
  const b = Object.assign(newBlock(kind, p), extra || {});
  if (unit.sprite && SPRITE_ACTIONS.has(b.k)) b.who = unit.sprite.name;
  unit.body.push(b);
  return b;
}

function addStage(p, kind, extra) {
  const b = Object.assign(newBlock(kind, p), extra || {});
  p.stage.push(b);
  return b;
}

export function recipe(name) {
  seq = 1;
  const p = emptyProgram();
  if (name === 'blank') return p;
  if (name === 'bounceBall' || name === 'movingDot' || name === 'eyes') {
    const u = addUnit(p, 'spriteCircle', { x: 16, y: 32, r: 6, fill: true });
    addBody(u, p, 'move', { who: 'circle', dir: 'right', amount: num(3) });
    const edge = addBody(u, p, 'ifEdge', { who: 'circle', edge: 'any' });
    edge.body.push(Object.assign(newBlock('bounce', p), { who: 'circle', edge: 'any' }));
    edge.body.push(Object.assign(newBlock('beep', p), { pitch: 'low', sec: 0.08 }));
    addBody(u, p, 'wait', { sec: 0.05 });
    return p;
  }
  if (name === 'soundPush' || name === 'soundDot') {
    const u = addUnit(p, 'spriteCircle', { x: 16, y: 32, r: 6, fill: true });
    addBody(u, p, 'move', { who: 'circle', dir: 'right', amount: { k: 'sound' } });
    const ex = addBody(u, p, 'ifExit', { who: 'circle', edge: 'right' });
    ex.body.push(Object.assign(newBlock('wrap', p), { who: 'circle', edge: 'right' }));
    addBody(u, p, 'wait', { sec: 0.05 });
    return p;
  }
  if (name === 'catchBox') {
    const ball = addUnit(p, 'spriteCircle', { x: 12, y: 32, r: 6, fill: true });
    addUnit(p, 'spriteRect', { x: 92, y: 24, w: 16, h: 16, fill: true });
    addUnit(p, 'spriteNumber', { x: 4, y: 2, value: { k: 'score' }, size: 1 });
    addBody(ball, p, 'move', { who: 'circle', dir: 'right', amount: num(2) });
    const hit = addBody(ball, p, 'ifTouch', { a: 'circle', b: 'rect' });
    hit.body.push(Object.assign(newBlock('scoreAdd', p), { n: 1 }));
    hit.body.push(Object.assign(newBlock('beep', p), { pitch: 'high', sec: 0.12 }));
    hit.body.push(Object.assign(newBlock('place', p), { who: 'circle', where: 'left' }));
    addBody(ball, p, 'wait', { sec: 0.05 });
    return p;
  }
  if (name === 'text') {
    const u = addUnit(p, 'spriteText', { text: 'HELLO', x: 16, y: 24, size: 2 });
    addBody(u, p, 'wait', { sec: 0.8 });
    return p;
  }
  if (name === 'counter') {
    const u = addUnit(p, 'spriteNumber', { x: 40, y: 20, value: { k: 'index' }, size: 3 });
    addBody(u, p, 'wait', { sec: 0.2 });
    return p;
  }
  if (name === 'led') {
    addStage(p, 'ledOn');
    addStage(p, 'wait', { sec: 0.4 });
    addStage(p, 'ledOff');
    addStage(p, 'wait', { sec: 0.4 });
    return p;
  }
  if (name === 'beep') {
    const u = addUnit(p, 'spriteText', { text: 'BEEP', x: 20, y: 16, size: 2 });
    addBody(u, p, 'beep', { pitch: 'mid', sec: 0.35 });
    addBody(u, p, 'wait', { sec: 0.45 });
    return p;
  }
  if (name === 'micbar') {
    const u = addUnit(p, 'spriteRect', { x: 6, y: 24, w: 4, h: 20, fill: true });
    addBody(u, p, 'move', { who: 'rect', dir: 'right', amount: { k: 'sound' } });
    addBody(u, p, 'wait', { sec: 0.05 });
    return p;
  }
  if (name === 'clap') {
    const u = addUnit(p, 'spriteText', { text: 'CLAP', x: 8, y: 24, size: 2 });
    const iff = addBody(u, p, 'ifSound', { op: 'gt', thresh: 40 });
    iff.body.push(Object.assign(newBlock('ledOn', p)));
    iff.body.push(Object.assign(newBlock('beep', p), { pitch: 'high', sec: 0.15 }));
    iff.body.push(Object.assign(newBlock('wait', p), { sec: 0.3 }));
    iff.body.push(Object.assign(newBlock('ledOff', p)));
    addBody(u, p, 'wait', { sec: 0.05 });
    return p;
  }
  addUnit(p, 'spriteCircle', { x: 32, y: 32, r: 8, fill: true });
  return p;
}

export function listUnits(program) {
  return Array.isArray(program?.units) ? program.units : [];
}

export function ownerUnit(program, id) {
  for (const u of listUnits(program)) {
    if (u.id === id || u.sprite?.id === id) return u;
    let hit = false;
    function scan(list) {
      for (const b of list || []) {
        if (b.id === id) {
          hit = true;
          return;
        }
        scan(b.body);
        scan(b.elseBody);
      }
    }
    scan(u.body);
    if (hit) return u;
  }
  return null;
}

export function walk(program, fn) {
  function list(arr, parent) {
    if (!Array.isArray(arr)) return;
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i];
      if (!b || typeof b !== 'object') continue;
      fn(b, arr, i, parent);
      if (Array.isArray(b.body)) list(b.body, b);
      if (Array.isArray(b.elseBody)) list(b.elseBody, b);
    }
  }
  for (const u of listUnits(program)) {
    if (u.sprite) fn(u.sprite, null, 0, u);
    list(u.body, u);
  }
  list(program?.stage, program);
}

export function listSprites(program) {
  return listUnits(program).map((u) => u.sprite).filter(Boolean);
}

export function countBlocks(program) {
  let n = 0;
  walk(program, () => {
    n++;
  });
  return n;
}

export function locate(program, id) {
  let found = null;
  walk(program, (b, list, i, parent) => {
    if (!found && b.id === id) found = { node: b, list, index: i, parent };
  });
  return found;
}

export function nestOf(program, id) {
  let depth = 0;
  function search(list, d) {
    for (const b of list || []) {
      if (b.id === id) {
        depth = d;
        return true;
      }
      if (search(b.body, d + 1) || search(b.elseBody, d + 1)) return true;
    }
    return false;
  }
  for (const u of listUnits(program)) {
    if (u.sprite?.id === id) return 0;
    if (search(u.body, 0)) return depth;
  }
  search(program.stage, 0);
  return depth;
}

function containsId(block, id) {
  if (!block || !id) return false;
  let hit = false;
  function scan(list) {
    for (const b of list || []) {
      if (b.id === id) {
        hit = true;
        return;
      }
      scan(b.body);
      scan(b.elseBody);
    }
  }
  scan(block.body);
  scan(block.elseBody);
  return hit;
}

function extraDepth(block) {
  let max = 0;
  function scan(list, n) {
    for (const b of list || []) {
      if (n > max) max = n;
      scan(b.body, n + 1);
      scan(b.elseBody, n + 1);
    }
  }
  scan(block?.body, 1);
  scan(block?.elseBody, 1);
  return max;
}

export function destList(program, dest) {
  if (!program || !dest) return null;
  if (dest.zone === 'units') return program.units;
  if (dest.parentId) {
    const found = locate(program, dest.parentId);
    if (!found) return null;
    if (dest.slot === 'in-else' && Array.isArray(found.node.elseBody)) return found.node.elseBody;
    if (Array.isArray(found.node.body)) return found.node.body;
    return null;
  }
  if (dest.zone === 'unit') {
    const u = listUnits(program).find((x) => x.id === dest.unitId);
    return u ? u.body : null;
  }
  if (dest.zone === 'stage') return program.stage;
  return program.stage;
}

export function canPlace(program, block, dest) {
  if (!block || !dest) return false;
  if (block.k === 'sprite') return dest.zone === 'units';
  if (dest.zone === 'units') return false;
  const list = destList(program, dest);
  if (!list) return false;
  if (dest.parentId && (dest.parentId === block.id || containsId(block, dest.parentId))) return false;
  const unit = dest.unitId
    ? listUnits(program).find((u) => u.id === dest.unitId)
    : dest.parentId
      ? ownerUnit(program, dest.parentId)
      : null;
  if (SPRITE_ACTIONS.has(block.k) && !unit?.sprite) return false;
  return true;
}

function destIndex(list, dest) {
  const i = Number(dest?.index);
  if (!Number.isFinite(i)) return list.length;
  return Math.max(0, Math.min(i, list.length));
}

function copyEdgeInto(program, dest, block) {
  if ((block.k !== 'bounce' && block.k !== 'wrap') || !dest?.parentId || dest.slot !== 'in') return;
  const parent = locate(program, dest.parentId)?.node;
  if (parent && (parent.k === 'ifEdge' || parent.k === 'ifExit') && parent.edge) block.edge = parent.edge;
}

function otherSpriteName(program, name) {
  return listSprites(program).map((s) => s.name).find((n) => n && n !== name) || '';
}

function bindWho(program, dest, block) {
  const unit = dest.unitId
    ? listUnits(program).find((u) => u.id === dest.unitId)
    : dest.parentId
      ? ownerUnit(program, dest.parentId)
      : null;
  const name = unit?.sprite?.name || '';
  if (!name) return;
  if (SPRITE_ACTIONS.has(block.k)) block.who = name;
  if (block.k === 'ifTouch') {
    block.a = name;
    if (!block.b || block.b === name || block.b === 'current') block.b = otherSpriteName(program, name);
  }
}

export function insertAt(program, dest, block) {
  if (countBlocks(program) >= MAX_BLOCKS) throw Error('积木太多了，先删掉一些再加。');
  if (block.k === 'sprite') {
    if (!canPlace(program, block, dest)) dest = { zone: 'units', index: listUnits(program).length };
    const units = program.units || (program.units = []);
    const unit = { id: nid(), sprite: block, body: [] };
    units.splice(destIndex(units, dest.zone === 'units' ? dest : { index: units.length }), 0, unit);
    return;
  }
  const wantsNest = Array.isArray(block.body);
  if (wantsNest && dest?.parentId && nestOf(program, dest.parentId) + 1 >= MAX_NEST) {
    throw Error('套在一起的积木不能再深了。');
  }
  if (!canPlace(program, block, dest)) throw Error('这里放不进去。');
  bindWho(program, dest, block);
  copyEdgeInto(program, dest, block);
  const list = destList(program, dest);
  list.splice(destIndex(list, dest), 0, block);
}

export function insertBlock(program, anchor, block) {
  if (block.k === 'sprite') {
    insertAt(program, { zone: 'units', index: listUnits(program).length }, block);
    return;
  }
  if (anchor?.slot === 'in' || anchor?.slot === 'in-else') {
    insertAt(program, { parentId: anchor.id, slot: anchor.slot, index: 999 }, block);
    return;
  }
  const unit = (anchor?.unitId && listUnits(program).find((u) => u.id === anchor.unitId))
    || (anchor?.id && ownerUnit(program, anchor.id))
    || listUnits(program).filter((u) => u.sprite).pop();
  if (SPRITE_ACTIONS.has(block.k) && !unit?.sprite) throw Error('先放一个角色，再给它移动。');
  if (unit?.sprite) insertAt(program, { zone: 'unit', unitId: unit.id, index: unit.body.length }, block);
  else insertAt(program, { zone: 'stage', index: (program.stage || []).length }, block);
}

export function removeBlock(program, id) {
  const unit = listUnits(program).find((u) => u.id === id || u.sprite?.id === id);
  if (unit && (id === unit.id || id === unit.sprite?.id)) {
    program.units.splice(program.units.indexOf(unit), 1);
    return true;
  }
  const found = locate(program, id);
  if (!found || !found.list) return false;
  found.list.splice(found.index, 1);
  return true;
}

export function moveBlock(program, id, dest) {
  const unit = listUnits(program).find((u) => u.id === id || u.sprite?.id === id);
  if (unit && (id === unit.id || id === unit.sprite?.id)) {
    if (dest?.zone !== 'units') return false;
    const fromIndex = program.units.indexOf(unit);
    let toIndex = destIndex(program.units, dest);
    if (fromIndex === toIndex || fromIndex + 1 === toIndex) return false;
    program.units.splice(fromIndex, 1);
    if (fromIndex < toIndex) toIndex--;
    program.units.splice(toIndex, 0, unit);
    return true;
  }
  const found = locate(program, id);
  if (!found?.list) return false;
  const block = found.node;
  if (!canPlace(program, block, dest)) return false;
  if (dest.parentId && nestOf(program, dest.parentId) + 1 + extraDepth(block) > MAX_NEST) return false;
  const fromList = found.list;
  const fromIndex = found.index;
  const toList = destList(program, dest);
  let toIndex = destIndex(toList, dest);
  if (fromList === toList) {
    if (fromIndex === toIndex || fromIndex + 1 === toIndex) return false;
    fromList.splice(fromIndex, 1);
    if (fromIndex < toIndex) toIndex--;
    toList.splice(toIndex, 0, block);
  } else {
    fromList.splice(fromIndex, 1);
    toList.splice(toIndex, 0, block);
  }
  bindWho(program, dest, block);
  copyEdgeInto(program, dest, block);
  return true;
}

export function cloneProgram(program) {
  return JSON.parse(JSON.stringify(program || defaultProgram()));
}

function clamp(n, lo, hi) {
  n = Number(n);
  if (!Number.isFinite(n)) n = lo;
  return Math.min(hi, Math.max(lo, n));
}

export function sanitizeText(s) {
  return String(s || '')
    .toUpperCase()
    .replace(FONT_OK, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT);
}

function cleanAmount(node) {
  if (typeof node === 'number') return num(Math.round(clamp(node, 0, 40)));
  if (node?.k === 'sound') return { k: 'sound' };
  return num(Math.round(clamp(node?.v, 0, 40)));
}

function cleanWho(name) {
  const s = String(name || '');
  if (s === 'current') return 'current';
  if (/^(circle|rect|text|number|line)\d*$/.test(s)) return s;
  return '';
}

const KINDS = new Set([
  'sprite', 'move', 'place', 'bounce', 'wrap', 'ifEdge', 'ifExit', 'ifTouch', 'ifSound', 'scoreAdd',
  'led', 'beep', 'quiet', 'wait', 'repeat',
]);

function cleanSprite(raw) {
  const type = SPRITE_TYPES.includes(raw.type) ? raw.type : 'circle';
  const b = { id: typeof raw.id === 'string' && raw.id ? raw.id : nid(), k: 'sprite', type };
  b.name = cleanWho(raw.name);
  if (!b.name || b.name === 'current') b.name = type;
  if (type === 'circle') {
    b.x = Math.round(clamp(raw.x, 0, 127));
    b.y = Math.round(clamp(raw.y, 0, 63));
    b.r = Math.round(clamp(raw.r, 1, 30));
    b.fill = raw.fill !== false;
  } else if (type === 'rect') {
    b.x = Math.round(clamp(raw.x, 0, 127));
    b.y = Math.round(clamp(raw.y, 0, 63));
    b.w = Math.round(clamp(raw.w, 1, 128));
    b.h = Math.round(clamp(raw.h, 1, 64));
    b.fill = raw.fill !== false;
  } else if (type === 'text') {
    b.x = Math.round(clamp(raw.x, 0, 127));
    b.y = Math.round(clamp(raw.y, 0, 63));
    b.text = sanitizeText(raw.text);
    b.size = Math.round(clamp(raw.size, 1, 3));
  } else if (type === 'number') {
    b.x = Math.round(clamp(raw.x, 0, 127));
    b.y = Math.round(clamp(raw.y, 0, 63));
    b.size = Math.round(clamp(raw.size, 1, 3));
    b.value = raw.value?.k === 'score' || raw.value?.k === 'sound' || raw.value?.k === 'index'
      ? { k: raw.value.k }
      : raw.value?.k === 'num' || typeof raw.value === 'number'
        ? num(typeof raw.value === 'number' ? raw.value : raw.value.v)
        : { k: 'score' };
  } else {
    b.x1 = Math.round(clamp(raw.x1, 0, 127));
    b.y1 = Math.round(clamp(raw.y1, 0, 63));
    b.x2 = Math.round(clamp(raw.x2, 0, 127));
    b.y2 = Math.round(clamp(raw.y2, 0, 63));
    b.thick = Math.round(clamp(raw.thick, 1, 5));
  }
  return b;
}

export function validateProgram(input) {
  const src = input && typeof input === 'object' ? input : defaultProgram();
  const migrated = migrateLegacy(src);
  const out = emptyProgram();
  let used = 0;
  function cleanList(list, depth, inRepeat) {
    const result = [];
    if (!Array.isArray(list) || depth > MAX_NEST) return result;
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      let k = raw.k;
      if (k === 'spriteCircle') k = 'sprite';
      if (k === 'sprite' || !KINDS.has(k)) continue;
      if (used >= MAX_BLOCKS) break;
      used++;
      const id = typeof raw.id === 'string' && raw.id ? raw.id : nid();
      const b = { id, k };
      if (k === 'move') {
        b.who = cleanWho(raw.who);
        b.dir = ['left', 'right', 'up', 'down'].includes(raw.dir) ? raw.dir : 'right';
        b.amount = cleanAmount(raw.amount);
      } else if (k === 'place') {
        b.who = cleanWho(raw.who);
        b.where = ['left', 'right', 'top', 'bottom', 'start'].includes(raw.where) ? raw.where : 'left';
      } else if (k === 'bounce' || k === 'wrap') {
        b.who = cleanWho(raw.who);
        b.edge = ['any', 'left', 'right', 'top', 'bottom'].includes(raw.edge) ? raw.edge : 'any';
      } else if (k === 'ifEdge' || k === 'ifExit') {
        b.who = cleanWho(raw.who);
        b.edge = ['any', 'left', 'right', 'top', 'bottom'].includes(raw.edge) ? raw.edge : k === 'ifExit' ? 'right' : 'any';
        b.body = cleanList(raw.body, depth + 1, inRepeat);
      } else if (k === 'ifTouch') {
        b.a = cleanWho(raw.a);
        b.b = cleanWho(raw.b);
        b.body = cleanList(raw.body, depth + 1, inRepeat);
      } else if (k === 'ifSound') {
        b.op = raw.op === 'lt' ? 'lt' : 'gt';
        b.thresh = Math.round(clamp(raw.thresh, 0, 100));
        b.body = cleanList(raw.body, depth + 1, inRepeat);
        b.elseBody = cleanList(raw.elseBody, depth + 1, inRepeat);
      } else if (k === 'scoreAdd') {
        b.n = Math.round(clamp(raw.n, -20, 20)) || 1;
      } else if (k === 'led') b.on = !!raw.on;
      else if (k === 'beep') {
        b.pitch = PITCH[raw.pitch] ? raw.pitch : 'mid';
        b.sec = Math.round(clamp(raw.sec, 0.05, 5) * 20) / 20;
      } else if (k === 'wait') b.sec = Math.round(clamp(raw.sec, 0.05, 5) * 20) / 20;
      else if (k === 'repeat') {
        b.times = Math.round(clamp(raw.times, 1, 50));
        b.body = cleanList(raw.body, depth + 1, true);
      }
      result.push(b);
    }
    return result;
  }
  for (const raw of migrated.units || []) {
    if (!raw || used >= MAX_BLOCKS) continue;
    const sprite = raw.sprite && raw.sprite.k === 'sprite' ? cleanSprite(raw.sprite) : null;
    if (!sprite) {
      out.stage.push(...cleanList(raw.body, 0, false));
      continue;
    }
    used++;
    out.units.push({
      id: typeof raw.id === 'string' && raw.id ? raw.id : nid(),
      sprite,
      body: cleanList(raw.body, 0, false),
    });
  }
  out.stage = out.stage.concat(cleanList(migrated.stage, 0, false));
  const names = listSprites(out).map((s) => s.name);
  const last = names[names.length - 1] || '';
  function rewriteCurrent(list, fallback) {
    for (const b of list || []) {
      if (b.who === 'current') b.who = fallback;
      if (b.a === 'current') b.a = fallback;
      if (b.b === 'current') b.b = fallback;
      rewriteCurrent(b.body, fallback);
      rewriteCurrent(b.elseBody, fallback);
    }
  }
  function bindUnitList(list, name) {
    for (const b of list || []) {
      if (SPRITE_ACTIONS.has(b.k)) b.who = name;
      if (b.k === 'ifTouch') {
        b.a = name;
        if (!b.b || b.b === name || b.b === 'current' || !names.includes(b.b)) {
          b.b = names.find((n) => n !== name) || '';
        }
      }
      bindUnitList(b.body, name);
      bindUnitList(b.elseBody, name);
    }
  }
  for (const u of out.units) {
    if (u.sprite?.name) bindUnitList(u.body, u.sprite.name);
    rewriteCurrent(u.body, u.sprite?.name || last);
  }
  rewriteCurrent(out.stage, last);
  syncSeq(out);
  return out;
}

function migrateLegacy(src) {
  if (src.v === 3 && Array.isArray(src.units)) {
    return { v: 3, units: src.units, stage: Array.isArray(src.stage) ? src.stage : [] };
  }
  const sprites = [];
  const leftover = [];
  for (const b of src.start || []) {
    if (b?.k === 'sprite' || b?.k === 'spriteCircle') sprites.push(b.k === 'spriteCircle' ? { ...b, k: 'sprite', type: b.type || 'circle' } : b);
    else leftover.push(b);
  }
  const units = sprites.map((s) => ({ id: nid(), sprite: s, body: [] }));
  const byName = {};
  for (const u of units) if (u.sprite?.name) byName[u.sprite.name] = u;
  function place(b) {
    if (!b) return;
    const who = (b.who && byName[b.who] && b.who)
      || (b.a && byName[b.a] && b.a)
      || '';
    if (who) byName[who].body.push(b);
    else if (units.length === 1) units[0].body.push(b);
    else leftoverStage.push(b);
  }
  const leftoverStage = [];
  leftover.forEach(place);
  (src.body || []).forEach(place);
  return { v: 3, units, stage: leftoverStage };
}

export function analyze(program) {
  const p = validateProgram(program);
  const flags = { amp: false, mic: false, led: false, draw: false, index: false, seconds: false };
  walk(p, (b) => {
    if (b.k === 'sprite') flags.draw = true;
    if (b.k === 'led') flags.led = true;
    if (b.k === 'beep' || b.k === 'quiet') flags.amp = true;
    if (b.k === 'ifSound') flags.mic = true;
    if (b.k === 'move' && b.amount?.k === 'sound') flags.mic = true;
    if (b.k === 'sprite' && b.type === 'number' && b.value?.k === 'sound') flags.mic = true;
    if (b.k === 'sprite' && b.type === 'number' && b.value?.k === 'index') flags.index = true;
    if (b.a?.k === 'sound' || b.b?.k === 'sound') flags.mic = true;
  });
  if (listSprites(p).length) flags.draw = true;
  return { program: p, ...flags };
}

export function reporterLabel(node) {
  if (!node) return '0';
  if (node.k === 'sound') return '声音大小';
  if (node.k === 'score') return '分数';
  if (node.k === 'index') return '第几次';
  if (node.k === 'seconds') return '计时秒数';
  return String(node.v ?? 0) + ' pixels';
}

export function allBodies(program) {
  const p = program || emptyProgram();
  const lists = [];
  for (const u of listUnits(p)) lists.push(u.body || []);
  lists.push(p.stage || []);
  return lists;
}
