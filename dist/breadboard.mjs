export const holes=[];
const xs=[-13.97,-11.43,-8.89,-6.35,-3.81,3.81,6.35,8.89,11.43,13.97];
for(let r=1;r<=30;r++)for(let c=0;c<10;c++)holes.push({id:`bb:${'abcdefghij'[c]}${r}`,x:xs[c],y:(15.5-r)*2.54,net:`${c<5?'L':'R'}${r}`});
for(let side=0;side<2;side++)for(let polarity=0;polarity<2;polarity++)for(let n=1;n<=25;n++)holes.push({id:`bb:${side?'R':'L'}${polarity?'-':'+'}${n}`,x:(side?1:-1)*(polarity?23:20.46),y:34.29-(n-1+Math.floor((n-1)/5))*2.54,net:`${side?'R':'L'}${polarity?'-':'+'}`});
export const holeMap=new Map(holes.map(h=>[h.id,h]));
export const internal=[];
for(const net of new Set(holes.map(h=>h.net))){const group=holes.filter(h=>h.net===net);for(const h of group.slice(1))internal.push({a:group[0].id,b:h.id});}
export const defaults={esp:2,oled:12,amp:18,mic:27,speaker:30};
export function footprint(id,row=defaults[id]){
 let pairs=[];
 if(id==='esp')pairs=[...['5V','G','3.3','4','3','2','1','0'].map((p,i)=>[p,'h',i]),...['5','6','7','8','9','10','20','21'].map((p,i)=>[p,'d',i])];
 if(id==='oled')pairs=['GND','VCC','SCL','SDA'].map((p,i)=>[p,'j',3-i]);
 if(id==='amp')pairs=[...['LRC','BCLK','DIN','GAIN','SD','GND','Vin'].map((p,i)=>[p,'a',6-i]),['+','b',7],['-','b',8]];
 if(id==='mic')pairs=[...['L/R','WS','SCK'].map((p,i)=>[p,'d',i]),...['GND','VDD','SD'].map((p,i)=>[p,'f',i])];
 if(id==='speaker')pairs=[['-','a',0],['+','j',0]];
 return pairs.map(([p,c,i])=>({a:`${id}:${p}`,b:`bb:${c}${row+i}`}));
}
export function placement(id,row=defaults[id]){const y=(15.5-row)*2.54;return{id,row,pos:id==='esp'?[1.27,y-8.89]:id==='oled'?[25.87,y-3.81]:id==='amp'?[-22.32,y-7.62]:id==='mic'?[0,y-2.54]:[43,-35],rotation:id==='oled'||id==='amp'?Math.PI/2:0,flipped:false};}
export function rowOf(p){return Number.isInteger(p.row)?p.row:defaults[p.id];}
export function boardEdges(parts){return[...internal,...parts.flatMap(p=>footprint(p.id,rowOf(p)))];}
export function occupied(parts,wires=[]){return new Set([...parts.flatMap(p=>footprint(p.id,rowOf(p)).map(e=>e.b)),...wires.flatMap(w=>[w.a,w.b])]);}
export function validPlacement(parts,id,row,wires=[]){const fp=footprint(id,row),used=occupied(parts.filter(p=>p.id!==id),wires);if(fp.some(e=>!holeMap.has(e.b)||used.has(e.b)))return false;const rows=fp.map(e=>+e.b.match(/\d+$/)[0]);return !parts.filter(p=>p.id!==id&&p.id!=='speaker'&&id!=='speaker').some(p=>{const other=footprint(p.id,rowOf(p)).map(e=>+e.b.match(/\d+$/)[0]);return Math.min(...rows)<=Math.max(...other)&&Math.max(...rows)>=Math.min(...other);});}
