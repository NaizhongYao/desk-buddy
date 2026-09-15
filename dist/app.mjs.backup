import {holes,holeMap,boardEdges,occupied,footprint,defaults,validPlacement,coveredHoles,freeOnNet,autoWires,placement} from './breadboard.mjs';
import {compile,execute} from './runtime.mjs';import {examples} from './examples.mjs';import {definitions,lessonWires,connected as graphConnected,checkCircuit as graphCheck,validateProject as oldValidate} from './circuit.mjs';import {Display} from './display.mjs';import {createTable} from './board-scene.mjs?v=20260912-1';import {initGuide} from './knowledge.mjs?v=20260912-1';
const $=id=>document.getElementById(id),editor=$('code'),canvas=$('oled'),ctx=canvas.getContext('2d'),display=new Display();let table,wires=[],pending=null,selected=null,controller=null,runGeneration=0,ready=false,sda=5,scl=4,modes={},values={},logs=[],lastProgram='',wiringMode='custom';
const teacherStation=['localhost','127.0.0.1'].includes(location.hostname)&&new URLSearchParams(location.search).get('teacher')==='1';document.body.classList.toggle('teacher-station',teacherStation);if(!teacherStation){for(const id of ['connect-board','disconnect-board','flash'])$(id).hidden=true;}
display.render(ctx,false);editor.value=examples.eyes;const numbers=()=>{$('numbers').textContent=Array.from({length:editor.value.split('\n').length},(_,i)=>i+1).join('\n');};numbers();
let toastTimer;function toast(s){$('toast').textContent=s;$('toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.display='none',4000);}
let audioCtx=null,micAnalyser=null,micData=null,osc=null,oscGain=null;
async function ensureAudio(){if(typeof AudioContext==='undefined')return;if(!audioCtx)audioCtx=new AudioContext();if(audioCtx.state==='suspended')await audioCtx.resume();}
async function ensureMic(){await ensureAudio();if(!audioCtx||micAnalyser)return;try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});const src=audioCtx.createMediaStreamSource(stream);micAnalyser=audioCtx.createAnalyser();micAnalyser.fftSize=256;src.connect(micAnalyser);micData=new Uint8Array(micAnalyser.frequencyBinCount);log('已打开电脑麦克风');}catch(e){log('没有麦克风权限，改用模拟音量。');}}
function readMic(){if(micAnalyser&&micData){micAnalyser.getByteTimeDomainData(micData);let peak=0;for(let i=0;i<micData.length;i++){const v=Math.abs(micData[i]-128);if(v>peak)peak=v;}return Math.min(1023,peak*8);}return 80+Math.floor(220*Math.abs(Math.sin(Date.now()/400)));}
function playTone(freq){if(!audioCtx)return;stopTone();osc=audioCtx.createOscillator();oscGain=audioCtx.createGain();osc.type='sine';osc.frequency.value=Math.max(80,Math.min(4000,freq));oscGain.gain.value=0.07;osc.connect(oscGain);oscGain.connect(audioCtx.destination);osc.start();}
function stopTone(){if(osc){try{osc.stop();}catch(e){}try{osc.disconnect();}catch(e){}osc=null;}if(oscGain){try{oscGain.disconnect();}catch(e){}oscGain=null;}}
function log(s){logs.push(String(s));logs=logs.slice(-150);$('log').textContent=logs.join('\n');$('log').scrollTop=$('log').scrollHeight;}
function blackScreen(){display.render(ctx,false);table?.refreshScreen();}
function stop(message='已停止'){controller?.abort();controller=null;runGeneration++;ready=false;stopTone();blackScreen();table?.led(false);$('ledstate').textContent='板载 LED：关闭';$('run').disabled=false;$('stop').disabled=true;$('status').textContent=message;}
const network=w=>[...w,...boardEdges(table?.state()??[])];
function connected(w,a,b){return graphConnected(network(w),a,b);}
function checkCircuit(w,a,sda=5,scl=4){return graphCheck(network(w),a,sda,scl);}
function validateProject(p){if(p?.version!==2)throw Error('请使用面包板版本的作品文件；旧版 .ino 代码仍可打开');if(typeof p.code!=='string'||p.code.length>50000||!Array.isArray(p.parts)||p.parts.length>5||!Array.isArray(p.wires)||p.wires.length>80)throw Error('作品格式无效');const ps=[];for(const v of p.parts){if(!definitions.some(d=>d.id===v.id)||ps.some(d=>d.id===v.id)||!Number.isInteger(v.row)||!validPlacement(ps,v.id,v.row))throw Error('零件位置无效');ps.push(v);}const used=occupied(ps);for(const w of p.wires){if(!holeMap.has(w.a)||!holeMap.has(w.b)||w.a===w.b||used.has(w.a)||used.has(w.b))throw Error('孔位无效或被重复占用');used.add(w.a);used.add(w.b);}return p;}
function freeHole(pin){return freeOnNet(pin,table.state(),wires);}
const active=()=>table?table.state().map(p=>p.id):[];
function selectedPart(id){selected=id;$('selected').hidden=!id;if(id)$('selectedname').textContent=definitions.find(d=>d.id===id).name;}
function wireName(id){if(holeMap.has(id))return '孔 '+id.slice(3);const[part,pin]=id.split(':');return definitions.find(d=>d.id===part).name+' '+pin;}
function updateGuide(){if(!table)return;if(wiringMode==='ready'){$('step-title').textContent='参考答案已接好';$('step-text').textContent='五个零件和杜邦线都在。点运行看屏幕；喇叭/麦克风示例会用电脑喇叭和麦克风。';$('steps').replaceChildren();table.highlight([],pending);}else{const done=lessonWires.map(([a,b])=>connected(wires,a,b));let i=done.indexOf(false);$('steps').replaceChildren(...done.map(v=>{let el=document.createElement('span');el.className=v?'done':'';return el;}));if(i<0){$('step-title').textContent='4 / 4 · 屏幕接线完成';$('step-text').textContent='点击运行，让眼睛眨起来。试试把 delay(1500) 改成 delay(500)。';table.highlight([],pending);}else{$('step-title').textContent=`${i+1} / 4 · ${lessonWires[i][2]}`;const pair=lessonWires[i].slice(0,2).map(freeHole);$('step-text').textContent=lessonWires[i][3]+' 可用孔：'+pair.map(p=>p?p.slice(3):'请先放入零件 / 释放孔位').join(' ↔ ');const cover=coveredHoles(table.state());table.highlight(pending?holes.filter(h=>connected(wires,pending,h.id)&&!cover.has(h.id)).map(h=>h.id):pair.filter(Boolean),pending);}}$('wirecount').textContent=wires.length;$('wirelist').replaceChildren(...wires.map((w,i)=>{const row=document.createElement('div');row.className='wirerow';const txt=document.createElement('span');txt.textContent=wireName(w.a)+' ↔ '+wireName(w.b);const b=document.createElement('button');b.textContent='删除';b.onclick=()=>{stop('接线已更改');wires.splice(i,1);updateWires();};row.append(txt,b);return row;}));}
function updateWires(){table.setWires(wires);updateGuide();}
function connect(id){
  if(!holeMap.has(id))return;
  
  // 修复 H6: 先做所有校验，再调用 highlight
  const cover=coveredHoles(table.state());
  const pinHere=[...table.state()].flatMap(p=>footprint(p.id,p.row)).some(e=>e.b===id);
  
  if(cover.has(id)&&!pinHere){
    toast('这个孔被零件压住了，杜邦线插不进去。请点旁边没被挡住、同一组的空孔。');
    return;
  }
  
  if(occupied(table.state(),wires).has(id)){
    toast('此孔已被针脚或插头占用，请选同组的其他空孔。');
    return;
  }
  
  if(controller){
    toast('先停止运行，再修改接线。');
    return;
  }
  
  // 校验通过后才更新高亮
  const net=network(wires);
  table.highlight(holes.filter(h=>graphConnected(net,id,h.id)&&(!cover.has(h.id)||occupied(table.state(),wires).has(h.id))).map(h=>h.id),id);
  
  if(!pending){
    pending=id;
    updateGuide();
    toast('已选 '+wireName(id)+'，再点击终点针脚');
    return;
  }
  
  if(pending===id){
    pending=null;
    updateGuide();
    return;
  }
  
  if(wires.some(w=>(w.a===pending&&w.b===id)||(w.b===pending&&w.a===id))){
    toast('这两个针脚已经连接');
    pending=null;
    updateGuide();
    return;
  }
  
  wires.push({a:pending,b:id});
  pending=null;
  updateWires();
  const check=checkCircuit(wires,active());
  if(check.errors.length)toast(check.errors[0]);
}
function refresh(){const c=checkCircuit(wires,active(),sda,scl);display.render(ctx,ready&&c.ready);table.refreshScreen();}
const counts={'Wire.begin':[2],'display.begin':[2],'display.clearDisplay':[0],'display.display':[0],'display.drawPixel':[3],'display.drawLine':[5],'display.drawRect':[5],'display.fillRect':[5],'display.drawCircle':[4],'display.fillCircle':[4],'display.drawRoundRect':[6],'display.fillRoundRect':[6],'display.setCursor':[2],'display.setTextSize':[1],'display.setTextColor':[1,2],'display.print':[1],'display.println':[0,1],'display.invertDisplay':[1],'pinMode':[2],'digitalWrite':[2],'digitalRead':[1],'analogRead':[1],'tone':[2],'noTone':[0,1],'Serial.begin':[1],'Serial.print':[1],'Serial.println':[0,1]};
function hardware(name,a){if(!counts[name]?.includes(a.length))throw Error(name+'() 参数个数不正确');if(a.some(v=>typeof v==='number'&&(!Number.isFinite(v)||Math.abs(v)>1000000)))throw Error('数值超出初版范围');
 if(name==='Wire.begin'){[sda,scl]=a;if(!Number.isInteger(sda)||!Number.isInteger(scl)||sda===scl)throw Error('SDA 与 SCL 要使用不同的引脚编号');return 1;}
 if(name==='display.begin'){const c=checkCircuit(wires,active(),sda,scl);ready=c.ready&&a[0]===2&&a[1]===0x3c;if(!ready)log(!c.powered?'屏幕未供电：请检查 GND 和 VCC。':!c.bus?`屏幕信号线不匹配：代码 SDA=${sda}、SCL=${scl}。`:'屏幕地址应为 0x3C，供电模式使用 SSD1306_SWITCHCAPVCC。');return ready?1:0;}
 if(name==='display.clearDisplay'){display.pixels.fill(0);return 0;}if(name==='display.display'){refresh();return 0;}
 if(name.startsWith('display.')){const f=name.slice(8);if(['drawPixel','drawLine','drawRect','fillRect','drawCircle','fillCircle','drawRoundRect','fillRoundRect'].includes(f)&&a.some(v=>typeof v!=='number'))throw Error('绘图参数需要数字');switch(f){case'drawPixel':display.pixel(...a);break;case'drawLine':display.line(...a);break;case'drawRect':display.rect(...a);break;case'fillRect':display.rect(...a,true);break;case'drawCircle':display.circle(...a);break;case'fillCircle':display.circle(...a,true);break;case'drawRoundRect':display.rect(a[0],a[1],a[2],a[3],a[5],false,a[4]);break;case'fillRoundRect':display.rect(a[0],a[1],a[2],a[3],a[5],true,a[4]);break;case'setCursor':[display.x,display.y]=a;break;case'setTextSize':if(!Number.isInteger(a[0])||a[0]<1||a[0]>8)throw Error('文字大小请使用 1–8');display.size=a[0];break;case'setTextColor':display.color=a[0];break;case'print':display.print(a[0]);break;case'println':display.print(a[0]??'',true);break;case'invertDisplay':display.invert=!!a[0];refresh();break;}return 0;}
 if(name==='pinMode'){if(![0,1,2].includes(a[1]))throw Error('pinMode 模式无效');modes[a[0]]=a[1];return 0;}if(name==='digitalWrite'){if(modes[a[0]]!==1)throw Error(`请先设置 pinMode(${a[0]}, OUTPUT)`);values[a[0]]=a[1]?1:0;if(a[0]===8){table.led(!a[1]);$('ledstate').textContent='板载 LED：'+(a[1]?'关闭':'点亮');}return 0;}if(name==='digitalRead')return values[a[0]]??(modes[a[0]]===2?1:0);if(name==='analogRead')return readMic();if(name==='tone'){playTone(a[1]);return 0;}if(name==='noTone'){stopTone();return 0;}if(name==='Serial.begin')return 0;if(name.startsWith('Serial.')){log(a[0]??'');return 0;}throw Error('尚不支持 '+name);
}
async function run(){if(!table){toast('零件尚未加载完');return;}stop();logs=[];$('log').textContent='';display.reset();sda=5;scl=4;modes={};values={};const generation=runGeneration;try{const program=compile(editor.value);const check=checkCircuit(wires,active());if(check.errors.length)throw Error(check.errors.join('\n'));lastProgram=editor.value;await ensureAudio();if(/analogRead\s*\(/.test(editor.value))await ensureMic();controller=new AbortController();$('run').disabled=true;$('stop').disabled=false;$('status').textContent='运行中';log('语法检查通过，正在执行 setup() / loop()。');const own=controller;await execute(program,{call:hardware},own.signal);}catch(e){if(e.message==='STOPPED'||generation!==runGeneration)return;stop('运行出错');log('错误：'+e.message);const m=/第 (\d+) 行/.exec(e.message);if(m){let start=editor.value.split('\n').slice(0,+m[1]-1).join('\n').length;const line=editor.value.split('\n')[+m[1]-1]||'';editor.focus();editor.setSelectionRange(start,start+line.length+1);}}}
for(const d of definitions){const b=document.createElement('button');b.className='partbtn';b.dataset.part=d.id;const sw=document.createElement('img');sw.className='partswatch';sw.src='./assets/guide-'+d.id+'.png';sw.alt='';const span=document.createElement('span'),bold=document.createElement('b'),small=document.createElement('small');bold.textContent=d.name;small.textContent={oled:'眼睛 · 把表情画出来',esp:'大脑 · 听懂你的程序',amp:'功放 · 帮声音放大',mic:'耳朵 · 听听周围的声音',speaker:'嘴巴 · 发出好听的声音'}[d.id];span.append(bold,small);b.append(sw,span);b.onclick=()=>{if(!table)return;if(controller)stop('零件已更改');table.setActive(d.id,true);table.select(d.id);updateGuide();if(d.id==='amp'||d.id==='speaker')toast('虚拟运行时，tone() 会从电脑喇叭出声。');if(d.id==='mic')toast('虚拟运行时，analogRead() 会读电脑麦克风。');};$('catalog').append(b);}
const hint='左键拖零件或点空孔接线 · 滚轮平移画面 · 右键绕面包板旋转';
const FULL_WIRING=[
  ['esp:G','rail:R-'],['esp:3.3','rail:R+'],
  ['oled:GND','rail:R-'],['oled:VCC','rail:R+'],['oled:SCL','esp:4'],['oled:SDA','esp:5'],
  ['amp:GND','rail:L-'],['amp:Vin','rail:L+'],['amp:LRC','esp:7'],['amp:BCLK','esp:8'],['amp:DIN','esp:9'],
  ['mic:GND','rail:R-'],['mic:VDD','rail:R+'],['mic:WS','esp:20'],['mic:SCK','esp:21'],['mic:SD','esp:10'],
  ['rail:L-','rail:R-'],['rail:L+','rail:R+']
];
function applyReadyWiring(){wires=autoWires(table.state(),FULL_WIRING);}
function setWiringMode(mode,resetParts=false,silent=false){const prev=wiringMode;wiringMode=mode;$('mode-custom').classList.toggle('active',mode==='custom');$('mode-ready').classList.toggle('active',mode==='ready');if(!table)return;if(controller)stop('接线模式已更改');pending=null;if(mode==='ready'){table.restore(['esp','oled','amp','mic','speaker'].map(id=>placement(id)));table.select(null);applyReadyWiring();if(!silent)toast(wires.length>=FULL_WIRING.length?'完整参考答案：5 个零件 + 电源轨和信号线都已就位。':'有些孔被零件挡住，自动接线未完成，请调整零件位置后再试。');}else if(resetParts||prev==='ready'){table.restore(['esp','oled'].map(id=>placement(id)));table.select(null);wires=[];if(!silent)toast('自己接线：点击两个空孔，把屏幕的四根线接上。');}updateWires();}
initGuide();
$('run').onclick=run;$('stop').onclick=()=>stop();$('clearlog').onclick=()=>{logs=[];$('log').textContent='';};$('help').onclick=()=>$('helpdialog').showModal();$('top').onclick=()=>{table?.setMode('top');$('top').classList.add('active');$('three').classList.remove('active');$('scenehint').textContent=hint;};$('xray').onclick=()=>{const on=$('xray').getAttribute('aria-pressed')!=='true';$('xray').setAttribute('aria-pressed',String(on));table?.setXray(on);$('xray').classList.toggle('active',on);};$('three').onclick=()=>{table?.setMode('three');$('three').classList.add('active');$('top').classList.remove('active');$('scenehint').textContent=hint;};$('resetview').onclick=()=>table?.center();$('mode-custom').onclick=()=>setWiringMode('custom');$('mode-ready').onclick=()=>setWiringMode('ready');$('remove').onclick=()=>{if(!selected)return;stop('零件已收回');table.setActive(selected,false);wires=wires.filter(w=>![w.a,w.b].some(p=>p.startsWith(selected+':')));pending=null;table.select(null);updateWires();};$('undo').onclick=()=>{stop('已撤销接线');wires.pop();pending=null;updateWires();};
function lesson(){stop();table.center();setWiringMode(wiringMode,true);}
$('lesson').onclick=()=>{if(confirm(wiringMode==='ready'?'恢复五个零件的初始位置，并重新接好全部参考接线？代码会保留。':'恢复 ESP 和 OLED 的初始位置，并清空接线？代码会保留。'))lesson();};$('loadexample').onclick=()=>{if(editor.value!==lastProgram&&editor.value!==examples.eyes&&!confirm('载入示例会替换编辑器中的代码，是否继续？'))return;stop('示例已载入');editor.value=examples[$('example').value];lastProgram=editor.value;numbers();};
editor.addEventListener('input',()=>{numbers();if(controller)stop('代码已修改，请重新运行');});editor.addEventListener('scroll',()=>{$('numbers').scrollTop=editor.scrollTop;});editor.addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();const start=editor.selectionStart,end=editor.selectionEnd;editor.setRangeText('  ',start,end,'end');editor.dispatchEvent(new Event('input'));}if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();run();}});
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function project(){return{version:2,code:editor.value,parts:table.state(),wires};}
function exportCode(){download('desk-buddy.ino',editor.value,'text/x-c++src;charset=utf-8');toast('代码文件已下载，发给老师就好。');}
function showHandoff(){$('handoff-code').value=editor.value;$('handoffdialog').showModal();}
async function copyCode(){const code=editor.value;try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(code);}else{const field=$('handoff-code');field.focus();field.select();if(!document.execCommand('copy'))throw Error('复制不可用');}toast('代码已复制！现在把它粘贴发给老师。');}catch{toast('复制没有成功，试试点击“下载 .ino”。');}}
$('handoff').onclick=showHandoff;$('copy-code').onclick=copyCode;
$('save').onclick=()=>{if(!table)return;download('desk-buddy.json',JSON.stringify(project(),null,2),'application/json');toast('作品已保存到下载文件夹');};$('export').onclick=()=>download('desk_buddy.ino',editor.value,'text/plain');$('open').onclick=()=>$('file').click();$('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;try{if(file.size>200000)throw Error('文件太大');const data=await file.text();if(!confirm('打开文件会替换当前作品中的相应内容，是否继续？'))return;if(file.name.endsWith('.ino')){stop('代码已打开');editor.value=data;}else{const p=validateProject(JSON.parse(data));stop('作品已打开');editor.value=p.code;table.restore(p.parts);wires=p.wires.map(w=>({a:w.a,b:w.b}));pending=null;updateWires();}numbers();lastProgram=editor.value;}catch(e){toast('打开失败：'+e.message);}$('file').value='';};
$('export').onclick=exportCode;
try{table=await createTable($('viewport'),canvas,{pin:connect,select:selectedPart,change:()=>{stop('孔位已更改，请重新运行');pending=null;if(wiringMode==='ready')applyReadyWiring();updateWires();},message:toast});table.center();setWiringMode('custom',true,true);$('loading').remove();}catch(e){$('loading').textContent='三维零件加载失败，请刷新页面。'+e.message;log(e.message);$('run').disabled=true;}
window.addEventListener('keydown',e=>{if(e.key==='Escape'){pending=null;updateGuide();}});
// Optional browser tool interface uses the exact same state and validation.
if(document.modelContext?.registerTool){const life=new AbortController();window.addEventListener('pagehide',()=>life.abort(),{once:true});for(const tool of [{name:'read_desk_buddy_project',description:'Read the current virtual Desk Buddy code, parts and wiring.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(){if(!table)throw Error('尚未加载完成');return project();}},{name:'check_desk_buddy_code',description:'Check supported Arduino syntax without starting the program or modifying the circuit.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(){const p=compile(editor.value);return{valid:true,functions:Object.keys(p.functions),circuit:checkCircuit(wires,active())};}}])Promise.resolve(document.modelContext.registerTool(tool,{signal:life.signal})).catch(()=>{});}

// 烧录功能
let espPort = null;
let espTransport = null;
let espLoader = null;
let isConnected = false;

async function loadESPTools() {
  if (window.Transport) return;
  
  try {
    // 修复 C3: 使用真实的动态 import 替代假等待
    const module = await import('https://unpkg.com/esptool-js@0.6.1/bundle.js');
    window.Transport = module.Transport;
    window.ESPLoader = module.ESPLoader;
    console.log('[esptool] 加载成功');
  } catch (err) {
    console.error('[esptool] 加载失败:', err);
    throw new Error('esptool-js 加载失败，请检查网络连接');
  }
}

// 连接板子
$('connect-board').onclick = async () => {
  if (!teacherStation) { toast('烧录只在老师电脑上的教师烧录台进行。'); return; }
  try {
    $('connect-board').disabled = true;
    
    if (!('serial' in navigator)) {
      toast('❌ 需要 Chrome 或 Edge 浏览器才能连接板子');
      $('connect-board').disabled = false;
      return;
    }

    await loadESPTools();

    // 清理旧连接
    if (espTransport) {
      try { await espTransport.disconnect(); } catch (e) {}
    }
    if (espPort) {
      try { await espPort.close(); } catch (e) {}
    }

    toast('请在弹窗中选择 ESP32-C3...');
    espPort = await navigator.serial.requestPort({ filters: [{ usbVendorId: 0x303a }] });
    
    toast('正在连接板子...');
    espTransport = new window.Transport(espPort, false);  // 修复 C2: 关闭 tracing
    espLoader = new window.ESPLoader({
      transport: espTransport,
      baudrate: 115200,
      terminal: {
        clean: () => {},
        writeLine: (t) => { if (t) console.log('[ESP]', t); },  // 修复 C2: 节流日志
        write: (t) => {}  // 不输出逐字节日志
      }
    });

    toast('正在检测芯片...');
    const chipName = await espLoader.main();
    
    // 修复 0.3: 监听设备断开
    espTransport.device.addEventListener('disconnect', () => {
      console.log('[串口] 设备已断开');
      isConnected = false;
      espTransport = null;
      espLoader = null;
      espPort = null;
      $('connect-board').textContent = '连接板子';
      $('connect-board').style.display = '';
      $('disconnect-board').style.display = 'none';
      $('connect-board').disabled = false;
      $('flash').disabled = true;
      toast('⚠️ 板子已断开连接');
    });
    
    isConnected = true;
    $('connect-board').textContent = `✓ 已连接: ${chipName}`;
    $('connect-board').style.display = 'none';  // 修复 H10: 隐藏连接按钮
    $('disconnect-board').style.display = '';    // 显示断开按钮
    $('flash').disabled = false;
    toast(`✅ 已连接: ${chipName}`);

  } catch (err) {
    if (err.name === 'NotFoundError') {
      toast('已取消连接');
    } else {
      console.error(err);
      const friendlyMsg = err.message.includes('esptool-js 加载失败')
        ? err.message
        : '连接失败: ' + err.message;
      toast('❌ ' + friendlyMsg);
    }
    isConnected = false;
    $('connect-board').disabled = false;
    $('flash').disabled = true;
  }
};

// 修复 H10: 断开连接
$('disconnect-board').onclick = async () => {
  try {
    if (espTransport) {
      await espTransport.disconnect();
      console.log('[串口] 已断开连接');
    }
    if (espPort) {
      await espPort.close();
    }
  } catch (e) {
    console.warn('[串口] 断开警告:', e);
  }
  
  isConnected = false;
  espTransport = null;
  espLoader = null;
  espPort = null;
  
  $('connect-board').textContent = '连接板子';
  $('connect-board').style.display = '';
  $('disconnect-board').style.display = 'none';
  $('connect-board').disabled = false;
  $('flash').disabled = true;
  toast('已断开连接');
};

// 烧录程序
$('flash').onclick = async () => {
  if (!teacherStation) { toast('烧录只在老师电脑上的教师烧录台进行。'); return; }
  if (!isConnected) {
    toast('请先连接板子');
    return;
  }

  try {
    $('flash').disabled = true;
    $('connect-board').disabled = true;
    
    // 1. 编译代码
    toast('正在编译程序...');
    $('status').textContent = '编译中...';
    
    const compileRes = await fetch('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: editor.value })
    });

    let compiled;
    try {
      compiled = await compileRes.json();
    } catch (e) {
      throw new Error('编译服务无响应，请确认已用 npm run serve 启动');
    }
    if (!compileRes.ok) {
      throw new Error(compiled.message || compiled.error || '编译失败');
    }
    const { files, compileTime } = compiled;
    toast(`✓ 编译完成（${(compileTime/1000).toFixed(1)}s），开始烧录...`);

    // 2. 重新进入 bootloader 模式（修复 C1：确保芯片在下载模式）
    $('status').textContent = '准备烧录...';
    try {
      await espLoader.connect('default_reset');
      console.log('[烧录] 重新同步 bootloader');
    } catch (e) {
      console.warn('[烧录] 同步警告:', e.message);
      // 如果已经在 bootloader 模式则继续
    }

    // 3. 烧录固件
    const fileArray = files.map(f => ({
      data: Uint8Array.from(atob(f.data), c => c.charCodeAt(0)),
      address: f.offset
    }));

    await espLoader.writeFlash({
      fileArray,
      flashSize: '4MB',
      flashMode: 'dio',
      flashFreq: '80m',
      eraseAll: false,
      compress: true,
      reportProgress: (fileIndex, written, total) => {  // 修复 H1：正确的参数签名
        const percent = total > 0 ? Math.round((written / total) * 100) : 0;
        $('status').textContent = `烧录中 ${percent}%`;
      }
    });

    $('status').textContent = '烧录成功！';
    toast('✅ 烧录成功！板子正在运行程序');
    
    try {
      await espLoader.hardReset();
    } catch (e) {
      toast('⚠️ 自动复位失败，请手动按 RST 按钮');
    }

  } catch (err) {
    console.error(err);
    const friendlyMsg = err.message.includes('Serial data stream stopped') 
      ? '板子无响应，请重新插拔 USB 并重新连接'
      : err.message;
    toast('❌ 烧录失败: ' + friendlyMsg);
    $('status').textContent = '烧录失败';
  } finally {
    $('flash').disabled = !isConnected;
    $('connect-board').disabled = false;
  }
};
