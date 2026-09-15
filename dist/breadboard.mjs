export const holes = [];
const xs = [-13.97, -11.43, -8.89, -6.35, -3.81, 3.81, 6.35, 8.89, 11.43, 13.97];
for (let r = 1; r <= 30; r++) {
  for (let c = 0; c < 10; c++) {
    holes.push({
      id: `bb:${"abcdefghij"[c]}${r}`,
      x: xs[c],
      y: (15.5 - r) * 2.54,
      net: `${c < 5 ? "L" : "R"}${r}`,
    });
  }
}
for (let side = 0; side < 2; side++) {
  for (let polarity = 0; polarity < 2; polarity++) {
    for (let n = 1; n <= 25; n++) {
      holes.push({
        id: `bb:${side ? "R" : "L"}${polarity ? "-" : "+"}${n}`,
        x: (side ? 1 : -1) * (polarity ? 23 : 20.46),
        y: 34.29 - (n - 1 + Math.floor((n - 1) / 5)) * 2.54,
        net: `${side ? "R" : "L"}${polarity ? "-" : "+"}`,
      });
    }
  }
}
export const holeMap = new Map(holes.map((h) => [h.id, h]));
export const internal = [];
for (const net of new Set(holes.map((h) => h.net))) {
  const group = holes.filter((h) => h.net === net);
  for (const h of group.slice(1)) internal.push({ a: group[0].id, b: h.id });
}
export const defaults = { esp: 2, oled: 12, amp: 18, mic: 27, speaker: 30, btn: 16 };

export function footprint(id, row = defaults[id]) {
  let pairs = [];
  if (id === "esp") {
    // SuperMini is 0.6" (15.24 mm) across: columns d and h.
    pairs = [
      ...["5V", "G", "3.3", "4", "3", "2", "1", "0"].map((p, i) => [p, "h", i]),
      ...["5", "6", "7", "8", "9", "10", "20", "21"].map((p, i) => [p, "d", i]),
    ];
  }
  if (id === "oled") pairs = ["GND", "VCC", "SCL", "SDA"].map((p, i) => [p, "j", 3 - i]);
  if (id === "amp") pairs = ["LRC", "BCLK", "DIN", "GAIN", "SD", "GND", "Vin"].map((p, i) => [p, "a", 6 - i]);
  if (id === "mic") {
    pairs = [
      ...["L/R", "WS", "SCK"].map((p, i) => [p, "e", i]),
      ...["GND", "VDD", "SD"].map((p, i) => [p, "f", i]),
    ];
  }
  if (id === "speaker") pairs = [];
  if (id === "btn") pairs = [["GND", "e", 0], ["SIG", "f", 0]];
  return pairs.map(([p, c, i]) => ({ a: `${id}:${p}`, b: `bb:${c}${row + i}` }));
}

export function speakerPlacement(amp) {
  const y = amp ? amp.pos[1] : placement("amp").pos[1];
  return { id: "speaker", row: 30, pos: [-54, y], rotation: Math.PI / 2, flipped: false };
}

export function placement(id, row = defaults[id]) {
  const y = (15.5 - row) * 2.54;
  if (id === "speaker") return speakerPlacement();
  return {
    id,
    row,
    pos:
      id === "esp"
        ? [1.27, y - 8.89]
        : id === "oled"
          ? [25.87, y - 3.81]
          : id === "amp"
            ? [-22.32, y - 7.62]
            : id === "btn"
              ? [0, y]
              : [0, (14.5 - row) * 2.54],
    rotation: id === "oled" || id === "amp" ? Math.PI / 2 : 0,
    flipped: false,
  };
}

export function rowOf(p) {
  return Number.isInteger(p.row) ? p.row : defaults[p.id];
}

