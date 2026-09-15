// Deterministic monochrome framebuffer with a small 5x7 ASCII font.
const FONT={A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],G:['01111','10000','10000','10111','10001','10001','01111'],H:['10001','10001','10001','11111','10001','10001','10001'],I:['111','010','010','010','010','010','111'],J:['00111','00010','00010','00010','10010','10010','01100'],K:['10001','10010','10100','11000','10100','10010','10001'],L:['10000','10000','10000','10000','10000','10000','11111'],M:['10001','11011','10101','10101','10001','10001','10001'],N:['10001','11001','10101','10011','10001','10001','10001'],O:['01110','10001','10001','10001','10001','10001','01110'],P:['11110','10001','10001','11110','10000','10000','10000'],Q:['01110','10001','10001','10001','10101','10010','01101'],R:['11110','10001','10001','11110','10100','10010','10001'],S:['01111','10000','10000','01110','00001','00001','11110'],T:['11111','00100','00100','00100','00100','00100','00100'],U:['10001','10001','10001','10001','10001','10001','01110'],V:['10001','10001','10001','10001','10001','01010','00100'],W:['10001','10001','10001','10101','10101','11011','10001'],X:['10001','10001','01010','00100','01010','10001','10001'],Y:['10001','10001','01010','00100','00100','00100','00100'],Z:['11111','00001','00010','00100','01000','10000','11111'],'0':['01110','10001','10011','10101','11001','10001','01110'],'1':['00100','01100','00100','00100','00100','00100','01110'],'2':['01110','10001','00001','00010','00100','01000','11111'],'3':['11110','00001','00001','01110','00001','00001','11110'],'4':['00010','00110','01010','10010','11111','00010','00010'],'5':['11111','10000','10000','11110','00001','00001','11110'],'6':['01110','10000','10000','11110','10001','10001','01110'],'7':['11111','00001','00010','00100','01000','01000','01000'],'8':['01110','10001','10001','01110','10001','10001','01110'],'9':['01110','10001','10001','01111','00001','00001','01110'],'!':['1','1','1','1','1','0','1'],'?':['01110','10001','00001','00010','00100','00000','00100'],'.':['0','0','0','0','0','1','1'],':':['0','1','1','0','1','1','0'],'-':['00000','00000','00000','11111','00000','00000','00000'],'%':['11001','11010','00100','01000','00100','01011','10011'],'/':['00001','00010','00100','01000','10000','00000','00000'],'+':['00000','00100','00100','11111','00100','00100','00000'],' ':[]};
export class Display{
 constructor(){this.pixels=new Uint8Array(128*64);this.reset();}
 reset(){this.pixels.fill(0);this.x=0;this.y=0;this.size=1;this.color=1;this.invert=false;}
 pixel(x,y,c=1){x=Math.trunc(x);y=Math.trunc(y);if(x>=0&&x<128&&y>=0&&y<64){let i=y*128+x;this.pixels[i]=c===2?1-this.pixels[i]:c?1:0;}}
 line(x,y,x1,y1,c){[x,y,x1,y1]=[x,y,x1,y1].map(Math.trunc);let dx=Math.abs(x1-x),sx=x<x1?1:-1,dy=-Math.abs(y1-y),sy=y<y1?1:-1,e=dx+dy;for(let n=0;n<4096;n++){this.pixel(x,y,c);if(x===x1&&y===y1)break;let e2=2*e;if(e2>=dy){e+=dy;x+=sx;}if(e2<=dx){e+=dx;y+=sy;}}}
 rect(x,y,w,h,c,fill=false,r=0){[x,y,w,h,r]=[x,y,w,h,r].map(Math.trunc);r=Math.max(0,Math.min(r,w/2,h/2));for(let yy=Math.max(0,y);yy<Math.min(64,y+h);yy++)for(let xx=Math.max(0,x);xx<Math.min(128,x+w);xx++){let inside=(px,py)=>{if(px<x||px>=x+w||py<y||py>=y+h)return false;let cx=Math.max(x+r-.5,Math.min(px,x+w-r-.5)),cy=Math.max(y+r-.5,Math.min(py,y+h-r-.5));return !r||((px-cx)**2+(py-cy)**2<=r*r);};if(inside(xx,yy)&&(fill||!inside(xx-1,yy)||!inside(xx+1,yy)||!inside(xx,yy-1)||!inside(xx,yy+1)))this.pixel(xx,yy,c);}}
 circle(x,y,r,c,fill=false){[x,y,r]=[x,y,r].map(Math.trunc);if(r<0||r>1024)throw Error('圆的半径请使用 0–1024');if(fill){for(let yy=Math.max(0,y-r);yy<=Math.min(63,y+r);yy++)for(let xx=Math.max(0,x-r);xx<=Math.min(127,x+r);xx++)if((xx-x)**2+(yy-y)**2<=r*r)this.pixel(xx,yy,c);}else{let px=0,py=r,d=1-r;while(px<=py){for(const [a,b] of [[px,py],[py,px],[-px,py],[-py,px],[px,-py],[py,-px],[-px,-py],[-py,-px]])this.pixel(x+a,y+b,c);px++;if(d<0)d+=2*px+1;else{py--;d+=2*(px-py)+1;}}}}
	 print(v,newline=false){for(const ch of String(v)){if(ch==='\n'){this.x=0;this.y+=8*this.size;continue;}if(this.x+6*this.size>128){this.x=0;this.y+=8*this.size;}const glyph=FONT[ch.toUpperCase()];if(!glyph){this.x+=6*this.size;continue;}glyph.forEach((row,y)=>[...row].forEach((v,x)=>{if(v==='1')this.rect(this.x+x*this.size,this.y+y*this.size,this.size,this.size,this.color,true);}));this.x+=6*this.size;}if(newline){this.x=0;this.y+=8*this.size;}}
	 render(ctx,on=true){const im=ctx.createImageData(128,64);for(let i=0;i<this.pixels.length;i++){const lit=on&&(this.invert?!this.pixels[i]:this.pixels[i]);im.data.set(lit?[126,235,255,255]:[5,13,20,255],i*4);}ctx.putImageData(im,0,0);}
		 paintHotspot(ssid){
		  this.reset();
		  this.size=1;
		  this.color=1;
		  this.x=0;this.y=0;
		  this.print('PLUG USB',true);
		  this.print('WIFI AP:',true);
		  this.print(String(ssid||'DeskBuddy'),true);
		  this.print('OPEN',true);
		  this.print('192.168.4.1',true);
		 }
		 paintConnecting(){
		  this.reset();
		  this.size=1;
		  this.color=1;
		  this.x=0;this.y=0;
		  this.print('PLUG USB',true);
		  this.print('WIFI...',true);
		  this.print('JOINING',true);
		  this.print('HOME NET',true);
		 }
			 paintWifiOk(ssid){
			  this.reset();
			  this.size=1;
			  this.color=1;
			  this.x=0;this.y=0;
			  this.print('WIFI OK',true);
			  this.print('JOINED',true);
			  const ascii=String(ssid||'').replace(/[^\x20-\x7E]/g,'').trim().slice(0,16);
			  this.print(ascii||'HOME WIFI',true);
			  this.print('WAIT KEY',true);
			 }
			 paintKeyCheck(){
			  this.reset();
			  this.size=1;
			  this.color=1;
			  this.x=0;this.y=0;
			  this.print('WIFI OK',true);
			  this.print('KEY...',true);
			  this.print('CHECKING',true);
			 }
			 paintKeyOk(){
			  this.reset();
			  this.size=1;
			  this.color=1;
			  this.x=0;this.y=0;
			  this.print('WIFI OK',true);
			  this.print('KEY OK',true);
			  this.print('WAIT TALK',true);
			 }
				 paintKeyBad(){
				  this.reset();
				  this.size=1;
				  this.color=1;
				  this.x=0;this.y=0;
				  this.print('WIFI OK',true);
				  this.print('KEY BAD',true);
				  this.print('RETRY KEY',true);
				 }
				 paintListening(){
				  this.reset();
				  this.size=1;
				  this.color=1;
				  this.x=0;this.y=0;
				  this.print('WIFI OK',true);
				  this.print('LISTEN',true);
				  this.print('SPEAK NOW',true);
				 }
				 paintListenWait(){
				  this.reset();
				  this.size=1;
				  this.color=1;
				  this.x=0;this.y=0;
				  this.print('WIFI OK',true);
				  this.print('LISTEN',true);
				  this.print('WRITING',true);
				 }
				 paintHeard(text){
				  this.reset();
				  this.size=1;
				  this.color=1;
				  this.x=0;this.y=0;
				  const raw=String(text||'').replace(/\s+/g,' ').trim();
				  const ascii=raw.replace(/[^\x20-\x7E]/g,'').trim().slice(0,32);
				  if(!raw){
				    this.print('DIDNT HEAR',true);
				    this.print('TRY AGAIN',true);
				    return;
				  }
				  this.print('HEARD',true);
				  if(!ascii){
				    this.print('CHINESE',true);
				    this.print('SEE TOAST',true);
				    return;
				  }
				  this.print(ascii.slice(0,16),true);
				  if(ascii.length>16) this.print(ascii.slice(16,32),true);
				 }
				 paintListenBad(){
				  this.reset();
				  this.size=1;
				  this.color=1;
				  this.x=0;this.y=0;
				  this.print('LISTEN BAD',true);
				  this.print('RETRY',true);
				 }
				 paintThinking(){
				  this.reset();
				  this.size=1;
				  this.color=1;
				  this.x=0;this.y=0;
				  this.print('WIFI OK',true);
				  this.print('THINK...',true);
				  this.print('WRITING',true);
				 }
				 paintReply(text){
				  this.reset();
				  this.size=1;
				  this.color=1;
				  this.x=0;this.y=0;
				  const raw=String(text||'').replace(/\s+/g,' ').trim();
				  const ascii=raw.replace(/[^\x20-\x7E]/g,'').trim().slice(0,32);
				  this.print('REPLY',true);
				  if(!raw){
				    this.print('NO TEXT',true);
				    this.print('TRY AGAIN',true);
				    return;
				  }
				  if(!ascii){
				    this.print('CHINESE',true);
				    this.print('SEE TOAST',true);
				    return;
				  }
				  this.print(ascii.slice(0,16),true);
				  if(ascii.length>16) this.print(ascii.slice(16,32),true);
				 }
					 paintReplyBad(){
					  this.reset();
					  this.size=1;
					  this.color=1;
					  this.x=0;this.y=0;
					  this.print('REPLY BAD',true);
					  this.print('RETRY',true);
					 }
					 paintSpeaking(){
					  this.reset();
					  this.size=1;
					  this.color=1;
					  this.x=0;this.y=0;
					  this.print('WIFI OK',true);
					  this.print('SPEAKING',true);
					  this.print('LISTEN',true);
					 }
					 paintSpeakBad(){
					  this.reset();
					  this.size=1;
					  this.color=1;
					  this.x=0;this.y=0;
					  this.print('SPEAK BAD',true);
					  this.print('RETRY',true);
					 }
				}
