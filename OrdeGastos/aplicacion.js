/* Megaste 0.2.1 · 30/oct/2026 · Diseño: Arley Zarate · Desarrollo: NOVA
   Sin peticiones HTTP, telemetría ni dependencias externas. */
(() => {
'use strict';
const W=215.9,H=279.4,MM_TO_PT=72/25.4,ROWS_PER_INDEX=20;
const $=id=>document.getElementById(id);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={receipts:[],margins:{top:10,bottom:10,left:10,right:10},gap:2,mode:'auto',columns:[],layout:{pages:[],unplaced:[],order:[]},displayOrder:[],coverCount:1,busy:false};
let pageInView=0,toastTimer=null,selectedReceipt=null;
const enc=new TextEncoder(),dec=new TextDecoder();
const mm=v=>Math.round(v*100)/100;
function message(text){const el=$('toast');el.textContent=text;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3200)}
function setBusy(on,task='Procesando'){state.busy=on;for(const id of ['guardar','abrir','pdf','imagenes','entrada','entrada-proyecto'])$(id).disabled=on; if(on)message(task)}
function idNew(){return 'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,9)}
function clamp(v,lo,hi){return Math.min(hi,Math.max(lo,v))}
function median(a){if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2}
function blobToImage(blob){return new Promise((res,rej)=>{const image=new Image();const src=URL.createObjectURL(blob);image.onload=()=>res({image,url:src});image.onerror=()=>{URL.revokeObjectURL(src);rej(new Error('No se pudo abrir la imagen'))};image.src=src})}

/* Medición preliminar: binarización Otsu + componentes conexos para estimar alturas
   de glifos, tanto texto oscuro/claro. No descifra texto ni corrige perspectiva. */
function otsu(hist,total){let sum=0;for(let i=0;i<256;i++)sum+=i*hist[i];let sb=0,wb=0,best=0,t=127;for(let i=0;i<256;i++){wb+=hist[i];if(!wb)continue;let wf=total-wb;if(!wf)break;sb+=i*hist[i];let d=sb/wb-(sum-sb)/wf;let v=wb*wf*d*d;if(v>best){best=v;t=i}}return t}
function components(gray,w,h,threshold,light){const mask=new Uint8Array(w*h),seen=new Uint8Array(w*h),hist=[];let n=0;
  for(let i=0;i<mask.length;i++){if((light?gray[i]>threshold:gray[i]<threshold)){mask[i]=1;n++}}
  if(n<30||n>mask.length*.48)return [];
  const stack=new Int32Array(w*h),heights=[];
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const p=y*w+x;if(!mask[p]||seen[p])continue;let head=0,tail=1;stack[0]=p;seen[p]=1;let minx=x,maxx=x,miny=y,maxy=y,count=0;
    while(head<tail){const v=stack[head++],xx=v%w,yy=(v/w)|0;count++;if(xx<minx)minx=xx;if(xx>maxx)maxx=xx;if(yy<miny)miny=yy;if(yy>maxy)maxy=yy;
      for(const step of [-w,w,-1,1]){const k=v+step;if(k<0||k>=mask.length||seen[k]||!mask[k])continue;if(step===-1&&xx===0||step===1&&xx===w-1)continue;seen[k]=1;stack[tail++]=k}
    }
    const bw=maxx-minx+1,bh=maxy-miny+1,ratio=bw/bh,fill=count/(bw*bh);
    if(bh>=4&&bh<=h*.078&&bw>=1&&bw<=w*.13&&ratio>=.07&&ratio<=2.3&&fill>=.075&&fill<=.96&&count>=5){heights.push(bh)}
  }
  return heights;
}
function detectTextHeight(image){const w0=image.naturalWidth,h0=image.naturalHeight;const f=Math.min(1,1000/Math.max(w0,h0));const w=Math.max(1,Math.round(w0*f)),h=Math.max(1,Math.round(h0*f));
  const c=document.createElement('canvas');c.width=w;c.height=h;let ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(image,0,0,w,h);const data=ctx.getImageData(0,0,w,h).data,gray=new Uint8Array(w*h),hist=new Uint32Array(256);let i=0;
  for(let p=0;p<data.length;p+=4){const a=data[p+3]/255,g=Math.round((.2126*data[p]+.7152*data[p+1]+.0722*data[p+2])*a+255*(1-a));gray[i++]=g;hist[g]++}
  const thr=otsu(hist,gray.length), candidates=[components(gray,w,h,thr,false),components(gray,w,h,thr,true)].map(arr=>{
    if(arr.length<5)return null;
    const mid=median(arr),clean=arr.filter(v=>v>=mid*.62&&v<=mid*1.65);
    return clean.length<5?null:{h:median(clean)/f,count:clean.length,score:clean.length/Math.max(1,Math.abs(median(clean)-mid)+1)}
  }).filter(Boolean).sort((a,b)=>b.score-a.score);
  c.width=1;c.height=1;return candidates[0]||null;
}
async function addFiles(fileList){const files=[...fileList];if(!files.length)return;setBusy(true,'Analizando las imágenes en este dispositivo…');let accepted=0,fail=0;
  for(const file of files){if(!['image/jpeg','image/png','image/webp'].includes(file.type)){fail++;continue}try{
    const {image,url}=await blobToImage(file);
    if(!image.naturalWidth||!image.naturalHeight){URL.revokeObjectURL(url);fail++;continue}
    const info=detectTextHeight(image);
    const h=info?.h??Math.max(8,Math.min(image.naturalWidth,image.naturalHeight)/110);
    state.receipts.push({id:idNew(),name:file.name||`Recibo ${state.receipts.length+1}`,blob:file,type:file.type,image,url,pw:image.naturalWidth,ph:image.naturalHeight,letterPx:mm(h),detected:!!info,manual:false,extra:{}});accepted++;
  }catch(e){fail++;console.error('Error al leer imagen',e)}}
  setBusy(false);reflow();message(`${accepted} imagen(es) agregada(s).${fail?' '+fail+' no admitida(s).':''}`)
}
function dims(r){const unit=2/r.letterPx;return {w:r.pw*unit,h:r.ph*unit}}
function fitsPage(d,i){return (d.w<=i.w+1e-7&&d.h<=i.h+1e-7)||(d.h<=i.w+1e-7&&d.w<=i.h+1e-7)}
function interiorSize(){let x=state.margins.left,y=state.margins.top,w=W-x-state.margins.right,h=H-y-state.margins.bottom;return{x,y,w,h}}
function newBin(box){return{items:[],free:[{x:box.x,y:box.y,w:box.w,h:box.h}]}}
function intersects(a,b){return !(b.x>=a.x+a.w-1e-7||b.x+b.w<=a.x+1e-7||b.y>=a.y+a.h-1e-7||b.y+b.h<=a.y+1e-7)}
function contains(a,b){return b.x>=a.x-1e-7&&b.y>=a.y-1e-7&&b.x+b.w<=a.x+a.w+1e-7&&b.y+b.h<=a.y+a.h+1e-7}
function placeRect(bin,rect){const fresh=[];
  for(const free of bin.free){if(!intersects(free,rect)){fresh.push(free);continue}
    if(rect.x>free.x+1e-7)fresh.push({x:free.x,y:free.y,w:rect.x-free.x,h:free.h});
    if(rect.x+rect.w<free.x+free.w-1e-7)fresh.push({x:rect.x+rect.w,y:free.y,w:free.x+free.w-rect.x-rect.w,h:free.h});
    if(rect.y>free.y+1e-7)fresh.push({x:free.x,y:free.y,w:free.w,h:rect.y-free.y});
    if(rect.y+rect.h<free.y+free.h-1e-7)fresh.push({x:free.x,y:rect.y+rect.h,w:free.w,h:free.y+free.h-rect.y-rect.h})
  }
  bin.free=fresh.filter((f,i)=>f.w>1e-6&&f.h>1e-6&&!fresh.some((o,j)=>i!==j&&contains(o,f)&&(o.w*o.h>f.w*f.h+1e-6||j<i)));
  bin.items.push(rect);
}
function tryPosition(bin,r,gap){const d=dims(r),tests=[{w:d.w,h:d.h,rot:false},{w:d.h,h:d.w,rot:true}],best=[];
  for(const fr of bin.free)for(const t of tests){const w=t.w+gap,h=t.h+gap;if(w>fr.w+1e-7||h>fr.h+1e-7)continue;const short=Math.min(fr.w-w,fr.h-h),long=Math.max(fr.w-w,fr.h-h);
    best.push({x:fr.x,y:fr.y,w,h,drawW:t.w,drawH:t.h,rot:t.rot,short,long})}
  best.sort((a,b)=>a.short-b.short||a.long-b.long||a.y-b.y||a.x-b.x);return best[0]||null;
}
function packAuto(sorted,box){let bins=[],unplaced=[];
  for(const r of sorted){const d=dims(r);if(!fitsPage({w:d.w+state.gap,h:d.h+state.gap},box)){unplaced.push(r.id);continue}
    let selected=null,which=-1;for(let j=0;j<bins.length;j++){const p=tryPosition(bins[j],r,state.gap);if(p&&(!selected||p.short<selected.short-1e-6)){selected=p;which=j}}
    if(!selected){bins.push(newBin(box));which=bins.length-1;selected=tryPosition(bins[which],r,state.gap)}
    if(!selected){unplaced.push(r.id);continue}
    placeRect(bins[which],{id:r.id,x:selected.x,y:selected.y,w:selected.w,h:selected.h,drawW:selected.drawW,drawH:selected.drawH,rot:selected.rot});
  }
  const pages=bins.map(b=>b.items.map(r=>({...r,w:r.drawW,h:r.drawH}))),order=pages.flatMap(p=>[...p].sort((a,b)=>a.y-b.y||a.x-b.x).map(q=>q.id));
  return{pages,unplaced,order,score:bins.length*100000+(bins.length?bins.at(-1).items.reduce((m,r)=>Math.max(m,r.y+r.h),0):0)}
}
function packManual(list,box){const pages=[],unplaced=[],gap=state.gap;let page=[],x=box.x,y=box.y,rowHeight=0;
  for(const r of list){const d=dims(r),opts=[{w:d.w,h:d.h,rot:false},{w:d.h,h:d.w,rot:true}];
    if(!fitsPage({w:d.w+gap,h:d.h+gap},box)){unplaced.push(r.id);continue}
    let choices=opts.filter(o=>o.w+gap<=box.x+box.w-x+1e-6&&o.h+gap<=box.y+box.h-y+1e-6);
    if(!choices.length){x=box.x;y+=rowHeight;rowHeight=0;choices=opts.filter(o=>o.w+gap<=box.w+1e-6&&o.h+gap<=box.y+box.h-y+1e-6)}
    if(!choices.length){if(page.length)pages.push(page);page=[];x=box.x;y=box.y;rowHeight=0;choices=opts.filter(o=>o.w+gap<=box.w+1e-6&&o.h+gap<=box.h+1e-6)}
    if(!choices.length){unplaced.push(r.id);continue}
    // Prioriza horizontal y luego menor altura para no crear filas excesivas.
    choices.sort((a,b)=>(a.h+Math.abs((box.x+box.w)-(x+a.w))*.03)-(b.h+Math.abs((box.x+box.w)-(x+b.w))*.03));
    const o=choices[0];page.push({id:r.id,x,y,w:o.w,h:o.h,rot:o.rot});x+=o.w+gap;rowHeight=Math.max(rowHeight,o.h+gap)
  }
  if(page.length)pages.push(page);return{pages,unplaced,order:pages.flatMap(p=>p.map(o=>o.id))}
}
function reflow(){const box=interiorSize();if(box.w<=10||box.h<=10){state.layout={pages:[],unplaced:state.receipts.map(r=>r.id),order:[]};state.displayOrder=[...state.layout.unplaced];render();message('Los márgenes no dejan espacio útil.');return}
  if(state.mode==='manual')state.layout=packManual(state.receipts,box);
  else{
    const rs=state.receipts;const sorts=[
      [...rs].sort((a,b)=>(dims(b).w*dims(b).h)-(dims(a).w*dims(a).h)),
      [...rs].sort((a,b)=>Math.max(dims(b).w,dims(b).h)-Math.max(dims(a).w,dims(a).h)),
      [...rs].sort((a,b)=>dims(b).h-dims(a).h),
      [...rs]
    ];
    let best=null;for(const sort of sorts){const result=packAuto(sort,box);if(!best||result.unplaced.length<best.unplaced.length||result.unplaced.length===best.unplaced.length&&result.score<best.score)best=result}
    state.layout=best;
  }
  state.displayOrder=[...state.layout.order,...state.layout.unplaced];state.coverCount=Math.max(1,Math.ceil(state.displayOrder.length/ROWS_PER_INDEX));render()
}
function reorderId(id,newIndex){const old=state.displayOrder.indexOf(id);if(old<0)return;const order=[...state.displayOrder];order.splice(old,1);order.splice(clamp(newIndex,0,order.length),0,id);const byId=new Map(state.receipts.map(r=>[r.id,r]));state.receipts=order.map(x=>byId.get(x)).filter(Boolean);state.mode='manual';$('modo').value='manual';reflow();message(`Recibo movido a la posición ${state.displayOrder.indexOf(id)+1}. Orden manual aplicado.`)}
function columnCells(r){return state.columns.map(c=>`<input type="text" data-field="extra" data-id="${escape(r.id)}" data-col="${escape(c.id)}" value="${escape(r.extra?.[c.id]||'')}" aria-label="${escape(c.name)}">`).join('')}
function rowIndex(r,number,pg){const cc=[`<span class="consecutivo">${String(number).padStart(2,'0')}</span>`,`<span>${pg==null?'Sin ubicar':pg}</span>`,`<input type="text" data-field="extra" data-id="${escape(r.id)}" data-col="descripcion" value="${escape(r.extra?.descripcion||'')}" aria-label="Descripción">`,`<input type="text" data-field="extra" data-id="${escape(r.id)}" data-col="valor" value="${escape(r.extra?.valor||'')}" aria-label="Valor">`,...state.columns.map(c=>`<input type="text" data-field="extra" data-id="${escape(r.id)}" data-col="${escape(c.id)}" value="${escape(r.extra?.[c.id]||'')}" aria-label="${escape(c.name)}">`)];
  return `<div class="indice-fila" tabindex="0" draggable="true" data-id="${escape(r.id)}" aria-label="Recibo ${number}, página ${pg||'sin ubicar'}; arrastrar o usar Mover a" style="grid-template-columns:repeat(${cc.length},minmax(0,1fr))"><span class="arrastrar" title="Arrastrar para reordenar">⋮⋮</span>${cc.join('')}<label class="mover">Mover a <input type="number" data-mover="${escape(r.id)}" min="1" max="${state.displayOrder.length}" value="${number}" aria-label="Mover recibo ${number} a posición"></label></div>`}
function coverSheet(index){const start=index*ROWS_PER_INDEX,subset=state.displayOrder.slice(start,start+ROWS_PER_INDEX),map=new Map(state.receipts.map(r=>[r.id,r]));let pagesById=new Map();state.layout.pages.forEach((page,i)=>page.forEach(o=>pagesById.set(o.id,i+1)));
  const n=4+state.columns.length;const grid=`grid-template-columns:repeat(${n},minmax(0,1fr))`;
  const headers=[`<span>Consecutivo</span>`,`<span>Página</span>`,`<span>Descripción</span>`,`<span>Valor</span>`,...state.columns.map(c=>`<input type="text" data-field="colname" data-col="${escape(c.id)}" value="${escape(c.name)}" aria-label="Nombre de columna">`)];
  const el=document.createElement('article');el.className='hoja';el.dataset.index=index;el.dataset.pagina=`Índice ${index+1}/${state.coverCount}`;el.innerHTML=`<div class="portada-contenido"><div class="portada-rotulo">Documento · tamaño carta</div><h2 class="portada-titulo">${index===0?'Índice de recibos':'Índice · continuación'}</h2><div class="portada-linea"></div><div class="portada-sub">${state.receipts.length} recibos · ${state.layout.pages.length} páginas de comprobantes</div><div class="indice-cabecera" style="${grid}">${headers.join('')}</div><div class="indice-filas">${subset.map((id,i)=>rowIndex(map.get(id),start+i+1,pagesById.get(id))).join('')}</div><div class="portada-totales" style="${grid}"><strong>Total</strong><span></span><span></span><strong>${new Intl.NumberFormat('es-CO').format(state.receipts.reduce((a,r)=>a+(Number(String(r.extra?.valor||'').replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',','.'))||0),0))}</strong>${state.columns.map(c=>`<strong>${new Intl.NumberFormat('es-CO').format(state.receipts.reduce((a,r)=>a+(Number(String(r.extra?.[c.id]||'').replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',','.'))||0),0))}</strong>`).join('')}</div>${index===0?`<div class="indice-agregar"><button type="button" data-column="add" title="Agregar columna al índice">+ Columna</button><button type="button" data-column="remove" title="Quitar la última columna personalizada" ${state.columns.length?'':'disabled'}>− Columna</button></div>`:''}<div class="portada-footer">Megaste · Documento organizado localmente</div></div>`;return el;
}
function receiptSheet(items,index){const el=document.createElement('article');el.className='hoja';el.dataset.index=state.coverCount+index;el.dataset.pagina=`Página ${index+1}`;const area=document.createElement('div');area.className='contenido-hoja';const orderNums=new Map(state.displayOrder.map((id,i)=>[id,i+1]));
  for(const o of items){const r=state.receipts.find(a=>a.id===o.id);if(!r)continue;const d=document.createElement('div');d.className='elemento'+(o.rot?' rotada':'');d.style.cssText=`left:${o.x/W*100}%;top:${o.y/H*100}%;width:${o.w/W*100}%;height:${o.h/H*100}%;`;
    const img=document.createElement('img');img.src=r.url;img.alt=r.name;img.draggable=false;if(o.rot){img.style.width=(o.h/o.w*100)+'%';img.style.height=(o.w/o.h*100)+'%'}
    d.dataset.receiptId=o.id;const tag=document.createElement('span');tag.className='numero';tag.textContent=String(orderNums.get(o.id)).padStart(2,'0');d.append(img,tag);area.append(d)}el.append(area);return el;
}
function render(){const doc=$('documento'),fragment=document.createDocumentFragment();for(let j=0;j<state.coverCount;j++)fragment.append(coverSheet(j));state.layout.pages.forEach((p,i)=>fragment.append(receiptSheet(p,i)));doc.replaceChildren(fragment);$('cantidad').textContent=state.receipts.length;$('estado-paginas').textContent=`${state.receipts.length} recibos · ${state.layout.pages.length} páginas${state.layout.unplaced.length?' · '+state.layout.unplaced.length+' sin ubicar':''}`;
  const list=$('lista-recibos');if(!state.receipts.length)list.innerHTML='<p class="sin-recibos">Los recibos agregados aparecerán aquí.</p>';else{const ids=[...state.displayOrder];const byId=new Map(state.receipts.map(r=>[r.id,r]));list.innerHTML=ids.map((id,i)=>{
    const r=byId.get(id),d=dims(r),bad=state.layout.unplaced.includes(id),noText=!r.detected;
    return `<div class="recibo-control"><img class="miniatura" src="${r.url}" alt=""><div class="recibo-datos"><b title="${escape(r.name)}">${String(i+1).padStart(2,'0')} · ${escape(r.name)}</b><small>${mm(d.w)} × ${mm(d.h)} mm</small><br><small>Altura letra (px): <input class="ajustar-altura" type="number" step="0.5" min="1" max="10000" value="${r.letterPx}" data-height="${escape(id)}" title="Corrija la altura medida en píxeles"></small>${bad?'<br><small class="alerta">No cabe a escala de 2 mm</small>':noText?'<br><small class="alerta">Medición estimada; revise</small>':''}</div><button type="button" data-remove="${escape(id)}" aria-label="Quitar ${escape(r.name)}" title="Eliminar recibo">×</button></div>`}).join('')}
  const live=$('indice-vivo'),byIdLive=new Map(state.receipts.map(r=>[r.id,r]));
  const cols=[{id:'descripcion',name:'Descripción'},{id:'valor',name:'Valor'},...state.columns];
  const grid=`grid-template-columns:36px repeat(${cols.length},minmax(0,1fr))`;
  $('indice-encabezados').style.cssText=grid;
  $('indice-encabezados').innerHTML='<span>N.º</span>'+cols.map(c=>`<span title="${escape(c.name)}">${escape(c.name)}</span>`).join('');
  live.innerHTML=state.displayOrder.map((id,i)=>{const r=byIdLive.get(id);if(!r)return '';return `<div class="indice-fila-viva${selectedReceipt===id?' activa':''}" style="${grid}" data-receipt="${escape(id)}" tabindex="0"><span>${String(i+1).padStart(2,'0')}</span>${cols.map(c=>`<button type="button" data-edit="${escape(id)}" data-focus="${escape(c.id)}" title="Editar ${escape(c.name)}">${escape(r.extra?.[c.id]||'·')}</button>`).join('')}</div>`}).join('');
  const money=v=>{const n=Number(String(v||'').replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',','.'));return Number.isFinite(n)?n:0};
  const fmt=n=>new Intl.NumberFormat('es-CO',{maximumFractionDigits:2}).format(n);
  $('indice-total').style.cssText=grid;
  $('indice-total').innerHTML='<strong>Total</strong>'+cols.map(c=>c.id==='descripcion'?'<span></span>':`<strong>${fmt(state.receipts.reduce((sum,r)=>sum+money(r.extra?.[c.id]),0))}</strong>`).join('');
  $('quitar-columna').disabled=!state.columns.length;
  $('bienvenida').hidden=state.receipts.length>0;$('principal-area').hidden=!state.receipts.length;$('pie-flotante').hidden=!state.receipts.length;
  $('separacion-valor').textContent=state.gap+' mm';$('modo').value=state.mode;pageInView=clamp(pageInView,0,state.coverCount+state.layout.pages.length-1);updateNav();
}
function updateNav(){$('contador-pagina').textContent=pageInView<state.coverCount?(pageInView===0?'Portada':`Índice ${pageInView+1}`):`${pageInView-state.coverCount+1} / ${state.layout.pages.length}`;$('anterior').disabled=pageInView===0;$('siguiente').disabled=pageInView>=state.coverCount+state.layout.pages.length-1}
function jumpPage(to){pageInView=clamp(to,0,state.coverCount+state.layout.pages.length-1);const el=$('documento').querySelector(`[data-index="${pageInView}"]`);if(el){$('workspace-scroll')?.scrollTo?.(0,el.offsetTop);el.scrollIntoView({behavior:'smooth',block:'start'});updateNav()}}
function revokeReceipts(){for(const r of state.receipts)if(r.url)URL.revokeObjectURL(r.url)}
function reset(){if(state.receipts.length&&!confirm('¿Crear un documento nuevo? Los cambios sin guardar se perderán.'))return;revokeReceipts();state.receipts=[];state.columns=[];state.mode='auto';pageInView=0;reflow();message('Documento nuevo')}
function download(data,name,type){const blob=data instanceof Blob?data:new Blob([data],{type});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.style.display='none';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),25000)}

