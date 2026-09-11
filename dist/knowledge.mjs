import * as T from "three";
import { definitions } from "./circuit.mjs";
import { GLTFLoader } from "./vendor/GLTFLoader.js";

const SKIP_KEY = "desk-buddy-skip-intro";
const $ = (id) => document.getElementById(id);

const NAV = [
  { id: "robot", name: "认识小机器人", hint: "它是谁" },
  { id: "board", name: "面包板工作台", hint: "插零件的板" },
  { id: "esp", name: "大脑 ESP32", hint: "会跑程序" },
  { id: "oled", name: "眼睛 OLED", hint: "会眨眼睛" },
  { id: "amp", name: "功放", hint: "帮喇叭说话" },
  { id: "mic", name: "耳朵 麦克风", hint: "能听见声音" },
  { id: "speaker", name: "嘴巴 喇叭", hint: "会发出声音" },
  { id: "wires", name: "电线颜色", hint: "红黑青金" },
  { id: "faq", name: "常见问题", hint: "卡住了看这里" },
];

const PINS = {
  esp: [
    ["5V", "电源备用", "5 伏电源针。这节课使用 3.3V 供电，先空着它；不同零件能用的电压不一样。"],
    ["G", "地线", "电做完事情回家的路。所有零件的 GND 最后都要通到这里，或通到蓝色地线轨。"],
    ["3.3", "电源", "3.3 伏特，小零件的午饭。屏幕、麦克风、功放都吃这个。红色线。"],
    ["4", "时钟 SCL", "给屏幕报时：现在可以传画面了。接 OLED 的 SCL。金色线。"],
    ["5", "数据 SDA", "把画面内容传给屏幕。接 OLED 的 SDA。青色线。"],
    ["0 / 1 / 2 / 3 / 6", "先留着", "现在课上先不用。以后想接开关、灯或其他小零件，再来用它们。"],
    ["7", "功放节拍", "已经接好时，接到功放的 LRC，告诉喇叭现在是左声道还是右声道。"],
    ["8", "蓝灯 / 功放节拍", "板子上那颗可编程的蓝灯就在这根针。已经接好时，也接到功放的 BCLK，给声音打拍子。"],
    ["9", "声音数据", "已经接好时，把要说的话送给功放的 DIN。"],
    ["10", "听麦克风", "已经接好时，接到麦克风的 SD，把听到的声音收回来。"],
    ["20", "麦克风节拍", "已经接好时，接到麦克风的 WS。"],
    ["21", "麦克风小拍子", "已经接好时，接到麦克风的 SCK。"],
  ],
  oled: [
    ["GND", "地线", "回家的路。黑色。接到主板 G，或接到蓝色地线轨。"],
    ["VCC", "电源", "屏幕要吃饭。红色。接到主板 3.3，或接到红色电源轨。不要接 5V。"],
    ["SCL", "时钟", "主板喊“开始传了”。金色。接到主板的 4。"],
    ["SDA", "画面数据", "真正的画面从这里走进屏幕。青色。接到主板的 5。"],
  ],
  amp: [
    ["LRC", "左右节拍", "告诉喇叭现在轮到左还是右。接到主板 7。"],
    ["BCLK", "小拍子", "声音一位一位往前走的节拍。接到主板 8。"],
    ["DIN", "声音进来", "主板把要说的话从这里送进来。接到主板 9。"],
    ["GAIN", "音量", "决定喇叭大声还是小声。第一课可以先不接线，模块自己有个默认大小。"],
    ["SD", "开关", "让功放醒来或睡觉。第一课可以先不接线。"],
    ["GND", "地线", "回家的路。黑色。接到蓝色地线轨。"],
    ["Vin", "电源", "给功放供电。本实验桌接 3.3V 电源轨；实物供电请按模块说明核对。"],
    ["+", "喇叭正极", "绿色端子的 +。喇叭红线拧进来。"],
    ["−", "喇叭负极", "绿色端子的 −。喇叭黑线拧进来。"],
  ],
  mic: [
    ["L/R", "左右选择", "选择声音放在左声道还是右声道。实物接地还是接电源，要配合模块说明和程序设置；不是音量开关。"],
    ["WS", "节拍", "和功放的 LRC 很像，给声音对齐拍子。接到主板 20。"],
    ["SCK", "小拍子", "声音一位一位往前走。接到主板 21。"],
    ["GND", "地线", "回家的路。黑色。接到蓝色地线轨。"],
    ["VDD", "电源", "麦克风要吃饭。红色。接到 3.3 电源轨。"],
    ["SD", "声音出去", "听到的声音从这里送给主板。接到主板 10。"],
  ],
  speaker: [
    ["+", "红线", "喇叭的正极。剥掉一点皮，拧进功放绿色端子的 +。不插面包板。"],
    ["−", "黑线", "喇叭的负极。拧进功放绿色端子的 −。千万不要直接插到 ESP32 上。"],
  ],
};

