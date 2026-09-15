import {holes,holeMap,boardEdges,occupied,footprint,defaults,validPlacement,coveredHoles,freeOnNet,autoWires,placement} from './breadboard.mjs';
import {compile,execute} from './runtime.mjs';import {examples,virtualSketch} from './examples.mjs';import {definitions,lessons,COMPANION_PARTS,COMPANION_WIRING,connected as graphConnected,checkCircuit as graphCheck,getLessonProgress,checkWire,diagnoseWrongWire,pinLabel,validateProject as oldValidate,keepWiresFromPreviousLessons,wireTouchesPart} from './circuit.mjs';import {Display} from './display.mjs';import {createTable} from './board-scene.mjs?v=20260915-2';import {initGuide} from './knowledge.mjs?v=20260915-2';
import {analyze,defaultProgram,recipe,validateProgram,listUnits} from './blocks.mjs?v=20260912-19';
import {executeBlocks,generateSketch} from './blocks-gen.mjs?v=20260912-19';
import {mountBlocks} from './blocks-ui.mjs?v=20260912-19';
import {validatePortal,loadProvision,saveProvision,clearProvision,isOnline,canListen} from './provision.mjs?v=20260914-9';
import {mergeFloat32,downsample,encodeWav,wavToBase64} from './asr.mjs?v=20260914-4';
const $=id=>document.getElementById(id),editor=$('code'),canvas=$('oled'),ctx=canvas.getContext('2d'),display=new Display();let table,wires=[],pending=null,selected=null,selectedWire=null,controller=null,runGeneration=0,ready=false,sda=5,scl=4,modes={},values={},logs=[],lastProgram='',wiringMode='custom',currentLesson=1,completedLessons=[],editorMode='blocks',lessonEditorMode='blocks';
let lifeOpen=true,lessonLifeOpen=true,talkLifeOpen=false;
let wireHistory=[[]],wireHistoryIndex=0;
const PROGRESS_KEY='desk-buddy-lesson-progress';
const HOTSPOT_KEY='desk-buddy-hotspot-id';
let provision=loadProvision();
let portalBusy=false;
let connectingTimer=null;
let keyBusy=false;
let listenBusy=false;
let lastHeard=null;
let lastKeyCode='';
let listenRec=null;
let listenGen=0;
let keyGen=0;
let speakPlayer=null;
let speakUrl=null;
let speakFinish=null;
let isConnected=false;
function robotHotspotName(){
  try{
    let id=localStorage.getItem(HOTSPOT_KEY);
    if(!/^[0-9A-F]{4}$/.test(id||'')){
      id=Array.from({length:4},()=>'0123456789ABCDEF'[Math.floor(Math.random()*16)]).join('');
      localStorage.setItem(HOTSPOT_KEY,id);
    }
    return 'DeskBuddy-'+id;
  }catch{
    return 'DeskBuddy-A3F2';
  }
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function paintTalkScreen(){
  if(portalBusy) display.paintConnecting();
  else if(keyBusy) display.paintKeyCheck();
  else if(listenBusy==='rec') display.paintListening();
  else if(listenBusy==='wait') display.paintListenWait();
  else if(listenBusy==='think') display.paintThinking();
  else if(listenBusy==='speak') display.paintSpeaking();
  else if(lastHeard&&!lastHeard.ok) display.paintListenBad(lastHeard.code);
  else if(lastHeard&&lastHeard.ok&&lastHeard.replyOk===false) display.paintReplyBad(lastHeard.code);
  else if(lastHeard&&lastHeard.ok&&lastHeard.speakOk===false) display.paintSpeakBad(lastHeard.code);
  else if(lastHeard&&lastHeard.ok&&lastHeard.reply) display.paintReply(lastHeard.reply);
  else if(lastHeard&&lastHeard.ok) display.paintHeard(lastHeard.text);
  else if(isOnline(provision)&&provision.keyStatus==='ok') display.paintKeyOk();
  else if(isOnline(provision)&&provision.keyStatus==='bad') display.paintKeyBad(lastKeyCode);
  else if(isOnline(provision)) display.paintWifiOk(provision.ssid);
  else display.paintHotspot(robotHotspotName());
  display.render(ctx,true);
  table?.refreshScreen();
}
function persistProvision(){
  provision=saveProvision(provision);
}
function talkPhase(){
  if(isOnline(provision)) return 'online';
  if(provision.hotspotJoined) return 'joined';
  return 'hotspot';
}
function updateTalkDock(){
  const dock=$('talk-dock');
  if(!dock) return;
  const on=wiringMode==='talk';
  dock.hidden=!on;
  const phase=talkPhase();
  const note=dock.querySelector('.talk-note');
  const busy=portalBusy||keyBusy||!!listenBusy;
  if($('talk-join')){
    $('talk-join').hidden=phase==='online';
    $('talk-join').disabled=phase!=='hotspot'||busy;
  }
  if($('talk-open')){
    $('talk-open').hidden=phase==='online';
    $('talk-open').disabled=phase!=='joined'||busy;
  }
  if($('talk-check')){
    $('talk-check').hidden=phase!=='online';
    $('talk-check').disabled=phase!=='online'||busy;
  }
  if($('talk-forget')) $('talk-forget').hidden=(phase==='hotspot'&&!portalBusy&&!listenBusy)||keyBusy||listenBusy==='wait'||listenBusy==='think'||listenBusy==='speak';
  const listen=$('talk-listen');
  if(listen){
    if(listenBusy==='rec'){
      listen.disabled=!teacherStation;
      listen.textContent=teacherStation?'说完了':'练习听…';
    }else if(listenBusy==='wait'){
      listen.disabled=true;
      listen.textContent='正在听写…';
    }else if(listenBusy==='think'){
      listen.disabled=true;
      listen.textContent='正在想…';
    }else if(listenBusy==='speak'){
      listen.disabled=true;
      listen.textContent='正在说…';
    }else{
      listen.disabled=!(canListen(provision)&&!portalBusy&&!keyBusy);
      listen.textContent='开始听';
    }
  }
  if($('talk-connect')){
    $('talk-connect').hidden=!teacherStation;
    $('talk-connect').disabled=!!isConnected||busy;
    $('talk-connect').textContent=isConnected?'板子已连接':'连接板子';
  }
  if($('talk-flash')){
    $('talk-flash').hidden=!teacherStation;
    $('talk-flash').disabled=!isConnected||busy;
  }
  if(portalBusy){
    if($('talk-status')) $('talk-status').textContent='正在离开热点，去连家里的网…';
    if(note) note.textContent='机器人正在用你刚填的 Wi-Fi 名字去找家里的网。这一步还不检查 MiniMax key。';
  }else if(keyBusy){
    if($('talk-status')) $('talk-status').textContent='正在检查 MiniMax 钥匙…';
    if(note) note.textContent=teacherStation?'老师电脑正在替机器人问 MiniMax：这把钥匙能不能用。现在还不能开始听。':'学生页正在练习检查钥匙，不会把钥匙发到网上。';
  }else if(listenBusy==='rec'){
    if($('talk-status')) $('talk-status').textContent=teacherStation?'正在听…请对着电脑麦克风说话':'练习听…屏幕会假装在听';
    if(note) note.textContent=teacherStation?'说完再点「说完了」。听完以后它会回答，还会出声。':'这是练习。屏幕会假装听、想、说。真的 MiniMax 请到老师电脑。';
  }else if(listenBusy==='wait'){
    if($('talk-status')) $('talk-status').textContent='正在把声音写成字…';
    if(note) note.textContent=teacherStation?'老师电脑正在把这段声音交给 MiniMax 听写。':'这是练习听写。不会把声音发到网上。';
  }else if(listenBusy==='think'){
    if($('talk-status')) $('talk-status').textContent=lastHeard?.text?'听见了：'+lastHeard.text+' · 正在想':'正在想怎么回答…';
    if(note) note.textContent=teacherStation?'老师电脑正在把听见的字交给 MiniMax 想一句短回答，然后出声。':'这是练习。屏幕正在假装想一句回答。';
  }else if(listenBusy==='speak'){
    if($('talk-status')) $('talk-status').textContent=lastHeard?.reply?'它写下了：'+lastHeard.reply+' · 正在说':'正在说话…';
    if(note) note.textContent=teacherStation?'老师电脑正在把回答交给 MiniMax 出声，请听电脑喇叭。':'这是练习出声。真的 MiniMax 声音只在老师电脑。';
  }else if(phase==='online'&&provision.keyStatus==='ok'&&lastHeard?.ok&&lastHeard.speakOk===false){
    if($('talk-status')) $('talk-status').textContent=lastHeard.reply?'它写下了：'+lastHeard.reply+' · 没有发出声音':'没有发出声音';
    if(note) note.textContent=lastHeard.message||'它写下了回答，但没有发出声音。可以再点「开始听」。';
  }else if(phase==='online'&&provision.keyStatus==='ok'&&lastHeard?.ok&&lastHeard.reply){
    if($('talk-status')) $('talk-status').textContent='它写下了：'+lastHeard.reply;
    if(note) note.textContent=lastHeard.practice?'这是练习回答。真的对话请到老师电脑上的教师台。':lastHeard.speakOk===false?'回答已经写在屏幕上，但没有发出声音。可以再点「开始听」。':'回答已经写在屏幕上，电脑喇叭也会说出来。可以再点「开始听」。';
  }else if(phase==='online'&&provision.keyStatus==='ok'&&lastHeard?.ok&&lastHeard.replyOk===false){
    if($('talk-status')) $('talk-status').textContent=lastHeard.text?'听见了：'+lastHeard.text+' · 没有想出回答':'没有想出回答';
    if(note) note.textContent=lastHeard.message||'听见了，但没有写出回答。可以再点「开始听」。';
  }else if(phase==='online'&&provision.keyStatus==='ok'&&lastHeard?.ok){
    if($('talk-status')) $('talk-status').textContent=lastHeard.text?'听见了：'+lastHeard.text:'没听清';
    if(note) note.textContent='听写完成了。可以再点「开始听」。';
  }else if(phase==='online'&&provision.keyStatus==='ok'&&lastHeard&&!lastHeard.ok){
    if($('talk-status')) $('talk-status').textContent='听写没有成功';
    if(note) note.textContent='刚才没写成字。可以再点「开始听」，或让大人检查钥匙。';
  }else if(phase==='online'&&provision.keyStatus==='ok'){
    if($('talk-status')) $('talk-status').textContent='已连上 '+provision.ssid+' · 钥匙能用';
    if(note) note.textContent=teacherStation?'钥匙检查通过了。可以点「开始听」。听完它会回答，还会出声。真机请先连接板子，再烧录对话固件。':'钥匙练习通过了。可以点「开始听」看屏幕的脸。真的 MiniMax 请到老师电脑。';
  }else if(phase==='online'&&provision.keyStatus==='bad'){
    if($('talk-status')) $('talk-status').textContent='已连上 '+provision.ssid+' · 钥匙不对';
    if(note) note.textContent='网已经连上，但 MiniMax 钥匙检查没通过。请让大人再填一次，或再点「检查钥匙」。现在还不能开始听。';
  }else if(phase==='online'){
    if($('talk-status')) $('talk-status').textContent='已连上 '+provision.ssid+' · MiniMax key 已收下';
    if(note) note.textContent=teacherStation?'家里的网已经写进这台机器人。下一步请点「检查钥匙」。现在还不能开始听。':'家里的网已经写进这台机器人。下一步请点「检查钥匙」。学生页只是练习，不会把钥匙发到网上。';
  }else if(phase==='joined'){
    if($('talk-status')) $('talk-status').textContent='手机已连上 '+robotHotspotName()+' · 还没填家里的网';
    if(note) note.textContent='手机已经连上机器人热点。下一步打开 192.168.4.1，填 Wi-Fi 名字、密码和 MiniMax API key。空的格子不能保存。';
  }else{
    if($('talk-status')) $('talk-status').textContent='未配网 · 请先用 USB 给主板供电';
    if(note) note.textContent='现在还不能说话。先用手机连上屏幕上的 Wi-Fi 热点，再打开 192.168.4.1 填家里的网和 MiniMax key。';
  }
}
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
const teacherStation=['localhost','127.0.0.1'].includes(location.hostname)&&new URLSearchParams(location.search).get('teacher')==='1';document.body.classList.toggle('teacher-station',teacherStation);if($('edition')){$('edition').textContent=teacherStation?'教师版':'学生版';$('edition').title=teacherStation?'本机教师台：可以连接板子和烧录':'学生页：没有连接板子和烧录';}if(teacherStation)document.title='Desk Buddy · 教师台';if(!teacherStation){for(const id of ['connect-board','disconnect-board','flash'])$(id).hidden=true;}
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
function stop(message='已停止'){controller?.abort();controller=null;runGeneration++;ready=false;stopTone();if(wiringMode==='talk')paintTalkScreen();else blackScreen();table?.led(false);$('ledstate').textContent='板载 LED：关闭';$('run').disabled=false;$('stop').disabled=true;$('status').textContent=message;}
const network=w=>[...w,...boardEdges(table?.state()??[])];
function connected(w,a,b){return graphConnected(network(w),a,b);}
function checkCircuit(w,a,sda=5,scl=4){return graphCheck(network(w),a,sda,scl);}
function validateProject(p){if(p?.version!==2&&p?.version!==3)throw Error('请使用面包板版本的作品文件；旧版 .ino 代码仍可打开');if(typeof p.code!=='string'||p.code.length>50000||!Array.isArray(p.parts)||p.parts.length>6||!Array.isArray(p.wires)||p.wires.length>80)throw Error('作品格式无效');if(p.version===3&&p.editorMode&&p.editorMode!=='blocks'&&p.editorMode!=='code')throw Error('作品格式无效');const ps=[];for(const v of p.parts){if(!definitions.some(d=>d.id===v.id)||ps.some(d=>d.id===v.id)||!Number.isInteger(v.row)||!validPlacement(ps,v.id,v.row))throw Error('零件位置无效');ps.push(v);}const used=occupied(ps);for(const w of p.wires){if(!holeMap.has(w.a)||!holeMap.has(w.b)||w.a===w.b||used.has(w.a)||used.has(w.b))throw Error('孔位无效或被重复占用');used.add(w.a);used.add(w.b);}return p;}
function freeHole(pin){return freeOnNet(pin,table.state(),wires);}
const active=()=>table?table.state().map(p=>p.id):[];
function selectedPart(id){
  selected=id;
  if(id) selectedWire=null;
  updateSelectionBar();
  if(id) table?.setSelectedWire(null);
}
function wiringFrozen(){return wiringMode!=='custom';}
function sceneHint(){
  return wiringFrozen()
    ?'零件和电线已经固定 · 点空白处拖动平移 · Shift+滚轮也可平移 · 滚轮缩放 · 右键旋转'
    :'点空孔接线 · 点电线可选中后删除 · 点空白处拖动平移 · Shift+滚轮也可平移 · 滚轮缩放 · 右键旋转';
}
function copyWires(list){return (list||[]).map(w=>({a:w.a,b:w.b}));}
function sameWires(a,b){
  if(!a||!b||a.length!==b.length) return false;
  return a.every((w,i)=>w.a===b[i].a&&w.b===b[i].b);
}
function updateHistoryButtons(){
  const back=$('step-back'),fwd=$('step-forward');
  const frozen=wiringFrozen();
  if(back) back.disabled=frozen||wireHistoryIndex<=0;
  if(fwd) fwd.disabled=frozen||wireHistoryIndex>=wireHistory.length-1;
}
function commitWireHistory(){
  const snap=copyWires(wires);
  if(sameWires(wireHistory[wireHistoryIndex],snap)){updateHistoryButtons();return;}
  wireHistory=wireHistory.slice(0,wireHistoryIndex+1);
  wireHistory.push(snap);
  if(wireHistory.length>40) wireHistory=wireHistory.slice(-40);
  wireHistoryIndex=wireHistory.length-1;
  updateHistoryButtons();
}
function applyHistoryIndex(i){
  if(i<0||i>=wireHistory.length) return;
  wireHistoryIndex=i;
  wires=copyWires(wireHistory[i]);
  selectedWire=null;
  pending=null;
  updateWires();
}
function stepBack(){
  if(wiringFrozen()) return;
  if(wireHistoryIndex<=0) return;
  if(controller) stop('已回到上一步');
  applyHistoryIndex(wireHistoryIndex-1);
  toast('回到上一步。');
}
function stepForward(){
  if(wiringFrozen()) return;
  if(wireHistoryIndex>=wireHistory.length-1) return;
  if(controller) stop('已前进到下一步');
  applyHistoryIndex(wireHistoryIndex+1);
  toast('前进到下一步。');
}
function updateSelectionBar(){
  const bar=$('selected');
  const remove=$('remove');
  const removeWire=$('remove-wire');
  if(!bar) return;
  if(wiringFrozen()){
    bar.hidden=true;
    bar.classList.remove('wire-selected');
    if(remove) remove.hidden=true;
    if(removeWire) removeWire.hidden=true;
    return;
  }
  if(selected){
    bar.hidden=false;
    bar.classList.remove('wire-selected');
    $('selectedname').textContent=definitions.find(d=>d.id===selected)?.name||'';
    if(remove) remove.hidden=false;
    if(removeWire) removeWire.hidden=true;
    return;
  }
  if(Number.isInteger(selectedWire)&&wires[selectedWire]){
    const w=wires[selectedWire];
    bar.hidden=false;
    bar.classList.add('wire-selected');
    $('selectedname').textContent=wireName(w.a)+' ↔ '+wireName(w.b);
    if(remove) remove.hidden=true;
    if(removeWire) removeWire.hidden=false;
    return;
  }
  bar.hidden=true;
  bar.classList.remove('wire-selected');
  if(remove) remove.hidden=false;
  if(removeWire) removeWire.hidden=true;
}
function pickWire(index){
  if(wiringFrozen()) return;
  if(!Number.isInteger(index)){
    if(!Number.isInteger(selectedWire)) return;
    selectedWire=null;
    table?.setSelectedWire(null);
    updateSelectionBar();
    updateGuide();
    return;
  }
  if(controller){toast('先停止运行，再修改接线。');return;}
  if(selectedWire===index){
    selectedWire=null;
    table?.setSelectedWire(null);
    updateSelectionBar();
    updateGuide();
    return;
  }
  selected=null;
  pending=null;
  selectedWire=index;
  table?.setSelectedWire(index);
  updateSelectionBar();
  updateGuide();
}
function deleteWireAt(i){
  if(wiringFrozen()) return;
  if(!Number.isInteger(i)||i<0||i>=wires.length) return;
  if(controller) stop('接线已更改');
  wires.splice(i,1);
  selectedWire=null;
  pending=null;
  commitWireHistory();
  updateWires();
}
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
  if(!ha||!hb) return `${text} 针脚旁边的空孔被零件遮挡，无法接线。请按亮起的其他空孔。`;
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
  if(wiringMode==='talk'){
    const ssid=robotHotspotName();
    const tag=$('guide-toggle')?.querySelector('.tag');
    if(tag) tag.textContent='对话开机';
    if(portalBusy){
      $('step-title').textContent='对话 · 正在连家里的网';
      $('step-text').textContent='机器人正在离开自己的热点，去找你刚填的 Wi-Fi。这一步只检查有没有填名字，还不检查 MiniMax key。现在还不能开始听。';
    }else if(keyBusy){
      $('step-title').textContent='对话 · 正在检查钥匙';
      $('step-text').textContent=teacherStation?'老师电脑正在替机器人问 MiniMax：这把钥匙能不能用。现在还不能开始听。':'学生页正在练习检查钥匙，不会把钥匙发到网上。';
    }else if(listenBusy==='rec'){
      $('step-title').textContent='对话 · 正在听';
      $('step-text').textContent=teacherStation?'请对着电脑麦克风说话。说完点「说完了」。听完以后它会回答，还会出声。':'这是练习。屏幕会假装听、想、说。真的 MiniMax 请到老师电脑。';
    }else if(listenBusy==='wait'){
      $('step-title').textContent='对话 · 正在听写';
      $('step-text').textContent=teacherStation?'老师电脑正在把这段声音交给 MiniMax 写成字。':'这是练习听写。不会把声音发到网上。';
    }else if(listenBusy==='think'){
      $('step-title').textContent='对话 · 正在想';
      $('step-text').textContent=teacherStation?(lastHeard?.text?'听见了：'+lastHeard.text+'。老师电脑正在让 MiniMax 想一句短回答，然后出声。':'老师电脑正在让 MiniMax 想一句短回答，然后出声。'):'这是练习。屏幕正在假装想一句回答。';
    }else if(listenBusy==='speak'){
      $('step-title').textContent='对话 · 正在说';
      $('step-text').textContent=teacherStation?(lastHeard?.reply?'它写下了：'+lastHeard.reply+'。老师电脑正在让 MiniMax 出声，请听电脑喇叭。':'老师电脑正在让 MiniMax 出声，请听电脑喇叭。'):'这是练习出声。真的 MiniMax 声音只在老师电脑。';
    }else if(isOnline(provision)&&provision.keyStatus==='ok'&&lastHeard?.ok&&lastHeard.speakOk===false){
      $('step-title').textContent='对话 · 没有发出声音';
      $('step-text').textContent=lastHeard.message||'它写下了回答，但没有发出声音。可以再点「开始听」。';
    }else if(isOnline(provision)&&provision.keyStatus==='ok'&&lastHeard?.ok&&lastHeard.reply){
      $('step-title').textContent='对话 · 写下了回答';
      $('step-text').textContent='它写下了：'+lastHeard.reply+'。电脑喇叭也会说出来。可以再点「开始听」。';
    }else if(isOnline(provision)&&provision.keyStatus==='ok'&&lastHeard?.ok&&lastHeard.replyOk===false){
      $('step-title').textContent='对话 · 没有想出回答';
      $('step-text').textContent=lastHeard.message||'听见了，但没有写出回答。可以再点「开始听」。';
    }else if(isOnline(provision)&&provision.keyStatus==='ok'&&lastHeard?.ok){
      $('step-title').textContent='对话 · 听见了';
      $('step-text').textContent=lastHeard.text?'听见了：'+lastHeard.text+'。可以再点「开始听」。':'没听清。请再靠近麦克风说一次。';
    }else if(isOnline(provision)&&provision.keyStatus==='ok'&&lastHeard&&!lastHeard.ok){
      $('step-title').textContent='对话 · 听写没有成功';
      $('step-text').textContent=lastHeard.message||'刚才没写成字。可以再点「开始听」。';
    }else if(isOnline(provision)&&provision.keyStatus==='ok'){
      $('step-title').textContent='对话 · 钥匙能用';
      $('step-text').textContent=teacherStation
        ?'已经连上 '+provision.ssid+'，MiniMax 钥匙检查通过。可以点「开始听」。听完它会回答，还会出声。'
        :'已经连上 '+provision.ssid+'，钥匙练习通过了。可以点「开始听」看屏幕的脸。真的 MiniMax 请到老师电脑。';
    }else if(isOnline(provision)&&provision.keyStatus==='bad'){
      $('step-title').textContent='对话 · 钥匙不对';
      $('step-text').textContent='已经连上 '+provision.ssid+'，但 MiniMax 钥匙检查没通过。请让大人再填一次，或再点「检查钥匙」。现在还不能开始听。';
    }else if(isOnline(provision)){
      $('step-title').textContent='对话 · 已经连上家里的网';
      $('step-text').textContent=teacherStation
        ?'机器人已经离开自己的热点，连上了 '+provision.ssid+'。MiniMax key 已收下。下一步请点「检查钥匙」。现在还不能开始听。'
        :'机器人已经离开自己的热点，连上了 '+provision.ssid+'。下一步请点「检查钥匙」。学生页只是练习，不会把钥匙发到网上。';
    }else if(provision.hotspotJoined){
      $('step-title').textContent='对话 · 手机已连上热点';
      $('step-text').textContent='手机已经连上 '+ssid+'。请打开 192.168.4.1，填家里的 Wi-Fi 名字、密码和 MiniMax API key。空的格子不能保存。';
    }else{
      $('step-title').textContent='对话 · 还没有配网';
      $('step-text').textContent='现在没有电池，请先用 USB 给主板供电。屏幕上写着热点名 '+ssid+'，以及 192.168.4.1。请先点「手机连上热点」，再打开配网页。现在还不能开始听。';
    }
    $('steps').replaceChildren();
    $('lesson-errors').replaceChildren();
    table.highlight([],null,[]);
  }else if(wiringMode==='ready'){
    const tag=$('guide-toggle')?.querySelector('.tag');
    if(tag) tag.textContent='接线指导';
    $('step-title').textContent='已经接好 · 完整范例';
    $('step-text').textContent='五个零件和参考线都在。零件和电线已经固定，可以直接运行。课程还是要自己接线才能解锁下一课。';
    $('steps').replaceChildren();
    $('lesson-errors').replaceChildren();
    table.highlight([],null,[]);
  }else{
    const tag=$('guide-toggle')?.querySelector('.tag');
    if(tag) tag.textContent='接线指导';
    const prevMissing=progress.prevWires.find((_,i)=>!progress.prevDone[i]);
    const nextNew=progress.newWires.find((_,i)=>!progress.newDone[i]);
    const spec=prevMissing||nextNew;
    const bars=progress.newDone.length?progress.newDone:progress.wiresDone;
    $('steps').replaceChildren(...bars.map(v=>{const el=document.createElement('span');el.className=v?'done':'';return el;}));
    const msgs=[...progress.errors];
    const taskIds=spec?spec.slice(0,2).map(freeHole).filter(Boolean):[];
    let netIds=[];
    if(pending){
      const cover=coveredHoles(table.state());
      netIds=holes.filter(h=>graphConnected(net,pending,h.id)&&(!cover.has(h.id)||occupied(table.state(),wires).has(h.id))).map(h=>h.id);
    }
    table.highlight(taskIds,pending,netIds);
    if(!spec){
      const missing=lesson.parts.filter(id=>!active().includes(id));
      const newTotal=progress.newWires.length||progress.total;
      if(progress.completed){
        $('step-title').textContent=`${newTotal} / ${newTotal} · ${lesson.name}完成`;
        $('step-text').textContent=missing.length
          ?`接线完成！${currentLesson<lessons.length?'可以开始下一课。下一课会用到：'+missing.map(id=>definitions.find(d=>d.id===id)?.name||id).join('、')+'。':'可以载入示例继续玩。'}`
          :(currentLesson<lessons.length?'接线完成！点「运行」看屏幕，或开始下一课。':'接线完成！点「运行」看屏幕，或载入这一课的示例。');
        markCompleted(progress);
      }else if(missing.length){
        const names=missing.map(id=>definitions.find(d=>d.id===id)?.name||id).join('、');
        $('step-title').textContent=`${newTotal} / ${newTotal} · 还差零件`;
        $('step-text').textContent=`线接上了。请从左边零件盒把 ${names} 放到桌上。`;
      }else{
        $('step-title').textContent=`${newTotal} / ${newTotal} · ${lesson.name}完成`;
        $('step-text').textContent=currentLesson<lessons.length?'接线完成！点「运行」看屏幕，或开始下一课。':'接线完成！点「运行」看屏幕，或载入这一课的示例。';
        markCompleted(progress);
      }
    }else{
      const done=progress.newDone.filter(Boolean).length;
      const total=progress.newWires.length||progress.total;
      const prefix=prevMissing?(currentLesson>1?'上一课的线松了 · ':'') : '';
      $('step-title').textContent=`${done} / ${total} · ${prefix}${spec[2]}`;
      $('step-text').textContent=(prevMissing&&currentLesson>1?'上一课的线还要通着。 ':'')+stepHint(spec);
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
    row.className='wirerow'+(selectedWire===i?' picked':'');
    const txt=document.createElement('span');
    const good=lesson.wires.some(lw=>checkWire(net,lw.slice(0,2))&&(graphConnected(net,w.a,lw[0])||graphConnected(net,w.a,lw[1])));
    txt.textContent=(good?'✅ ':'')+wireName(w.a)+' ↔ '+wireName(w.b);
    if(!wiringFrozen()){
      const b=document.createElement('button');
      b.textContent='删除';
      b.onclick=e=>{e.stopPropagation();deleteWireAt(i);};
      row.onclick=()=>pickWire(i);
      row.append(txt,b);
    }else{
      row.append(txt);
    }
    return row;
  }));
  updateLessonUI();
}
function updateWires(){table.setWires(wires,selectedWire);updateGuide();updateHistoryButtons();updateSelectionBar();}
function updateLessonUI(){
  const lesson=lessons[currentLesson-1];
  const talk=wiringMode==='talk';
  $('current-lesson-name').textContent=talk?'对话模式':lesson.name;
  $('current-lesson-desc').textContent=talk?(canListen(provision)?(teacherStation?'钥匙能用。可以点「开始听」。听完它会回答，还会出声。':'钥匙练习通过了。可以点「开始听」看屏幕的脸。真的 MiniMax 请到老师电脑。'):isOnline(provision)?'已经连上家里的网。下一步检查 MiniMax 钥匙。':'桌上多一颗说话按键。先连热点，再打开 192.168.4.1 填家里的网。'):lesson.description;
  const count=$('parts-count');
  if(count) count.textContent=talk?'对话 6':('这一课 '+lesson.parts.length);
  const muted=document.querySelector('.parts > p.muted');
  if(muted) muted.textContent=wiringFrozen()?'零件已经固定，不能再加减。平移、缩放、3D 还可以。':'点一个零件，把它放上桌。后面课才用的会灰一点。';
  document.querySelectorAll('#catalog .partbtn').forEach(btn=>{
    const id=btn.dataset.part;
    const laterPart=talk?!COMPANION_PARTS.includes(id):wiringMode==='ready'?id==='btn':!lesson.parts.includes(id);
    btn.disabled=wiringFrozen();
    btn.classList.toggle('later',laterPart||wiringFrozen());
    btn.title=wiringFrozen()?'零件已经固定，不能再加减':laterPart?(id==='btn'?'说话按键在「对话」模式里才会用到':'这一课还用不上，先把眼前的线接完'):'点一下放到桌上';
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
  if(wiringMode==='talk') return true;
  return wiringMode==='ready' || lesson1ReadyOnBoard();
}
function updateLifeLock(){
  const lock=$('life-lock');
  const panel=document.querySelector('.coding');
  if(!lock||!panel) return;
  const open=lifeIsUnlocked();
  lock.hidden=open;
  panel.classList.toggle('life-locked',!open);
  const title=lock?.querySelector('strong');
  const copy=lock?.querySelector('p');
  const readyBtn=$('life-lock-ready');
  const phoneBtn=$('life-lock-phone');
  const guideBtn=$('life-lock-guide');
  if(readyBtn) readyBtn.hidden=wiringMode==='talk';
  if(phoneBtn) phoneBtn.hidden=wiringMode!=='talk';
  if(guideBtn) guideBtn.textContent='看接线指导';
  if(title) title.textContent='先接线，它才会听你的话';
  if(copy) copy.textContent='把屏幕的四根线接上。接完这边就会亮起来。也可以点「已经接好」看完整范例。';
  if(!open&&controller) stop('先接线，再运行');
  updateTalkDock();
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
  selectedWire=null;
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
  if(wiringMode==='talk'){toast('对话模式不按课解锁。要接线上课，请切回「自己接线」。');return;}
  if(wiringMode==='ready'){toast('「已经接好」是完整范例，不会解锁课程。要按课往下走，请先切回「自己接线」。');return;}
  if(lessonId>1&&!completedLessons.includes(lessonId-1)){toast(`请先把第${lessonId-1}课的线接完。灰掉的课点一下也会提醒你。`);return;}
  const restart=!!opts.restart;
  if(controller)stop(restart?'重新开始这一课':'切换课程');
  currentLesson=lessonId;
  saveProgress();
  const lesson=lessons[lessonId-1];
  pending=null;
  selectedWire=null;
  selected=null;
  table.select(null);
  if(restart) resetCurrentLessonBoard();
  else addMissingParts(lesson);
  commitWireHistory();
  updateWires();
  updateSelectionBar();
  toast(restart
    ?(lessonId===1?`重新开始${lesson.name}。`:`重新开始${lesson.name}：上一课的线还在，接着接新零件。`)
    :(lessonId===1?`开始${lesson.name}：${lesson.description}`:`开始${lesson.name}：上一课的线还在。${lesson.description}`));
}
function connect(id){
  if(wiringFrozen()) return;
  if(!holeMap.has(id))return;
  if(Number.isInteger(selectedWire)){
    selectedWire=null;
    table?.setSelectedWire(null);
    updateSelectionBar();
  }
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
  if(!pending){
    pending=id;
    selectedWire=null;
    table?.setSelectedWire(null);
    updateSelectionBar();
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
  selectedWire=null;
  commitWireHistory();
  updateWires();
  const after=network(wires);
  const lesson=lessons[currentLesson-1];
  const check=checkCircuit(after,active());
  const wrong=diagnoseWrongWire(after,lesson,from,id);
  if(check.errors.length)toast(check.errors[0]);
  else if(wrong)toast(wrong);
  else{
    const progress=getLessonProgress(currentLesson,after,active());
    const thisWireNeeded=lesson.wires.some(lw=>checkWire(after,lw.slice(0,2))&&(graphConnected(after,from,lw[0])||graphConnected(after,from,lw[1])));
    if(thisWireNeeded){
      toast(progress.completed?'这根线接对了，这一课完成。':'这根线接对了。');
    }else{
      toast('这根线接上了，但不是这一课要求的。');
    }
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
function codingPanel(){return document.querySelector('.coding');}
function updateLifeToggle(){
  const btn=$('toggle-life');
  if(!btn) return;
  const talk=wiringMode==='talk';
  const label=talk||editorMode==='code'?'代码':'积木';
  btn.textContent=label;
  btn.classList.toggle('active',lifeOpen);
  btn.setAttribute('aria-pressed',String(lifeOpen));
  btn.setAttribute('aria-expanded',String(lifeOpen));
  btn.title=lifeOpen?'收起右边栏，让实验桌更大':(talk?'打开右边的代码':'打开右边的积木和代码');
}
function setLifeOpen(open,silent=false){
  lifeOpen=!!open;
  if(wiringMode==='talk') talkLifeOpen=lifeOpen;
  else lessonLifeOpen=lifeOpen;
  document.body.classList.toggle('life-collapsed',!lifeOpen);
  updateLifeToggle();
  if(!silent) toast(lifeOpen?(wiringMode==='talk'?'右边打开了。对话模式只有代码，没有积木。':'右边打开了。'):'右边收起来了，实验桌更大。');
}
function applyTalkEditorChrome(){
  const talk=wiringMode==='talk';
  codingPanel()?.classList.toggle('talk-code-only',talk);
  if(talk) setEditorMode('code',true);
  else setEditorMode(lessonEditorMode,true);
  updateLifeToggle();
}
function setEditorMode(mode,silent=false){
  if(mode!=='blocks'&&mode!=='code') return;
  if(wiringMode==='talk'&&mode==='blocks'){
    if(!silent) toast('对话模式没有积木。请切回「自己接线」或「已经接好」。');
    mode='code';
  }
  if(mode===editorMode){
    codingPanel()?.classList.toggle('blocks-mode',mode==='blocks');
    updateLifeToggle();
    return;
  }
  if(controller) stop('已切换编辑方式');
  editorMode=mode;
  if(wiringMode!=='talk') lessonEditorMode=mode;
  codingPanel()?.classList.toggle('blocks-mode',mode==='blocks');
  $('mode-blocks')?.classList.toggle('active',mode==='blocks');
  $('mode-code')?.classList.toggle('active',mode==='code');
  if($('coding-title')) $('coding-title').textContent=mode==='blocks'?'拼积木，让它动起来':'写代码，让它动起来';
  if(mode==='code') numbers();
  updateLifeToggle();
  if(!silent) toast(mode==='blocks'?'积木还是刚才那份。代码里改过的字不会变成积木。':'积木还留着。这里改的代码不会改回去。');
}
function programHasLife(program){
  return !!(listUnits(program).length||(program.stage||[]).length);
}
async function run(){if(!table){toast('零件尚未加载完');return;}if(wiringMode==='talk'){toast(canListen(provision)?'对话模式不运行右边的程序。请点中间的「开始听」。':isOnline(provision)?'已经连上家里的网。请先检查 MiniMax 钥匙。对话模式不运行右边的程序。':'对话模式先连热点、打开 192.168.4.1。现在还不能开始听，也不运行右边的程序。');updateLifeLock();return;}if(!lifeIsUnlocked()){toast('先把屏幕的四根线接上，或点「已经接好」。');updateLifeLock();return;}pending=null;selectedWire=null;stop();logs=[];$('log').textContent='';display.reset();sda=5;scl=4;modes={};values={};const generation=runGeneration;try{if(editorMode==='blocks'){const check=checkCircuit(wires,active());if(check.errors.length)throw Error(check.errors.join('\n'));const program=blocksUI.getProgram();if(!programHasLife(program)){toast('还没有积木。先点左边的圆，或载入一个积木示例。');$('status').textContent='尚未运行';log('空白档案不会动。点左边角色，或载入「小球撞边」。');return;}const flags=analyze(program);lastProgram=generateSketch(program);refreshBlocksCode();await ensureAudio();if(flags.mic)await ensureMic();ready=check.ready;if(!ready&&flags.draw){toast('屏幕还没接好，中间是黑的。先接 OLED 四根线，或点「已经接好」看范例。');$('status').textContent='尚未运行';log('屏幕还没接好：先把 OLED 的 GND/VCC/SCL/SDA 接上，画面才会出现。也可以点「已经接好」看完整范例。');return;}if(flags.amp&&flags.led)toast('真机上哔声会占用蓝灯那根脚。网页演示互不影响。');controller=new AbortController();$('run').disabled=true;$('stop').disabled=false;$('status').textContent='运行中';log(flags.amp||flags.mic?'积木可以在网页里演示。喇叭和麦克风烧到真板子才走零件上的针脚。':'积木检查通过，正在运行。');const own=controller;await executeBlocks(program,{display,refresh(){display.render(ctx,ready);table?.refreshScreen();},delay:ms=>delayMs(ms,own.signal),playTone,stopTone,readMic,led(on){table.led(!!on);$('ledstate').textContent='板载 LED：'+(on?'点亮':'关闭');}},own.signal);return;}if(/ESP_I2S|I2SClass/.test(editor.value)){lastProgram=editor.value;await ensureAudio();if(/GAME_DINO|GAME_STAR|GAME_MOLE|PIN_MIC_|setPins\s*\(\s*21\s*,\s*20/.test(editor.value))await ensureMic();controller=new AbortController();$('run').disabled=true;$('stop').disabled=false;$('status').textContent='运行中';log(/GAME_DINO|GAME_STAR|GAME_MOLE/.test(editor.value)?'这个小游戏烧到板子才走真实麦克风。网页里请对着电脑麦克风拍手或喊一声。':'这个示例是给真实板子烧录的。MAX98357 只听 I2S，网页不能驱动真实喇叭。下面用电脑喇叭/麦克风演示。');const own=controller;const demo=compile(virtualSketch(editor.value));await execute(demo,{call:hardware},own.signal);return;}const program=compile(editor.value);const check=checkCircuit(wires,active());if(check.errors.length)throw Error(check.errors.join('\n'));lastProgram=editor.value;await ensureAudio();if(/analogRead\s*\(/.test(editor.value))await ensureMic();if(!check.ready){toast('屏幕还没接好，中间是黑的。先接 OLED 四根线，或点「已经接好」看范例。');log('屏幕还没接好：代码会跑，但眼睛是黑的。请先把 OLED 的 GND/VCC/SCL/SDA 接上。');}controller=new AbortController();$('run').disabled=true;$('stop').disabled=false;$('status').textContent='运行中';log('语法检查通过，正在执行 setup() / loop()。');const own=controller;await execute(program,{call:hardware},own.signal);}catch(e){if(e.message==='STOPPED'||generation!==runGeneration)return;stop('运行出错');log('错误：'+e.message);const m=/第 (\d+) 行/.exec(e.message);if(m&&editorMode==='code'){let start=editor.value.split('\n').slice(0,+m[1]-1).join('\n').length;const line=editor.value.split('\n')[+m[1]-1]||'';editor.focus();editor.setSelectionRange(start,start+line.length+1);}}}
for(const d of definitions){const b=document.createElement('button');b.className='partbtn';b.dataset.part=d.id;const sw=d.id==='btn'?document.createElement('span'):document.createElement('img');sw.className='partswatch';if(d.id!=='btn'){sw.src='./assets/guide-'+d.id+'.png';sw.alt='';sw.onerror=()=>{sw.hidden=true;}}const span=document.createElement('span'),bold=document.createElement('b'),small=document.createElement('small');bold.textContent=d.name;small.textContent={oled:'眼睛 · 把表情画出来',esp:'大脑 · 听懂你的程序',amp:'功放 · 帮声音放大',mic:'耳朵 · 听听周围的声音',speaker:'嘴巴 · 发出好听的声音',btn:'说话键 · 按下才通，不是 RST'}[d.id];span.append(bold,small);b.append(sw,span);b.onclick=()=>{if(!table||wiringFrozen())return;const lesson=lessons[currentLesson-1];if(d.id==='btn'){toast('说话按键在「对话」模式里才会用到。');return;}if(!lesson.parts.includes(d.id)){toast(`这个零件在${lesson.name}里还用不上。先把这一课的线接完，下一课就会用到它。`);updateLessonUI();return;}if(controller)stop('零件已更改');table.setActive(d.id,true);table.select(d.id);updateGuide();if(d.id==='amp'||d.id==='speaker')toast('网页里声音走电脑喇叭。烧到板子才走功放和喇叭。');if(d.id==='mic')toast('网页里声音大小走电脑麦克风。烧到板子才走零件上的麦克风。');};$('catalog').append(b);}
for(let i=1;i<=lessons.length;i++){const btn=document.createElement('button');btn.id='lesson-'+i;btn.className='lesson-btn';btn.textContent=lessons[i-1].name;btn.onclick=()=>switchLesson(i);$('lesson-selector').append(btn);}
const FULL_WIRING=[
  ['esp:G','rail:R-'],['esp:3.3','rail:R+'],
  ['oled:GND','rail:R-'],['oled:VCC','rail:R+'],['oled:SCL','esp:4'],['oled:SDA','esp:5'],
  ['amp:GND','rail:L-'],['amp:Vin','rail:L+'],['amp:LRC','esp:7'],['amp:BCLK','esp:8'],['amp:DIN','esp:9'],
  ['mic:GND','rail:R-'],['mic:VDD','rail:R+'],['mic:WS','esp:20'],['mic:SCK','esp:21'],['mic:SD','esp:10'],
  ['rail:L-','rail:R-'],['rail:L+','rail:R+']
];
function applyReadyWiring(){wires=autoWires(table.state(),FULL_WIRING);selectedWire=null;}
function applyTalkWiring(){wires=autoWires(table.state(),COMPANION_WIRING);selectedWire=null;}
function setWiringMode(mode,resetParts=false,silent=false){
  const prev=wiringMode;
  wiringMode=mode;
  $('mode-custom')?.classList.toggle('active',mode==='custom');
  $('mode-ready')?.classList.toggle('active',mode==='ready');
  $('mode-talk')?.classList.toggle('active',mode==='talk');
  document.body.classList.toggle('talk-mode',mode==='talk');
  applyTalkEditorChrome();
  setLifeOpen(mode==='talk'?talkLifeOpen:lessonLifeOpen,true);
  if(!table)return;
  table.setFrozen(mode!=='custom');
  if($('scenehint')) $('scenehint').textContent=sceneHint();
  if(controller)stop('接线模式已更改');
  if(prev==='talk'&&mode!=='talk'){
    stopListenCapture();
    stopSpeak();
    listenGen++;
    keyGen++;
    listenBusy=false;
    lastKeyCode='';
  }
  pending=null;
  selectedWire=null;
  if(mode==='talk'){
    table.restore(COMPANION_PARTS.map(id=>placement(id)));
    table.select(null);
    applyTalkWiring();
    paintTalkScreen();
    if(!silent)toast(canListen(provision)?(teacherStation?'对话模式：钥匙能用。可以点「开始听」。听完它会回答，还会出声。':'对话模式：钥匙练习通过了。可以点「开始听」看屏幕的脸。真的 MiniMax 请到老师电脑。'):isOnline(provision)?'对话模式：已经连上家里的网。下一步检查 MiniMax 钥匙。':'对话模式：先用 USB 供电。请先让手机连上屏幕上的热点，再打开 192.168.4.1。');
  }else if(mode==='ready'){
    table.restore(['esp','oled','amp','mic','speaker'].map(id=>placement(id)));
    table.select(null);
    applyReadyWiring();
    blackScreen();
    if(!silent)toast(wires.length>=FULL_WIRING.length?'已经接好：五个零件都在，可以直接运行。零件和电线已经固定。这是沙盒，不会替你解锁下一课。':'已经接好：零件位置固定，部分孔被遮挡导致部分线未接上。');
  }else if(resetParts||prev==='ready'||prev==='talk'){
    resetCurrentLessonBoard();
    blackScreen();
    if(!silent)toast(currentLesson===1?`自己接线：按下方提示，把${lessons[currentLesson-1].name}的线接上。`:`自己接线：上一课的线还在。按下方提示，把${lessons[currentLesson-1].name}的新线接上。`);
  }
  commitWireHistory();
  updateWires();
}
function joinHotspot(){
  if(wiringMode!=='talk'||isOnline(provision)||portalBusy||keyBusy||listenBusy) return;
  provision.hotspotJoined=true;
  persistProvision();
  paintTalkScreen();
  updateTalkDock();
  updateGuide();
  updateLifeLock();
  toast('手机已经连上 '+robotHotspotName()+'。下一步打开 192.168.4.1。');
}
function forgetNetwork(){
  if(wiringMode!=='talk') return;
  if(connectingTimer){clearTimeout(connectingTimer);connectingTimer=null;}
  stopListenCapture();
  stopSpeak();
  listenGen++;
  keyGen++;
  lastKeyCode='';
  portalBusy=false;
  keyBusy=false;
  listenBusy=false;
  lastHeard=null;
  provision=clearProvision();
  $('phone-portal')?.close();
  paintTalkScreen();
  updateTalkDock();
  updateGuide();
  updateLifeLock();
  toast('已经忘记网络。屏幕又回到热点名。请重新用手机连上热点。');
}
function renderPhoneForm(errors=[],values={}){
  const screen=$('phone-screen');
  const bar=$('phone-status-bar');
  if(bar) bar.textContent=robotHotspotName()+' · 没有网';
  if(!screen) return;
  const err=Object.fromEntries((errors||[]).map(e=>[e.field,e.message]));
  screen.innerHTML=`<p class="phone-url">http://192.168.4.1</p>
    <h2 id="phone-title">Desk Buddy 配网</h2>
    <p class="phone-lead">手机现在连着机器人自己的热点，还上不了网。把家里或学校的 Wi-Fi 写给它，再填 MiniMax API key。</p>
    <form id="phone-form">
      <label for="phone-ssid">Wi-Fi 名字</label>
      <input id="phone-ssid" name="ssid" autocomplete="off" spellcheck="false" value="${escapeHtml(values.ssid||'')}">
      ${err.ssid?`<p class="phone-error">${escapeHtml(err.ssid)}</p>`:''}
      <label for="phone-password">Wi-Fi 密码</label>
      <input id="phone-password" name="password" type="password" autocomplete="off" value="${escapeHtml(values.password||'')}">
      ${err.password?`<p class="phone-error">${escapeHtml(err.password)}</p>`:''}
      <label for="phone-key">MiniMax API key</label>
      <input id="phone-key" name="apiKey" autocomplete="off" spellcheck="false" value="${escapeHtml(values.apiKey||'')}">
      ${err.apiKey?`<p class="phone-error">${escapeHtml(err.apiKey)}</p>`:''}
      <button type="submit" class="primary">保存并连接</button>
    </form>`;
  $('phone-form').addEventListener('submit',submitPhoneForm);
}
function submitPhoneForm(e){
  e.preventDefault();
  const values={ssid:$('phone-ssid')?.value||'',password:$('phone-password')?.value||'',apiKey:$('phone-key')?.value||''};
  const check=validatePortal(values);
  if(!check.ok){
    renderPhoneForm(check.errors,values);
    toast(check.errors[0]?.message||'还有空格子。');
    return;
  }
  startConnecting(check.ssid,values.apiKey);
}
function startConnecting(ssid,apiKey){
  $('phone-portal')?.close();
  portalBusy=true;
  paintTalkScreen();
  updateTalkDock();
  updateGuide();
  updateLifeLock();
  toast('正在离开热点，去连 '+ssid+'…');
  if(connectingTimer) clearTimeout(connectingTimer);
  connectingTimer=setTimeout(()=>{
    connectingTimer=null;
    portalBusy=false;
    provision={hotspotJoined:false,ssid,hasKey:true,key:apiKey,keyStatus:''};
    persistProvision();
    if(wiringMode==='talk'){
      paintTalkScreen();
      updateTalkDock();
      updateGuide();
      updateLifeLock();
    }
    toast(teacherStation?'已经连上 '+ssid+'。MiniMax key 已收下。下一步请点「检查钥匙」。':'已经连上 '+ssid+'。下一步请点「检查钥匙」。学生页只是练习，不会把钥匙发到网上。');
  },1400);
}
async function checkMiniMaxKey(){
  if(wiringMode!=='talk'||!isOnline(provision)||portalBusy||keyBusy||listenBusy) return;
  if(!provision.key){
    toast('本机没有收过 MiniMax key。请重新打开 192.168.4.1 填写。');
    return;
  }
  const gen=++keyGen;
  keyBusy=true;
  lastHeard=null;
  paintTalkScreen();
  updateTalkDock();
  updateGuide();
  updateLifeLock();
  if(!teacherStation){
    toast('正在练习检查钥匙…不会把钥匙发到网上。');
    await new Promise(r=>setTimeout(r,900));
    if(gen!==keyGen) return;
    provision={...provision,keyStatus:'ok'};
    lastKeyCode='';
    persistProvision();
    toast('练习通过。真的 MiniMax 检查请到老师电脑上的教师台。下一步可以点「开始听」。');
    keyBusy=false;
    if(wiringMode==='talk'){
      paintTalkScreen();
      updateTalkDock();
      updateGuide();
      updateLifeLock();
    }
    return;
  }
  toast('正在检查 MiniMax 钥匙…');
  try{
    const res=await fetch('/api/minimax/health',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({key:provision.key}),
    });
    let data={};
    try{data=await res.json();}catch{data={};}
    if(gen!==keyGen) return;
    const ok=!!data.ok;
    lastKeyCode=ok?'':(data.code||'bad');
    provision={...provision,keyStatus:ok?'ok':'bad'};
    persistProvision();
    toast(data.message||(ok?'钥匙能用。下一步可以点「开始听」。':'钥匙检查没有通过。'));
  }catch{
    if(gen!==keyGen) return;
    lastKeyCode='network';
    provision={...provision,keyStatus:'bad'};
    persistProvision();
    toast('老师电脑连不上检查服务。请确认教师烧录台还开着。');
  }finally{
    if(gen!==keyGen) return;
    keyBusy=false;
    if(wiringMode==='talk'){
      paintTalkScreen();
      updateTalkDock();
      updateGuide();
      updateLifeLock();
    }
  }
}
function stopListenCapture(){
  const rec=listenRec;
  listenRec=null;
  if(!rec) return;
  if(rec.timer) clearTimeout(rec.timer);
  try{rec.processor?.disconnect();}catch{}
  try{rec.mute?.disconnect();}catch{}
  try{rec.source?.disconnect();}catch{}
  try{rec.stream?.getTracks().forEach(t=>t.stop());}catch{}
}
function stopSpeak(){
  const finish=speakFinish;
  const player=speakPlayer;
  const url=speakUrl;
  speakFinish=null;
  speakPlayer=null;
  speakUrl=null;
  if(player){
    try{player.pause();}catch{}
    try{player.removeAttribute('src');player.load();}catch{}
  }
  if(url){
    try{URL.revokeObjectURL(url);}catch{}
  }
  if(finish) finish(false);
}
function playMp3Base64(b64){
  return new Promise(resolve=>{
    stopSpeak();
    const raw=String(b64||'').replace(/\s/g,'');
    if(!raw){resolve(false);return;}
    let bytes;
    try{
      const bin=atob(raw);
      bytes=new Uint8Array(bin.length);
      for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
    }catch{
      resolve(false);
      return;
    }
    if(bytes.length<32){resolve(false);return;}
    const url=URL.createObjectURL(new Blob([bytes],{type:'audio/mpeg'}));
    const audio=new Audio(url);
    speakUrl=url;
    speakPlayer=audio;
    let done=false;
    const finish=ok=>{
      if(done) return;
      done=true;
      if(speakFinish===finish) speakFinish=null;
      if(speakPlayer===audio){
        speakPlayer=null;
        speakUrl=null;
        try{URL.revokeObjectURL(url);}catch{}
      }
      resolve(!!ok);
    };
    speakFinish=finish;
    audio.onended=()=>finish(true);
    audio.onerror=()=>finish(false);
    audio.play().catch(()=>finish(false));
  });
}
function onTalkListen(){
  if(wiringMode!=='talk') return;
  if(listenBusy==='rec'){
    finishListen();
    return;
  }
  startListen();
}
async function startListen(){
  if(wiringMode!=='talk'||portalBusy||keyBusy||listenBusy) return;
  if(!canListen(provision)){
    toast(isOnline(provision)?'已经连上家里的网。请先检查 MiniMax 钥匙。':'还没配网，不能开始听。请先连热点，再打开 192.168.4.1。');
    return;
  }
  if(!teacherStation){
    playStudentTalk();
    return;
  }
  stopSpeak();
  lastHeard=null;
  listenBusy='rec';
  paintTalkScreen();
  updateTalkDock();
  updateGuide();
  updateLifeLock();
  toast('正在听…请对着电脑麦克风说话。说完点「说完了」。');
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
    const ctx=audioCtx||new AudioContext();
    audioCtx=ctx;
    if(ctx.state==='suspended') await ctx.resume();
    const source=ctx.createMediaStreamSource(stream);
    const processor=ctx.createScriptProcessor(4096,1,1);
    const mute=ctx.createGain();
    mute.gain.value=0;
    const chunks=[];
    processor.onaudioprocess=e=>{
      if(listenBusy!=='rec') return;
      chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    source.connect(processor);
    processor.connect(mute);
    mute.connect(ctx.destination);
    listenRec={stream,source,processor,mute,chunks,rate:ctx.sampleRate,started:Date.now(),timer:setTimeout(()=>finishListen(),8000)};
  }catch{
    listenBusy=false;
    lastHeard={ok:false,text:'',message:'没有麦克风权限。请允许老师电脑使用麦克风后再试。',code:'format'};
    paintTalkScreen();
    updateTalkDock();
    updateGuide();
    updateLifeLock();
    toast(lastHeard.message);
  }
}
function waitTalk(ms,gen){
  return new Promise(r=>setTimeout(()=>r(gen===listenGen),ms));
}
async function playStudentTalk(){
  const gen=++listenGen;
  stopSpeak();
  lastHeard=null;
  listenBusy='rec';
  paintTalkScreen();
  updateTalkDock();
  updateGuide();
  updateLifeLock();
  toast('这是练习。屏幕会假装听、想、说。真的 MiniMax 请到老师电脑。');
  if(!await waitTalk(1400,gen)) return;
  lastHeard={ok:true,text:'你好呀',practice:true};
  listenBusy='wait';
  paintTalkScreen();
  updateTalkDock();
  updateGuide();
  updateLifeLock();
  if(!await waitTalk(800,gen)) return;
  listenBusy='think';
  paintTalkScreen();
  updateTalkDock();
  updateGuide();
  updateLifeLock();
  if(!await waitTalk(900,gen)) return;
  lastHeard={ok:true,text:'你好呀',reply:'你好，我在听。',replyOk:true,practice:true};
  listenBusy='speak';
  paintTalkScreen();
  updateTalkDock();
  updateGuide();
  updateLifeLock();
  toast('练习出声。真的 MiniMax 声音只在老师电脑。');
  try{
    await ensureAudio();
    playTone(620);
    await waitTalk(900,gen);
    stopTone();
  }catch{}
  if(gen!==listenGen) return;
  lastHeard={...lastHeard,speakOk:true};
  listenBusy=false;
  paintTalkScreen();
  updateTalkDock();
  updateGuide();
  updateLifeLock();
  toast('练习说完了：你好，我在听。真的对话请到老师电脑。');
}
function finishListen(){
  if(listenBusy!=='rec') return;
  if(!teacherStation) return;
  const rec=listenRec;
  stopListenCapture();
  const elapsed=rec?Date.now()-rec.started:0;
  const merged=mergeFloat32(rec?.chunks||[]);
  if(elapsed<300||merged.length<800){
    listenBusy=false;
    lastHeard={ok:false,text:'',message:'说得太短了。请再靠近麦克风说一次。',code:'empty'};
    paintTalkScreen();
    updateTalkDock();
    updateGuide();
    updateLifeLock();
    toast(lastHeard.message);
    return;
  }
  const pcm=downsample(merged,rec.rate||16000,16000);
  const wav=encodeWav(pcm,16000);
  sendAsr(wavToBase64(wav));
}
async function sendAsr(audio){
  const gen=++listenGen;
  listenBusy='wait';
  paintTalkScreen();
  updateTalkDock();
  updateGuide();
  updateLifeLock();
  toast('正在把声音写成字…');
  try{
    const res=await fetch('/api/minimax/asr',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({key:provision.key,audio,mime:'audio/wav'}),
    });
    let data={};
    try{data=await res.json();}catch{data={};}
    if(gen!==listenGen) return;
    lastHeard={ok:!!data.ok,text:typeof data.text==='string'?data.text:'',message:data.message||'',code:data.code||''};
    if(!data.ok||!lastHeard.text){
      toast(data.message||(data.ok?'没听清。请再靠近麦克风说一次。':'听写没有成功。请再试一次。'));
      listenBusy=false;
      if(wiringMode==='talk'){
        paintTalkScreen();
        updateTalkDock();
        updateGuide();
        updateLifeLock();
      }
      return;
    }
    toast('听见了：'+lastHeard.text);
    await sendChat(lastHeard.text,gen);
  }catch{
    if(gen!==listenGen) return;
    lastHeard={ok:false,text:'',message:'老师电脑连不上听写服务。请确认教师烧录台还开着。',code:'network'};
    toast(lastHeard.message);
    listenBusy=false;
    if(wiringMode==='talk'){
      paintTalkScreen();
      updateTalkDock();
      updateGuide();
      updateLifeLock();
    }
  }
}
async function sendChat(text,gen){
  if(gen!==listenGen) return;
  listenBusy='think';
  paintTalkScreen();
  updateTalkDock();
  updateGuide();
  updateLifeLock();
  toast('听见了。正在想一句短回答…');
  try{
    const res=await fetch('/api/minimax/chat',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({key:provision.key,text}),
    });
    let data={};
    try{data=await res.json();}catch{data={};}
    if(gen!==listenGen) return;
    lastHeard={
      ...(lastHeard||{ok:true,text}),
      ok:true,
      text,
      reply:typeof data.reply==='string'?data.reply:'',
      replyOk:!!data.ok,
      message:data.message||'',
      code:data.ok?'ok':(data.code||'bad'),
    };
    if(!data.ok||!lastHeard.reply){
      toast(data.message||(data.ok?'它想了一下，但没写出字。':'它没有想出回答。请再试一次。'));
      listenBusy=false;
      if(wiringMode==='talk'){
        paintTalkScreen();
        updateTalkDock();
        updateGuide();
        updateLifeLock();
      }
      return;
    }
    toast('它写下了：'+lastHeard.reply);
    await sendTts(lastHeard.reply,gen);
  }catch{
    if(gen!==listenGen) return;
    lastHeard={...(lastHeard||{ok:true,text}),ok:true,text,reply:'',replyOk:false,message:'老师电脑连不上回答服务。请确认教师烧录台还开着。',code:'network'};
    toast(lastHeard.message);
    listenBusy=false;
    if(wiringMode==='talk'){
      paintTalkScreen();
      updateTalkDock();
      updateGuide();
      updateLifeLock();
    }
  }
}
async function sendTts(reply,gen){
  if(gen!==listenGen) return;
  listenBusy='speak';
  paintTalkScreen();
  updateTalkDock();
  updateGuide();
  updateLifeLock();
  toast('正在说话…请听电脑喇叭。');
  try{
    const res=await fetch('/api/minimax/tts',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({key:provision.key,text:reply}),
    });
    let data={};
    try{data=await res.json();}catch{data={};}
    if(gen!==listenGen) return;
    lastHeard={
      ...(lastHeard||{ok:true,reply}),
      ok:true,
      reply,
      replyOk:true,
      speakOk:!!data.ok,
      message:data.message||'',
      code:data.ok?'ok':(data.code||'bad'),
    };
    if(!data.ok||!data.audio){
      toast(data.message||'它写下了回答，但没有发出声音。请再试一次。');
      return;
    }
    const played=await playMp3Base64(data.audio);
    if(gen!==listenGen) return;
    if(!played){
      lastHeard={...lastHeard,speakOk:false,message:'电脑喇叭没有播出声音。请检查音量后再试。',code:'bad'};
      toast(lastHeard.message);
      return;
    }
    toast(lastHeard.reply?'它说了：'+lastHeard.reply:'它说完了。');
  }catch{
    if(gen!==listenGen) return;
    lastHeard={...(lastHeard||{ok:true,reply}),ok:true,reply,replyOk:true,speakOk:false,message:'老师电脑连不上出声服务。请确认教师烧录台还开着。',code:'network'};
    toast(lastHeard.message);
  }finally{
    if(gen!==listenGen) return;
    listenBusy=false;
    if(wiringMode==='talk'){
      paintTalkScreen();
      updateTalkDock();
      updateGuide();
      updateLifeLock();
    }
  }
}
function openPhone(){
  if(wiringMode!=='talk') return;
  if(portalBusy){toast('机器人正在连家里的网，请稍等。');return;}
  if(isOnline(provision)){toast(canListen(provision)?'已经配上网。请点「开始听」。':'已经配上网。请先检查 MiniMax 钥匙。');return;}
  if(!provision.hotspotJoined){toast('请先点「手机连上热点」。真机上也要先连上 DeskBuddy 这个 Wi-Fi。');return;}
  renderPhoneForm();
  $('phone-portal')?.showModal();
}
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
  toast(wiringMode==='talk'?'先看中间的配网步骤：连热点，再打开 192.168.4.1。':'先按下面的接线指导，把屏幕四根线接上。');
});
$('life-lock-ready')?.addEventListener('click',()=>setWiringMode('ready'));
$('life-lock-phone')?.addEventListener('click',openPhone);
updateLifeLock();
updateLifeToggle();
$('toggle-life')?.addEventListener('click',()=>setLifeOpen(!lifeOpen));
$('mode-blocks').onclick=()=>setEditorMode('blocks');
$('mode-code').onclick=()=>setEditorMode('code');
$('load-block-example').onclick=()=>{
  const opt=$('block-example').selectedOptions[0];
  if(opt?.disabled){toast('这个示例要下一课的零件。先把这一课的线接完。');return;}
  if(!confirm('载入积木示例会替换当前积木，是否继续？'))return;
  const opt2=$('block-example').selectedOptions[0];
  if(opt2?.disabled){toast('这个示例要下一课的零件。先把这一课的线接完。');return;}
  stop('积木示例已载入');
  blocksUI.setProgram(recipe($('block-example').value));
  refreshBlocksCode();
  updateHistoryButtons();
};
$('run').onclick=run;$('stop').onclick=()=>stop();$('clearlog').onclick=()=>{logs=[];$('log').textContent='';};$('help').onclick=()=>$('helpdialog').showModal();$('top').onclick=()=>{table?.setMode('top');$('top').classList.add('active');$('three').classList.remove('active');$('scenehint').textContent=sceneHint();};$('xray').onclick=()=>{const on=$('xray').getAttribute('aria-pressed')!=='true';$('xray').setAttribute('aria-pressed',String(on));table?.setXray(on);$('xray').classList.toggle('active',on);};$('three').onclick=()=>{table?.setMode('three');$('three').classList.add('active');$('top').classList.remove('active');$('scenehint').textContent=sceneHint();};$('resetview').onclick=()=>{table?.center();showZoom();};$('zoom-in').onclick=()=>table?.zoomBy(1.2);$('zoom-out').onclick=()=>table?.zoomBy(1/1.2);$('zoom-reset').onclick=()=>table?.zoomTo(1);$('mode-custom').onclick=()=>setWiringMode('custom');$('mode-ready').onclick=()=>setWiringMode('ready');$('mode-talk')?.addEventListener('click',()=>setWiringMode('talk'));
$('talk-join')?.addEventListener('click',joinHotspot);
$('talk-open')?.addEventListener('click',openPhone);
$('talk-check')?.addEventListener('click',checkMiniMaxKey);
$('talk-forget')?.addEventListener('click',forgetNetwork);
$('talk-listen')?.addEventListener('click',onTalkListen);
$('talk-connect')?.addEventListener('click',()=>$('connect-board')?.click());
$('talk-flash')?.addEventListener('click',flashTalkFirmware);$('remove').onclick=()=>{if(wiringFrozen()||!selected)return;const id=selected;stop('零件已收回');const board=table.state();wires=wires.filter(w=>!wireTouchesPart(w,id,board));table.setActive(id,false);pending=null;selectedWire=null;table.select(null);commitWireHistory();updateWires();};$('remove-wire').onclick=()=>{if(wiringFrozen()||!Number.isInteger(selectedWire))return;deleteWireAt(selectedWire);toast('这根线已拿掉。');};$('step-back').onclick=stepBack;$('step-forward').onclick=stepForward;
function lesson(){stop();table.center();switchLesson(currentLesson,{restart:true});}
$('lesson').onclick=()=>{const name=lessons[currentLesson-1].name;const msg=currentLesson===1?`重新开始${name}？零件和接线会重置，积木和代码会保留。`:`重新开始${name}？这一课新接的线会清掉，上一课的线还在。积木和代码会保留。`;if(confirm(msg))lesson();};$('loadexample').onclick=()=>{const opt=$('example').selectedOptions[0];if(opt?.disabled){toast('这个示例要下一课的零件。先把这一课的线接完，或点「已经接好」再载入。');return;}if(editor.value!==lastProgram&&editor.value!==examples.eyes&&!confirm('载入示例会替换编辑器中的代码，是否继续？'))return;stop('示例已载入');editor.value=examples[$('example').value];lastProgram=editor.value;numbers();updateHistoryButtons();};
editor.addEventListener('input',()=>{numbers();if(controller)stop('代码已修改，请重新运行');});editor.addEventListener('scroll',()=>{$('numbers').scrollTop=editor.scrollTop;});editor.addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();const start=editor.selectionStart,end=editor.selectionEnd;editor.setRangeText('  ',start,end,'end');editor.dispatchEvent(new Event('input'));}if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();run();}});
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
function project(){return{version:3,editorMode,code:editor.value,blocks:blocksUI.getProgram(),parts:table.state(),wires};}
function exportCode(){const sketch=currentSketch();download('desk-buddy.ino',sketch,'text/x-c++src;charset=utf-8');toast('代码文件已下载，发给老师就好。');}
function showHandoff(){$('handoff-code').value=currentSketch();$('handoffdialog').showModal();}
async function copyCode(){const code=currentSketch();try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(code);}else{const field=$('handoff-code');field.focus();field.select();if(!document.execCommand('copy'))throw Error('复制不可用');}toast('代码已复制！现在把它粘贴发给老师。');}catch{toast('复制没有成功，试试点击“下载 .ino”。');}}
$('handoff').onclick=showHandoff;$('copy-code').onclick=copyCode;
$('save').onclick=()=>{if(!table)return;download('desk-buddy.json',JSON.stringify(project(),null,2),'application/json');toast('作品已保存到下载文件夹');};$('export').onclick=exportCode;$('open').onclick=()=>$('file').click();$('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;try{if(file.size>200000)throw Error('文件太大');const data=await file.text();if(!confirm('打开文件会替换当前作品中的相应内容，是否继续？'))return;if(file.name.endsWith('.ino')){stop('代码已打开');editor.value=data;lessonEditorMode='code';setEditorMode('code',true);numbers();}else{const p=validateProject(JSON.parse(data));stop('作品已打开');editor.value=p.code;table.restore(p.parts);wires=p.wires.map(w=>({a:w.a,b:w.b}));pending=null;selectedWire=null;selected=null;table.select(null);commitWireHistory();updateWires();updateSelectionBar();blocksUI.setProgram(p.version===3&&p.blocks?validateProgram(p.blocks):defaultProgram());refreshBlocksCode();const next=p.version===3?(p.editorMode==='code'?'code':'blocks'):'code';lessonEditorMode=next;setEditorMode(next,true);}numbers();lastProgram=editorMode==='blocks'?generateSketch(blocksUI.getProgram()):editor.value;}catch(e){toast('打开失败：'+e.message);}$('file').value='';};
try{table=await createTable($('viewport'),canvas,{pin:connect,select:selectedPart,pickWire,change:()=>{stop('孔位已更改，请重新运行');pending=null;selectedWire=null;if(wiringMode==='ready')applyReadyWiring();if(wiringMode==='talk'){applyTalkWiring();paintTalkScreen();}commitWireHistory();updateWires();},message:toast,zoom:showZoom});table.center();showZoom(1);switchLesson(1);if(completedLessons.length)toast('课程还记得：已完成的课仍然解锁。桌上的线要重新接，也可以打开上次保存的作品。');$('loading').remove();}catch(e){$('loading').textContent='三维零件加载失败，请刷新页面。'+e.message;log(e.message);$('run').disabled=true;}
window.addEventListener('keydown',e=>{
  const typing=/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)||e.target.isContentEditable;
  if(e.key==='Escape'){
    const anyDialogOpen=document.querySelector('dialog[open]');
    if(anyDialogOpen) return;
    if(wiringFrozen()) return;
    pending=null;
    pickWire(null);
    updateGuide();
    return;
  }
  if(typing) return;
  if(wiringFrozen()) return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey) stepForward(); else stepBack();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();stepForward();return;}
  if((e.key==='Delete'||e.key==='Backspace')&&Number.isInteger(selectedWire)){e.preventDefault();deleteWireAt(selectedWire);toast('这根线已拿掉。');}
});
// Optional browser tool interface uses the exact same state and validation.
if(document.modelContext?.registerTool){const life=new AbortController();window.addEventListener('pagehide',()=>life.abort(),{once:true});for(const tool of [{name:'read_desk_buddy_project',description:'Read the current virtual Desk Buddy code, parts and wiring.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(){if(!table)throw Error('尚未加载完成');return project();}},{name:'check_desk_buddy_code',description:'Check supported Arduino syntax without starting the program or modifying the circuit.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(){if(editorMode==='blocks'){const sketch=generateSketch(blocksUI.getProgram());return{valid:true,mode:'blocks',sketch,circuit:checkCircuit(wires,active())};}const p=compile(editor.value);return{valid:true,functions:Object.keys(p.functions),circuit:checkCircuit(wires,active())};}}])Promise.resolve(document.modelContext.registerTool(tool,{signal:life.signal})).catch(()=>{});}

