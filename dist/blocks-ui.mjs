import {
  DIR_LABEL,
  EDGE_LABEL,
  GROUPS,
  SPRITE_ACTIONS,
  canPlace,
  cloneProgram,
  defaultProgram,
  insertAt,
  insertBlock,
  listSprites,
  listUnits,
  locate,
  moveBlock,
  newBlock,
  num,
  ownerUnit,
  removeBlock,
  sanitizeText,
  spriteTitle,
  syncSeq,
  validateProgram,
} from './blocks.mjs';

const TONE = {
  sprite: 'screen',
  move: 'state',
  place: 'state',
  bounce: 'state',
  wrap: 'state',
  ifEdge: 'mic',
  ifExit: 'mic',
  ifTouch: 'mic',
  ifSound: 'mic',
  scoreAdd: 'control',
  led: 'led',
  beep: 'sound',
  quiet: 'sound',
  wait: 'control',
  repeat: 'control',
  if: 'control',
};

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function stepper(value, lo, hi, step, onChange, suffix) {
  const wrap = el('span', 'blk-step');
  const minus = el('button', 'blk-nbtn', '−');
  const label = el('span', 'blk-nval');
  const plus = el('button', 'blk-nbtn', '+');
  minus.type = plus.type = 'button';
  let current = Number(value) || 0;
  const show = (n) => {
    current = n;
    label.textContent = (Number.isInteger(step) ? String(n) : String(Math.round(n * 100) / 100)) + (suffix || '');
  };
  show(current);
  const apply = (next) => {
    const n = Math.min(hi, Math.max(lo, Math.round(next / step) * step));
    show(n);
    onChange(n);
  };
  minus.onclick = (e) => { e.stopPropagation(); apply(current - step); };
  plus.onclick = (e) => { e.stopPropagation(); apply(current + step); };
  wrap.append(minus, label, plus);
  return wrap;
}

function chip(text, on, onclick) {
  const b = el('button', 'blk-chip' + (on ? ' on' : ''), text);
  b.type = 'button';
  b.onclick = (e) => { e.stopPropagation(); onclick(); };
  return b;
}

function selectBox(value, options, onChange) {
  const s = el('select', 'blk-kind');
  for (const [v, t] of options) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = t;
    o.selected = v === value;
    s.append(o);
  }
  s.onclick = (e) => e.stopPropagation();
  s.onchange = (e) => { e.stopPropagation(); onChange(s.value); };
  return s;
}

