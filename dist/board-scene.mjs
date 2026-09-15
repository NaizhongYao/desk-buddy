import * as T from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js?v=20260912-5";
import { definitions } from "./circuit.mjs";
import {
  holes,
  holeMap,
  footprint,
  placement,
  speakerPlacement,
  defaults,
  validPlacement,
  occupied,
  coveredHoles,
} from "./breadboard.mjs";

const BOARD_TOP = 0;
const BOARD_THICK = 8;
const BOARD_Z = BOARD_TOP - BOARD_THICK / 2;
const DESK_Z = BOARD_TOP - BOARD_THICK - 0.4;
const SEATED_Z = 2.8;
const SPEAKER_Z = -3;
const HIDE_ON_SPEAKER = /wire|dupont|contact window|socket opening/i;

export async function createTable(container, screenCanvas, callbacks) {
  const scene = new T.Scene();
  scene.background = new T.Color("#e9eddf");
  const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  container.prepend(renderer.domElement);

  const camera = new T.OrthographicCamera(-60, 60, 55, -55, 0.1, 1200);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  const view = { panX: 0, panY: 0, zoom: 1, azimuth: 0, polar: 0.28, preset: "top" };
  const TOP_VIEW = { polar: 0.28, azimuth: 0, zoom: 1 };
  const THREE_VIEW = { polar: 1.02, azimuth: 0.72, zoom: 0.92 };
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 3.2;
  const camRight = new T.Vector3();
  const camUp = new T.Vector3();

  function applyCamera() {
    const dist = 240;
    view.polar = Math.min(1.28, Math.max(0.22, view.polar));
    const p = view.polar;
    const a = view.azimuth;
    const tx = view.panX;
    const ty = view.panY;
    camera.up.set(0, 0, 1);
    camera.position.set(tx + dist * Math.sin(p) * Math.sin(a), ty - dist * Math.sin(p) * Math.cos(a), dist * Math.cos(p));
    camera.lookAt(tx, ty, 0);
    camera.zoom = view.zoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const el = renderer.domElement;
    el.dataset.polar = p.toFixed(3);
    el.dataset.azimuth = a.toFixed(3);
    el.dataset.panx = tx.toFixed(2);
    el.dataset.pany = ty.toFixed(2);
    el.dataset.preset = view.preset;
  }

  function panByScreen(dx, dy) {
    const el = renderer.domElement;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    const worldX = (camera.right - camera.left) / camera.zoom / w;
    const worldY = (camera.top - camera.bottom) / camera.zoom / h;
    camRight.set(1, 0, 0).applyQuaternion(camera.quaternion).setZ(0);
    camUp.set(0, 1, 0).applyQuaternion(camera.quaternion).setZ(0);
    if (camRight.lengthSq() < 1e-6) camRight.set(1, 0, 0);
    if (camUp.lengthSq() < 1e-6) camUp.set(0, 1, 0);
    camRight.normalize();
    camUp.normalize();
    view.panX += camRight.x * dx * worldX + camUp.x * -dy * worldY;
    view.panY += camRight.y * dx * worldX + camUp.y * -dy * worldY;
  }

  function notifyZoom() {
    callbacks.zoom?.(view.zoom);
  }

  function setZoom(next, anchor) {
    const before = view.zoom;
    view.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
    if (anchor && Math.abs(view.zoom - before) > 1e-4) {
      const factor = before / view.zoom;
      view.panX = anchor.x + (view.panX - anchor.x) * factor;
      view.panY = anchor.y + (view.panY - anchor.y) * factor;
    }
    applyCamera();
    notifyZoom();
  }

  function resetView(preset = view.preset) {
    const src = preset === "three" ? THREE_VIEW : TOP_VIEW;
    view.preset = preset;
    view.panX = 0;
    view.panY = 0;
    view.zoom = src.zoom;
    view.azimuth = src.azimuth;
    view.polar = src.polar;
    applyCamera();
    notifyZoom();
  }

  scene.add(new T.AmbientLight(0xf4f7f8, 0.55));
  scene.add(new T.HemisphereLight(0xffffff, 0x7a8b96, 1.35));
  const key = new T.DirectionalLight(0xfff7ee, 2.35);
  key.position.set(-24, 48, 120);
  scene.add(key);
  const fill = new T.DirectionalLight(0xd7e8f6, 0.95);
  fill.position.set(50, -28, 70);
  scene.add(fill);
  const rim = new T.DirectionalLight(0xeef6ff, 0.55);
  rim.position.set(10, -80, 40);
  scene.add(rim);

  function makeTalkButton() {
    const g = new T.Group();
    const pcb = box(0, 0, 0.8, 12.2, 12.2, 1.6, 0x1c2420, g);
    pcb.userData.part = "btn";
    const legs = [
      [-3.8, -5.6],
      [3.8, -5.6],
      [-3.8, 5.6],
      [3.8, 5.6],
    ];
    for (const [x, y] of legs) {
      const leg = box(x, y, -0.4, 0.7, 0.7, 2.4, 0xc9b27a, g);
      leg.userData.part = "btn";
    }
    const stem = box(0, 0, 1.85, 6.4, 6.4, 0.7, 0x2a3330, g);
    stem.userData.part = "btn";
    const cap = box(0, 0, 2.55, 8.2, 8.2, 1.6, 0xd45b28, g);
    cap.userData.part = "btn";
    cap.name = "talk-cap";
    g.traverse((o) => {
      if (o.isMesh) o.userData.part = "btn";
    });
    return g;
  }

  function box(x, y, z, w, h, d, color, parent = scene) {
    const m = new T.Mesh(
      new T.BoxGeometry(w, h, d),
      new T.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.04 }),
    );
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  box(0, 0, DESK_Z - 0.7, 260, 200, 1.4, 0xe0e7d7);
  const shadow = new T.Mesh(
    new T.PlaneGeometry(62, 92),
    new T.MeshBasicMaterial({ color: 0x4b5d68, transparent: true, opacity: 0.16 }),
  );
  shadow.position.set(2.2, -2.4, DESK_Z + 0.04);
  scene.add(shadow);
  box(0, 0, BOARD_Z - 0.15, 56.4, 86.4, 0.5, 0xddd6c8);

  const boardCanvas = document.createElement("canvas");
  boardCanvas.width = 1024;
  boardCanvas.height = 1536;
  const bctx = boardCanvas.getContext("2d");
  bctx.fillStyle = "#f6f3ea";
  bctx.fillRect(0, 0, 1024, 1536);
  bctx.fillStyle = "#2b3338";
  bctx.font = "700 44px Segoe UI, Microsoft YaHei, sans-serif";
  bctx.textAlign = "center";
  bctx.textBaseline = "middle";
  for (let i = 1; i <= 30; i++) {
    const worldY = (15.5 - i) * 2.54;
    const canvasY = 1536 * ((worldY + 42.5) / 85);
    bctx.fillText(String(i), 84, canvasY);
  }
  const colXs = [-13.97, -11.43, -8.89, -6.35, -3.81, 3.81, 6.35, 8.89, 11.43, 13.97];
  const cols = "abcdefghij";
  for (let c = 0; c < 10; c++) {
    const canvasX = 1024 * ((colXs[c] + 27.5) / 55);
    bctx.fillText(cols[c], canvasX, 1536 * 0.96);
  }
  bctx.fillStyle = "#9a2b24";
  bctx.fillText("+", 1024 * ((-20.46 + 27.5) / 55), 1536 * 0.96);
  bctx.fillText("+", 1024 * ((20.46 + 27.5) / 55), 1536 * 0.96);
  bctx.fillStyle = "#1d4f86";
  bctx.fillText("−", 1024 * ((-23 + 27.5) / 55), 1536 * 0.96);
  bctx.fillText("−", 1024 * ((23 + 27.5) / 55), 1536 * 0.96);
  const boardTexture = new T.CanvasTexture(boardCanvas);
  boardTexture.anisotropy = 8;
  boardTexture.needsUpdate = true;
  const body = new T.Mesh(
    new T.BoxGeometry(55, 85, BOARD_THICK),
    new T.MeshStandardMaterial({ map: boardTexture, color: 0xffffff, roughness: 0.82, metalness: 0.04 }),
  );
  body.position.set(0, 0, BOARD_Z);
  scene.add(body);
  box(0, 0, 0.05, 2.6, 80, 0.1, 0xd0d8d6);

  const traces = new T.Group();
  scene.add(traces);
  traces.visible = false;
  for (const net of new Set(holes.map((h) => h.net))) {
    const hs = holes.filter((h) => h.net === net);
    const a = hs[0];
    const b = hs.at(-1);
    box(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      BOARD_Z,
      Math.abs(a.x - b.x) + 1.4,
      Math.abs(a.y - b.y) + 1.4,
      0.18,
      net.includes("+") ? 0xea665a : net.includes("-") ? 0x408dd6 : 0xd2a447,
      traces,
    );
  }

  function addEspPinLabels(g) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 640;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 512, 640);
    const right = ["5V", "G", "3.3", "4", "3", "2", "1", "0"];
    const left = ["5", "6", "7", "8", "9", "10", "20", "21"];
    const boardW = 18;
    const boardH = 22.5;
    const toX = (mmX) => ((mmX + boardW / 2) / boardW) * 512;
    const toY = (mmY) => ((boardH / 2 - mmY) / boardH) * 640;
    ctx.font = "bold 42px Segoe UI, Microsoft YaHei, sans-serif";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(12,18,16,0.92)";
    ctx.fillStyle = "#f4fff8";
    left.forEach((name, i) => {
      const x = toX(-6.2);
      const y = toY(8.89 - i * 2.54);
      ctx.textAlign = "left";
      ctx.strokeText(name, x, y);
      ctx.fillText(name, x, y);
    });
    right.forEach((name, i) => {
      const x = toX(6.2);
      const y = toY(8.89 - i * 2.54);
      ctx.textAlign = "right";
      ctx.strokeText(name, x, y);
      ctx.fillText(name, x, y);
    });
    const map = new T.CanvasTexture(canvas);
    map.anisotropy = 8;
    const plate = new T.Mesh(
      new T.PlaneGeometry(boardW, boardH),
      new T.MeshBasicMaterial({ map, transparent: true, depthTest: true, depthWrite: false }),
    );
    plate.position.set(0, 0, 1.72);
    plate.renderOrder = 2;
    plate.name = "esp-pin-labels";
    plate.userData.part = "esp";
    g.add(plate);
  }

  const holeGeom = new T.CylinderGeometry(0.56, 0.46, 1.05, 14);
  holeGeom.rotateX(Math.PI / 2);
  const hitHoles = [];
  for (const h of holes) {
    const m = new T.Mesh(
      holeGeom,
      new T.MeshStandardMaterial({ color: 0x243038, roughness: 0.92, metalness: 0.08, emissive: 0x000000 }),
    );
    m.position.set(h.x, h.y, -0.42);
    m.userData.hole = h.id;
    scene.add(m);
    hitHoles.push(m);
  }

  const labels = container.querySelector("#labels");
  for (const x of [-20.46, 20.46]) box(x, 0, 0.12, 0.28, 75, 0.1, 0xe75b50);
  for (const x of [-23, 23]) box(x, 0, 0.12, 0.28, 75, 0.1, 0x3885c9);

  const roots = new Map();
  const parts = new Map();
  const titles = new Map();
  const loader = new GLTFLoader();
  let wires = [];
  const wireObjects = [];
  const mountObjects = [];
  const previewWire = []; // 预览线容器
  let selected = null;
  let selectedWire = null;
  let pending = null;
  let highlighted = [];
  let taskLit = [];
  let xray = false;
  let mode = "top";
  let frozen = false;

  const texture = new T.CanvasTexture(screenCanvas);
  texture.magFilter = T.NearestFilter;
  texture.minFilter = T.NearestFilter;

  await Promise.all(
    definitions.map(async (d) => {
      const g = d.model < 0 ? makeTalkButton() : new T.Group();
      if (d.model >= 0) {
        const data = await loader.loadAsync(`./assets/part${d.model}.glb`);
        const model = data.scene;
        model.traverse((o) => {
          if (d.id === "speaker" && HIDE_ON_SPEAKER.test(o.name || "")) {
            o.visible = false;
            o.scale.set(0, 0, 0);
          }
          if (!o.isMesh) return;
          o.userData.part = d.id;
          o.material = o.material.clone();
        });
        g.add(model);
      }
      if (d.id === "mic") g.rotation.x = Math.PI;
      g.visible = false;
      scene.add(g);
      roots.set(d.id, g);
      const titleLabel = document.createElement("span");
      titleLabel.className = "partlabel";
      titleLabel.textContent = d.name;
      titleLabel.style.display = "none";
      labels.append(titleLabel);
      titles.set(d.id, { el: titleLabel, v: new T.Vector3(0, 0, 0) });
      if (d.id === "oled") {
        const s = new T.Mesh(
          new T.PlaneGeometry(23, 11.5),
          new T.MeshBasicMaterial({ map: texture, side: T.DoubleSide }),
        );
        s.position.set(0, -0.1, 1.43);
        g.add(s);
      }
      if (d.id === "esp") addEspPinLabels(g);
    }),
  );

  function clear(list) {
    for (const m of list) {
      scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    list.length = 0;
  }

  function cable(a, b, color, list, arch = 8, radius = 0.32, isPreview = false) {
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const dynamicArch = arch + dist * 0.08; // 根据距离调整弧度
    const dynamicRadius = radius * 1.5; // 增加线径粗细
    
    const curve = new T.CubicBezierCurve3(
      a,
      new T.Vector3(a.x, a.y, a.z + dynamicArch * 0.85),
      new T.Vector3(b.x, b.y, b.z + dynamicArch * 0.85),
      b,
    );
    const mesh = new T.Mesh(
      new T.TubeGeometry(curve, 32, dynamicRadius, 10, false), // 更多分段和径向分辨率
      new T.MeshStandardMaterial({ 
        color, 
        roughness: 0.42, 
        metalness: 0.06,
        transparent: isPreview,
        opacity: isPreview ? 0.35 : 1.0,
        depthWrite: !isPreview
      }),
    );
    scene.add(mesh);
    list.push(mesh);
    return mesh;
  }

  function state() {
    return [...parts.values()].map((p) => ({ ...p, pos: [...p.pos] }));
  }

  function seatZ(id) {
    if (id === "speaker") return SPEAKER_Z;
    if (id === "btn") return 1.2;
    return SEATED_Z;
  }

  function rebuild() {
    clear(wireObjects);
    clear(mountObjects);
    wires.forEach((w, i) => {
      const a = holeMap.get(w.a);
      const b = holeMap.get(w.b);
      if (!a || !b) return;
      const picked = selectedWire === i;
      const arch = 7.5 + (i % 4) * 2.4;
      const tube = cable(
        new T.Vector3(a.x, a.y, 2.55),
        new T.Vector3(b.x, b.y, 2.55),
        picked ? 0xf0b429 : w.color ?? 0x1595aa,
        wireObjects,
        arch,
        picked ? 0.38 : 0.28,
      );
      tube.userData.wireIndex = i;
      if (picked) {
        tube.material.emissive.setHex(0xffc44d);
        tube.material.emissiveIntensity = 0.55;
      }
      for (const h of [a, b]) {
        const housing = box(h.x, h.y, 1.45, 1.05, 1.05, 2.5, picked ? 0xf0b429 : 0x1b242b);
        const pin = box(h.x, h.y, 0.18, 0.38, 0.38, 0.7, picked ? 0xffe08a : 0xd6b25a);
        housing.userData.wireIndex = i;
        pin.userData.wireIndex = i;
        if (picked) {
          housing.material.emissive.setHex(0xf0b429);
          housing.material.emissiveIntensity = 0.35;
        }
        wireObjects.push(housing, pin);
      }
    });
    if (parts.has("amp") && parts.has("speaker")) {
      const amp = roots.get("amp");
      const speaker = roots.get("speaker");
      amp.updateMatrixWorld(true);
      speaker.updateMatrixWorld(true);
      const pairs = [
        { solder: new T.Vector3(-2.4, -7.3, -3.2), color: 0xdd3934, terminalX: 2.05 },
        { solder: new T.Vector3(2.4, -7.3, -3.2), color: 0x1a1f24, terminalX: -2.05 },
      ];
      for (const p of pairs) {
        const start = speaker.localToWorld(p.solder.clone());
        const mouth = amp.localToWorld(new T.Vector3(p.terminalX, 10.55, 2.5));
        const inside = amp.localToWorld(new T.Vector3(p.terminalX, 8.2, 2.0));
        cable(start, mouth, p.color, mountObjects, 12, 0.45);
        cable(mouth, inside, 0xc49a4a, mountObjects, 0, 0.28);
      }
    }
    
    applyXray();
  }

  function ghostMaterial(mat, on, ghostOpacity) {
    if (!mat) return;
    const list = Array.isArray(mat) ? mat : [mat];
    for (const m of list) {
      if (!m) continue;
      if (!m.userData) m.userData = {};
      if (!m.userData.xrayOrig) {
        m.userData.xrayOrig = {
          transparent: !!m.transparent,
          opacity: Number.isFinite(m.opacity) ? m.opacity : 1,
          depthWrite: m.depthWrite !== false,
        };
      }
      const orig = m.userData.xrayOrig;
      if (on) {
        m.transparent = true;
        m.opacity = Math.min(orig.opacity, ghostOpacity);
        m.depthWrite = false;
      } else {
        m.transparent = orig.transparent;
        m.opacity = orig.opacity;
        m.depthWrite = orig.depthWrite;
      }
      m.needsUpdate = true;
    }
  }

  function applyXray() {
    traces.visible = xray;
    ghostMaterial(body.material, xray, 0.22);
    for (const g of roots.values()) {
      g.traverse((o) => {
        if (o.name === "esp-pin-labels") {
          o.visible = !xray;
          return;
        }
        if (o.isMesh) ghostMaterial(o.material, xray, 0.22);
      });
    }
    for (const mesh of [...wireObjects, ...mountObjects, ...previewWire]) {
      if (mesh?.isMesh) ghostMaterial(mesh.material, xray, 0.15);
    }
  }

  function install(p) {
    if (p.id === "speaker" && parts.has("amp")) p = speakerPlacement(parts.get("amp"));
    parts.set(p.id, p);
    const g = roots.get(p.id);
    g.visible = true;
    g.position.set(p.pos[0], p.pos[1], seatZ(p.id));
    g.rotation.set(p.id === "mic" ? Math.PI : 0, 0, p.rotation);
    if (p.id === "amp" && parts.has("speaker")) {
      const sp = speakerPlacement(p);
      parts.set("speaker", sp);
      const sg = roots.get("speaker");
      sg.visible = true;
      sg.position.set(sp.pos[0], sp.pos[1], SPEAKER_Z);
      sg.rotation.set(0, 0, sp.rotation);
    }
  }

  function setActive(id, on) {
    if (!on) {
      parts.delete(id);
      roots.get(id).visible = false;
      rebuild();
      return true;
    }
    if (parts.has(id)) return true;
    let row = defaults[id];
    if (id !== "speaker" && !validPlacement(state(), id, row, wires)) {
      row = Array.from({ length: 30 }, (_, i) => i + 1).find((r) => validPlacement(state(), id, r, wires));
      if (!row) {
        callbacks.message?.("面包板没有足够的连续空位，请先收回其他零件。");
        return false;
      }
    }
    install(id === "speaker" ? speakerPlacement(parts.get("amp")) : placement(id, row));
    rebuild();
    return true;
  }

  const pointer = new T.Vector2();
  const ray = new T.Raycaster();
  const plane = new T.Plane(new T.Vector3(0, 0, 1), 0);

  function point(e) {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    const p = new T.Vector3();
    ray.ray.intersectPlane(plane, p);
    return p;
  }

  function nearest(p) {
    let best = null;
    let dist = 1.6;
    for (const h of holes) {
      const d = Math.hypot(h.x - p.x, h.y - p.y);
      if (d < dist) {
        best = h;
        dist = d;
      }
    }
    return best;
  }

  const info = document.createElement("div");
  info.className = "holeinfo";
  container.append(info);
  info.textContent = "";

  let orbit = null;
  let panning = null;
  function capture(el, id) {
    try {
      el.setPointerCapture(id);
    } catch {}
  }
  container.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 80 : 1;
      if (e.shiftKey) {
        panByScreen(e.deltaX * 0.7 * scale || e.deltaY * 0.7 * scale, e.deltaX ? 0 : e.deltaY * 0.7 * scale);
        applyCamera();
        return;
      }
      const world = point(e);
      const factor = Math.exp(-e.deltaY * 0.0016 * scale);
      setZoom(view.zoom * factor, world);
    },
    { passive: false },
  );
  container.addEventListener("contextmenu", (e) => e.preventDefault());
  container.addEventListener("auxclick", (e) => {
    if (e.button === 1) e.preventDefault();
  });
  renderer.domElement.addEventListener("pointerdown", (e) => {
    if (e.button === 1) {
      e.preventDefault();
      panning = { x: e.clientX, y: e.clientY };
      capture(renderer.domElement, e.pointerId);
      return;
    }
    if (e.button === 2) {
      e.preventDefault();
      orbit = { x: e.clientX, y: e.clientY, azimuth: view.azimuth, polar: view.polar };
      capture(renderer.domElement, e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    if (frozen) {
      panning = { x: e.clientX, y: e.clientY };
      capture(renderer.domElement, e.pointerId);
      return;
    }
    const p = point(e);
    const h = nearest(p);
    if (h) {
      if (mode !== "top") {
        if (!frozen) callbacks.message?.("3D 是用来看的。接线请点左上角「俯视接线」。");
        else {
          panning = { x: e.clientX, y: e.clientY };
          capture(renderer.domElement, e.pointerId);
        }
        return;
      }
      selected = null;
      callbacks.select(null);
      callbacks.pin(h.id);
      clear(previewWire);
      return;
    }
    const wireHits = ray
      .intersectObjects(wireObjects, false)
      .filter((v) => v.object.visible && Number.isInteger(v.object.userData.wireIndex));
    const tubeHit = wireHits.find((v) => v.object.geometry?.type === "TubeGeometry");
    if (tubeHit) {
      selected = null;
      callbacks.select(null);
      callbacks.pickWire?.(tubeHit.object.userData.wireIndex);
      return;
    }
    const hit = ray
      .intersectObjects([...roots.values()].filter((g) => g.visible), true)
      .find((v) => v.object.visible && v.object.userData.part);
    if (hit) {
      selected = hit.object.userData.part;
      callbacks.select(selected);
      return;
    }
    if (wireHits.length) {
      selected = null;
      callbacks.select(null);
      callbacks.pickWire?.(wireHits[0].object.userData.wireIndex);
      return;
    }
    selected = null;
    callbacks.select(null);
    callbacks.pickWire?.(null);
    panning = { x: e.clientX, y: e.clientY };
    capture(renderer.domElement, e.pointerId);
  });
  window.addEventListener("pointermove", (e) => {
    if (panning) {
      panByScreen(-(e.clientX - panning.x), -(e.clientY - panning.y));
      panning = { x: e.clientX, y: e.clientY };
      applyCamera();
    } else if (orbit) {
      view.azimuth = orbit.azimuth - (e.clientX - orbit.x) * 0.01;
      view.polar = orbit.polar - (e.clientY - orbit.y) * 0.0075;
      applyCamera();
    }
  });
  function endPointer() {
    panning = null;
    orbit = null;
  }
  window.addEventListener("pointerup", endPointer);
  window.addEventListener("pointercancel", endPointer);

  renderer.domElement.addEventListener("pointermove", (e) => {
    if (panning || orbit) return;
    const p = point(e);
    const h = nearest(p);
    if (h) {
      if (mode !== "top") {
        info.textContent = "3D 是用来看的 · 接线请切回「俯视接线」";
      } else {
        const owner = [...parts.values()].flatMap((part) => footprint(part.id, part.row)).find((v) => v.b === h.id);
        const blocked = coveredHoles(state()).has(h.id) && !owner;
        info.textContent =
          h.id.slice(3) +
          (owner ? " · " + owner.a : blocked ? " · 被零件挡住，接不了线" : " · " + (occupied(state(), wires).has(h.id) ? "已插线" : "空孔")) +
          " · " +
          (h.net.includes("+") || h.net.includes("-")
            ? "同侧同色轨相通"
            : "同一行 " + (h.net[0] === "L" ? "a–e" : "f–j") + " 相通");
      }
    } else {
      info.textContent = "";
    }
    
    // 更新预览线
    if (pending && h && mode === "top" && !frozen) {
      const fromHole = holeMap.get(pending);
      if (fromHole && h.id !== pending) {
        clear(previewWire);
        const arch = 7.5;
        cable(
          new T.Vector3(fromHole.x, fromHole.y, 2.55),
          new T.Vector3(h.x, h.y, 2.55),
          0x1595aa,
          previewWire,
          arch,
          0.28,
          true // 半透明预览
        );
      }
    } else if (previewWire.length > 0) {
      clear(previewWire);
    }
  });

  function release() {
    endPointer();
  }

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h, false);
    const span = Math.max(100, 140 / (w / h));
    camera.left = (-span * w) / h / 2;
    camera.right = (span * w) / h / 2;
    camera.top = span / 2;
    camera.bottom = -span / 2;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();
  resetView("top");

  function placeLabel(titleObj, part) {
    const g = roots.get(part.id);
    if (!g || !g.visible) {
      titleObj.el.style.display = "none";
      return;
    }
    const isSelected = selected === part.id;
    titleObj.el.style.display = isSelected ? "" : "none";
    if (isSelected) {
      const offset = part.id === "mic" ? -11 : -17;
      const worldPos = g.localToWorld(new T.Vector3(0, offset, 0));
      const projected = worldPos.project(camera);
      titleObj.el.style.left = ((projected.x + 1) / 2) * container.clientWidth + "px";
      titleObj.el.style.top = ((1 - projected.y) / 2) * container.clientHeight + "px";
    }
  }

  function relatedIds() {
    if (!selected || !parts.has(selected)) return new Set();
    if (selected === "speaker" && parts.has("amp")) return new Set(footprint("amp", parts.get("amp").row).map((e) => e.b));
    return new Set(footprint(selected, parts.get(selected).row).map((e) => e.b));
  }

  function tint() {}

  function render() {
    requestAnimationFrame(render);
    for (const [id, l] of titles) {
      const isSelected = selected === id && parts.has(id);
      l.el.style.display = isSelected ? "" : "none";
      if (isSelected) {
        const p = parts.get(id);
        const offset = id === "mic" ? -11 : -17;
        const g = roots.get(id);
        const worldPos = g.localToWorld(new T.Vector3(0, offset, 0));
        const projected = worldPos.project(camera);
        l.el.style.left = ((projected.x + 1) / 2) * container.clientWidth + "px";
        l.el.style.top = ((1 - projected.y) / 2) * container.clientHeight + "px";
      }
    }
    for (const id of roots.keys()) {
      const on = selected === id || (selected === "speaker" && id === "amp") || (selected === "amp" && id === "speaker");
      tint(id, on && parts.has(id));
    }
    const used = occupied(state(), wires);
    const cover = coveredHoles(state());
    const taskSet = new Set(taskLit.filter((id) => !cover.has(id) || used.has(id)));
    const netSet = new Set(highlighted.filter((id) => !cover.has(id) || used.has(id)));
    for (let i = 0; i < holes.length; i++) {
      const id = holes[i].id;
      const m = hitHoles[i];
      const blocked = cover.has(id);
      const task = taskSet.has(id);
      const net = !task && netSet.has(id);
      m.material.color.set(task ? 0xf0b429 : net ? 0x19c9a5 : blocked ? 0x151c21 : used.has(id) ? 0xe08a3c : 0x2a3640);
      m.material.emissive.set(task ? 0x8a5a10 : net ? 0x06352c : 0x000000);
      m.material.emissiveIntensity = task ? 0.55 : net ? 0.22 : 1;
      m.material.depthTest = true;
      m.renderOrder = task || net ? 1 : 0;
      m.scale.setScalar(task ? 1.22 : net ? 1.06 : blocked ? 0.82 : 1);
    }
    renderer.render(scene, camera);
  }
  render();

  return {
    roots,
    state,
    setActive,
    refreshScreen() {
      texture.needsUpdate = true;
    },
    setWires(v, picked) {
      wires = v;
      if (picked !== undefined) selectedWire = picked;
      if (selectedWire != null && (selectedWire < 0 || selectedWire >= wires.length)) selectedWire = null;
      rebuild();
    },
    setSelectedWire(index) {
      selectedWire = Number.isInteger(index) ? index : null;
      rebuild();
    },
    highlight(taskIds, from, netIds) {
      if (taskIds && !Array.isArray(taskIds) && typeof taskIds === "object") {
        taskLit = taskIds.task || [];
        highlighted = taskIds.net || [];
        pending = taskIds.from ?? null;
      } else {
        taskLit = taskIds || [];
        highlighted = netIds || [];
        pending = from || null;
      }
      if (!pending) clear(previewWire);
    },
    setFrozen(on) {
      frozen = !!on;
      if (frozen) clear(previewWire);
    },
    select(id) {
      selected = id;
      callbacks.select(id);
    },
    setMode(v) {
      mode = v;
      resetView(v === "three" ? "three" : "top");
    },
    center() {
      resetView(mode === "three" ? "three" : "top");
    },
    zoomBy(factor) {
      setZoom(view.zoom * factor);
    },
    zoomTo(value) {
      setZoom(value);
    },
    getZoom() {
      return view.zoom;
    },
    rotate() {
      callbacks.message?.("排针方向固定。零件位置已经写死，不能拖动。");
    },
    flip() {
      callbacks.message?.("插入面包板的零件不能翻面；可切换 3D 观察。");
    },
    restore(ps) {
      parts.clear();
      for (const g of roots.values()) g.visible = false;
      for (const p of ps) {
        const row = p.row ?? defaults[p.id];
        if (p.id !== "speaker" && !validPlacement(state(), p.id, row)) throw Error("零件孔位冲突或超出面包板");
        install(p.id === "speaker" ? speakerPlacement(parts.get("amp")) : placement(p.id, row));
      }
      rebuild();
    },
    setXray(on) {
      xray = !!on;
      applyXray();
    },
    led(on) {
      const g = roots.get("esp");
      let b = g.getObjectByName("virtual-led");
      if (!b) {
        b = box(4.1, 1.25, 1.6, 1, 1, 0.3, 0x198eff, g);
        b.name = "virtual-led";
      }
      b.visible = on;
    },
  };
}