// 烧录功能
let espPort = null;
let espTransport = null;
let espLoader = null;

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
    }, { once: true });
    
    isConnected = true;
    $('connect-board').textContent = `✓ 已连接: ${chipName}`;
    $('connect-board').style.display = 'none';  // 修复 H10: 隐藏连接按钮
    $('disconnect-board').style.display = '';    // 显示断开按钮
    $('flash').disabled = false;
    if(wiringMode==='talk') updateTalkDock();
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
  if(wiringMode==='talk') updateTalkDock();
  toast('已断开连接');
};

async function flashSketch(code, doneToast) {
  if (!teacherStation) { toast('烧录只在老师电脑上的教师烧录台进行。'); return; }
  if (!isConnected) {
    toast('请先连接板子');
    return;
  }
  try {
    $('flash').disabled = true;
    $('talk-flash') && ($('talk-flash').disabled = true);
    $('connect-board').disabled = true;
    toast('正在编译程序...');
    $('status').textContent = '编译中...';
    const compileRes = await fetch('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
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
    $('status').textContent = '准备烧录...';
    try {
      await espLoader.connect('default_reset');
      console.log('[烧录] 重新同步 bootloader');
    } catch (e) {
      console.warn('[烧录] 同步警告:', e.message);
    }
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
      reportProgress: (fileIndex, written, total) => {
        const percent = total > 0 ? Math.round((written / total) * 100) : 0;
        $('status').textContent = `烧录中 ${percent}%`;
      }
    });
    $('status').textContent = '烧录成功！';
    toast(doneToast || '✅ 烧录成功！板子正在运行程序');
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
    if (wiringMode === 'talk') updateTalkDock();
  }
}
async function flashTalkFirmware() {
  if (wiringMode !== 'talk') return;
  if (!teacherStation) { toast('烧录只在老师电脑上的教师烧录台进行。'); return; }
  toast('正在读取对话固件…');
  const res = await fetch('./firmware/desk-buddy-talk.ino');
  if (!res.ok) { toast('找不到对话固件文件。请确认教师烧录台还开着。'); return; }
  const code = await res.text();
  if (!code.includes('192.168.4.1') || !code.includes('speech_to_text')) {
    toast('对话固件文件不完整。');
    return;
  }
  await flashSketch(code, '✅ 对话固件已烧录。拔掉再插 USB，屏幕应出现热点名。手机连上后打开 192.168.4.1。短按说话键听，长按 4 秒忘记网络。');
}
$('flash').onclick = async () => {
  if (wiringMode === 'talk') {
    await flashTalkFirmware();
    return;
  }
  await flashSketch(currentSketch(), '✅ 烧录成功！板子正在运行程序');
};