/* ZIP almacenable y legible sin servicios, dependencias ni compresión externa. */
const crcTable=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c>>>0}
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0}
function zipBlob(entries){const locals=[],centers=[];let offset=0;const u16=(v,o,x)=>v.setUint16(o,x,true),u32=(v,o,x)=>v.setUint32(o,x,true);
  for(const item of entries){const name=enc.encode(item.name),data=item.data,crc=crc32(data);if(data.length>0xffffffff)throw new Error('Archivo demasiado grande para ZIP');
    let local=new Uint8Array(30+name.length),v=new DataView(local.buffer);u32(v,0,0x04034b50);u16(v,4,20);u16(v,6,0x0800);u16(v,8,0);u32(v,14,crc);u32(v,18,data.length);u32(v,22,data.length);u16(v,26,name.length);local.set(name,30);
    let center=new Uint8Array(46+name.length),z=new DataView(center.buffer);u32(z,0,0x02014b50);u16(z,4,20);u16(z,6,20);u16(z,8,0x0800);u32(z,16,crc);u32(z,20,data.length);u32(z,24,data.length);u16(z,28,name.length);u32(z,42,offset);center.set(name,46);
    locals.push(local,data);centers.push(center);offset+=local.length+data.length;
  }
  if(entries.length>65535)throw new Error('Demasiados archivos');const centerOffset=offset,centerSize=centers.reduce((s,c)=>s+c.length,0),end=new Uint8Array(22),dv=new DataView(end.buffer);u32(dv,0,0x06054b50);u16(dv,8,entries.length);u16(dv,10,entries.length);u32(dv,12,centerSize);u32(dv,16,centerOffset);return new Blob([...locals,...centers,end],{type:'application/zip'});
}
function unpackZip(bytes){const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(v.getUint32(i,true)===0x06054b50){end=i;break}}if(end<0)throw new Error('Archivo .megaste o .recibi no válido');const count=v.getUint16(end+10,true);if(count>1000)throw new Error('Demasiados elementos en proyecto');let at=v.getUint32(end+16,true);const result=new Map();for(let i=0;i<count;i++){
    if(at+46>bytes.length||v.getUint32(at,true)!==0x02014b50)throw new Error('Índice ZIP incorrecto');const method=v.getUint16(at+10,true),crc=v.getUint32(at+16,true),len=v.getUint32(at+20,true),nl=v.getUint16(at+28,true),ex=v.getUint16(at+30,true),comm=v.getUint16(at+32,true),loc=v.getUint32(at+42,true);if(method!==0)throw new Error('Este proyecto utiliza una compresión no compatible');const name=dec.decode(bytes.subarray(at+46,at+46+nl));if(loc+30>bytes.length||v.getUint32(loc,true)!==0x04034b50)throw new Error('Contenido ZIP incorrecto');let start=loc+30+v.getUint16(loc+26,true)+v.getUint16(loc+28,true);if(start+len>bytes.length)throw new Error('Datos incompletos');const data=bytes.subarray(start,start+len);if(crc32(data)!==crc)throw new Error('La integridad del proyecto es incorrecta');if(result.has(name))throw new Error('Archivo duplicado');result.set(name,data);at+=46+nl+ex+comm;
  }return result;
}
async function saveProject(){if(state.busy)return;setBusy(true,'Preparando el proyecto editable…');try{
  const data={app:'Megaste',version:'0.2.1',format:1,page:{w:W,h:H,margins:state.margins,gap:state.gap},mode:state.mode,columns:state.columns,receipts:state.receipts.map((r,i)=>({id:r.id,name:r.name,type:r.type,path:`imagenes/${i}.${r.type==='image/png'?'png':r.type==='image/webp'?'webp':'jpg'}`,pw:r.pw,ph:r.ph,letterPx:r.letterPx,detected:r.detected,manual:r.manual,extra:r.extra})),displayOrder:state.displayOrder};
  const entries=[{name:'proyecto.json',data:enc.encode(JSON.stringify(data,null,2))}];for(const e of data.receipts){const r=state.receipts.find(x=>x.id===e.id);entries.push({name:e.path,data:new Uint8Array(await r.blob.arrayBuffer())})}
  download(zipBlob(entries),'Megaste.megaste','application/octet-stream');message('Proyecto editable .megaste descargado');
  }catch(e){console.error(e);message('No se pudo guardar: '+e.message)}finally{setBusy(false)}
}
async function openProject(file){if(!file)return;setBusy(true,'Leyendo proyecto local…');const temp=[];try{
    const files=unpackZip(new Uint8Array(await file.arrayBuffer())),json=files.get('proyecto.json');if(!json)throw new Error('Falta proyecto.json');const data=JSON.parse(dec.decode(json));if(!['Megaste','Recibi'].includes(data.app)||data.format!==1||!Array.isArray(data.receipts))throw new Error('Formato de proyecto no reconocido');if(data.receipts.length>500)throw new Error('Máximo de 500 recibos');
    for(const e of data.receipts){if(!/^imagenes\/\d+\.(jpg|png|webp)$/.test(e.path)||!files.has(e.path)||!['image/jpeg','image/png','image/webp'].includes(e.type))throw new Error('Una imagen del proyecto no es válida');const blob=new Blob([files.get(e.path)],{type:e.type}),{image,url}=await blobToImage(blob);temp.push({id:String(e.id).slice(0,90),name:String(e.name).slice(0,250),blob,type:e.type,image,url,pw:image.naturalWidth,ph:image.naturalHeight,letterPx:clamp(Number(e.letterPx)||10,1,10000),detected:!!e.detected,manual:!!e.manual,extra:typeof e.extra==='object'&&e.extra?e.extra:{}})}
    revokeReceipts();state.receipts=temp;state.margins={top:10,bottom:10,left:10,right:10};for(const [k,id] of [['top','superior'],['bottom','inferior'],['left','izquierda'],['right','derecha']]){const v=clamp(Number(data.page?.margins?.[k])||0,0,100);state.margins[k]=v;$('m-'+id).value=v}state.gap=clamp(Number(data.page?.gap)||0,0,10);$('separacion').value=state.gap;
    state.mode=data.mode==='manual'?'manual':'auto';state.columns=(Array.isArray(data.columns)?data.columns:[]).slice(0,5).map(c=>({id:String(c.id).slice(0,35),name:String(c.name).slice(0,35)}));
    if(state.mode==='manual'&&Array.isArray(data.displayOrder)){const map=new Map(temp.map(x=>[x.id,x]));state.receipts=data.displayOrder.map(x=>map.get(x)).filter(Boolean);for(const r of temp)if(!state.receipts.includes(r))state.receipts.push(r)}
    pageInView=0;reflow();message(`Proyecto abierto: ${temp.length} recibo(s)`);
  }catch(e){for(const r of temp)URL.revokeObjectURL(r.url);console.error(e);message('No se pudo abrir: '+e.message)}finally{setBusy(false);$('entrada-proyecto').value=''}
}

