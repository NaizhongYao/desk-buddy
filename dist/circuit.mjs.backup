export const definitions=[
 {id:'oled',name:'0.96 寸 OLED',detail:'128 × 64 屏幕',color:'#12618d',model:0,pos:[24,12],pins:[['GND',-3.81,11.9],['VCC',-1.27,11.9],['SCL',1.27,11.9],['SDA',3.81,11.9]]},
 {id:'esp',name:'ESP32-C3',detail:'SuperMini 主控',color:'#253139',model:1,pos:[-26,10],pins:[...['5V','G','3.3','4','3','2','1','0'].map((n,i)=>[n,7.62,8.89-i*2.54]),...['5','6','7','8','9','10','20','21'].map((n,i)=>[n,-7.62,8.89-i*2.54])]},
 {id:'amp',name:'MAX98357A',detail:'功放 · tone() 走电脑喇叭',color:'#982972',model:2,pos:[-26,-28],pins:[...['LRC','BCLK','DIN','GAIN','SD','GND','Vin'].map((n,i)=>[n,(i-3)*2.54,-8.35]),['-',-2.05,10],['+',2.05,10]]},
 {id:'mic',name:'MSM3526',detail:'麦克风 · analogRead() 走电脑麦克风',color:'#d1a60b',model:3,pos:[0,-26],pins:[...['L/R','WS','SCK'].map((n,i)=>[n,-4.4,-2.54+i*2.54]),...['GND','VDD','SD'].map((n,i)=>[n,4.4,-2.54+i*2.54])]},
 {id:'speaker',name:'喇叭',detail:'8Ω 0.5W · 虚拟运行走电脑喇叭',color:'#606b73',model:4,pos:[33,-24],pins:[['-',20,20],['+',23,20]]}
];
export const pinIds=new Set(definitions.flatMap(d=>d.pins.map(p=>d.id+':'+p[0])));
export const lessonWires=[['oled:GND','esp:G','地线 GND','把 OLED 的 GND 接到 ESP32 的 G。'],['oled:VCC','esp:3.3','电源 VCC','把 OLED 的 VCC 接到 ESP32 的 3.3。'],['oled:SCL','esp:4','时钟 SCL','把 OLED 的 SCL 接到 ESP32 的 4。'],['oled:SDA','esp:5','数据 SDA','把 OLED 的 SDA 接到 ESP32 的 5。']];
export function connected(wires,a,b){const seen=new Set([a]),q=[a];while(q.length){const c=q.pop();if(c===b)return true;for(const w of wires){const next=w.a===c?w.b:w.b===c?w.a:null;if(next&&!seen.has(next)){seen.add(next);q.push(next);}}}return false;}
export function checkCircuit(wires,active,sda=5,scl=4){
 const errors=[];for(const [a,b] of [['esp:G','esp:3.3'],['esp:G','esp:5V'],['esp:3.3','esp:5V']])if(connected(wires,a,b))errors.push('电源短接：'+a.split(':')[1]+' 与 '+b.split(':')[1]+' 不能连接。');
 if(!active.includes('esp'))errors.push('请先放入 ESP32 主控。');
 const powered=active.includes('oled')&&connected(wires,'oled:GND','esp:G')&&connected(wires,'oled:VCC','esp:3.3');
 const bus=Number.isInteger(sda)&&Number.isInteger(scl)&&sda!==scl&&connected(wires,'oled:SDA','esp:'+sda)&&connected(wires,'oled:SCL','esp:'+scl);
 const pins=[...new Set(wires.flatMap(w=>[w.a,w.b]))].filter(x=>x.startsWith('esp:'));
 for(let i=0;i<pins.length;i++)for(let j=i+1;j<pins.length;j++)if(connected(wires,pins[i],pins[j])&&!errors.length)errors.push('两个不同的 ESP32 引脚被接到一起，请检查接线。');
 return{errors,powered,bus,ready:powered&&bus&&!errors.length};
}
export function validateProject(p){if(!p||p.version!==1||typeof p.code!=='string'||p.code.length>50000||!Array.isArray(p.parts)||!Array.isArray(p.wires)||p.wires.length>80||p.parts.length>5)throw Error('作品格式不正确或内容过大');let ids=new Set();for(const d of p.parts){if(!definitions.some(x=>x.id===d.id)||ids.has(d.id)||!Array.isArray(d.pos)||d.pos.length!==2||!d.pos.every(n=>Number.isFinite(n)&&Math.abs(n)<150)||!Number.isFinite(d.rotation)||Math.abs(d.rotation)>100||typeof d.flipped!=='boolean')throw Error('零件数据不正确');ids.add(d.id);}for(const w of p.wires){if(!pinIds.has(w.a)||!pinIds.has(w.b)||w.a===w.b||![w.a,w.b].every(x=>ids.has(x.split(':')[0])))throw Error('接线数据不正确');}return p;}