export function mountBlocks(root, { onChange, onMessage } = {}) {
  let program = defaultProgram();
  let selected = null;

  const palette = el('div', 'blk-palette');
  const script = el('div', 'blk-script');
  const tools = el('div', 'blk-tools');
  const del = el('button', 'blk-del', '删除选中的积木');
  del.type = 'button';
  del.onclick = () => {
    if (!selected?.id) return;
    removeBlock(program, selected.id);
    selected = null;
    emit();
  };
  tools.append(el('span', 'blk-hint', '一个角色下面一栏永远重复。点「插到这里」，或按左边六点拖过去。'), del);

  const workspace = el('div', 'blk-workspace');
  workspace.append(tools, script);
  root.replaceChildren(palette, workspace);

  function emit() {
    program = validateProgram(program);
    syncSeq(program);
    draw();
    onChange?.(program);
  }

  function pick(next) {
    selected = next;
    draw();
  }

  function destKey(d) {
    if (!d) return '';
    return [d.zone || '', d.unitId || '', d.parentId || '', d.slot || '', String(d.index)].join('/');
  }

  function readDest(node) {
    if (!node) return null;
    const dest = { zone: node.dataset.zone || 'stage', index: Number(node.dataset.index || 0) };
    if (node.dataset.unit) dest.unitId = node.dataset.unit;
    if (node.dataset.parent) dest.parentId = node.dataset.parent;
    if (node.dataset.slot) dest.slot = node.dataset.slot;
    return dest;
  }

  function destOfFound(found) {
    if (!found) return null;
    if (found.node?.k === 'sprite') {
      const u = ownerUnit(program, found.node.id);
      if (!u) return { zone: 'units', index: 0 };
      return { zone: 'unit', unitId: u.id, index: (u.body || []).length };
    }
    if (found.parent && found.list === found.parent.body) {
      if (found.parent.sprite) return { zone: 'unit', unitId: found.parent.id, index: found.index };
      const u = ownerUnit(program, found.parent.id);
      return { zone: u ? 'unit' : 'stage', unitId: u?.id, parentId: found.parent.id, slot: 'in', index: found.index };
    }
    if (found.parent && found.list === found.parent.elseBody) {
      const u = ownerUnit(program, found.parent.id);
      return { zone: u ? 'unit' : 'stage', unitId: u?.id, parentId: found.parent.id, slot: 'in-else', index: found.index };
    }
    const u = ownerUnit(program, found.node.id);
    if (u && found.list === u.body) return { zone: 'unit', unitId: u.id, index: found.index };
    return { zone: 'stage', index: found.index };
  }

  function destFromPoint(x, y) {
    const node = document.elementFromPoint(x, y);
    const hole = node?.closest?.('.blk-slot');
    if (hole && workspace.contains(hole)) return readDest(hole);
    const card = node?.closest?.('.blk');
    if (card && workspace.contains(card) && card.dataset.id) {
      const found = locate(program, card.dataset.id);
      const dest = destOfFound(found);
      if (!dest) return null;
      if (found.node?.k === 'sprite') return dest;
      const r = card.getBoundingClientRect();
      dest.index = found.index + (y > r.top + r.height / 2 ? 1 : 0);
      return dest;
    }
    return null;
  }

  let ghost = null;
  let justDragged = false;

  function showGhost(label, x, y) {
    if (!ghost) {
      ghost = el('div', 'blk-ghost');
      document.body.append(ghost);
    }
    ghost.textContent = label;
    ghost.style.left = x + 'px';
    ghost.style.top = y + 'px';
  }

  function clearDragUi() {
    workspace.classList.remove('dragging');
    script.querySelectorAll('.blk.dragging').forEach((n) => n.classList.remove('dragging'));
    script.querySelectorAll('.blk-slot.drop').forEach((n) => n.classList.remove('drop'));
    ghost?.remove();
    ghost = null;
  }

  function markDrop(x, y) {
    script.querySelectorAll('.blk-slot.drop').forEach((n) => n.classList.remove('drop'));
    const dest = destFromPoint(x, y);
    if (!dest) return;
    for (const hole of script.querySelectorAll('.blk-slot')) {
      if (destKey(readDest(hole)) === destKey(dest)) hole.classList.add('drop');
    }
  }

  function blockDragLabel(b) {
    if (b.k === 'sprite') return spriteTitle(b.name);
    if (b.k === 'move') return '移动';
    if (b.k === 'bounce') return '反弹';
    if (b.k === 'wrap') return '从另一边回来';
    if (b.k === 'place') return '瞬移到边上';
    if (b.k === 'wait') return '等待';
    if (b.k === 'repeat') return '重复几次';
    if (b.k === 'ifEdge') return '如果碰到边缘';
    if (b.k === 'ifExit') return '如果走出屏幕';
    if (b.k === 'ifTouch') return '如果角色碰到角色';
    if (b.k === 'ifSound') return b.op === 'lt' ? '如果声音很小' : '如果声音很大';
    if (b.k === 'led') return b.on ? '点亮板载灯' : '关掉板载灯';
    if (b.k === 'beep') return '哔一声';
    if (b.k === 'quiet') return '安静';
    if (b.k === 'scoreAdd') return '分数加 1';
    return '积木';
  }

  function startPointerDrag(e, payload) {
    if (e.button != null && e.button !== 0) return;
    const originX = e.clientX;
    const originY = e.clientY;
    const pid = e.pointerId;
    let live = false;
    if (payload.id) e.preventDefault();
    e.currentTarget?.setPointerCapture?.(pid);
    const move = (ev) => {
      if (ev.pointerId !== pid) return;
      const dx = ev.clientX - originX;
      const dy = ev.clientY - originY;
      if (!live && dx * dx + dy * dy < 36) return;
      if (!live) {
        live = true;
        justDragged = true;
        workspace.classList.add('dragging');
        if (payload.id) {
          const card = script.querySelector('[data-id="' + payload.id + '"]');
          card?.classList.add('dragging');
        }
      }
      showGhost(payload.label, ev.clientX, ev.clientY);
      markDrop(ev.clientX, ev.clientY);
    };
    const up = (ev) => {
      if (ev.pointerId !== pid) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!live) return;
      const dest = destFromPoint(ev.clientX, ev.clientY);
      clearDragUi();
      if (payload.id) {
        if (!dest) return;
        if (!canPlace(program, payload.node || locate(program, payload.id)?.node, dest) && payload.kind !== 'unit') {
          const unit = listUnits(program).find((u) => u.id === payload.id || u.sprite?.id === payload.id);
          if (unit && dest.zone === 'units' && moveBlock(program, unit.id, dest)) {
            selected = { id: unit.sprite.id };
            emit();
            return;
          }
          onMessage?.('这里放不进去。');
          return;
        }
        if (moveBlock(program, payload.id, dest)) {
          selected = { id: payload.id };
          emit();
        }
      } else if (payload.kind && dest) add(payload.kind, dest);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function add(kind, dest) {
    try {
      const block = newBlock(kind, program);
      const target = dest || selected?.dest;
      if (block.k === 'scoreAdd' && !listSprites(program).some((s) => s.type === 'number' && s.value?.k === 'score')) {
        onMessage?.('分数在涨，但屏幕上看不见。放一个数字角色，显示选「分数」。');
      }
      if (block.k === 'sprite') {
        insertAt(program, target?.zone === 'units' ? target : { zone: 'units', index: listUnits(program).length }, block);
        selected = { dest: { zone: 'unit', unitId: ownerUnit(program, block.id)?.id, index: 0 } };
      } else if (target) {
        if (target.zone === 'units' && block.k !== 'sprite') {
          onMessage?.(SPRITE_ACTIONS.has(block.k) ? '移动要放进某个角色下面的「永远重复」。' : '这个积木放进永远重复里。');
          insertBlock(program, selected, block);
        } else if (SPRITE_ACTIONS.has(block.k) && target.zone === 'stage' && !target.parentId) {
          onMessage?.('移动要放进某个角色下面的「永远重复」。');
          insertBlock(program, selected, block);
        } else {
          insertAt(program, target, block);
        }
        selected = { id: block.id };
      } else {
        insertBlock(program, selected, block);
        selected = { id: block.id };
      }
      emit();
    } catch (e) {
      onMessage?.(e.message);
    }
  }

  function patch(id, fn) {
    const found = locate(program, id);
    if (!found) return;
    fn(found.node);
    emit();
  }

  function drawPalette() {
    palette.replaceChildren();
    for (const g of GROUPS) {
      palette.append(el('div', 'blk-group', g.name));
      for (const item of g.items) {
        const tone = TONE[{
          spriteCircle: 'sprite', spriteRect: 'sprite', spriteText: 'sprite', spriteNumber: 'sprite', spriteLine: 'sprite',
          ledOn: 'led', ledOff: 'led', ifQuiet: 'ifSound',
        }[item.k] || item.k] || 'control';
        const b = el('button', 'blk-add tone-' + tone, item.label);
        b.type = 'button';
        b.title = '点一下加到选中位置，按住可以拖到「插到这里」';
        b.onpointerdown = (e) => startPointerDrag(e, { kind: item.k, label: item.label });
        b.onclick = () => {
          if (justDragged) {
            justDragged = false;
            return;
          }
          add(item.k);
        };
        palette.append(b);
      }
    }
  }

  function stack(list, destBase) {
    const box = el('div', 'blk-stack');
    const n = list?.length || 0;
    for (let i = 0; i <= n; i++) {
      const dest = { ...destBase, index: i };
      const hole = el('button', 'blk-slot' + (n === 0 ? ' empty' : ''), n === 0 ? '点左边积木，放这里' : '插到这里');
      hole.type = 'button';
      hole.dataset.zone = dest.zone || 'stage';
      hole.dataset.index = String(i);
      if (dest.unitId) hole.dataset.unit = dest.unitId;
      if (dest.parentId) hole.dataset.parent = dest.parentId;
      if (dest.slot) hole.dataset.slot = dest.slot;
      if (selected?.dest && destKey(selected.dest) === destKey(dest)) hole.classList.add('on');
      hole.onclick = (e) => {
        e.stopPropagation();
        pick({ dest: { ...dest } });
      };
      box.append(hole);
      if (i < n) box.append(renderBlock(list[i]));
    }
    return box;
  }

  function miniOled(b, onPlace) {
    const canvas = el('canvas', 'blk-mini-oled');
    canvas.width = 128;
    canvas.height = 64;
    canvas.setAttribute('aria-label', '点这里决定角色在屏幕上的位置');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#07131a';
    ctx.fillRect(0, 0, 128, 64);
    ctx.strokeStyle = '#25444a';
    for (let x = 0; x < 128; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 64); ctx.stroke(); }
    for (let y = 0; y < 64; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y); ctx.stroke(); }
    ctx.fillStyle = '#7eebff';
    ctx.strokeStyle = '#7eebff';
    if (b.type === 'circle') {
      ctx.beginPath();
      ctx.arc(b.x, b.y, Math.max(1, b.r), 0, Math.PI * 2);
      b.fill ? ctx.fill() : ctx.stroke();
    } else if (b.type === 'rect') {
      b.fill ? ctx.fillRect(b.x, b.y, b.w, b.h) : ctx.strokeRect(b.x, b.y, b.w, b.h);
    } else if (b.type === 'line') {
      ctx.lineWidth = Math.max(1, b.thick || 1);
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
      ctx.lineWidth = 1;
    } else {
      ctx.font = `${8 * (b.size || 1)}px monospace`;
      ctx.textBaseline = 'top';
      ctx.fillText(b.type === 'number' ? '0' : (b.text || 'A'), b.x, b.y);
    }
    canvas.onclick = (e) => {
      e.stopPropagation();
      const r = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(127, Math.round((e.clientX - r.left) * 128 / r.width)));
      const y = Math.max(0, Math.min(63, Math.round((e.clientY - r.top) * 64 / r.height)));
      onPlace(x, y);
    };
    return canvas;
  }

  function renderBlock(b) {
    const card = el('article', 'blk tone-' + (TONE[b.k] || 'control') + (selected?.id === b.id && !selected.slot && !selected.dest ? ' selected' : ''));
    card.dataset.id = b.id;
    const grip = el('button', 'blk-grip', '⋮⋮');
    grip.type = 'button';
    grip.title = '拖到「插到这里」';
    grip.setAttribute('aria-label', '拖动这块积木');
    grip.onpointerdown = (e) => {
      e.stopPropagation();
      startPointerDrag(e, { id: b.id, label: blockDragLabel(b) });
    };
    card.append(grip);
    card.onclick = (e) => {
      e.stopPropagation();
      if (justDragged) {
        justDragged = false;
        return;
      }
      pick({ id: b.id });
    };

    if (b.k === 'sprite') {
      card.append(el('b', '', spriteTitle(b.name)));
      card.append(el('span', 'blk-note', '先决定它长什么样、在哪。小格子是屏幕上的点。'));
      if (b.type !== 'line') card.append(miniOled(b, (x, y) => patch(b.id, (n) => { n.x = x; n.y = y; })));
      else card.append(miniOled(b, (x, y) => patch(b.id, (n) => {
        const dx = x - n.x1;
        const dy = y - n.y1;
        n.x1 = x;
        n.y1 = y;
        n.x2 = Math.max(0, Math.min(127, n.x2 + dx));
        n.y2 = Math.max(0, Math.min(63, n.y2 + dy));
      })));
      if (b.type === 'circle') {
        const row = el('div', 'blk-row');
        row.append(el('span', '', '圆心离左边'), stepper(b.x, 0, 127, 1, (v) => patch(b.id, (n) => (n.x = v)), ' px'));
        card.append(row);
        const row2 = el('div', 'blk-row');
        row2.append(el('span', '', '圆心离顶部'), stepper(b.y, 0, 63, 1, (v) => patch(b.id, (n) => (n.y = v)), ' px'));
        card.append(row2);
        const row3 = el('div', 'blk-row');
        row3.append(el('span', '', '半径'), stepper(b.r, 1, 30, 1, (v) => patch(b.id, (n) => (n.r = v)), ' px'));
        row3.append(chip('实心', b.fill !== false, () => patch(b.id, (n) => (n.fill = true))));
        row3.append(chip('空心', b.fill === false, () => patch(b.id, (n) => (n.fill = false))));
        card.append(row3);
      } else if (b.type === 'rect') {
        const row = el('div', 'blk-row');
        row.append(el('span', '', '左边'), stepper(b.x, 0, 127, 1, (v) => patch(b.id, (n) => (n.x = v)), ' px'));
        row.append(el('span', '', '上边'), stepper(b.y, 0, 63, 1, (v) => patch(b.id, (n) => (n.y = v)), ' px'));
        card.append(row);
        const row2 = el('div', 'blk-row');
        row2.append(el('span', '', '宽'), stepper(b.w, 1, 128, 1, (v) => patch(b.id, (n) => (n.w = v)), ' px'));
        row2.append(el('span', '', '高'), stepper(b.h, 1, 64, 1, (v) => patch(b.id, (n) => (n.h = v)), ' px'));
        row2.append(chip('实心', b.fill !== false, () => patch(b.id, (n) => (n.fill = true))));
        row2.append(chip('空心', b.fill === false, () => patch(b.id, (n) => (n.fill = false))));
        card.append(row2);
      } else if (b.type === 'text') {
        const inp = el('input', 'blk-text');
        inp.value = b.text;
        inp.maxLength = 12;
        inp.onclick = (e) => e.stopPropagation();
        inp.onchange = () => {
          const next = sanitizeText(inp.value);
          if (inp.value && /[^\x00-\x7F]/.test(inp.value)) onMessage?.('这块屏幕只会显示英文字母和数字，中文会去掉。');
          else if (inp.value && !next) onMessage?.('这块屏幕只会显示英文字母和数字。');
          patch(b.id, (n) => (n.text = next));
        };
        card.append(inp);
        const row = el('div', 'blk-row');
        row.append(el('span', '', '左边'), stepper(b.x, 0, 127, 1, (v) => patch(b.id, (n) => (n.x = v)), ' px'));
        row.append(el('span', '', '上边'), stepper(b.y, 0, 63, 1, (v) => patch(b.id, (n) => (n.y = v)), ' px'));
        row.append(el('span', '', '字号'), stepper(b.size, 1, 3, 1, (v) => patch(b.id, (n) => (n.size = v))));
        card.append(row);
      } else if (b.type === 'number') {
        const row = el('div', 'blk-row');
        row.append(el('span', '', '显示'));
        row.append(selectBox(b.value?.k || 'score', [['score', '分数'], ['index', '第几次'], ['sound', '声音大小'], ['num', '固定数字']], (v) => patch(b.id, (n) => (n.value = v === 'num' ? num(0) : { k: v }))));
        if (b.value?.k === 'num') row.append(stepper(b.value.v, 0, 999, 1, (v) => patch(b.id, (n) => (n.value = num(v)))));
        card.append(row);
        const row2 = el('div', 'blk-row');
        row2.append(el('span', '', '左边'), stepper(b.x, 0, 127, 1, (v) => patch(b.id, (n) => (n.x = v)), ' px'));
        row2.append(el('span', '', '上边'), stepper(b.y, 0, 63, 1, (v) => patch(b.id, (n) => (n.y = v)), ' px'));
        row2.append(el('span', '', '大小'), stepper(b.size || 1, 1, 3, 1, (v) => patch(b.id, (n) => (n.size = v))));
        card.append(row2);
      } else {
        const row = el('div', 'blk-row');
        row.append(el('span', '', '起点'), stepper(b.x1, 0, 127, 1, (v) => patch(b.id, (n) => (n.x1 = v)), ' px'), stepper(b.y1, 0, 63, 1, (v) => patch(b.id, (n) => (n.y1 = v)), ' px'));
        card.append(row);
        const row2 = el('div', 'blk-row');
        row2.append(el('span', '', '终点'), stepper(b.x2, 0, 127, 1, (v) => patch(b.id, (n) => (n.x2 = v)), ' px'), stepper(b.y2, 0, 63, 1, (v) => patch(b.id, (n) => (n.y2 = v)), ' px'));
        card.append(row2);
        const row3 = el('div', 'blk-row');
        row3.append(el('span', '', '粗细'), stepper(b.thick || 1, 1, 5, 1, (v) => patch(b.id, (n) => (n.thick = v)), ' px'));
        card.append(row3);
      }
    } else if (b.k === 'move') {
      const row = el('div', 'blk-row');
      row.append(el('b', '', '让 ' + spriteTitle(ownerUnit(program, b.id)?.sprite?.name || b.who)));
      for (const d of ['left', 'right', 'up', 'down']) row.append(chip(DIR_LABEL[d], b.dir === d, () => patch(b.id, (n) => (n.dir = d))));
      card.append(row);
      const row2 = el('div', 'blk-row');
      row2.append(el('span', '', '每次移动'));
      row2.append(selectBox(b.amount?.k === 'sound' ? 'sound' : 'num', [['num', '固定 pixels'], ['sound', '跟着声音']], (v) => patch(b.id, (n) => (n.amount = v === 'sound' ? { k: 'sound' } : num(3)))));
      if (b.amount?.k !== 'sound') row2.append(stepper(b.amount?.v || 0, 0, 20, 1, (v) => patch(b.id, (n) => (n.amount = num(v))), ' px'));
      else row2.append(el('span', 'blk-note', '声音越大，走得越远'));
      card.append(row2);
    } else if (b.k === 'place') {
      const row = el('div', 'blk-row');
      row.append(el('b', '', '把 ' + spriteTitle(ownerUnit(program, b.id)?.sprite?.name || b.who)));
      row.append(el('span', '', '放到'));
      row.append(selectBox(b.where, [['left', '左边'], ['right', '右边'], ['top', '上边'], ['bottom', '下边'], ['start', '一开始的位置']], (v) => patch(b.id, (n) => (n.where = v))));
      card.append(row);
      card.append(el('span', 'blk-note', '一下子跳过去，不是慢慢走。'));
    } else if (b.k === 'bounce' || b.k === 'wrap') {
      const me = spriteTitle(ownerUnit(program, b.id)?.sprite?.name || b.who);
      const row = el('div', 'blk-row');
      row.append(el('b', '', b.k === 'bounce' ? '让 ' + me + ' 反弹' : '让 ' + me + ' 从另一边回来'));
      card.append(row);
      const row2 = el('div', 'blk-row');
      row2.append(el('span', '', '这一边'));
      for (const e of ['any', 'left', 'right', 'top', 'bottom']) {
        row2.append(chip(EDGE_LABEL[e], (b.edge || 'any') === e, () => patch(b.id, (n) => (n.edge = e))));
      }
      card.append(row2);
    } else if (b.k === 'ifEdge' || b.k === 'ifExit') {
      const row = el('div', 'blk-row');
      row.append(el('b', '', b.k === 'ifEdge' ? '如果碰到' : '如果走出'));
      row.append(el('span', '', spriteTitle(ownerUnit(program, b.id)?.sprite?.name || b.who)));
      row.append(selectBox(b.edge, Object.entries(EDGE_LABEL), (v) => patch(b.id, (n) => (n.edge = v))));
      card.append(row);
      card.append(stack(b.body, { zone: 'unit', unitId: ownerUnit(program, b.id)?.id, parentId: b.id, slot: 'in' }));
    } else if (b.k === 'ifTouch') {
      const me = ownerUnit(program, b.id)?.sprite?.name || b.a;
      const row = el('div', 'blk-row');
      row.append(el('b', '', '如果 ' + spriteTitle(me) + ' 碰到'));
      const others = listSprites(program).filter((s) => s.name !== me).map((s) => [s.name, spriteTitle(s.name)]);
      if (!others.length) others.push(['', '再放一个角色']);
      row.append(selectBox(b.b, others, (v) => patch(b.id, (n) => (n.b = v))));
      card.append(row);
      card.append(el('span', 'blk-note', '刚碰到的那一下才触发一次。只有一个角色时，再放一个才能碰到。'));
      card.append(stack(b.body, { zone: 'unit', unitId: ownerUnit(program, b.id)?.id, parentId: b.id, slot: 'in' }));
    } else if (b.k === 'ifSound') {
      const row = el('div', 'blk-row');
      row.append(el('b', '', b.op === 'lt' ? '如果声音小于' : '如果声音大于'));
      row.append(stepper(b.thresh, 0, 100, 5, (v) => patch(b.id, (n) => (n.thresh = v))));
      card.append(row);
      card.append(stack(b.body, { zone: 'unit', unitId: ownerUnit(program, b.id)?.id, parentId: b.id, slot: 'in' }));
      card.append(el('div', 'blk-else', '否则'));
      card.append(stack(b.elseBody, { zone: 'unit', unitId: ownerUnit(program, b.id)?.id, parentId: b.id, slot: 'in-else' }));
    } else if (b.k === 'scoreAdd') {
      const row = el('div', 'blk-row');
      row.append(el('b', '', '分数'));
      row.append(chip('+1', b.n === 1, () => patch(b.id, (n) => (n.n = 1))));
      row.append(chip('-1', b.n === -1, () => patch(b.id, (n) => (n.n = -1))));
      card.append(row);
      if (!listSprites(program).some((s) => s.type === 'number' && s.value?.k === 'score')) {
        card.append(el('span', 'blk-note', '屏幕上看不见的话，先放一个数字角色，显示选「分数」。'));
      }
    } else if (b.k === 'led') card.append(el('b', '', b.on ? '点亮板载灯' : '关掉板载灯'));
    else if (b.k === 'beep') {
      const row = el('div', 'blk-row');
      row.append(el('b', '', '哔一声'));
      row.append(chip('低', b.pitch === 'low', () => patch(b.id, (n) => (n.pitch = 'low'))));
      row.append(chip('中', b.pitch === 'mid', () => patch(b.id, (n) => (n.pitch = 'mid'))));
      row.append(chip('高', b.pitch === 'high', () => patch(b.id, (n) => (n.pitch = 'high'))));
      card.append(row);
      const dur = el('div', 'blk-row');
      dur.append(el('span', '', '秒'));
      dur.append(stepper(b.sec, 0.05, 5, 0.05, (v) => patch(b.id, (n) => (n.sec = v))));
      card.append(dur);
    } else if (b.k === 'quiet') card.append(el('b', '', '安静'));
    else if (b.k === 'wait') {
      const row = el('div', 'blk-row');
      row.append(el('b', '', '等待'));
      row.append(stepper(b.sec, 0.05, 5, 0.05, (v) => patch(b.id, (n) => (n.sec = v))));
      row.append(el('span', '', '秒'));
      card.append(row);
    } else if (b.k === 'repeat') {
      const row = el('div', 'blk-row');
      row.append(el('b', '', '重复'));
      row.append(stepper(b.times, 1, 50, 1, (v) => patch(b.id, (n) => (n.times = v))));
      row.append(el('span', '', '次'));
      card.append(row);
      card.append(stack(b.body, { zone: 'unit', unitId: ownerUnit(program, b.id)?.id, parentId: b.id, slot: 'in' }));
    } else card.append(el('b', '', '积木'));
    return card;
  }

  function draw() {
    const kids = [];
    const units = listUnits(program);
    if (!units.length && !(program.stage || []).length) {
      const empty = el('div', 'blk-empty');
      empty.append(el('b', '', '空白档案'));
      empty.append(el('span', '', '点左边的圆、方块、文字、数字或线，开始做一个角色。每个角色下面有自己的永远重复。'));
      kids.push(empty);
    }
    for (let i = 0; i <= units.length; i++) {
      const hole = el('button', 'blk-slot blk-unit-slot' + (units.length ? '' : ' empty'), units.length ? '在这里插入角色' : '点左边角色，放这里');
      hole.type = 'button';
      hole.dataset.zone = 'units';
      hole.dataset.index = String(i);
      if (selected?.dest && destKey(selected.dest) === destKey({ zone: 'units', index: i })) hole.classList.add('on');
      hole.onclick = (e) => {
        e.stopPropagation();
        pick({ dest: { zone: 'units', index: i } });
      };
      kids.push(hole);
      if (i < units.length) kids.push(renderUnit(units[i]));
    }
    const stage = el('div', 'blk-forever blk-stage');
    stage.append(el('div', 'blk-forever-head', '舞台 · 永远重复'));
    stage.append(el('span', 'blk-note', '灯、喇叭、等待可以放这里。移动、反弹要放进某个角色下面。'));
    stage.append(stack(program.stage, { zone: 'stage' }));
    kids.push(stage);
    script.replaceChildren(...kids);
    del.disabled = !selected?.id;
  }

  function renderUnit(u) {
    const box = el('div', 'blk-unit');
    box.dataset.unit = u.id;
    const hat = el('div', 'blk-hat');
    hat.append(el('b', '', spriteTitle(u.sprite?.name) + ' · 角色'));
    hat.append(el('span', '', '这一栏只放这一个角色。第二个圆会叫圆2。'));
    hat.append(renderBlock(u.sprite));
    const forever = el('div', 'blk-forever');
    forever.append(el('div', 'blk-forever-head', spriteTitle(u.sprite?.name) + ' · 永远重复'));
    forever.append(el('span', 'blk-note', '移动、碰到边缘、喇叭都放在这个角色下面。'));
    forever.append(stack(u.body, { zone: 'unit', unitId: u.id }));
    box.append(hat, forever);
    return box;
  }

  drawPalette();
  draw();

  return {
    getProgram: () => cloneProgram(program),
    setProgram(next) {
      program = validateProgram(next || defaultProgram());
      syncSeq(program);
      selected = null;
      draw();
    },
  };
}