/* Exportación raster con dimensiones métricas exactas de hoja carta. */
function text(ctx,str,x,y,size=11,color='#27465a',weight='400'){ctx.fillStyle=color;ctx.font=`${weight} ${size}px Arial,sans-serif`;ctx.fillText(String(str),x,y)}
function drawCover(ctx,index,scale){const left=20,top=24,width=W-40,start=index*ROWS_PER_INDEX,subset=state.displayOrder.slice(start,start+ROWS_PER_INDEX),byId=new Map(state.receipts.map(r=>[r.id,r])),pages=new Map();state.layout.pages.forEach((p,i)=>p.forEach(r=>pages.set(r.id,i+1)));
  ctx.save();ctx.scale(scale,scale);text(ctx,'DOCUMENTO · TAMAÑO CARTA',left,top,3.4,'#18818d','bold');text(ctx,index===0?'Índice de recibos':'Índice · continuación',left,top+22,10,'#1e3d50','bold');ctx.fillStyle='#10aba5';ctx.fillRect(left,top+29,24,1.2);text(ctx,`${state.receipts.length} recibos · ${state.layout.pages.length} páginas de comprobantes`,left,top+39,4,'#527183');
  const n=4+state.columns.length,cw=width/n,y0=top+50,header=['N.º','Página','Descripción','Valor',...state.columns.map(c=>c.name)];header.forEach((v,i)=>text(ctx,v.slice(0,Math.max(5,Math.floor(cw/2.1))),left+i*cw,y0,3.4,'#315265','bold'));ctx.strokeStyle='#bacfd3';ctx.beginPath();ctx.moveTo(left,y0+2);ctx.lineTo(left+width,y0+2);ctx.stroke();
  subset.forEach((id,i)=>{const r=byId.get(id);let y=y0+8+i*8.1;text(ctx,String(start+i+1).padStart(2,'0'),left,y,3.6,'#1b7783','bold');text(ctx,pages.get(id)??'Sin ubicar',left+cw,y,3.6);text(ctx,String(r?.extra?.descripcion||'').slice(0,Math.floor(cw/1.6)),left+2*cw,y,3.2);text(ctx,String(r?.extra?.valor||'').slice(0,Math.floor(cw/1.6)),left+3*cw,y,3.2);state.columns.forEach((c,j)=>text(ctx,String(r?.extra?.[c.id]||'').slice(0,Math.floor(cw/2.0)),left+(j+4)*cw,y,3.2));ctx.strokeStyle='#e7eef0';ctx.beginPath();ctx.moveTo(left,y+2);ctx.lineTo(left+width,y+2);ctx.stroke()});
  const sum=(col)=>state.receipts.reduce((a,r)=>a+(Number(String(r.extra?.[col]||'').replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',','.'))||0),0);
  const totalY=Math.min(H-24,y0+11+subset.length*8.1);text(ctx,'Total',left,totalY,3.4,'#ae2e1f','bold');text(ctx,new Intl.NumberFormat('es-CO').format(sum('valor')),left+3*cw,totalY,3.2,'#2b2f38','bold');state.columns.forEach((c,j)=>text(ctx,new Intl.NumberFormat('es-CO').format(sum(c.id)),left+(j+4)*cw,totalY,3.2,'#2b2f38','bold'));
  text(ctx,'Megaste · Documento organizado localmente',left,H-18,3.3,'#8a9da9');ctx.restore();
}
function drawReceiptPage(ctx,items,scale,pageNum){const byId=new Map(state.receipts.map(r=>[r.id,r]));const indexes=new Map(state.displayOrder.map((id,i)=>[id,i+1]));ctx.save();ctx.scale(scale,scale);
  for(const p of items){const r=byId.get(p.id);if(!r)continue;ctx.save();if(p.rot){ctx.translate(p.x+p.w/2,p.y+p.h/2);ctx.rotate(Math.PI/2);ctx.drawImage(r.image,-p.h/2,-p.w/2,p.h,p.w)}else ctx.drawImage(r.image,p.x,p.y,p.w,p.h);ctx.restore();const lab=String(indexes.get(p.id)).padStart(2,'0');ctx.fillStyle='#fff';ctx.fillRect(p.x+0.6,p.y+.6,8,4.4);text(ctx,lab,p.x+1.4,p.y+4,3,'#17627b','bold')}
  if(state.margins.bottom>=6){text(ctx,`Página ${pageNum}`,W-26,H-3.8,3.3,'#687e8e')}
  ctx.restore();
}
function renderCanvas(index,dpi=210){let canvas=document.createElement('canvas'),scale=dpi/25.4;canvas.width=Math.round(W*scale);canvas.height=Math.round(H*scale);const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  if(index<state.coverCount)drawCover(ctx,index,scale);else drawReceiptPage(ctx,state.layout.pages[index-state.coverCount],scale,index-state.coverCount+1);return canvas;
}
function canvasBlob(c,type,quality){return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('Error al generar imagen')),type,quality))}
async function exportImages(){if(!state.receipts.length){message('Agregue recibos antes de exportar');return}setBusy(true,'Creando imágenes PNG…');try{const pages=state.coverCount+state.layout.pages.length,entries=[];
    for(let i=0;i<pages;i++){const c=renderCanvas(i,200),blob=await canvasBlob(c,'image/png');entries.push({name:`pagina_${String(i+1).padStart(3,'0')}.png`,data:new Uint8Array(await blob.arrayBuffer())});c.width=1;c.height=1}
    download(zipBlob(entries),'Megaste_paginas.zip','application/zip');message(`${pages} páginas PNG exportadas`)
  }catch(e){console.error(e);message('Error al exportar imágenes: '+e.message)}finally{setBusy(false)}
}
function pdfBytes(images){const pieces=[];let length=0,offsets=[0];function push(a){let v=typeof a==='string'?enc.encode(a):a;pieces.push(v);length+=v.length}function object(n,content){offsets[n]=length;push(`${n} 0 obj\n`);for(const part of content)push(part);push('\nendobj\n')}
  const total=images.length;push('%PDF-1.4\n');object(1,['<< /Type /Catalog /Pages 2 0 R >>']);let kids=[];for(let i=0;i<total;i++)kids.push(`${3+i*3} 0 R`);object(2,[`<< /Type /Pages /Count ${total} /Kids [${kids.join(' ')}] >>`]);
  for(let i=0;i<total;i++){const p=3+i*3,c=4+i*3,img=5+i*3,bytes=images[i].bytes,cmd='q\n612 0 0 792 0 0 cm\n/Im0 Do\nQ\n',raw=enc.encode(cmd);
    object(p,[`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 ${img} 0 R >> >> /Contents ${c} 0 R >>`]);
    object(c,[`<< /Length ${raw.length} >>\nstream\n`,raw,'endstream']);
    object(img,[`<< /Type /XObject /Subtype /Image /Width ${images[i].w} /Height ${images[i].h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`,bytes,'\nendstream']);
  }
  const startXref=length,count=3+total*3;push(`xref\n0 ${count}\n0000000000 65535 f \n`);for(let i=1;i<count;i++)push(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);push(`trailer\n<< /Root 1 0 R /Size ${count} >>\nstartxref\n${startXref}\n%%EOF\n`);return new Blob(pieces,{type:'application/pdf'});
}
async function exportPdf(){if(!state.receipts.length){message('Agregue recibos antes de exportar');return}setBusy(true,'Preparando PDF local…');try{const images=[],total=state.coverCount+state.layout.pages.length;
    for(let i=0;i<total;i++){const c=renderCanvas(i,240),b=await canvasBlob(c,'image/jpeg',.92);images.push({bytes:new Uint8Array(await b.arrayBuffer()),w:c.width,h:c.height});c.width=1;c.height=1}
    download(pdfBytes(images),'Megaste.pdf','application/pdf');message(`${total} páginas exportadas en PDF tamaño carta`);
  }catch(e){console.error(e);message('Error al crear PDF: '+e.message)}finally{setBusy(false)}
}

