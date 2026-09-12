import {holes,holeMap,boardEdges,occupied,footprint,defaults,validPlacement,coveredHoles,freeOnNet,autoWires,placement} from './breadboard.mjs';
import {compile,execute} from './runtime.mjs';import {examples,virtualSketch} from './examples.mjs';import {definitions,lessons,connected as graphConnected,checkCircuit as graphCheck,getLessonProgress,checkWire,diagnoseWrongWire,pinLabel,validateProject as oldValidate,keepWiresFromPreviousLessons,wireTouchesPart} from './circuit.mjs';import {Display} from './display.mjs';import {createTable} from './board-scene.mjs?v=20260912-7';import {initGuide} from './knowledge.mjs?v=20260912-13';
import {analyze,defaultProgram,recipe,validateProgram,listUnits} from './blocks.mjs?v=20260912-19';
import {executeBlocks,generateSketch} from './blocks-gen.mjs?v=20260912-19';
import {mountBlocks} from './blocks-ui.mjs?v=20260912-19';
const $=id=>document.getElementById(id),editor=$('code'),canvas=$('oled'),ctx=canvas.getContext('2d'),display=new Display();let table,wires=[],pending=null,selected=null,controller=null,runGeneration=0,ready=false,sda=5,scl=4,modes={},values={},logs=[],lastProgram='',wiringMode='custom',currentLesson=1,completedLessons=[],editorMode='blocks';
const PROGRESS_KEY='desk-buddy-lesson-progress';
const BLOCK_BY_LESSON={1:['blank','bounceBall','text','counter','led'],2:['blank','bounceBall','text','counter','led','beep'],3:['blank','bounceBall','soundPush','catchBox','text','counter','led','beep','clap']};
function loadProgress(){
  try{
    const raw=JSON.parse(localStorage.getItem(PROGRESS_KEY)||'null');
    if(!raw||typeof raw!=='object')return;
    const done=(Array.isArray(raw.completed)?raw.completed:[]).map(Number).filter(n=>n>=1&&n<=lessons.length);
    completedLessons=[...new Set(done)];
  }catch{}
}
function saveProgress(){
  try{localStorage.setItem(PROGRESS_KEY,JSON.stringify({completed:completedLessons,current:currentLesson}));}catch{}
}
const teacherStation=['localhost','127.0.0.1'].includes(location.hostname)&&new URLSearchParams(location.search).get('teacher')==='1';document.body.classList.toggle('teacher-station',teacherStation);if(!teacherStation){for(const id of ['connect-board','disconnect-board','flash'])$(id).hidden=true;}
display.render(ctx,false);editor.value=examples.eyes;if($('example'))$('example').value='eyes';loadProgress();const numbers=()=>{$('numbers').textContent=Array.from({length:editor.value.split('\n').length},(_,i)=>i+1).join('\n');};numbers();
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
function validateProject(p){if(p?.version!==2&&p?.version!==3)throw Error('请使用面包板版本的作品文件；旧版 .ino 代码仍可打开');if(typeof p.code!=='string'||p.code.length>50000||!Array.isArray(p.parts)||p.parts.length>5||!Array.isArray(p.wires)||p.wires.length>80)throw Error('作品格式无效');if(p.version===3&&p.editorMode&&p.editorMode!=='blocks'&&p.editorMode!=='code')throw Error('作品格式无效');const ps=[];for(const v of p.parts){if(!definitions.some(d=>d.id===v.id)||ps.some(d=>d.id===v.id)||!Number.isInteger(v.row)||!validPlacement(ps,v.id,v.row))throw Error('零件位置无效');ps.push(v);}const used=occupied(ps);for(const w of p.wires){if(!holeMap.has(w.a)||!holeMap.has(w.b)||w.a===w.b||used.has(w.a)||used.has(w.b))throw Error('孔位无效或被重复占用');used.add(w.a);used.add(w.b);}return p;}
function freeHole(pin){return freeOnNet(pin,table.state(),wires);}
const active=()=>table?table.state().map(p=>p.id):[];
function selectedPart(id){selected=id;$('selected').hidden=!id;if(id)$('selectedname').textContent=definitions.find(d=>d.id===id).name;}
function holeText(id){return id?id.slice(3):'请先放入零件 / 释放孔位';}
function wireName(id){return pinLabel(id);}
function pinHoleLabel(pin){
  const partId=pin.split(':')[0];
  const part=table.state().find(p=>p.id===partId);
  if(!part)return pinLabel(pin);
  const edge=footprint(partId,part.row).find(e=>e.a===pin);
  return edge?pinLabel(pin)+'（针在 '+edge.b.slice(3)+'）':pinLabel(pin);
}
function stepHint(spec){
  const [a,b,title,text]=spec;
  const ha=freeHole(a),hb=freeHole(b);
  const pinA=pinHoleLabel(a),pinB=pinHoleLabel(b);
  if(!ha||!hb) return `${text} 针脚旁边的空孔被挡住了，请先把零件挪开一点。`;
  return `${text} 针已经占着孔，请点旁边亮起来的空孔：先点 ${holeText(ha)}（靠近 ${pinA}），再点 ${holeText(hb)}（靠近 ${pinB}）。同一排空孔也通电。`;
}
function markCompleted(progress){
  if(progress.completed&&!completedLessons.includes(currentLesson)){
    completedLessons.push(currentLesson);
    saveProgress();
    toast(currentLesson<lessons.length?`🎉 ${lessons[currentLesson-1].name}完成！可以点「开始下一课」。`:`🎉 ${lessons[currentLesson-1].name}完成！`);
  }
}
function nextLessonButton(){
  const b=document.createElement('button');
  b.type='button';
  b.className='next-lesson';
  b.textContent='开始下一课 →';
  b.onclick=()=>switchLesson(currentLesson+1);
  return b;
}
function updateGuide(){
  if(!table)return;
  const lesson=lessons[currentLesson-1];
  const net=network(wires);
  const progress=getLessonProgress(currentLesson,net,active());
  if(wiringMode==='ready'){
    $('step-title').textContent='已经接好 · 完整范例';
    $('step-text').textContent='五个零件和参考线都在。这是沙盒，可以直接运行。课程还是要自己接线才能解锁下一课。';
    $('steps').replaceChildren();
    $('lesson-errors').replaceChildren();
    table.highlight([],pending);
  }else{
    const prevMissing=progress.prevWires.find((_,i)=>!progress.prevDone[i]);
    const nextNew=progress.newWires.find((_,i)=>!progress.newDone[i]);
    const spec=prevMissing||nextNew;
    const bars=progress.newDone.length?progress.newDone:progress.wiresDone;
    $('steps').replaceChildren(...bars.map(v=>{const el=document.createElement('span');el.className=v?'done':'';return el;}));
    const msgs=[...progress.errors];
    if(pending){
      const cover=coveredHoles(table.state());
      table.highlight(holes.filter(h=>graphConnected(net,pending,h.id)&&(!cover.has(h.id)||occupied(table.state(),wires).has(h.id))).map(h=>h.id),pending);
    }
    if(!spec){
      const missing=lesson.parts.filter(id=>!active().includes(id));
      const newTotal=progress.newWires.length||progress.total;
      if(missing.length){
        const names=missing.map(id=>definitions.find(d=>d.id===id)?.name||id).join('、');
        $('step-title').textContent=`${newTotal} / ${newTotal} · 还差零件`;
        $('step-text').textContent=`线接上了。请从左边零件盒把 ${names} 放到桌上。`;
        if(!pending)table.highlight([],null);
      }else{
        $('step-title').textContent=`${newTotal} / ${newTotal} · ${lesson.name}完成`;
        $('step-text').textContent=currentLesson<lessons.length?'接线完成！点「运行」看屏幕，或开始下一课。零件挪过以后，请按新的空孔接线。':'接线完成！点「运行」看屏幕，或载入这一课的示例。';
        if(!pending)table.highlight([],null);
        markCompleted(progress);
      }
    }else{
      const done=progress.newDone.filter(Boolean).length;
      const total=progress.newWires.length||progress.total;
      const prefix=prevMissing?(currentLesson>1?'上一课的线松了 · ':'') : '';
      $('step-title').textContent=`${done} / ${total} · ${prefix}${spec[2]}`;
      $('step-text').textContent=(prevMissing&&currentLesson>1?'上一课的线还要通着。 ':'')+stepHint(spec);
      if(!pending)table.highlight(spec.slice(0,2).map(freeHole).filter(Boolean),null);
    }
    $('lesson-errors').replaceChildren();
    if(msgs.length){
      const errorBox=document.createElement('div');
      errorBox.className='lesson-error';
      errorBox.textContent=msgs[0];
      $('lesson-errors').append(errorBox);
    }
    if(progress.completed&&currentLesson<lessons.length){
      $('lesson-errors').append(nextLessonButton());
    }
  }
  $('wirecount').textContent=wires.length;
  $('wirelist').replaceChildren(...wires.map((w,i)=>{
    const row=document.createElement('div');
    row.className='wirerow';
    const txt=document.createElement('span');
    const good=lesson.wires.some(lw=>checkWire(net,lw.slice(0,2))&&(graphConnected(net,w.a,lw[0])||graphConnected(net,w.a,lw[1])));
    txt.textContent=(good?'✅ ':'')+wireName(w.a)+' ↔ '+wireName(w.b);
    const b=document.createElement('button');
    b.textContent='删除';
    b.onclick=()=>{stop('接线已更改');wires.splice(i,1);updateWires();};
    row.append(txt,b);
    return row;
  }));
  updateLessonUI();
}
function updateWires(){table.setWires(wires);updateGuide();}
function updateLessonUI(){
  const lesson=lessons[currentLesson-1];
  $('current-lesson-name').textContent=lesson.name;
  $('current-lesson-desc').textContent=lesson.description;
  const count=$('parts-count');
  if(count) count.textContent='这一课 '+lesson.parts.length;
  const later=new Set(definitions.map(d=>d.id).filter(id=>!lesson.parts.includes(id)));
  document.querySelectorAll('#catalog .partbtn').forEach(btn=>{
    const laterPart=wiringMode!=='ready'&&later.has(btn.dataset.part);
    btn.classList.toggle('later',laterPart);
    btn.title=laterPart?'这一课还用不上，先把眼前的线接完':'点一下放到桌上';
  });
  for(let i=1;i<=lessons.length;i++){
    const btn=$('lesson-'+i);
    if(!btn) continue;
    const locked=i>1&&!completedLessons.includes(i-1);
    btn.disabled=false;
    btn.classList.toggle('active',i===currentLesson);
    btn.classList.toggle('completed',completedLessons.includes(i));
    btn.classList.toggle('locked',locked);
    btn.setAttribute('aria-disabled',String(locked));
  }
  const allowed=wiringMode==='ready'?null:new Set(lesson.examples);
  Array.from($('example').options).forEach(opt=>{
    opt.disabled=!!(allowed&&!allowed.has(opt.value));
  });
  const blockAllowed=wiringMode==='ready'?null:new Set(BLOCK_BY_LESSON[currentLesson]||[]);
  Array.from($('block-example').options).forEach(opt=>{
    opt.disabled=!!(blockAllowed&&!blockAllowed.has(opt.value));
  });
  updateLifeLock();
}
function lesson1ReadyOnBoard(){
  if(!table) return false;
  return getLessonProgress(1,network(wires),active()).completed;
}
function lifeIsUnlocked(){
  return wiringMode==='ready' || lesson1ReadyOnBoard();
}
function updateLifeLock(){
  const lock=$('life-lock');
  const panel=document.querySelector('.coding');
  if(!lock||!panel) return;
  const open=lifeIsUnlocked();
  lock.hidden=open;
  panel.classList.toggle('life-locked',!open);
  if(!open&&controller) stop('先接线，再运行');
}
function addMissingParts(lesson){
  const have=new Set(active());
  for(const id of lesson.parts){
    if(!have.has(id)) table.setActive(id,true);
  }
}
function resetCurrentLessonBoard(){
  const lesson=lessons[currentLesson-1];
  pending=null;
  table.select(null);
  if(currentLesson===1){
    table.restore(lesson.parts.map(id=>placement(id)));
    wires=[];
  }else{
    wires=keepWiresFromPreviousLessons(wires,currentLesson,table.state());
    addMissingParts(lesson);
  }
}
function switchLesson(lessonId,opts={}){
  if(wiringMode==='ready'){toast('「已经接好」是完整范例，不会解锁课程。要按课往下走，请先切回「自己接线」。');return;}
  if(lessonId>1&&!completedLessons.includes(lessonId-1)){toast(`请先把第${lessonId-1}课的线接完。灰掉的课点一下也会提醒你。`);return;}
  const restart=!!opts.restart;
  if(controller)stop(restart?'重新开始这一课':'切换课程');
  currentLesson=lessonId;
  saveProgress();
  const lesson=lessons[lessonId-1];
  pending=null;
  table.select(null);
  if(restart) resetCurrentLessonBoard();
  else addMissingParts(lesson);
  updateWires();
  toast(restart
    ?(lessonId===1?`重新开始${lesson.name}。`:`重新开始${lesson.name}：上一课的线还在，接着接新零件。`)
    :(lessonId===1?`开始${lesson.name}：${lesson.description}`:`开始${lesson.name}：上一课的线还在。${lesson.description}`));
}
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
  
  const from=pending;
  wires.push({a:from,b:id});
  pending=null;
  updateWires();
  const after=network(wires);
  const lesson=lessons[currentLesson-1];
  const check=checkCircuit(after,active());
  const wrong=diagnoseWrongWire(after,lesson,from,id);
  if(check.errors.length)toast(check.errors[0]);
  else if(wrong)toast(wrong);
  else{
    const progress=getLessonProgress(currentLesson,after,active());
    toast(progress.completed?'这根线接对了，这一课完成。':'这根线接对了。');
  }
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
async function delayMs(ms,signal){if(!Number.isFinite(ms)||ms<0||ms>60000)throw Error('等待范围为 0–60 秒');for(let n=0;n<Math.max(ms,1);n+=20){if(signal.aborted)throw Error('STOPPED');await new Promise(r=>setTimeout(r,Math.min(20,Math.max(ms,1)-n)));}}
function currentSketch(){return editorMode==='blocks'?generateSketch(blocksUI.getProgram()):editor.value;}
function refreshBlocksCode(){if($('blocks-code'))$('blocks-code').textContent=generateSketch(blocksUI.getProgram());}
function setEditorMode(mode,silent=false){if(mode!=='blocks'&&mode!=='code')return;if(mode===editorMode){document.querySelector('.coding')?.classList.toggle('blocks-mode',mode==='blocks');return;}if(controller)stop('已切换编辑方式');editorMode=mode;document.querySelector('.coding')?.classList.toggle('blocks-mode',mode==='blocks');$('mode-blocks')?.classList.toggle('active',mode==='blocks');$('mode-code')?.classList.toggle('active',mode==='code');if($('coding-title'))$('coding-title').textContent=mode==='blocks'?'拼积木，让它动起来':'写代码，让它动起来';if(mode==='code')numbers();if(!silent)toast(mode==='blocks'?'积木还是刚才那份。代码里改过的字不会变成积木。':'积木还留着。这里改的代码不会改回去。');}
function programHasLife(program){
  return !!(listUnits(program).length||(program.stage||[]).length);
}
async function run(){if(!table){toast('零件尚未加载完');return;}if(!lifeIsUnlocked()){toast('先把屏幕的四根线接上，或点「已经接好」。');updateLifeLock();return;}stop();logs=[];$('log').textContent='';display.reset();sda=5;scl=4;modes={};values={};const generation=runGeneration;try{if(editorMode==='blocks'){const check=checkCircuit(wires,active());if(check.errors.length)throw Error(check.errors.join('\n'));const program=blocksUI.getProgram();if(!programHasLife(program)){toast('还没有积木。先点左边的圆，或载入一个积木示例。');$('status').textContent='尚未运行';log('空白档案不会动。点左边角色，或载入「小球撞边」。');return;}const flags=analyze(program);lastProgram=generateSketch(program);refreshBlocksCode();await ensureAudio();if(flags.mic)await ensureMic();ready=check.ready;if(!ready&&flags.draw){toast('屏幕还没接好，中间是黑的。先接 OLED 四根线，或点「已经接好」看范例。');$('status').textContent='尚未运行';log('屏幕还没接好：先把 OLED 的 GND/VCC/SCL/SDA 接上，画面才会出现。也可以点「已经接好」看完整范例。');return;}if(flags.amp&&flags.led)toast('真机上哔声会占用蓝灯那根脚。网页演示互不影响。');controller=new AbortController();$('run').disabled=true;$('stop').disabled=false;$('status').textContent='运行中';log(flags.amp||flags.mic?'积木可以在网页里演示。喇叭和麦克风烧到真板子才走零件上的针脚。':'积木检查通过，正在运行。');const own=controller;await executeBlocks(program,{display,refresh(){display.render(ctx,ready);table?.refreshScreen();},delay:ms=>delayMs(ms,own.signal),playTone,stopTone,readMic,led(on){table.led(!!on);$('ledstate').textContent='板载 LED：'+(on?'点亮':'关闭');}},own.signal);return;}if(/ESP_I2S|I2SClass/.test(editor.value)){lastProgram=editor.value;await ensureAudio();if(/GAME_DINO|GAME_STAR|GAME_MOLE|PIN_MIC_|setPins\s*\(\s*21\s*,\s*20/.test(editor.value))await ensureMic();controller=new AbortController();$('run').disabled=true;$('stop').disabled=false;$('status').textContent='运行中';log(/GAME_DINO|GAME_STAR|GAME_MOLE/.test(editor.value)?'这个小游戏烧到板子才走真实麦克风。网页里请对着电脑麦克风拍手或喊一声。':'这个示例是给真实板子烧录的。MAX98357 只听 I2S，网页不能驱动真实喇叭。下面用电脑喇叭/麦克风演示。');const own=controller;const demo=compile(virtualSketch(editor.value));await execute(demo,{call:hardware},own.signal);return;}const program=compile(editor.value);const check=checkCircuit(wires,active());if(check.errors.length)throw Error(check.errors.join('\n'));lastProgram=editor.value;await ensureAudio();if(/analogRead\s*\(/.test(editor.value))await ensureMic();if(!check.ready){toast('屏幕还没接好，中间是黑的。先接 OLED 四根线，或点「已经接好」看范例。');log('屏幕还没接好：代码会跑，但眼睛是黑的。请先把 OLED 的 GND/VCC/SCL/SDA 接上。');}controller=new AbortController();$('run').disabled=true;$('stop').disabled=false;$('status').textContent='运行中';log('语法检查通过，正在执行 setup() / loop()。');const own=controller;await execute(program,{call:hardware},own.signal);}catch(e){if(e.message==='STOPPED'||generation!==runGeneration)return;stop('运行出错');log('错误：'+e.message);const m=/第 (\d+) 行/.exec(e.message);if(m&&editorMode==='code'){let start=editor.value.split('\n').slice(0,+m[1]-1).join('\n').length;const line=editor.value.split('\n')[+m[1]-1]||'';editor.focus();editor.setSelectionRange(start,start+line.length+1);}}}
for(const d of definitions){const b=document.createElement('button');b.className='partbtn';b.dataset.part=d.id;const sw=document.createElement('img');sw.className='partswatch';sw.src='./assets/guide-'+d.id+'.png';sw.alt='';const span=document.createElement('span'),bold=document.createElement('b'),small=document.createElement('small');bold.textContent=d.name;small.textContent={oled:'眼睛 · 把表情画出来',esp:'大脑 · 听懂你的程序',amp:'功放 · 帮声音放大',mic:'耳朵 · 听听周围的声音',speaker:'嘴巴 · 发出好听的声音'}[d.id];span.append(bold,small);b.append(sw,span);b.onclick=()=>{if(!table)return;const lesson=lessons[currentLesson-1];if(wiringMode!=='ready'&&!lesson.parts.includes(d.id)){toast(`这个零件在${lesson.name}里还用不上。先把这一课的线接完，下一课就会用到它。`);return;}if(controller)stop('零件已更改');table.setActive(d.id,true);table.select(d.id);updateGuide();if(d.id==='amp'||d.id==='speaker')toast('网页里声音走电脑喇叭。烧到板子才走功放和喇叭。');if(d.id==='mic')toast('网页里声音大小走电脑麦克风。烧到板子才走零件上的麦克风。');};$('catalog').append(b);}
for(let i=1;i<=lessons.length;i++){const btn=document.createElement('button');btn.id='lesson-'+i;btn.className='lesson-btn';btn.textContent=lessons[i-1].name;btn.onclick=()=>switchLesson(i);$('lesson-selector').append(btn);}
const hint='左键拖零件或点空孔接线 · 点空白处拖动平移 · 滚轮缩放 · 右键旋转';
const FULL_WIRING=[
  ['esp:G','rail:R-'],['esp:3.3','rail:R+'],
  ['oled:GND','rail:R-'],['oled:VCC','rail:R+'],['oled:SCL','esp:4'],['oled:SDA','esp:5'],
  ['amp:GND','rail:L-'],['amp:Vin','rail:L+'],['amp:LRC','esp:7'],['amp:BCLK','esp:8'],['amp:DIN','esp:9'],
  ['mic:GND','rail:R-'],['mic:VDD','rail:R+'],['mic:WS','esp:20'],['mic:SCK','esp:21'],['mic:SD','esp:10'],
  ['rail:L-','rail:R-'],['rail:L+','rail:R+']
];
function applyReadyWiring(){wires=autoWires(table.state(),FULL_WIRING);}
function setWiringMode(mode,resetParts=false,silent=false){const prev=wiringMode;wiringMode=mode;$('mode-custom').classList.toggle('active',mode==='custom');$('mode-ready').classList.toggle('active',mode==='ready');if(!table)return;if(controller)stop('接线模式已更改');pending=null;if(mode==='ready'){table.restore(['esp','oled','amp','mic','speaker'].map(id=>placement(id)));table.select(null);applyReadyWiring();if(!silent)toast(wires.length>=FULL_WIRING.length?'已经接好：五个零件都在，可以直接运行。这是沙盒，不会替你解锁下一课。':'有些孔被零件挡住，自动接线未完成，请挪一下零件再试。');}else if(resetParts||prev==='ready'){resetCurrentLessonBoard();if(!silent)toast(currentLesson===1?`自己接线：按下方提示，把${lessons[currentLesson-1].name}的线接上。`:`自己接线：上一课的线还在。按下方提示，把${lessons[currentLesson-1].name}的新线接上。`);}updateWires();}
function showZoom(z){if($('zoom-reset'))$('zoom-reset').textContent=Math.round((z??table?.getZoom()??1)*100)+'%';}
const blocksUI=mountBlocks($('blocks-root'),{onChange(){if(controller&&editorMode==='blocks')stop('积木已修改，请重新运行');refreshBlocksCode();},onMessage:toast});
refreshBlocksCode();
initGuide();
function setGuideOpen(open){const g=$('guide');if(!g)return;g.classList.toggle('collapsed',!open);$('guide-toggle')?.setAttribute('aria-expanded',String(open));$('guide-toggle')?.setAttribute('title',open?'收起接线指导，让实验桌更大':'展开接线指导');}
$('guide-toggle')?.addEventListener('click',()=>setGuideOpen($('guide').classList.contains('collapsed')));
$('life-lock-guide')?.addEventListener('click',()=>{
  setGuideOpen(true);
  const g=$('guide');
  g?.classList.add('nudge');
  g?.scrollIntoView({block:'nearest',behavior:'smooth'});
  setTimeout(()=>g?.classList.remove('nudge'),1600);
  toast('先按下面的接线指导，把屏幕四根线接上。');
});
$('life-lock-ready')?.addEventListener('click',()=>setWiringMode('ready'));
updateLifeLock();
$('mode-blocks').onclick=()=>setEditorMode('blocks');
$('mode-code').onclick=()=>setEditorMode('code');
$('load-block-example').onclick=()=>{const opt=$('block-example').selectedOptions[0];if(opt?.disabled){toast('这个示例要下一课的零件。先把这一课的线接完。');return;}if(!confirm('载入积木示例会替换当前积木，是否继续？'))return;stop('积木示例已载入');blocksUI.setProgram(recipe($('block-example').value));refreshBlocksCode();};
$('run').onclick=run;$('stop').onclick=()=>stop();$('clearlog').onclick=()=>{logs=[];$('log').textContent='';};$('help').onclick=()=>$('helpdialog').showModal();$('top').onclick=()=>{table?.setMode('top');$('top').classList.add('active');$('three').classList.remove('active');$('scenehint').textContent=hint;};$('xray').onclick=()=>{const on=$('xray').getAttribute('aria-pressed')!=='true';$('xray').setAttribute('aria-pressed',String(on));table?.setXray(on);$('xray').classList.toggle('active',on);};$('three').onclick=()=>{table?.setMode('three');$('three').classList.add('active');$('top').classList.remove('active');$('scenehint').textContent=hint;};$('resetview').onclick=()=>{table?.center();showZoom();};$('zoom-in').onclick=()=>table?.zoomBy(1.2);$('zoom-out').onclick=()=>table?.zoomBy(1/1.2);$('zoom-reset').onclick=()=>table?.zoomTo(1);$('mode-custom').onclick=()=>setWiringMode('custom');$('mode-ready').onclick=()=>setWiringMode('ready');$('remove').onclick=()=>{if(!selected)return;const id=selected;stop('零件已收回');const board=table.state();wires=wires.filter(w=>!wireTouchesPart(w,id,board));table.setActive(id,false);pending=null;table.select(null);updateWires();};$('undo').onclick=()=>{stop('已撤销接线');wires.pop();pending=null;updateWires();};
function lesson(){stop();table.center();switchLesson(currentLesson,{restart:true});}
$('lesson').onclick=()=>{const name=lessons[currentLesson-1].name;const msg=currentLesson===1?`重新开始${name}？零件和接线会重置，代码会保留。`:`重新开始${name}？这一课新接的线会清掉，上一课的线还在。代码会保留。`;if(confirm(msg))lesson();};$('loadexample').onclick=()=>{const opt=$('example').selectedOptions[0];if(opt?.disabled){toast('这个示例要下一课的零件。先把这一课的线接完，或点「已经接好」再载入。');return;}if(editor.value!==lastProgram&&editor.value!==examples.eyes&&!confirm('载入示例会替换编辑器中的代码，是否继续？'))return;stop('示例已载入');editor.value=examples[$('example').value];lastProgram=editor.value;numbers();};
editor.addEventListener('input',()=>{numbers();if(controller)stop('代码已修改，请重新运行');});editor.addEventListener('scroll',()=>{$('numbers').scrollTop=editor.scrollTop;});editor.addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();const start=editor.selectionStart,end=editor.selectionEnd;editor.setRangeText('  ',start,end,'end');editor.dispatchEvent(new Event('input'));}if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();run();}});
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function project(){return{version:3,editorMode,code:editor.value,blocks:blocksUI.getProgram(),parts:table.state(),wires};}
function exportCode(){const sketch=currentSketch();download('desk-buddy.ino',sketch,'text/x-c++src;charset=utf-8');toast('代码文件已下载，发给老师就好。');}
function showHandoff(){$('handoff-code').value=currentSketch();$('handoffdialog').showModal();}
async function copyCode(){const code=currentSketch();try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(code);}else{const field=$('handoff-code');field.focus();field.select();if(!document.execCommand('copy'))throw Error('复制不可用');}toast('代码已复制！现在把它粘贴发给老师。');}catch{toast('复制没有成功，试试点击“下载 .ino”。');}}
$('handoff').onclick=showHandoff;$('copy-code').onclick=copyCode;
$('save').onclick=()=>{if(!table)return;download('desk-buddy.json',JSON.stringify(project(),null,2),'application/json');toast('作品已保存到下载文件夹');};$('export').onclick=()=>download('desk_buddy.ino',editor.value,'text/plain');$('open').onclick=()=>$('file').click();$('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;try{if(file.size>200000)throw Error('文件太大');const data=await file.text();if(!confirm('打开文件会替换当前作品中的相应内容，是否继续？'))return;if(file.name.endsWith('.ino')){stop('代码已打开');editor.value=data;setEditorMode('code',true);}else{const p=validateProject(JSON.parse(data));stop('作品已打开');editor.value=p.code;table.restore(p.parts);wires=p.wires.map(w=>({a:w.a,b:w.b}));pending=null;updateWires();blocksUI.setProgram(p.version===3&&p.blocks?validateProgram(p.blocks):defaultProgram());refreshBlocksCode();setEditorMode(p.version===3?(p.editorMode==='code'?'code':'blocks'):'code',true);}numbers();lastProgram=editorMode==='blocks'?generateSketch(blocksUI.getProgram()):editor.value;}catch(e){toast('打开失败：'+e.message);}$('file').value='';};
$('export').onclick=exportCode;
try{table=await createTable($('viewport'),canvas,{pin:connect,select:selectedPart,change:()=>{stop('孔位已更改，请重新运行');pending=null;if(wiringMode==='ready')applyReadyWiring();updateWires();},message:toast,zoom:showZoom});table.center();showZoom(1);switchLesson(1);if(completedLessons.length)toast('课程还记得：已完成的课仍然解锁。桌上的线要重新接，也可以打开上次保存的作品。');$('loading').remove();}catch(e){$('loading').textContent='三维零件加载失败，请刷新页面。'+e.message;log(e.message);$('run').disabled=true;}
window.addEventListener('keydown',e=>{if(e.key==='Escape'){pending=null;updateGuide();}});
// Optional browser tool interface uses the exact same state and validation.
if(document.modelContext?.registerTool){const life=new AbortController();window.addEventListener('pagehide',()=>life.abort(),{once:true});for(const tool of [{name:'read_desk_buddy_project',description:'Read the current virtual Desk Buddy code, parts and wiring.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(){if(!table)throw Error('尚未加载完成');return project();}},{name:'check_desk_buddy_code',description:'Check supported Arduino syntax without starting the program or modifying the circuit.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(){if(editorMode==='blocks'){const sketch=generateSketch(blocksUI.getProgram());return{valid:true,mode:'blocks',sketch,circuit:checkCircuit(wires,active())};}const p=compile(editor.value);return{valid:true,functions:Object.keys(p.functions),circuit:checkCircuit(wires,active())};}}])Promise.resolve(document.modelContext.registerTool(tool,{signal:life.signal})).catch(()=>{});}

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
      body: JSON.stringify({ code: currentSketch() })
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