const AROUND = {
  esp: [
    ["黑", "G → 右边蓝轨", "把大脑的地线接到面包板，大家共用一条回家的路。"],
    ["红", "3.3 → 右边红轨", "把 3.3 伏特电送到面包板，屏幕和麦克风来这里吃饭。"],
    ["金", "4 → OLED SCL", "给眼睛报时。"],
    ["青", "5 → OLED SDA", "把画面传给眼睛。"],
    ["青", "7 → 功放 LRC", "告诉喇叭左右声道。已经接好才会出现。"],
    ["青", "8 → 功放 BCLK", "给声音打拍子。已经接好才会出现。"],
    ["青", "9 → 功放 DIN", "把要说的话送出去。已经接好才会出现。"],
    ["青", "20 → 麦克风 WS", "给耳朵对齐拍子。已经接好才会出现。"],
    ["青", "21 → 麦克风 SCK", "给耳朵打小拍子。已经接好才会出现。"],
    ["青", "10 → 麦克风 SD", "把听到的声音收回大脑。已经接好才会出现。"],
  ],
  oled: [
    ["黑", "GND → 右边蓝轨", "屏幕的电做完事情回家。"],
    ["红", "VCC → 右边红轨", "屏幕来面包板吃饭。"],
    ["金", "SCL → 主板 4", "听大脑喊开始。"],
    ["青", "SDA → 主板 5", "接收画面。"],
  ],
  amp: [
    ["黑", "GND → 左边蓝轨", "功放回家。"],
    ["红", "Vin → 左边红轨", "功放吃饭。左右红轨还要用一根红线连起来，电才会流到这边。"],
    ["青", "LRC → 主板 7", "左右声道节拍。"],
    ["青", "BCLK → 主板 8", "声音小拍子。"],
    ["青", "DIN → 主板 9", "要说的话走进来。"],
    ["红", "绿色端子 + ← 喇叭红线", "不经过面包板，直接拧螺丝。"],
    ["黑", "绿色端子 − ← 喇叭黑线", "不经过面包板，直接拧螺丝。"],
  ],
  mic: [
    ["黑", "GND → 右边蓝轨", "麦克风回家。"],
    ["红", "VDD → 右边红轨", "麦克风吃饭。"],
    ["青", "WS → 主板 20", "对齐拍子。"],
    ["青", "SCK → 主板 21", "小拍子。"],
    ["青", "SD → 主板 10", "把听到的声音送回大脑。"],
  ],
  speaker: [
    ["红", "红线 → 功放 +", "从喇叭身子直接走进绿色端子，不插孔。"],
    ["黑", "黑线 → 功放 −", "同样不插面包板。"],
  ],
};

function tone(name) {
  if (/GND|^G$|−|^-$/.test(name) || name === "黑") return "#273c49";
  if (/VCC|3\.3|5V|Vin|VDD|\+|红/.test(name)) return "#e15449";
  if (/SCL|金/.test(name)) return "#e1a32c";
  return "#1499ac";
}

function pinCards(id) {
  return `<div class="kb-pins">${PINS[id]
    .map(
      ([name, role, text]) => `<article class="kb-pin">
      <span class="kb-pin-dot" style="background:${tone(name)}"></span>
      <div><b>${name}</b><small>${role}</small><p>${text}</p></div>
    </article>`,
    )
    .join("")}</div>`;
}

function around(id) {
  if (!AROUND[id]) return "";
  return `<section class="kb-block">
    <p>颜色帮助我们认线，真正决定用途的是两端接到的针脚。</p>
    <div class="kb-wires">${AROUND[id]
      .map(
        ([color, title, text]) => `<article class="kb-wire">
        <span class="kb-wire-bar" style="background:${tone(color)}"></span>
        <div><b>${title}</b><p>${text}</p></div>
      </article>`,
      )
      .join("")}</div></section>`;
}