function selectReceipt(id,scroll=false){selectedReceipt=id;document.querySelectorAll('.indice-fila-viva').forEach(el=>el.classList.toggle('activa',el.dataset.receipt===id));document.querySelectorAll('.elemento').forEach(el=>el.classList.toggle('resaltado',el.dataset.receiptId===id));const row=[...document.querySelectorAll('.indice-fila-viva')].find(el=>el.dataset.receipt===id);if(row)row.scrollIntoView({block:'nearest'});if(scroll){const item=[...document.querySelectorAll('.elemento')].find(el=>el.dataset.receiptId===id);if(item)item.closest('.hoja').scrollIntoView({behavior:'smooth',block:'start'})}}
function controls(){const zone=$('zona');
  $('agregar-inicio').addEventListener('click',()=>$('entrada').click());$('agregar').addEventListener('click',()=>$('entrada').click());
  const toggleConfig=show=>{const panel=$('panel-config');panel.hidden=!show;$('configuracion').setAttribute('aria-expanded',String(show))};
  $('configuracion').addEventListener('click',()=>toggleConfig($('panel-config').hidden));$('cerrar-config').addEventListener('click',()=>toggleConfig(false));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')toggleConfig(false)});
  let editingId=null;const editor=$('editor-flotante');
  function suggestions(){const q=$('editor-descripcion').value.trim().toLocaleLowerCase('es');const values=[...new Set(state.receipts.map(r=>String(r.extra?.descripcion||'').trim()).filter(Boolean))].filter(v=>v.toLocaleLowerCase('es').includes(q)).slice(0,6);$('sugerencias').innerHTML=values.map(v=>`<button type="button" data-suggest="${escape(v)}">${escape(v)}</button>`).join('')}
  function openEdit(id,focus='descripcion'){const r=state.receipts.find(r=>r.id===id);if(!r)return;editingId=id;$('editor-descripcion').value=r.extra?.descripcion||'';$('editor-valor').value=r.extra?.valor||'';editor.hidden=false;suggestions();(focus==='valor'?$('editor-valor'):$('editor-descripcion')).focus();selectReceipt(id)}
  function closeEdit(){editor.hidden=true;editingId=null}
  $('editor-cerrar').addEventListener('click',closeEdit);$('editor-cancelar').addEventListener('click',closeEdit);
  $('editor-aceptar').addEventListener('click',()=>{const r=state.receipts.find(r=>r.id===editingId);if(!r)return closeEdit();r.extra??={};r.extra.descripcion=$('editor-descripcion').value.trim().slice(0,100);r.extra.valor=$('editor-valor').value.trim().slice(0,100);const id=r.id;closeEdit();render();selectReceipt(id);message('Cambios aceptados')});
  $('editor-descripcion').addEventListener('input',suggestions);
  $('sugerencias').addEventListener('click',e=>{const b=e.target.closest('[data-suggest]');if(b){$('editor-descripcion').value=b.dataset.suggest;suggestions();$('editor-valor').focus()}});
  $('indice-vivo').addEventListener('click',e=>{const b=e.target.closest('[data-edit]');if(b)openEdit(b.dataset.edit,b.dataset.focus)});
  $('agregar-columna').addEventListener('click',()=>{if(state.columns.length>=5)return message('Máximo cinco columnas adicionales');state.columns.push({id:idNew(),name:`Columna ${state.columns.length+1}`});render();message('Columna agregada')});
  $('quitar-columna').addEventListener('click',()=>{if(!state.columns.length)return;state.columns.pop();render();message('Columna retirada')});
  $('indice-vivo').addEventListener('click',e=>{const row=e.target.closest('[data-receipt]');if(row)selectReceipt(row.dataset.receipt,!e.target.closest('input'))});
  $('indice-vivo').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.target.closest('input')){const row=e.target.closest('[data-receipt]');if(row)selectReceipt(row.dataset.receipt,true)}});
  $('documento').addEventListener('pointerover',e=>{if(e.pointerType==='mouse'){const el=e.target.closest('[data-receipt-id]');if(el)selectReceipt(el.dataset.receiptId)}});
  $('documento').addEventListener('click',e=>{const el=e.target.closest('[data-receipt-id]');if(el)selectReceipt(el.dataset.receiptId)});
  $('documento').addEventListener('dblclick',e=>{const el=e.target.closest('[data-receipt-id]');if(!el)return;selectReceipt(el.dataset.receiptId);const row=[...document.querySelectorAll('.indice-fila-viva')].find(x=>x.dataset.receipt===el.dataset.receiptId);openEdit(el.dataset.receiptId)});
  let lastTap={id:null,time:0};$('documento').addEventListener('touchend',e=>{const el=e.target.closest('[data-receipt-id]');if(!el)return;const now=Date.now();if(lastTap.id===el.dataset.receiptId&&now-lastTap.time<450){const row=[...document.querySelectorAll('.indice-fila-viva')].find(x=>x.dataset.receipt===el.dataset.receiptId);openEdit(el.dataset.receiptId);lastTap={id:null,time:0}}else lastTap={id:el.dataset.receiptId,time:now}},{passive:true});
  for(const event of ['dragover','drop'])document.addEventListener(event,e=>{if(e.dataTransfer?.types?.includes('Files')){e.preventDefault();if(event==='drop')addFiles(e.dataTransfer.files)}});