export function boardEdges(parts) {
  return [
    ...internal,
    ...parts.flatMap((p) => footprint(p.id, rowOf(p))),
    ...(parts.some((p) => p.id === "amp") && parts.some((p) => p.id === "speaker")
      ? [
          { a: "speaker:+", b: "amp:+" },
          { a: "speaker:-", b: "amp:-" },
        ]
      : []),
  ];
}

export const bodyHalf = {
  esp: [9.3, 11.6],
  oled: [13.6, 13.6],
  amp: [10.2, 13.2],
  mic: [8.0, 8.0],
  btn: [6.2, 3.6],
};

export function underBody(part, hole) {
  const half = bodyHalf[part.id];
  if (!half || !part.pos) return false;
  const dx = hole.x - part.pos[0];
  const dy = hole.y - part.pos[1];
  const c = Math.cos(part.rotation || 0);
  const s = Math.sin(part.rotation || 0);
  const lx = dx * c + dy * s;
  const ly = -dx * s + dy * c;
  return Math.abs(lx) <= half[0] + 0.4 && Math.abs(ly) <= half[1] + 0.4;
}

export function coveredHoles(parts) {
  const ids = new Set();
  for (const part of parts) {
    if (!bodyHalf[part.id]) continue;
    for (const h of holes) {
      if (underBody(part, h)) ids.add(h.id);
    }
  }
  return ids;
}

export function occupied(parts, wires = []) {
  return new Set([
    ...parts.flatMap((p) => footprint(p.id, rowOf(p)).map((e) => e.b)),
    ...wires.flatMap((w) => [w.a, w.b]),
  ]);
}

function freeOnNetName(net, parts, wires = [], near = null) {
  const used = occupied(parts, wires);
  const cover = coveredHoles(parts);
  const candidates = holes.filter((h) => h.net === net && !used.has(h.id) && !cover.has(h.id));
  if (near) {
    candidates.sort(
      (a, b) => Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y),
    );
  }
  return candidates[0]?.id ?? null;
}

export function freeOnNet(pin, parts, wires = []) {
  if (pin.startsWith("rail:")) return freeOnNetName(pin.slice(5), parts, wires);
  const id = pin.split(":")[0];
  const part = parts.find((p) => p.id === id);
  if (!part) return null;
  const edge = footprint(id, rowOf(part)).find((e) => e.a === pin);
  const pinHole = edge && holeMap.get(edge.b);
  if (!pinHole) return null;
  return freeOnNetName(pinHole.net, parts, wires, pinHole);
}

function wireColor(pin) {
  if (/GND|:G$|rail:.*-/.test(pin)) return 0x273c49;
  if (/VCC|3\.3|5V|Vin|VDD|rail:.*\+/.test(pin)) return 0xe15449;
  if (/SCL/.test(pin)) return 0xe1a32c;
  return 0x1499ac;
}

export function autoWires(parts, pairs) {
  const out = [];
  for (const [pinA, pinB] of pairs) {
    const a = freeOnNet(pinA, parts, out);
    const near = a ? holeMap.get(a) : null;
    const b = pinB.startsWith("rail:")
      ? freeOnNetName(pinB.slice(5), parts, out, near)
      : freeOnNet(pinB, parts, out);
    if (!a || !b) continue;
    out.push({ a, b, color: wireColor(pinA) || wireColor(pinB) });
  }
  return out;
}

export function validPlacement(parts, id, row, wires = []) {
  const fp = footprint(id, row);
  const used = occupied(
    parts.filter((p) => p.id !== id),
    wires,
  );
  if (fp.some((e) => !holeMap.has(e.b) || used.has(e.b))) return false;
  const rows = fp.map((e) => +e.b.match(/\d+$/)[0]);
  return !parts
    .filter((p) => p.id !== id && p.id !== "speaker" && id !== "speaker")
    .some((p) => {
      const other = footprint(p.id, rowOf(p)).map((e) => +e.b.match(/\d+$/)[0]);
      return Math.min(...rows) <= Math.max(...other) && Math.max(...rows) >= Math.min(...other);
    });
}