function hero(note) {
  return `<div class="kb-hero"><canvas id="kb-canvas" width="640" height="360" tabindex="0" aria-label="零件立体模型，拖动或使用方向键旋转"></canvas>
    <p class="kb-hint">${note}</p></div>`;
}

const PAGES = {
  robot() {
    return `${hero("按住拖一拖，转着看整台小机器人")}
      <p class="kb-lead">Desk Buddy 不是会走路、会转头的机器人。它是坐在电脑旁边的<strong>桌面小伙伴</strong>：屏幕当眼睛，麦克风当耳朵，喇叭当嘴巴，中间那块小小的电脑板是大脑。</p>
      <div class="kb-facts">
        <article><b>眼睛</b><p>0.96 寸小屏幕，会眨、会看、会写字。</p></article>
        <article><b>大脑</b><p>ESP32-C3 跑你写的程序，还会闪一颗蓝灯。</p></article>
        <article><b>耳朵</b><p>麦克风听见拍手、说话。虚拟实验桌里先用电脑麦克风。</p></article>
        <article><b>嘴巴</b><p>功放加上喇叭才能出声。喇叭绝不直接插到大脑上。</p></article>
      </div>
      <p>左边零件栏可以把它放到面包板上。第一次来，先看完介绍视频，再点「自己接线」把眼睛的四根线接上，或者点「已经接好」直接看它眨眼。</p>`;
  },
  board() {
    return `<p class="kb-lead">面包板是工作台。上面有很多小孔，零件的针插进去，电就会在板子里面悄悄走，不用焊接。</p>
      <div class="kb-facts">
        <article><b>中间 30 行</b><p>每一行左边 a–e 是通的，右边 f–j 是通的。中间那条沟过不去，所以大脑可以骑在沟上，左右针脚不会撞车。</p></article>
        <article><b>两边红蓝轨</b><p>红轨送电，蓝轨送回家的路。左边和右边不会自动相通，要用杜邦线把两边的红连红、蓝连蓝。</p></article>
        <article><b>一个孔一根针</b><p>被零件压住的孔插不进线。想接线，请点旁边同一组还空着的孔。</p></article>
        <article><b>X-ray</b><p>点工具栏的透视，能看见板子里面哪几个孔是一家的。</p></article>
      </div>
      <div class="kb-callout">红轨自己不会发电。一定要把主板的 3.3 接到红轨、G 接到蓝轨，小零件才吃得到饭。</div>`;
  },
  esp() {
    return `${hero("按住拖动，看看大脑两排针脚")}
      <p class="kb-lead">ESP32-C3 SuperMini 是整台小机器人的大脑。你在右边写的程序，就是让它去指挥眼睛、耳朵和嘴巴。</p>
      <p>板子上一直亮的红灯是电源灯，表示它吃上电了。会听程序闪的是旁边那颗<strong>蓝灯</strong>，连在针脚 8 上。</p>
      ${around("esp")}<h3>每一根针是什么</h3>${pinCards("esp")}`;
  },
  oled() {
    return `${hero("转一转，看看屏幕和四根针")}
      <p class="kb-lead">这是小机器人的眼睛。只有 128 × 64 个小点，但已经够眨眼睛、写大字、画爱心。</p>
      <p>实物背面朝上、黄排线在上时，四根针从左到右是 <strong>GND、VCC、SCL、SDA</strong>。代码里要写 <code>Wire.begin(5, 4)</code>，屏幕地址是 <code>0x3C</code>。</p>
      ${around("oled")}<h3>每一根针是什么</h3>${pinCards("oled")}`;
  },
  amp() {
    return `${hero("转一转，绿色端子在喇叭那边")}
      <p class="kb-lead">功放像一个小嗓门教练。大脑发出的声音信号很轻，它负责放大，喇叭才能让人听见。</p>
      <div class="kb-callout">喇叭只许接这块紫色板子的绿色端子，红线接 +，黑线接 −。千万不要把喇叭直接插到 ESP32 上，会伤到大脑。</div>
      <p>虚拟实验桌里点运行时，<code>tone()</code> 会先从电脑喇叭出声，方便你在没接真喇叭时也能听见。</p>
      ${around("amp")}<h3>每一根针是什么</h3>${pinCards("amp")}`;
  },
  mic() {
    return `${hero("转一转，看看小小的耳朵")}
      <p class="kb-lead">麦克风是小机器人的耳朵。它可以听见拍手、说话。虚拟实验桌里，<code>analogRead()</code> 会先读电脑的麦克风，方便你马上试「拍手亮灯」。</p>
      ${around("mic")}<h3>每一根针是什么</h3>${pinCards("mic")}`;
  },
  speaker() {
    return `${hero("转一转，红黑线要进绿色端子")}
      <p class="kb-lead">喇叭是小机器人的嘴巴。它不插面包板，而是躺在功放左边，红黑线剥掉一点皮，拧进绿色螺丝端子。</p>
      <div class="kb-callout">记住口诀：红加黑减，只进绿色端子，不进大脑。</div>
      ${around("speaker")}<h3>每一根针是什么</h3>${pinCards("speaker")}`;
  },
  wires() {
    return `<p class="kb-lead">杜邦线就是小机器人的神经。颜色是给小朋友看的暗号，不是电线自己带电。</p>
      <div class="kb-palette">
        <article><span style="background:#273c49"></span><b>黑色 · 地线</b><p>回家的路。GND、G、蓝轨。喇叭黑线要接功放 −，不能当作地线。</p></article>
        <article><span style="background:#e15449"></span><b>红色 · 电源</b><p>给零件吃饭。3.3、VCC、Vin、VDD、红轨。喇叭红线接功放 +，不是接电源。</p></article>
        <article><span style="background:#e1a32c"></span><b>金色 · 时钟</b><p>喊“现在开始”。屏幕的 SCL 接到主板 4。</p></article>
        <article><span style="background:#1499ac"></span><b>青色 · 数据</b><p>真正说话的内容。画面、声音、节拍都走这种颜色。</p></article>
      </div>
      <h3>第一课只要四根线</h3>
      <div class="kb-wires">
        <article class="kb-wire"><span class="kb-wire-bar" style="background:#273c49"></span><div><b>OLED GND → 主板 G</b><p>黑色。眼睛和大脑共用回家的路。</p></div></article>
        <article class="kb-wire"><span class="kb-wire-bar" style="background:#e15449"></span><div><b>OLED VCC → 主板 3.3</b><p>红色。眼睛来吃饭。</p></div></article>
        <article class="kb-wire"><span class="kb-wire-bar" style="background:#e1a32c"></span><div><b>OLED SCL → 主板 4</b><p>金色。大脑给眼睛报时。</p></div></article>
        <article class="kb-wire"><span class="kb-wire-bar" style="background:#1499ac"></span><div><b>OLED SDA → 主板 5</b><p>青色。画面走进眼睛。</p></div></article>
      </div>
      <p>点「已经接好」，实验桌还会自动补上功放、麦克风、喇叭和左右电源轨的线，当作完整参考答案。</p>`;
  },
  faq() {
    return `<div class="kb-faq">
      <details open><summary>Desk Buddy 会走路吗？</summary><p>不会。它是插在电脑旁边的桌面小宠物，负责眨眼、听话、说话，不会走路也不会转头。</p></details>
      <details><summary>为什么红轨插上零件还不亮？</summary><p>红轨自己不会发电。先把主板的 3.3 接到红轨、G 接到蓝轨，再让屏幕去红蓝轨上吃饭、回家。</p></details>
      <details><summary>左右两边的红轨是通的吗？</summary><p>不通。左边和右边是两家人。已经接好时，会用一根红线把两边红轨连起来，再用一根黑线把两边蓝轨连起来。</p></details>
      <details><summary>被零件挡住的孔为什么点不了？</summary><p>针已经占满板子下面的空间，杜邦线挤不进去。请点旁边同一组还空着的孔，电在板子里面是通的。</p></details>
      <details><summary>喇叭为什么不能直接接 ESP32？</summary><p>喇叭胃口很大，会把大脑的针脚累坏。一定要经过功放，并且只拧绿色端子。</p></details>
      <details><summary>虚拟运行和烧录有什么不一样？</summary><p>点「运行」，程序在网页里假装执行，屏幕画在右边放大窗口里，声音走电脑喇叭。点「连接板子 / 烧录」，才会把程序送到真的 Desk Buddy 身上。</p></details>
      <details><summary>为什么虚拟运行听不见 I2S 录音？</summary><p>网页里还不会完整模拟 I2S。喇叭示例用 tone()，麦克风示例用电脑麦克风。烧到真板子上才走零件上的那些针脚。</p></details>
      <details><summary>我想再看介绍视频</summary><p>关掉这个窗口，点顶部的「介绍视频」。也可以勾选「下次进来不再播放」，下次就不会自动跳出。</p></details>
    </div>`;
  },
};