zone.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('entrada').click()}});$('entrada').addEventListener('change',e=>{addFiles(e.target.files);e.target.value='' });
  for(const event of ['dragenter','dragover'])zone.addEventListener(event,e=>{e.preventDefault();zone.classList.add('sobre')});for(const event of ['dragleave','drop'])zone.addEventListener(event,e=>{e.preventDefault();zone.classList.remove('sobre')});zone.addEventListener('drop',e=>addFiles(e.dataTransfer?.files||[]));
  $('abrir').addEventListener('click',()=>$('entrada-proyecto').click());$('entrada-proyecto').addEventListener('change',e=>openProject(e.target.files[0]));$('guardar').addEventListener('click',saveProject);$('imagenes').addEventListener('click',exportImages);$('pdf').addEventListener('click',exportPdf);$('vaciar').addEventListener('click',reset);
  $('modo').addEventListener('change',e=>{state.mode=e.target.value;reflow();message(state.mode==='auto'?'Organización automática aplicada':'Orden manual aplicado')});$('separacion').addEventListener('input',e=>{state.gap=Number(e.target.value);reflow()});
  for(const [key,id] of [['top','superior'],['bottom','inferior'],['left','izquierda'],['right','derecha']])$('m-'+id).addEventListener('change',e=>{state.margins[key]=clamp(Number(e.target.value)||0,0,100);e.target.value=state.margins[key];reflow()});
  $('lista-recibos').addEventListener('change',e=>{const i=e.target;if(i.matches('[data-height]')){const r=state.receipts.find(r=>r.id===i.dataset.height);if(r){r.letterPx=clamp(Number(i.value)||r.letterPx,1,10000);r.manual=true;reflow();message('Escala ajustada según la altura indicada')}}});
  $('lista-recibos').addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(!b)return;const idx=state.receipts.findIndex(r=>r.id===b.dataset.remove);if(idx<0)return;URL.revokeObjectURL(state.receipts[idx].url);state.receipts.splice(idx,1);reflow();message('Recibo retirado')});
  $('documento').addEventListener('change',e=>{const i=e.target;if(i.dataset.field==='extra'){const r=state.receipts.find(r=>r.id===i.dataset.id);if(r){r.extra[i.dataset.col]=i.value.slice(0,100);i.value=r.extra[i.dataset.col]}}if(i.dataset.field==='colname'){const c=state.columns.find(c=>c.id===i.dataset.col);if(c){c.name=i.value.slice(0,35)||'Columna';render()}}if(i.dataset.mover){const id=i.dataset.mover,pos=Math.round(Number(i.value)||1)-1;i.disabled=true;setTimeout(()=>reorderId(id,pos),0)}});
  $('documento').addEventListener('click',e=>{const row=e.target.closest('.indice-fila');if(row&&!e.target.closest('input')){document.querySelectorAll('.indice-fila.orden-activo').forEach(r=>r.classList.remove('orden-activo'));row.classList.add('orden-activo');row.focus()}const b=e.target.closest('[data-column]');if(!b)return;if(b.dataset.column==='add'){if(state.columns.length>=5){message('Máximo 5 columnas adicionales');return}state.columns.push({id:idNew(),name:`Columna ${state.columns.length+5}`});render();message('Columna agregada')}else{state.columns.pop();render();message('Última columna retirada')}});
  let dragged=null;$('documento').addEventListener('dragstart',e=>{const row=e.target.closest('.indice-fila');if(!row)return;dragged=row.dataset.id;row.classList.add('arrastre');e.dataTransfer.effectAllowed='move'});$('documento').addEventListener('dragover',e=>{if(!dragged)return;const row=e.target.closest('.indice-fila');if(row){e.preventDefault();row.classList.add('sobre')}});$('documento').addEventListener('dragleave',e=>{const row=e.target.closest('.indice-fila');if(row)row.classList.remove('sobre')});$('documento').addEventListener('drop',e=>{if(!dragged)return;const row=e.target.closest('.indice-fila');if(row){e.preventDefault();reorderId(dragged,state.displayOrder.indexOf(row.dataset.id))}dragged=null});$('documento').addEventListener('dragend',()=>{dragged=null;document.querySelectorAll('.indice-fila').forEach(r=>r.classList.remove('arrastre','sobre'))});
  $('documento').addEventListener('keydown',e=>{if(e.target.closest('input'))return;const row=e.target.closest('.indice-fila');if(!row||!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const id=row.dataset.id,at=state.displayOrder.indexOf(id);reorderId(id,at+(e.key==='ArrowUp'?-1:1))});
  $('portada').addEventListener('click',()=>jumpPage(0));$('anterior').addEventListener('click',()=>jumpPage(pageInView-1));$('siguiente').addEventListener('click',()=>jumpPage(pageInView+1));let zoom=1;$('ajustar').addEventListener('click',()=>{zoom=zoom>=1.6?.8:Math.round((zoom+.2)*10)/10;document.querySelectorAll('.hoja').forEach(el=>el.style.width=`${Math.round(zoom*100)}%`);$('ajustar').title=`Zoom ${Math.round(zoom*100)} %`;message(`Zoom ${Math.round(zoom*100)} %`)});
  $('ayuda').addEventListener('click',()=>$('dialogo').showModal());$('cerrar-dialogo').addEventListener('click',()=>$('dialogo').close());
  const intersection=new IntersectionObserver(entries=>{const seen=entries.filter(x=>x.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(seen){pageInView=Number(seen.target.dataset.index)||0;updateNav()}},{root:document.querySelector('.workspace'),threshold:[.25,.5,.7]});
  const mutation=new MutationObserver(()=>{intersection.disconnect();document.querySelectorAll('.hoja').forEach(el=>intersection.observe(el))});mutation.observe($('documento'),{childList:true});
}
controls();reflow();
})();