const MODELS = { oled: 0, esp: 1, amp: 2, mic: 3, speaker: 4 };

let viewer = null;
let activePage = "robot";

class MiniViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(32, 2, 0.1, 200);
    this.camera.up.set(0, 0, 1);
    this.scene.add(new T.AmbientLight(0xffffff, 0.7));
    this.scene.add(new T.HemisphereLight(0xffffff, 0x7a8b96, 1.1));
    const key = new T.DirectionalLight(0xfff7ee, 2.1);
    key.position.set(-24, 48, 80);
    this.scene.add(key);
    const fill = new T.DirectionalLight(0xd7e8f6, 0.9);
    fill.position.set(50, -28, 40);
    this.scene.add(fill);
    this.root = new T.Group();
    this.scene.add(this.root);
    this.az = 0.72;
    this.pol = 1.02;
    this.dist = 48;
    this.gen = 0;
    this.dragging = false;
    this.last = [0, 0];
    this.alive = true;
    this.loader = new GLTFLoader();
    this.onDown = (e) => {
      this.dragging = true;
      this.last = [e.clientX, e.clientY];
      canvas.setPointerCapture?.(e.pointerId);
    };
    this.onMove = (e) => {
      if (!this.dragging) return;
      this.az -= (e.clientX - this.last[0]) * 0.01;
      this.pol = Math.min(2.8, Math.max(0.2, this.pol + (e.clientY - this.last[1]) * 0.01));
      this.last = [e.clientX, e.clientY];
    };
    this.onKey = (e) => { if (!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) return; e.preventDefault(); this.az += e.key === "ArrowLeft" ? -0.15 : e.key === "ArrowRight" ? 0.15 : 0; this.pol = Math.min(2.8, Math.max(0.2, this.pol + (e.key === "ArrowUp" ? -0.15 : e.key === "ArrowDown" ? 0.15 : 0))); };
    canvas.addEventListener("keydown", this.onKey);
    this.onUp = () => {
      this.dragging = false;
    };
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    this.tick = this.tick.bind(this);
    this.resize();
    this.raf = requestAnimationFrame(this.tick);
  }
  resize() {
    const w = this.canvas.clientWidth || 640;
    const h = this.canvas.clientHeight || 320;
    if (this.width === w && this.height === h) return;
    this.width = w; this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }
  async show(ids) {
    const gen = ++this.gen;
    while (this.root.children.length) this.root.remove(this.root.children[0]);
    const gap = ids.length === 1 ? 0 : 22;
    const start = -((ids.length - 1) * gap) / 2;
    const loaded = await Promise.all(
      ids.map(async (id, i) => {
        const data = await this.loader.loadAsync(`./assets/part${MODELS[id]}.glb`);
        return { id, i, scene: data.scene };
      }),
    );
    if (!this.alive || gen !== this.gen) return;
    for (const { id, i, scene: model } of loaded) {
      model.traverse((o) => {
        if (id === "speaker" && /wire|dupont|contact window|socket opening/i.test(o.name || "")) {
          o.visible = false;
        }
        if (o.isMesh && o.material) o.material = o.material.clone();
      });
      model.updateMatrixWorld(true);
      const box = new T.Box3();
      model.traverseVisible(o => { if (o.isMesh) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
      const size = box.getSize(new T.Vector3());
      const center = box.getCenter(new T.Vector3());
      const g = new T.Group();
      model.position.sub(center);
      g.add(model);
      const target = ids.length === 1 ? 24 : 16;
      g.scale.multiplyScalar(target / Math.max(size.x, size.y, size.z, 0.01));
      if (id === "mic") g.rotation.x = Math.PI;
      g.position.x = start + i * gap;
      this.root.add(g);
    }
    this.dist = ids.length === 1 ? 46 : 72;
  }
  tick() {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(this.tick);
    
    this.resize();
    const p = this.pol;
    const a = this.az;
    const d = this.dist;
    this.camera.position.set(Math.sin(p) * Math.sin(a) * d, -Math.sin(p) * Math.cos(a) * d, Math.cos(p) * d);
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener("keydown", this.onKey);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    this.root.traverse(o => { if (o.isMesh) { o.geometry?.dispose(); for (const m of [o.material].flat()) { for (const v of Object.values(m || {})) if (v?.isTexture) v.dispose(); m?.dispose(); } } });
    this.renderer.dispose();
  }
}

function mountViewer(ids) {
  const canvas = $("kb-canvas");
  if (!canvas) return;
  viewer?.dispose();
  try { viewer = new MiniViewer(canvas); viewer.show(ids).catch(() => { const hint = document.querySelector(".kb-hint"); if (hint) hint.textContent = "模型暂时没载入，请重新选择零件。针脚说明仍可阅读。"; }); } catch { canvas.outerHTML = "<p>此浏览器暂时无法显示 3D 模型，仍可查看下方针脚说明。</p>"; }
}

const PROFILES = {
  esp: ["大脑", "ESP32-C3 SuperMini", "它读懂你写的程序，再告诉眼睛怎么眨、嘴巴说什么。就像机器人的小队长。", "#dcebe5"],
  oled: ["眼睛", "0.96 寸 OLED", "128 × 64 个小亮点，拼出眨眼、文字和爱心。你写什么，它就努力画出来。", "#dcecf5"],
  amp: ["声音帮手", "MAX98357A 功放", "大脑送来的声音信号还推不动喇叭。它来搭把手，让喇叭真正响起来。", "#eee1f2"],
  mic: ["耳朵", "MSM3526 麦克风", "把拍手和说话变成大脑能读懂的声音数据。它负责听，喇叭负责说。", "#f5edcf"],
  speaker: ["嘴巴", "8Ω 小喇叭", "里面的小薄片来回振动，推动空气，我们就听到了声音。它要和功放一起工作。", "#e4e8ec"]
};
function pinsFor(id) {
  return definitions.find(d => d.id === id).pins.map(([name]) => {
    const entry = PINS[id].find(p => p[0] === name || (name === '-' && p[0] === '−') || p[0].split(' / ').includes(name));
    return [name, entry?.[1] || '针脚', entry?.[2] || '请对照板子上的标字。'];
  });
}
function renderPart(id) {
  const [role,name,description,color] = PROFILES[id];
  return `<p class="kb-lead">${description}</p><div class="kb-part-layout"><section class="kb-model-panel" style="--part-tint:${color}"><div class="kb-model-label"><span>${role}</span><span>3D 实物模型</span></div>${hero('按住拖动看正反面 · 对照板子上的针脚名字')}<div class="kb-pin-strip" aria-label="选择针脚">${pinsFor(id).map(([pin])=>`<button data-pin="${pin}" style="--pin-color:${tone(pin)}">${pin}</button>`).join('')}</div><p class="kb-diagram-note">按名称选针脚；这里的按钮不是实物位置图。</p><strong class="kb-model-name">${name}</strong></section><section class="kb-pin-inspector"><span class="kb-eyebrow">针脚小翻译</span><h3>这根针，做什么？</h3><p class="kb-muted">点左边的名字，就能看懂它。</p><div id="kb-pin-detail" aria-live="polite"></div></section></div><div class="kb-section-heading"><span>接线备忘</span><h3>这些电线，要去哪里？</h3><p>以下是本实验桌的参考接法。实物要先断电，再核对板上的标字。</p></div>${around(id)}`;
}
function selectPin(id, name) {
  const [pin,role,description] = pinsFor(id).find(p=>p[0] === name);
  document.querySelectorAll('[data-pin]').forEach(b=>{ const on=b.dataset.pin===name; b.classList.toggle('active',on); b.setAttribute('aria-pressed',String(on)); });
  $('kb-pin-detail').innerHTML = `<div class="kb-selected-pin" style="--pin-color:${tone(pin)}"><b>${pin}</b><span>${role}</span></div><p>${description}</p><div class="kb-small-tip">找一找：先在实物板上找到 <strong>${pin}</strong>，再决定线插哪里。板子转个方向，名字也不会变。</div>`;
}
function renderPage(id) {
  viewer?.dispose(); viewer = null;
  activePage = id;
  const title = NAV.find(n => n.id === id);
  $('kb-kicker').textContent = PROFILES[id] ? '零件图鉴 / ' + PROFILES[id][0] : '探索 DESK BUDDY';
  $('kb-title').textContent = title.name;
  $('kb-body').innerHTML = PROFILES[id] ? renderPart(id) : PAGES[id]();
  $('kb-body').scrollTop = 0;
  document.querySelectorAll('#kb-nav button').forEach(b => { b.classList.toggle('active', b.dataset.id === id); b.setAttribute('aria-current',b.dataset.id === id ? 'page' : 'false'); });
  if (PROFILES[id]) { mountViewer([id]); document.querySelectorAll('[data-pin]').forEach(b => b.onclick=()=>selectPin(id,b.dataset.pin)); selectPin(id,pinsFor(id)[0][0]); }
  if (id === 'robot') {
    $('kb-body').innerHTML = `<div class="kb-welcome"><span class="kb-eyebrow">你好，我是 DESK BUDDY</span><h3>把这些小零件，<br>变成你的桌面小伙伴。</h3><p>我不会走路，但可以用屏幕做表情。<br>加上麦克风、功放和喇叭，还能听见和发声。</p></div><div class="kb-collection">${Object.entries(PROFILES).map(([key,[role,name,desc,color]],i)=>`<button class="kb-collect" data-part="${key}" style="--part-tint:${color}"><span class="kb-collect-top"><span>0${i+1} / ${role}</span><span>↗</span></span><img src="./assets/guide-${key}.png" alt="${name}的立体模型" onerror="this.hidden=true"><b>${name}</b><span>${desc}</span><small>看看它的针脚 →</small></button>`).join('')}</div><div class="kb-callout">第一次动手？先认识「眼睛 OLED」，接好四根线，就能让它亮起来。</div>`;
    document.querySelectorAll('[data-part]').forEach(b=>b.onclick=()=>renderPage(b.dataset.part));
  }
}

function readSkip() {
  try {
    return localStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSkip(on) {
  try {
    if (on) localStorage.setItem(SKIP_KEY, "1");
    else localStorage.removeItem(SKIP_KEY);
  } catch {}
}

function closeIntro() {
  const overlay = $("intro-overlay");
  const video = $("intro-video");
  writeSkip(!!$("intro-hide")?.checked);
  video?.pause();
  overlay.close();
  overlay.setAttribute("aria-hidden", "true");
}

function showIntro() {
  const overlay = $("intro-overlay");
  const video = $("intro-video");
  const play = $("intro-play");
  if (!overlay.open) overlay.showModal();
  overlay.setAttribute("aria-hidden", "false");
  $("intro-hide").checked = readSkip();
  play.hidden = true;
  const start = video.play();
  if (start) start.catch(() => {
    play.hidden = false;
  });
}

function initIntro() {
  $("intro-overlay").addEventListener("cancel", (e) => { e.preventDefault(); closeIntro(); });
  $("intro-skip").onclick = closeIntro;
  $("intro-start").onclick = closeIntro;
  $("intro-play").onclick = () => {
    $("intro-play").hidden = true;
    $("intro-video").play().catch(() => {
      $("intro-play").hidden = false;
    });
  };
  $("intro-video").addEventListener("error", () => { $("intro-play").hidden = false; $("intro-play").textContent = "视频未载入 · 点此重试"; });
  $("intro-video").addEventListener("play", () => {
    $("intro-play").hidden = true;
  });
  $("intro-video").addEventListener("ended", () => {
    $("intro-start").textContent = "看完了，开始实验";
    $("intro-start").focus();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("intro-overlay").open) closeIntro();
  });
  $("intro-replay").onclick = () => {
    if ($("knowledge").open) $("knowledge").close();
    $("intro-video").currentTime = 0;
    $("intro-start").textContent = "开始实验";
    showIntro();
  };
  if (!readSkip()) showIntro();
}

function initKnowledge() {
  const nav = $("kb-nav");
  nav.replaceChildren(
    ...NAV.map((item) => {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.id = item.id;
      b.innerHTML = `<b>${item.name}</b><small>${item.hint}</small>`;
      b.onclick = () => renderPage(item.id);
      return b;
    }),
  );
  $("guidebook").onclick = () => {
    if ($("intro-overlay").open) $("intro-video").pause();
    $("knowledge").showModal();
    renderPage(activePage);
  };
  $("kb-close").onclick = () => $("knowledge").close();
  $("knowledge").addEventListener("close", () => {
    viewer?.dispose();
    viewer = null;
  });
}

export function initGuide() {
  initIntro();
  initKnowledge();
}
