/* Gran Imagen 1.7.0 | Diseño: Arley Zarate | Desarrollo: NOVA | 28/oct/2026
   Los archivos de usuario se procesan únicamente en este navegador.
   GeoTIFF.js 2.1.3 se usa para leer TIFF con sus avisos de licencia respectivos. */
(()=>{'use strict';
const $=id=>document.getElementById(id), stage=$('stage'), canvas=$('canvas'),ctx=canvas.getContext('2d',{alpha:false});
const state={sources:new Map(),layers:[],selected:null,multi:new Set(),scene:{w:0,h:0},view:{zoom:1,x:0,y:0},mode:'normal',crop:null,busy:false, drag:null, fileMode:'open',projectName:'Sin título'};
const MAX_PREVIEW=2200,MAX_EXPORT=8_000_000;
let measureType=null, measureDraft=null, measureHover=null, dimensionRefresh=false;
const documents=[];let currentDocument=null;
let detailTimer=null, detailsGeneration=0, progressVisible=false, textCommitTimer=null, movingLayerId=null;
const cloneLayer=l=>({...l,srcWindow:l.srcWindow?.slice()||null});
function freeze(){return {sources:new Map(state.sources),layers:state.layers.map(cloneLayer),selected:state.selected,multi:new Set(state.multi),scene:{...state.scene},view:{...state.view},projectName:state.projectName}};
function record(){if(!currentDocument)return;const h=currentDocument.undo||(currentDocument.undo=[]);h.push(freeze());if(h.length>40)h.shift();currentDocument.redo=[];updateUndoButtons()}
function updateUndoButtons(){if(!$('btnUndo'))return;$('btnUndo').disabled=!(currentDocument?.undo?.length);$('btnRedo').disabled=!(currentDocument?.redo?.length)}
function applyHistory(data){measureType=null;measureDraft=null;for(const k of ['sources','layers','selected','multi','scene','view','projectName'])state[k]=data[k];state.mode='normal';state.crop=null;hideTextEntry();updateControls();updateUndoButtons();}
function undo(){if(!currentDocument?.undo?.length||state.busy)return;const d=currentDocument.undo.pop();(currentDocument.redo ||= []).push(freeze());applyHistory(d);msg('Acción deshecha')}
function redo(){if(!currentDocument?.redo?.length||state.busy)return;const d=currentDocument.redo.pop();(currentDocument.undo ||= []).push(freeze());applyHistory(d);msg('Acción rehecha')}
function progress(step,note,show=true){$('loadProgress').hidden=!show;progressVisible=show;if(!show)return;$('loadTitle').textContent=note;$('loadText').textContent=`${step*25} % de etapas completadas · No representa bytes leídos`;$('loadBar').style.width=(step*25)+'%';}

let count=0,notifyTimer=0,scriptPromise=null,drawQueued=false,panPointers=new Map(),pinch=null;
const uuid=()=>`gi_${Date.now().toString(36)}_${(++count).toString(36)}`;
const icon=(id)=>`<svg aria-hidden="true"><use href="#i-${id}"></use></svg>`;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const safeName=s=>String(s||'Imagen').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,100);
const msg=(s,err=false)=>{const el=$('toast');el.textContent=s;el.style.borderColor=err?'#ff8991':'#59e4d0aa';el.classList.add('show');clearTimeout(notifyTimer);notifyTimer=setTimeout(()=>el.classList.remove('show'),3600)};
const nameText=(node,text)=>{node.textContent=text;};
const laterDraw=()=>{if(!drawQueued){drawQueued=true;requestAnimationFrame(()=>{drawQueued=false;draw()})}};
const sx=x=>x*state.view.zoom+state.view.x,sy=y=>y*state.view.zoom+state.view.y,wx=x=>(x-state.view.x)/state.view.zoom,wy=y=>(y-state.view.y)/state.view.zoom;
const getSelected=()=>state.layers.find(l=>l.id===state.selected)||null;
const mimeType=file=>{const ext=file.name.toLowerCase().split('.').pop();return ext==='tif'||ext==='tiff'?'tiff':(['jpg','jpeg','png','webp'].includes(ext)?'image':'invalid')};
function snapshot(){return {sources:state.sources,layers:state.layers,selected:state.selected,multi:state.multi,scene:state.scene,view:state.view,projectName:state.projectName};}
function activateDocument(doc){measureType=null;measureDraft=null;if(currentDocument){Object.assign(currentDocument.data,snapshot());}
 hideTextEntry();currentDocument=doc;detailsGeneration++;clearTimeout(detailTimer);
 for(const key of ['sources','layers','selected','multi','scene','view','projectName'])state[key]=doc.data[key];
 state.mode='normal';state.crop=null;state.drag=null;state.busy=false;showLayers(false);updateControls();updateUndoButtons();renderTabs();}
function createDocument(title='Sin título'){const doc={id:uuid(),title,data:{sources:new Map(),layers:[],selected:null,multi:new Set(),scene:{w:0,h:0},view:{zoom:1,x:0,y:0},projectName:title}};documents.push(doc);activateDocument(doc);return doc;}
function renameDocument(name){if(currentDocument){currentDocument.title=safeName(name).slice(0,38);state.projectName=currentDocument.title;renderTabs();}}
function closeDocument(id){const idx=documents.findIndex(d=>d.id===id);if(idx<0)return;const doc=documents[idx];if(currentDocument===doc && state.layers.length&&!confirm(`¿Cerrar «${doc.title}»? Guarde el proyecto si necesita conservar los cambios.`))return;
 documents.splice(idx,1);if(doc===currentDocument){currentDocument=null;const next=documents[Math.max(0,idx-1)];if(next)activateDocument(next);else createDocument();}else renderTabs();}
function renderTabs(){const nav=$('documentTabs');nav.replaceChildren();for(const doc of documents){const box=document.createElement('div');box.className='document-tab'+(currentDocument===doc?' active':'');box.setAttribute('role','presentation');const b=document.createElement('button');b.type='button';b.className='tab-title';b.textContent=doc.title;b.title=doc.title;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(currentDocument===doc));b.onclick=()=>{if(!state.busy)activateDocument(doc)};
 const x=document.createElement('button');x.className='tab-close';x.type='button';x.title='Cerrar pestaña';x.setAttribute('aria-label','Cerrar '+doc.title);x.innerHTML=icon('x');x.onclick=()=>{if(!state.busy)closeDocument(doc.id)};box.append(b,x);nav.append(box)}const plus=document.createElement('button');plus.type='button';plus.className='tab-plus';plus.innerHTML=icon('plus');plus.title='Nuevo proyecto o abrir .granimagen';plus.setAttribute('aria-label','Nuevo proyecto o abrir .granimagen');plus.onclick=()=>{$('tabMenu').hidden=!$('tabMenu').hidden};nav.append(plus)}
function setBusy(b,detail='Procesando…'){state.busy=b;document.body.style.cursor=b?'progress':'';if(b) msg(detail);updateControls()}
function resize(){const r=stage.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);canvas.width=Math.max(1,Math.round(r.width*d));canvas.height=Math.max(1,Math.round(r.height*d));ctx.setTransform(d,0,0,d,0,0);laterDraw()}
const cw=()=>stage.clientWidth,ch=()=>stage.clientHeight;
function fit(){if(!state.scene.w)return;const pad=innerWidth<601?70:120;state.view.zoom=Math.min((cw()-pad)/state.scene.w,(ch()-pad)/state.scene.h);state.view.zoom=Math.max(.0000001,state.view.zoom);state.view.x=(cw()-state.scene.w*state.view.zoom)/2;state.view.y=(ch()-state.scene.h*state.view.zoom)/2;laterDraw()}
function zoom(mult,point={x:cw()/2,y:ch()/2}){if(!state.scene.w)return;const old=state.view.zoom,now=clamp(old*mult,1e-7,64);state.view.x=point.x-(point.x-state.view.x)*now/old;state.view.y=point.y-(point.y-state.view.y)*now/old;state.view.zoom=now;laterDraw()}
function renderText(c,l){const lines=String(l.text||'Texto').split('\n').slice(0,100),fs=clamp(Number(l.fontSize)||35,4,500);
 const nw=l.naturalW||l.w||1,nh=l.naturalH||l.h||1;c.save();c.scale(l.w/nw,l.h/nh);c.font=`${l.bold?'bold ':''}${fs}px ${l.font||'Arial'}`;c.textBaseline='top';c.lineJoin='round';const gap=fs*1.24;
 lines.forEach((line,i)=>{let y=fs*.12+i*gap,x=6;if(l.shadow){c.shadowColor='#000c';c.shadowBlur=Math.max(2,fs*.13);c.shadowOffsetX=fs*.09;c.shadowOffsetY=fs*.1}
 if(l.effect==='hundido'){c.shadowColor='transparent';c.strokeStyle='#04111cbd';c.lineWidth=Math.max(1,fs*.08);c.strokeText(line,x+fs*.025,y+fs*.05)}
 c.fillStyle=l.color||'#f6ffff';if(l.effect==='tinta'){const grad=c.createLinearGradient(0,y,0,y+fs);grad.addColorStop(0,l.color||'#f6ffff');grad.addColorStop(.52,l.color||'#f6ffff');grad.addColorStop(1,'#546677');c.fillStyle=grad}
 c.fillText(line,x,y);c.shadowColor='transparent';c.shadowBlur=0;c.shadowOffsetX=c.shadowOffsetY=0});c.restore()}
function scheduleDetail(){clearTimeout(detailTimer);detailTimer=setTimeout(refreshDetail,140)}
function rasterCanvas(rgb,w,h){const cv=document.createElement('canvas');cv.width=w;cv.height=h;const cc=cv.getContext('2d');const im=cc.createImageData(w,h);const bands=Math.max(1,Math.round(rgb.length/(w*h)));for(let i=0,j=0;i<w*h;i++,j+=bands){im.data[i*4]=rgb[j]||0;im.data[i*4+1]=rgb[j+1]??rgb[j]??0;im.data[i*4+2]=rgb[j+2]??rgb[j]??0;im.data[i*4+3]=255}cc.putImageData(im,0,0);return cv}
async function bestImage(src,neededWidth){if(!src.overviews?.length)return{image:src.tiffImage,factor:1};let chosen=src.overviews[0];for(const o of src.overviews){if(o.w>=neededWidth&&o.w<chosen.w)chosen=o}return{image:chosen.image,factor:chosen.w/src.w}}
async function refreshDetail(){if(state.busy||!state.scene.w)return;const epoch=detailsGeneration,doc=currentDocument;
 const target=state.layers.find(l=>l.kind==='base'&&l.visible)||state.layers.find(l=>l.visible&&!['text','measure'].includes(l.kind));if(!target||target.angle)return;
 const src=state.sources.get(target.sourceId);if(!src?.tiffImage||src.missing)return;const win=target.srcWindow||[0,0,src.w,src.h];
 const p1=Math.min(wx(0),wx(cw())),p2=Math.max(wx(0),wx(cw())),q1=Math.min(wy(0),wy(ch())),q2=Math.max(wy(0),wy(ch()));
 const m=Math.max(20,180/Math.max(state.view.zoom,.001));const lx0=clamp(p1-m,target.x,target.x+target.w),lx1=clamp(p2+m,target.x,target.x+target.w),ly0=clamp(q1-m,target.y,target.y+target.h),ly1=clamp(q2+m,target.y,target.y+target.h);
 if(lx1<=lx0||ly1<=ly0)return;
 const toX=x=>win[0]+(x-target.x)/target.w*(win[2]-win[0]),toY=y=>win[1]+(y-target.y)/target.h*(win[3]-win[1]);
 const x0=Math.max(0,Math.floor(toX(lx0))),x1=Math.min(src.w,Math.ceil(toX(lx1))),y0=Math.max(0,Math.floor(toY(ly0))),y1=Math.min(src.h,Math.ceil(toY(ly1)));
 const nW=x1-x0,nH=y1-y0;if(nW<1||nH<1)return;
 const scale=state.view.zoom*target.w/(win[2]-win[0])*Math.min(devicePixelRatio||1,2);
 if(scale<Math.max(src.preview.width/src.w,src.preview.height/src.h)*1.12)return;
 const width=Math.max(1,Math.min(1800,Math.round(nW*Math.min(scale,1)))),height=Math.max(1,Math.min(1800,Math.round(nH*Math.min(scale,1))));
 const last=src.detail;if(last&&last.res>=width/nW*.95&&last.win[0]<=x0&&last.win[1]<=y0&&last.win[2]>=x1&&last.win[3]>=y1)return;
 if(src.detailPending)return;src.detailPending=true;
 try{const selection=await bestImage(src,Math.max(width,src.w*width/nW));const f=selection.factor,opts={window:[Math.floor(x0*f),Math.floor(y0*f),Math.ceil(x1*f),Math.ceil(y1*f)],width,height,interleave:true,resampleMethod:'bilinear'};
 const raster=await selection.image.readRGB(opts);
 if(doc!==currentDocument||epoch!==detailsGeneration)return;
 src.detail={win:[x0,y0,x1,y1],canvas:rasterCanvas(raster,width,height),res:width/nW};laterDraw()
 }catch(err){console.warn('Detalle de vista no disponible:',err)}finally{src.detailPending=false}}
function paintLayer(c,l){if(!l.visible)return;if(l.kind==='measure'){drawMeasurement(c,l);return}const src=state.sources.get(l.sourceId);if(l.kind!=='text'&&(!src||!src.preview))return;
 c.save();c.globalAlpha=clamp(Number(l.opacity),0,1);c.translate(l.x+l.w/2,l.y+l.h/2);c.rotate(l.angle||0);c.scale(l.flipX?-1:1,l.flipY?-1:1);
 if(l.kind==='text'){c.translate(-l.w/2,-l.h/2);if(!l.editing)renderText(c,l)}else{const win=l.srcWindow||[0,0,src.w,src.h],scaleX=src.preview.width/src.w,scaleY=src.preview.height/src.h;
 try{c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(src.preview,win[0]*scaleX,win[1]*scaleY,Math.max(1,(win[2]-win[0])*scaleX),Math.max(1,(win[3]-win[1])*scaleY),-l.w/2,-l.h/2,l.w,l.h);
 const det=src.detail;if(det?.canvas&&!(l.angle||0)){const d=det.win,ix0=Math.max(d[0],win[0]),iy0=Math.max(d[1],win[1]),ix1=Math.min(d[2],win[2]),iy1=Math.min(d[3],win[3]);if(ix1>ix0&&iy1>iy0){const dx=-l.w/2+(ix0-win[0])/(win[2]-win[0])*l.w,dy=-l.h/2+(iy0-win[1])/(win[3]-win[1])*l.h,dw=(ix1-ix0)/(win[2]-win[0])*l.w,dh=(iy1-iy0)/(win[3]-win[1])*l.h;c.drawImage(det.canvas,(ix0-d[0])/(d[2]-d[0])*det.canvas.width,(iy0-d[1])/(d[3]-d[1])*det.canvas.height,(ix1-ix0)/(d[2]-d[0])*det.canvas.width,(iy1-iy0)/(d[3]-d[1])*det.canvas.height,dx,dy,dw,dh)}}}catch(e){console.warn('Vista parcial:',e)}}c.restore()}
function draw(){ctx.save();const d=Math.min(devicePixelRatio||1,2);ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,cw(),ch());ctx.fillStyle='#091624';ctx.fillRect(0,0,cw(),ch());if(state.scene.w){ctx.save();ctx.translate(state.view.x,state.view.y);ctx.scale(state.view.zoom,state.view.zoom);for(const l of state.layers)paintLayer(ctx,l);if(measureDraft?.length&&measureType)drawMeasurement(ctx,{kind:"measure",vertices:[...measureDraft,...(measureHover?[measureHover]:[])],measureType,opacity:1,visible:true,preview:true});ctx.restore()}ctx.restore();positionBoxes();scheduleDetail()}
function positionBoxes(){const c=$('cropBox'),s=$('selectionBox');if(state.mode==='crop'&&state.crop){const b=state.crop;c.hidden=false;c.style.left=sx(b.x)+'px';c.style.top=sy(b.y)+'px';c.style.width=Math.max(4,b.w*state.view.zoom)+'px';c.style.height=Math.max(4,b.h*state.view.zoom)+'px';}else c.hidden=true;
const l=getSelected();if(l && l.kind!=='measure' && !['crop','measure'].includes(state.mode)&&!l.locked&&state.mode!=='normal'&&l.visible){s.hidden=false;s.style.left=sx(l.x)+'px';s.style.top=sy(l.y)+'px';s.style.width=Math.max(8,l.w*state.view.zoom)+'px';s.style.height=Math.max(8,l.h*state.view.zoom)+'px';s.style.transform=`rotate(${l.angle||0}rad)`}else s.hidden=true;positionTextTools();positionDimensions()}
function updateControls(){const has=state.layers.length>0;for(const id of ['btnCrop','btnText','btnSave','btnExport','btnMeasure'])$(id).disabled=!has||state.busy;$('btnLayers').setAttribute('aria-expanded',String(!$('layersPanel').hidden));$('btnCrop').classList.toggle('active',state.mode==='crop');$('btnMeasure').classList.toggle('active',state.mode==='measure');stage.classList.toggle('measure-cursor',state.mode==='measure');$('btnLayers').classList.toggle('active',!$('layersPanel').hidden);$('empty').hidden=has;updateUndoButtons();$('linkMissing').hidden=![...state.sources.values()].some(s=>s.missing);$('actionTray').hidden=!['crop','measure'].includes(state.mode);$('confirmAction').disabled=state.mode==='crop'?!(state.crop?.w>2&&state.crop?.h>2):state.mode==='measure'&&measureDraft?.length<(measureType==='area'?3:measureType==='route'?2:1);$('measureMenu').hidden=true;renderLayers();updateStatus();const compass=$('compass');const base=state.layers.find(l=>l.kind==='base');const geo=base&&state.sources.get(base.sourceId)?.geodata;compass.hidden=!(geo?.hasGeo&&!geo.rotated);laterDraw()}
function showLayers(force){const v=force===undefined?$('layersPanel').hidden:force;$('layersPanel').hidden=!v;updateControls()}
function escHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function renderLayers(){const list=$('layerList');list.replaceChildren();if(!state.layers.length){const p=document.createElement('p');p.className='small';p.textContent='Todavía no hay capas.';list.append(p);return}
 for(const l of [...state.layers].reverse()){
 const row=document.createElement('div');row.className='layer'+(state.multi.has(l.id)||state.selected===l.id?' selected':'');row.tabIndex=0;row.draggable=true;row.addEventListener('dragstart',e=>{movingLayerId=l.id;e.dataTransfer.setData('text/plain',l.id)});row.addEventListener('dragover',e=>e.preventDefault());row.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();placeBeforeTarget(l.id)});row.addEventListener('dragend',()=>{movingLayerId=null});row.setAttribute('role','option');row.setAttribute('aria-selected',String(state.selected===l.id));
 const thumb=document.createElement('canvas');thumb.className='layer-thumb';thumb.width=42;thumb.height=42;const c=thumb.getContext('2d');if(l.kind==='measure'){c.fillStyle='#16334a';c.fillRect(0,0,42,42);c.fillStyle='#8ce9d8';c.font='bold 24px Arial';c.fillText('↗',9,30)}else if(l.kind==='text'){c.fillStyle='#18354a';c.fillRect(0,0,42,42);c.fillStyle=l.color||'#eaffff';c.font='bold 26px Arial';c.fillText('T',12,31)}else{const src=state.sources.get(l.sourceId);if(src?.preview){const v=l.srcWindow||[0,0,src.w,src.h],px=src.preview.width/src.w,py=src.preview.height/src.h;try{c.drawImage(src.preview,v[0]*px,v[1]*py,(v[2]-v[0])*px,(v[3]-v[1])*py,0,0,42,42)}catch(e){}}}
 const name=document.createElement('span');name.className='layer-name';name.textContent=l.name;name.title='Doble clic para editar el nombre';name.ondblclick=e=>{e.stopPropagation();rename(l)};
 const actions=document.createElement('div');actions.className='layer-actions';const act=(title,symbol,fn)=>{const b=document.createElement('button');b.type='button';b.title=title;b.setAttribute('aria-label',`${title}: ${l.name}`);b.innerHTML=icon(symbol);b.onclick=e=>{e.stopPropagation();fn()};actions.append(b);return b};
 act(l.visible?'Ocultar':'Mostrar',l.visible?'eye':'eye-off',()=>{record();l.visible=!l.visible;updateControls()});act(l.locked?'Desbloquear':'Bloquear',l.locked?'lock':'unlock',()=>{record();l.locked=!l.locked;updateControls()});
 const alpha=act('Transparencia','opacity',()=>{const open=row.querySelector('.layer-alpha');open.hidden=!open.hidden});
 const opacity=document.createElement('div');opacity.className='layer-alpha';opacity.hidden=true;const label=document.createElement('label');label.textContent='Opacidad';const slider=document.createElement('input');slider.type='range';slider.min=0;slider.max=100;slider.value=Math.round(l.opacity*100);slider.setAttribute('aria-label','Opacidad de '+l.name);const value=document.createElement('output');value.textContent=slider.value+' %';slider.onpointerdown=e=>e.stopPropagation();slider.onclick=e=>e.stopPropagation();slider.addEventListener('pointerdown',()=>record());slider.oninput=()=>{l.opacity=+slider.value/100;value.textContent=slider.value+' %';laterDraw()};label.append(slider,value);opacity.append(label);
 row.append(thumb,name,actions,opacity);row.onclick=e=>{if(movingLayerId){placeBeforeTarget(l.id);return}if(e.shiftKey&&state.selected){const a=state.layers.findIndex(q=>q.id===state.selected),b=state.layers.indexOf(l);if(a>=0)for(const item of state.layers.slice(Math.min(a,b),Math.max(a,b)+1))state.multi.add(item.id);}else if(e.ctrlKey||e.metaKey){state.multi.has(l.id)?state.multi.delete(l.id):state.multi.add(l.id);state.selected=l.id;state.mode=!l.locked?'edit':'normal';updateControls()}else selectLayer(l.id)};
 row.ondblclick=e=>{if(e.target===row||e.target===thumb)rename(l)};
 let holdTimer;row.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch'||e.target.closest('button,input'))return;const px=e.clientX,py=e.clientY;holdTimer=setTimeout(()=>{holdTimer=null;state.selected=l.id;state.multi=new Set([l.id]);updateControls();contextExport(px,py)},600)});for(const event of ['pointerup','pointercancel','pointermove'])row.addEventListener(event,()=>{if(holdTimer){clearTimeout(holdTimer);holdTimer=null}});
 row.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();if(!state.multi.has(l.id)){state.multi=new Set([l.id]);state.selected=l.id;updateControls()}contextExport(e.clientX,e.clientY)};
 row.onkeydown=e=>{if(e.target===row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();selectLayer(l.id)}else if(e.target===row&&(e.key==='Delete'||e.key==='Backspace')){e.preventDefault();deleteSelected()}};
 list.append(row)
 }}
function contextExport(x,y){const prev=document.querySelector('.layer-context');prev?.remove();const menu=document.createElement('div');menu.className='layer-context';menu.style.left=Math.max(5,Math.min(x,innerWidth-205))+'px';menu.style.top=Math.max(5,Math.min(y,innerHeight-180))+'px';
 const add=(label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{menu.remove();fn()};menu.append(b)};
 add(`Exportar ${state.multi.size>1?'capas seleccionadas':'capa'}`,exportSelected);
 if(state.multi.size===1){const l=getSelected();if(l){const idx=state.layers.indexOf(l);add('Mover posición',()=>repositionLayer(l))}}
 add('Eliminar selección',deleteSelected);document.body.append(menu);setTimeout(()=>document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target))menu.remove()},{once:true}),10)}
function deleteSelected(){const ids=state.multi.size?[...state.multi]:state.selected?[state.selected]:[];if(!ids.length)return;const count=ids.length;record();state.layers=state.layers.filter(l=>!ids.includes(l.id));for(const [id] of state.sources)if(!state.layers.some(l=>l.sourceId===id))state.sources.delete(id);state.multi=new Set();state.selected=state.layers.at(-1)?.id||null;if(!state.layers.length){state.scene={w:0,h:0};state.mode='normal';state.view={zoom:1,x:0,y:0};}updateControls();msg('Capas eliminadas del proyecto.')}

function moveLayer(l,dir){record();const i=state.layers.indexOf(l),j=i+dir;if(j>=0&&j<state.layers.length){[state.layers[i],state.layers[j]]=[state.layers[j],state.layers[i]];updateControls()}}
function repositionLayer(l){movingLayerId=l.id;showLayers(true);msg('Seleccione la capa de destino para mover «'+l.name+'» a su posición. Escape cancela.');}
function placeBeforeTarget(targetId){if(!movingLayerId)return false;const a=state.layers.findIndex(l=>l.id===movingLayerId),b=state.layers.findIndex(l=>l.id===targetId);if(a<0||b<0){movingLayerId=null;return false}if(a!==b){record();const [item]=state.layers.splice(a,1);state.layers.splice(state.layers.findIndex(l=>l.id===targetId)+1,0,item)}movingLayerId=null;updateControls();msg('Orden de capas actualizado.');return true}

function rename(l){const row=[...$('layerList').children].find(r=>r.querySelector('.layer-name')?.textContent===l.name);if(!row)return;const node=row.querySelector('.layer-name');const input=document.createElement('input');input.type='text';input.className='layer-rename';input.maxLength=90;input.value=l.name;node.replaceWith(input);input.focus();input.select();let done=false;const finish=save=>{if(done)return;done=true;if(save&&input.value.trim()&&l.name!==input.value.trim()){record();l.name=input.value.trim()}updateControls()};input.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter')finish(true);if(e.key==='Escape')finish(false)};input.onblur=()=>finish(true)}
function deleteLayer(l){record();
 state.layers=state.layers.filter(e=>e.id!==l.id);if(!state.layers.some(e=>e.sourceId===l.sourceId))state.sources.delete(l.sourceId);
 if(state.selected===l.id)state.selected=state.layers.at(-1)?.id||null;
 if(!state.layers.length){state.scene={w:0,h:0};state.mode='normal';state.crop=null;state.view={zoom:1,x:0,y:0};}else state.mode='normal';updateControls();msg('Capa eliminada del proyecto.');}
function newProject(){
 createDocument('Sin título');msg('Nuevo espacio de trabajo.');}
function selectLayer(id){state.selected=id;state.multi=new Set([id]);const l=getSelected();state.mode=l&&!l.locked&&l.kind!=='base'?'edit':'normal';updateControls()}
function fileStatus(src){if(!src)return{title:'Sin imagen',detail:'Seleccione un archivo local'};if(src.missing)return{title:'Archivo sin vincular',detail:src.name+' · Vincule el original'};
 if(src.geodata?.epsg){const epsg=src.geodata.epsg;const names={3116:'MAGNA-SIRGAS / Colombia Bogotá',9377:'MAGNA-SIRGAS / Origen-Nacional',4686:'MAGNA-SIRGAS',32618:'WGS 84 / UTM zona 18N',32718:'WGS 84 / UTM zona 18S'};return{title:names[epsg]||src.geodata.description||`Sistema de referencia EPSG:${epsg}`,detail:`EPSG:${epsg} · ${src.w} × ${src.h} píxeles`}}
 if(src.geodata?.hasGeo)return{title:'Referencia espacial detectada',detail:`Sistema no identificado · ${src.w} × ${src.h} píxeles`};
 const g=src.metadata?.gps;if(g)return{title:'Fotografía con ubicación GPS',detail:`${Math.abs(g.lat).toFixed(6)}°${g.lat>=0?'N':'S'} · ${Math.abs(g.lon).toFixed(6)}°${g.lon>=0?'E':'O'}`};
 return{title:src.metadata?.items?.length?'Sin GPS en el archivo recibido':'Imagen sin datos geográficos',detail:`${src.name} · ${(src.size/1024).toFixed(0)} KB · ${src.w} × ${src.h} px`}}
function updateStatus(){const l=getSelected()||state.layers[0];const src=l?state.sources.get(l.sourceId):null;const baseSrc=state.sources.get(state.layers.find(x=>x.kind==='base')?.sourceId);const st=l?.kind==='measure'?(baseSrc?fileStatus(baseSrc):{title:'Medición sin referencia',detail:'Medición no disponible'}):l?.kind==='text'?(baseSrc?fileStatus(baseSrc):{title:'Texto sin referencia espacial',detail:'Posición en el espacio de trabajo'}):fileStatus(src);$('geoTitle').textContent=st.title;$('geoDetail').textContent=st.detail;$('geoStatus').disabled=!(src||(['text','measure'].includes(l?.kind)&&state.layers.some(x=>x.kind==='base')));$('geoStatus').title=src?'Consultar información y metadatos de la imagen':'Abra una imagen para consultar sus datos'}
function infoImage(){const l=getSelected()||state.layers[0];if(!l)return;const src=state.sources.get(l.sourceId)||state.sources.get(state.layers.find(x=>x.kind==='base')?.sourceId);if(!src)return;
 const f=(s)=>escHTML(String(s??'No consta'));
 const bytes=(n)=>Number.isFinite(n)?`${(n/(1024*1024)).toFixed(2)} MB (${n.toLocaleString('es-CO')} bytes)`:'No consta';
 const fields=[['Archivo',src.name],['Tipo',src.format==='tiff'?'TIFF / GeoTIFF':String(src.format||'imagen').toUpperCase()],['Dimensiones',`${src.w} × ${src.h} píxeles`],['Tamaño',bytes(src.size)],['Fecha de modificación del archivo',src.modified?new Date(src.modified).toLocaleString('es-CO'):'No consta']];
 const m=src.metadata||{items:[],gps:null,resumen:{}};const r=m.resumen||{},g=m.gps;
 const fact=['fabricante','modelo','fecha','iso','focal','apertura','exposicion','orientacion','software'];const labels={fabricante:'Fabricante de cámara',modelo:'Modelo de cámara',fecha:'Fecha de captura',iso:'ISO',focal:'Distancia focal (mm)',apertura:'Apertura (f)',exposicion:'Tiempo de exposición (s)',orientacion:'Orientación EXIF',software:'Software'};
 const orientations={1:'Normal',2:'Invertir horizontalmente',3:'Girar 180°',4:'Invertir verticalmente',5:'Transponer',6:'Girar 90° a la derecha',7:'Transversal',8:'Girar 90° a la izquierda'};const optional=fact.filter(k=>r[k]!=null&&r[k]!=='').map(k=>[labels[k],k==='exposicion'&&Number(r[k])>0&&Number(r[k])<1?'1/'+Math.round(1/Number(r[k])):k==='orientacion'?(orientations[r[k]]||'No identificada')+` (${r[k]})`:r[k]]);
 const table=arr=>`<dl class="meta-grid">${arr.map(([a,b])=>`<dt>${f(a)}</dt><dd>${f(b)}</dd>`).join('')}</dl>`;
 const status=src.geodata?.epsg?`EPSG:${src.geodata.epsg} · ${src.geodata.description||'Sistema de referencia espacial'}`:src.geodata?.hasGeo?'Datos espaciales sin EPSG identificado':g?`GPS ${g.fuente==='XMP'?'XMP':'EXIF'} (${g.datum||'dátum no declarado'}; lugar de captura, no georreferencia de toda la imagen)`:'Sin ubicación geográfica identificada';
 let html=`<p class="meta-note">Datos leídos en su equipo. La fotografía original no se modifica ni se envía por internet.</p><h3>Archivo</h3>${table(fields)}<h3>Información espacial</h3>${table([['Referencia',status],...(src.geodata?.origin?[['Origen del raster',src.geodata.origin.join(', ')]]:[]),...(src.geodata?.resolution?[['Resolución espacial',src.geodata.resolution.join(', ')]]:[])])}`;
 if(g){html+=`<h3>Ubicación de captura GPS</h3>${table([['Latitud',g.lat.toFixed(8)+'°'],['Longitud',g.lon.toFixed(8)+'°'],...(Number.isFinite(g.alt)?[['Altitud registrada',g.alt.toFixed(2)+' m · '+(g.altRef||'referencia no identificada')]]:[]),['Dátum declarado en metadatos',g.datum||'No declarado']])}<p><a class="maps-link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(g.lat.toFixed(8)+','+g.lon.toFixed(8))}" target="_blank" rel="noopener noreferrer">Ver ubicación en Google Maps</a></p><p class="small">Google Maps solo recibe las coordenadas cuando usted abre este enlace. Google Maps interpreta estas coordenadas en WGS 84. Si el EXIF declara otro dátum, la posición podría diferir; corresponde al lugar de captura, no a toda la fotografía.</p>`}
 if(optional.length)html+=`<h3>Datos de cámara</h3>${table(optional)}`;
 if(m.items?.length){const groups={ifd:'EXIF / imagen',exif:'EXIF / captura',gps:'GPS',xmp:'XMP',png:'PNG',archivo:'Otros datos'};html+=`<details class="meta-all"><summary>Todos los metadatos interpretados (${m.items.length})</summary>`;for(const [key,title] of Object.entries(groups)){const a=m.items.filter(x=>x.grupo===key);if(a.length)html+=`<h3>${title}</h3>${table(a.map(x=>[x.etiqueta,x.valor]))}`}html+='</details>'}
 if(!g&&!src.geodata?.hasGeo)html+='<h3>Ubicación GPS no disponible</h3><p class="small">El archivo que recibió el navegador no contiene coordenadas GPS interpretables, aunque pueda conservar otros datos EXIF. En Android, el selector de Fotos o algunas aplicaciones pueden entregar una copia sin ubicación. Abra el JPG original desde <strong>Archivos</strong> o el administrador de archivos, preferiblemente después de extraerlo de su archivo comprimido. Compruebe el nombre y el tamaño en la sección Archivo de esta ficha.</p>';
 if(m.incomplete)html+='<p class="small">La lectura de metadatos fue parcial; algunos campos pueden estar fuera del área examinada o utilizar una codificación no reconocida.</p>';
 html+='<p class="small">El original conserva sus metadatos íntegros. Las exportaciones de recorte TIFF no conservan todos los datos EXIF, XMP, IPTC ni los metadatos propietarios.</p>';
 if(src.file&&!src.missing)html+='<button id="downloadOriginal">Descargar archivo original sin cambios</button>';
 modal(`Información · ${src.name}`,html);const b=$('downloadOriginal');if(b)b.onclick=()=>download(src.file,src.name);
}
async function ensureTiff(){if(window.GeoTIFF?.fromBlob)return window.GeoTIFF;if(scriptPromise)return scriptPromise;scriptPromise=(async()=>{const sources=['vendor/geotiff.js','https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js'];for(const url of sources){try{await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.onload=resolve;s.onerror=()=>{s.remove();reject(Error('No disponible'))};document.head.append(s)});if(window.GeoTIFF?.fromBlob)return window.GeoTIFF}catch(e){}}throw Error('GeoTIFF.js no está disponible. Para uso sin conexión, agregue vendor/geotiff.js al sitio. Consulte la guía.')})();try{return await scriptPromise}finally{scriptPromise=null}}
function projection(geo){const fd=geo.fileDirectory||{},keys=geo.getGeoKeys?.()||{};const epsg=+(keys.ProjectedCSTypeGeoKey||keys.GeographicTypeGeoKey||0)||null;
let origin=null,resolution=null;try{origin=geo.getOrigin();resolution=geo.getResolution()}catch(e){}
const valid=!!(origin?.length>=2&&resolution?.length>=2&&origin.every(Number.isFinite)&&resolution.every(Number.isFinite));return {epsg,hasGeo:valid||!!keys.ProjectedCSTypeGeoKey||!!keys.GeographicTypeGeoKey,origin:valid?origin.slice(0,2):null,resolution:valid?resolution.slice(0,2):null,description:keys.PCSCitationGeoKey||keys.GTCitationGeoKey||'',rasterType:keys.GTRasterTypeGeoKey||1,rotated:!!(fd.ModelTransformation&&(Math.abs(fd.ModelTransformation[1]||0)>1e-10||Math.abs(fd.ModelTransformation[4]||0)>1e-10)),geoKeys:keys};}
async function makePreviewTiff(image,w,h,src){const m=Math.min(1,MAX_PREVIEW/Math.max(w,h)),pw=Math.max(1,Math.round(w*m)),ph=Math.max(1,Math.round(h*m));const {image:overview,factor}=await bestImage(src,pw);const arr=await overview.readRGB({width:pw,height:ph,interleave:true,resampleMethod:'bilinear'});return rasterCanvas(arr,pw,ph)}
async function makePreviewImage(file){const im=await createImageBitmap(file);const w=im.width,h=im.height,m=Math.min(1,MAX_PREVIEW/Math.max(w,h)),pw=Math.max(1,Math.round(w*m)),ph=Math.max(1,Math.round(h*m));const cv=document.createElement('canvas');cv.width=pw;cv.height=ph;cv.getContext('2d').drawImage(im,0,0,pw,ph);im.close?.();return {preview:cv,w,h}}
async function buildSource(file,existingId=null){if(mimeType(file)==='invalid')throw Error('Formato no compatible. Use TIFF, JPG, PNG o WebP.');let src={id:existingId||uuid(),name:file.name,size:file.size,modified:file.lastModified,file,format:mimeType(file),missing:false};
 if(src.format==='tiff'){const lib=await ensureTiff();src.tiff=await lib.fromBlob(file);src.tiffImage=await src.tiff.getImage();src.w=src.tiffImage.getWidth();src.h=src.tiffImage.getHeight();src.geodata=projection(src.tiffImage);progress(1,'Cabecera y referencia espacial leídas');
 src.overviews=[{image:src.tiffImage,w:src.w,h:src.h}];try{const count=Math.min(await src.tiff.getImageCount(),30);for(let i=1;i<count;i++){const im=await src.tiff.getImage(i);if(im.getWidth()<src.w&&im.getHeight()<src.h&&im.getSamplesPerPixel()===src.tiffImage.getSamplesPerPixel())src.overviews.push({image:im,w:im.getWidth(),h:im.getHeight()})}}catch(e){console.warn('Pirámides internas:',e)}
 progress(2,src.overviews.length>1?`Encontrados ${src.overviews.length} niveles de resolución`:'Preparando lectura por sectores');src.preview=await makePreviewTiff(src.tiffImage,src.w,src.h,src);
 }else{const o=await makePreviewImage(file);Object.assign(src,o);src.geodata=null;progress(2,'Imagen local decodificada');}
 progress(3,'Extrayendo metadatos locales');try{src.metadata=await window.GranImagenMetadatos.leer(file)}catch(e){console.warn('Metadatos no interpretados:',e);src.metadata={items:[],gps:null,resumen:{},incomplete:true}}
 return src}
function loadAsLayer(src,at=null){record();state.sources.set(src.id,src);if(!state.scene.w){state.scene={w:src.w,h:src.h};state.layers.push({id:uuid(),name:src.name,kind:'base',sourceId:src.id,x:0,y:0,w:src.w,h:src.h,angle:0,visible:true,locked:true,opacity:1,srcWindow:null});state.selected=state.layers[0].id;state.multi=new Set([state.selected]);if(currentDocument?.title==='Sin título')renameDocument(src.name);fit()}else{
 const base=state.layers.find(l=>l.kind==='base'),basis=base&&state.sources.get(base.sourceId);const a=src.geodata,b=basis?.geodata;let x,y,w,h;
 if(a?.epsg&&b?.epsg&&a.epsg===b.epsg&&a.origin&&a.resolution&&b.origin&&b.resolution&&!a.rotated&&!b.rotated){w=Math.abs(src.w*a.resolution[0]/b.resolution[0]);h=Math.abs(src.h*a.resolution[1]/b.resolution[1]);x=(a.origin[0]-b.origin[0])/b.resolution[0];y=(a.origin[1]-b.origin[1])/b.resolution[1]}
 else{const sc=Math.min(1,Math.min(state.scene.w*.8/src.w,state.scene.h*.8/src.h));w=src.w*sc;h=src.h*sc;const pos=at||{x:cw()/2,y:ch()/2};x=wx(pos.x)-w/2;y=wy(pos.y)-h/2}
 state.layers.push({id:uuid(),name:src.name,kind:'image',sourceId:src.id,x,y,w,h,angle:0,visible:true,locked:false,opacity:1,srcWindow:null});state.selected=state.layers.at(-1).id;state.multi=new Set([state.selected]);state.mode='edit'}updateControls();msg(`Imagen importada localmente: ${src.name}`)}
async function loadFiles(files,relink=false,at=null){const arr=[...files];if(!arr.length)return;setBusy(true,'Leyendo archivos locales…');let ok=0;for(const file of arr){try{progress(0,'Leyendo '+file.name);const old=relink?[...state.sources.values()].find(s=>s.missing&&s.name===file.name&&s.size===file.size):null;if(relink&&!old){msg(`No coincide: ${file.name}. Revise nombre y tamaño.`,true);continue;}const src=await buildSource(file,old?.id||null);if(old){record();state.sources.set(src.id,src);ok++;msg('Archivo vinculado: '+src.name)}else{loadAsLayer(src,at);ok++}progress(4,'Vista lista: '+file.name);await new Promise(r=>setTimeout(r,150))}catch(e){console.error(e);msg(`No se pudo abrir ${file.name}: ${e.message}`,true)}}progress(4,'Carga finalizada',false);setBusy(false);updateControls();if(ok)laterDraw();state.fileMode='open'}
function saveProject(){if(!state.layers.length)return;const data={format:'GranImagen',version:'1.7.0',fecha:new Date().toISOString(),aviso:'El archivo .granimagen contiene referencias y ajustes, no incluye las imágenes originales.',sources:[...state.sources.values()].map(s=>({id:s.id,name:s.name,size:s.size,modified:s.modified,format:s.format,w:s.w,h:s.h,geodata:s.geodata?{epsg:s.geodata.epsg,hasGeo:s.geodata.hasGeo,origin:s.geodata.origin,resolution:s.geodata.resolution,description:s.geodata.description,rotated:s.geodata.rotated,rasterType:s.geodata.rasterType}:null,metadata:s.metadata?{gps:s.metadata.gps,resumen:s.metadata.resumen,items:s.metadata.items?.slice(0,2000),incomplete:s.metadata.incomplete}:null})),scene:state.scene,view:state.view,layers:state.layers,selected:state.selected};download(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),safeName(state.projectName.replace(/\.[^.]+$/,'')||'GranImagen')+'.granimagen');msg('Proyecto preparado para descarga; imágenes originales excluidas.')}
async function openProject(file){try{const json=JSON.parse(await file.text());if(json.format!=='GranImagen'||!Array.isArray(json.sources)||!Array.isArray(json.layers)||json.sources.length>2000||json.layers.length>5000)throw Error('Archivo de proyecto no compatible');createDocument(file.name.replace(/\.granimagen$/i,''));state.sources=new Map(json.sources.filter(s=>typeof s.id==='string'&&typeof s.name==='string'&&Number.isFinite(s.w)&&Number.isFinite(s.h)).map(s=>[s.id,{...s,missing:true,preview:null,file:null}]));state.layers=json.layers.filter(l=>(['text','measure'].includes(l.kind)||state.sources.has(l.sourceId))&&Number.isFinite(l.w)&&Number.isFinite(l.h)&&Number.isFinite(l.x)&&Number.isFinite(l.y)).map(l=>({...l,angle:Number.isFinite(l.angle)?l.angle:0,visible:l.visible!==false,locked:!!l.locked,opacity:clamp(Number(l.opacity)||0,0,1)}));state.scene=json.scene||{w:0,h:0};state.selected=state.layers.some(l=>l.id===json.selected)?json.selected:state.layers.at(-1)?.id||null;state.multi=new Set(state.selected?[state.selected]:[]);state.mode='normal';fit();updateControls();msg('Proyecto abierto. Vincule las imágenes originales.');modal('Vincular archivos',`<p>Este proyecto no contiene las imágenes originales. Seleccione sus archivos TIFF, JPG, PNG o WebP para volver a mostrarlos. Deben conservar el nombre y tamaño originales.</p><button id="modalRelink">Vincular imágenes</button>`);$('modalRelink').onclick=()=>{closeModal();$('relinkPicker').click()}}catch(e){msg('No se pudo leer el proyecto: '+e.message,true)}}
function download(blob,filename){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=safeName(filename);document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60_000)}
function startCrop(){measureType=null;measureDraft=null;const l=getSelected()||state.layers[0];if(!l||['text','measure'].includes(l.kind)){msg('Seleccione una capa de imagen para dibujar el recorte.',true);return}if(Math.abs(l.angle||0)>1e-6){msg('Para recortar esta capa, ajuste primero su rotación a cero.',true);return}state.selected=l.id;state.mode='crop';state.crop=null;$('actionText').textContent='Recorte dibujado';updateControls();msg('Dibuje el área: toque y arrastre sobre la imagen. Después puede ajustar las esquinas.')}
function cancelAction(){measureType=null;measureDraft=null;measureHover=null;state.crop=null;state.mode=getSelected()&&!getSelected().locked?'edit':'normal';updateControls()}
function acceptCrop(){const b=state.crop,l=state.layers.find(x=>x.id===b?.layerId);if(!b||!l)return;const left=clamp(b.x,l.x,l.x+l.w),top=clamp(b.y,l.y,l.y+l.h),right=clamp(b.x+b.w,l.x,l.x+l.w),bottom=clamp(b.y+b.h,l.y,l.y+l.h);if(right-left<1||bottom-top<1){msg('El recorte es demasiado pequeño.',true);return}const src=state.sources.get(l.sourceId);if(!src){msg('Primero vincule el archivo original.',true);return}const prev=l.srcWindow||[0,0,src.w,src.h];const toX=x=>prev[0]+((x-l.x)/l.w)*(prev[2]-prev[0]),toY=y=>prev[1]+((y-l.y)/l.h)*(prev[3]-prev[1]);const win=[clamp(toX(left),0,src.w),clamp(toY(top),0,src.h),clamp(toX(right),0,src.w),clamp(toY(bottom),0,src.h)];record();const crop={id:uuid(),name:`Recorte de ${l.name}`,kind:'crop',sourceId:l.sourceId,x:left,y:top,w:right-left,h:bottom-top,angle:0,visible:true,locked:false,opacity:1,srcWindow:win};state.layers.push(crop);state.selected=crop.id;state.multi=new Set([crop.id]);state.crop=null;state.mode='edit';updateControls();msg('Recorte creado como capa independiente.')}
async function toRGB(src,win){const x0=Math.floor(win[0]),y0=Math.floor(win[1]),x1=Math.ceil(win[2]),y1=Math.ceil(win[3]);const w=x1-x0,h=y1-y0;if(w<=0||h<=0||w*h>MAX_EXPORT)throw Error('El recorte supera el límite de 8 millones de píxeles. Seleccione un sector menor.');if(src.format==='tiff'){const data=await src.tiffImage.readRGB({window:[x0,y0,x1,y1],width:w,height:h,interleave:true});const rgb=new Uint8Array(w*h*3);const b=Math.max(1,Math.round(data.length/(w*h)));for(let i=0;i<w*h;i++){rgb[i*3]=data[i*b]||0;rgb[i*3+1]=data[i*b+1]??data[i*b]??0;rgb[i*3+2]=data[i*b+2]??data[i*b]??0;}return {rgb,w,h,x0,y0}}const full=await createImageBitmap(src.file);const cv=document.createElement('canvas');cv.width=w;cv.height=h;const c=cv.getContext('2d',{willReadFrequently:true});c.fillStyle='white';c.fillRect(0,0,w,h);c.drawImage(full,x0,y0,w,h,0,0,w,h);full.close?.();const rgba=c.getImageData(0,0,w,h).data,rgb=new Uint8Array(w*h*3);for(let i=0;i<w*h;i++){rgb[i*3]=rgba[i*4];rgb[i*3+1]=rgba[i*4+1];rgb[i*3+2]=rgba[i*4+2]}return{rgb,w,h,x0,y0}}
function createTIFF(data,geo){/* TIFF clásico con RGB o RGBA y GeoKeys de norte de cuadrícula. */
 const {rgb,rgba,w,h,x0=0,y0=0}=data,alpha=!!rgba,bytes=alpha?rgba:rgb,samples=alpha?4:3;
 if(w<1||h<1||w*h>MAX_EXPORT||!bytes||bytes.length!==w*h*samples)throw Error('Imagen TIFF fuera de límites.');
 const safeGeo=!!(geo?.epsg&&geo.origin&&geo.resolution&&geo.resolution[0]>0&&geo.resolution[1]<0&&geo.rasterType!==2&&!geo.rotated),projected=(geo?.epsg||0)>=2000;
 const keys=[1,1,0,3,1024,0,1,projected?1:2,1025,0,1,1,projected?3072:2048,0,1,geo?.epsg||0];
 const entries=[{tag:256,type:4,count:1,val:w},{tag:257,type:4,count:1,val:h},{tag:258,type:3,count:samples,arr:Array(samples).fill(8)},{tag:259,type:3,count:1,val:1},{tag:262,type:3,count:1,val:2},{tag:273,type:4,count:1,val:0},{tag:277,type:3,count:1,val:samples},{tag:278,type:4,count:1,val:h},{tag:279,type:4,count:1,val:bytes.length},{tag:284,type:3,count:1,val:1}];
 if(alpha)entries.push({tag:338,type:3,count:1,val:2}); // alfa no asociado, compatible con visores TIFF habituales
 if(safeGeo){entries.push({tag:33550,type:12,count:3,arr:[geo.resolution[0],Math.abs(geo.resolution[1]),0]},{tag:33922,type:12,count:6,arr:[0,0,0,geo.origin[0]+x0*geo.resolution[0],geo.origin[1]+y0*geo.resolution[1],0]},{tag:34735,type:3,count:keys.length,arr:keys})}
 entries.sort((a,b)=>a.tag-b.tag);let offset=8+2+entries.length*12+4;const extra=[];const align=()=>{if(offset%2)offset++};for(const e of entries){const size=e.count*(e.type===12?8:e.type===3?2:4);if(size>4){align();e.ptr=offset;extra.push(e);offset+=size}}align();const imageOffset=offset;entries.find(e=>e.tag===273).val=imageOffset;
 const out=new ArrayBuffer(imageOffset+bytes.length),dv=new DataView(out);dv.setUint16(0,0x4949,true);dv.setUint16(2,42,true);dv.setUint32(4,8,true);dv.setUint16(8,entries.length,true);let pos=10;
 for(const e of entries){dv.setUint16(pos,e.tag,true);dv.setUint16(pos+2,e.type,true);dv.setUint32(pos+4,e.count,true);if(e.ptr)dv.setUint32(pos+8,e.ptr,true);else if(e.type===3)dv.setUint16(pos+8,e.val,true);else dv.setUint32(pos+8,e.val,true);pos+=12}dv.setUint32(pos,0,true);
 for(const e of extra){let t=e.ptr;for(const v of e.arr){if(e.type===3){dv.setUint16(t,v,true);t+=2}else if(e.type===12){dv.setFloat64(t,v,true);t+=8}else{dv.setUint32(t,v,true);t+=4}}}new Uint8Array(out,imageOffset).set(bytes);return{blob:new Blob([out],{type:'image/tiff'}),georef:safeGeo,alpha}
}
async function exportLayer(l){const s=state.sources.get(l.sourceId);if(!s||s.missing)throw Error('Vincule el archivo original.');const win=l.srcWindow||[0,0,s.w,s.h];const rgb=await toRGB(s,win);const tif=createTIFF(rgb,s.geodata);download(tif.blob,`${safeName(l.name)}.tif`);return tif.georef}
function sceneGeo(){const base=state.layers.find(l=>l.kind==='base'),src=base&&state.sources.get(base.sourceId);if(!src?.geodata?.epsg||src.geodata.rotated||base.x!==0||base.y!==0||base.w!==state.scene.w||base.h!==state.scene.h)return null;return src.geodata}
async function exportComposite(layers,filename){const valid=layers.filter(l=>l.visible);if(!valid.length)throw Error('No hay capas visibles para exportar.');
 // Coordenadas de trabajo en píxeles originales, para conservar la resolución espacial.
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const l of valid){const cx=l.x+l.w/2,cy=l.y+l.h/2,co=Math.abs(Math.cos(l.angle||0)),si=Math.abs(Math.sin(l.angle||0)),rw=l.w*co+l.h*si,rh=l.w*si+l.h*co;x0=Math.min(x0,cx-rw/2);y0=Math.min(y0,cy-rh/2);x1=Math.max(x1,cx+rw/2);y1=Math.max(y1,cy+rh/2)}
 const left=Math.floor(x0),top=Math.floor(y0),w=Math.ceil(x1)-left,h=Math.ceil(y1)-top;if(w<=0||h<=0||w*h>MAX_EXPORT)throw Error('La composición supera 8 millones de píxeles. Oculte capas o exporte una zona menor.');
 const cv=document.createElement('canvas');cv.width=w;cv.height=h;const c=cv.getContext('2d',{willReadFrequently:true});c.translate(-left,-top);
 for(const l of valid){c.save();c.globalAlpha=clamp(l.opacity,0,1);c.translate(l.x+l.w/2,l.y+l.h/2);c.rotate(l.angle||0);c.scale(l.flipX?-1:1,l.flipY?-1:1);
 if(l.kind==='measure'){c.restore();drawMeasurement(c,l);continue}else if(l.kind==='text'){c.translate(-l.w/2,-l.h/2);renderText(c,l)}else{const src=state.sources.get(l.sourceId);if(!src||src.missing){c.restore();throw Error('Vincule todas las imágenes utilizadas antes de exportar.')};const win=l.srcWindow||[0,0,src.w,src.h];
 let bitmap;if(src.format==='tiff'){const data=await toRGB(src,win),temp=document.createElement('canvas');temp.width=data.w;temp.height=data.h;const tc=temp.getContext('2d');const im=tc.createImageData(data.w,data.h);for(let i=0,j=0;i<data.rgb.length;i+=3,j+=4){im.data[j]=data.rgb[i];im.data[j+1]=data.rgb[i+1];im.data[j+2]=data.rgb[i+2];im.data[j+3]=255}tc.putImageData(im,0,0);bitmap=temp;
 }else{bitmap=await createImageBitmap(src.file)}
 if(src.format==='tiff')c.drawImage(bitmap,-l.w/2,-l.h/2,l.w,l.h);
 else c.drawImage(bitmap,win[0],win[1],win[2]-win[0],win[3]-win[1],-l.w/2,-l.h/2,l.w,l.h);
 bitmap.close?.();}c.restore()}
 const rgba=new Uint8Array(c.getImageData(0,0,w,h).data);let transparent=false;for(let i=3;i<rgba.length;i+=4)if(rgba[i]!==255){transparent=true;break}
 let payload;if(transparent)payload={rgba,w,h,x0:left,y0:top};else{const rgb=new Uint8Array(w*h*3);for(let a=0,b=0;a<rgba.length;a+=4){rgb[b++]=rgba[a];rgb[b++]=rgba[a+1];rgb[b++]=rgba[a+2]}payload={rgb,w,h,x0:left,y0:top}}
 const tif=createTIFF(payload,sceneGeo());download(tif.blob,safeName(filename)+'.tif');return tif
}
async function performExport(layers,name){if(state.busy)return;setBusy(true,'Exportando capas visibles localmente…');try{if(layers.length===1){const l=layers[0],src=state.sources.get(l.sourceId),win=src&&(l.srcWindow||[0,0,src.w,src.h]);if(!['text','measure'].includes(l.kind)&&src&&Math.abs(l.angle||0)<1e-8&&Math.abs(l.w-(win[2]-win[0]))<1e-5&&Math.abs(l.h-(win[3]-win[1]))<1e-5&&l.opacity===1&&Math.abs(l.x-win[0])<1e-6&&Math.abs(l.y-win[1])<1e-6){await exportLayer(l);msg('TIFF de capa generado con coordenadas del origen, cuando están disponibles.');return}}
 const tif=await exportComposite(layers,name);msg(tif.georef?'TIFF compuesto georreferenciado preparado.': 'TIFF compuesto preparado; sistema de referencia no verificable.')}catch(e){console.error(e);msg('No se exportó: '+e.message,true)}finally{setBusy(false)}}
function exportVisible(){const layers=state.layers.filter(l=>l.visible);return performExport(layers,`${state.projectName.replace(/\.[^.]+$/,'')||'GranImagen'}_capas`)}
function exportSelected(){const ids=state.multi.size?state.multi:new Set([state.selected]);const layers=state.layers.filter(l=>ids.has(l.id)&&l.visible);if(!layers.length){msg('Muestre las capas seleccionadas para exportarlas.',true);return}return performExport(layers,layers.length===1?layers[0].name:'Capas_seleccionadas')}
function textMetrics(l){const c=document.createElement('canvas').getContext('2d'),fs=clamp(Number(l.fontSize)||35,6,500),lines=String(l.text||'Texto').split('\n');c.font=`${l.bold?'bold ':''}${fs}px ${l.font||'Arial'}`;return{w:Math.max(20,Math.ceil(Math.max(...lines.map(t=>c.measureText(t||' ').width))+16)),h:Math.ceil(lines.length*fs*1.24+fs*.25)}}
function createTextAt(x,y,initial='Texto'){record();const fs=clamp(Math.round(Math.min(state.scene.w,state.scene.h)*.035),14,180);const l={id:uuid(),kind:'text',name:'Texto',sourceId:null,text:initial,font:'Arial',fontSize:fs,color:'#ffffff',bold:false,shadow:false,effect:'normal',flipX:false,flipY:false,uniformScale:true,opacity:1,angle:0,x,y,w:0,h:0,naturalW:0,naturalH:0,visible:true,locked:false};const size=textMetrics(l);l.w=l.naturalW=size.w;l.h=l.naturalH=size.h;state.layers.push(l);state.selected=l.id;state.multi=new Set([l.id]);state.mode='edit';updateControls();showTextEntry(l)}
function hideTextEntry(){if($('textEditTray'))$('textEditTray').hidden=true;const el=$('textEntry');if(el){el.hidden=true;const l=state.layers.find(z=>z.id===el.dataset.layer);if(l)l.editing=false;el.dataset.layer=''}if($('textTools'))$('textTools').hidden=true}
function positionTextTools(){const l=getSelected(),tools=$('textTools'),input=$('textEntry');if(!tools)return;if(!l||l.kind!=='text'||state.mode==='crop'||state.mode==='text-place'||l.locked){tools.hidden=true;if(!input.hidden){const prior=state.layers.find(x=>x.id===input.dataset.layer);if(prior)prior.editing=false;input.hidden=true}return}
 tools.hidden=state.mode!=='edit';tools.style.left=Math.max(4,Math.min(cw()-Math.min(770,cw()-8),sx(l.x)))+'px';tools.style.top=Math.max(5,Math.min(ch()-48,sy(l.y)-52))+'px';
 if(!input.hidden&&input.dataset.layer===l.id){input.style.left=Math.max(4,Math.min(cw()-180,sx(l.x)))+'px';input.style.top=Math.max(60,Math.min(ch()-65,sy(l.y)))+'px';input.style.width=Math.max(145,Math.min(cw()-25,Math.abs(l.w*state.view.zoom)))+'px';input.style.fontFamily=l.font;input.style.fontSize=clamp(l.fontSize*state.view.zoom,16,80)+'px';input.style.fontWeight=l.bold?'bold':'normal';input.style.color=l.color}}
function syncTextControls(l){$('textFont').value=l.font||'Arial';$('textSize').value=l.fontSize||35;$('textColor').value=l.color||'#ffffff';$('textAlpha').value=Math.round((l.opacity??1)*100);for(const [id,active] of [['textBold',!!l.bold],['textShadow',!!l.shadow],['textUniform',l.uniformScale!==false]])$(id).classList.toggle('active',active);$('textEffect').title='Efecto: '+(l.effect||'normal')}
function showTextEntry(l){if(!l||l.kind!=='text')return;hideTextEntry();state.selected=l.id;state.mode='edit';l.editing=true;const input=$('textEntry');input.dataset.layer=l.id;input.value=l.text==='Texto'?'':l.text;input.placeholder='Escriba aquí';input.hidden=false;$('textEditTray').hidden=false;syncTextControls(l);positionTextTools();setTimeout(()=>{if(input.dataset.layer===l.id&&!input.hidden){input.focus();input.select()}},40);laterDraw()}
function textChanged(l){if(!l)return;const beforeW=l.naturalW||l.w,beforeH=l.naturalH||l.h;const sx0=l.w/Math.max(beforeW,1),sy0=l.h/Math.max(beforeH,1);const d=textMetrics(l);l.naturalW=d.w;l.naturalH=d.h;l.w=d.w*sx0;l.h=d.h*sy0;l.name='Texto: '+(l.text||'Texto').slice(0,32);updateControls()}
function setupTextTools(){const input=$('textEntry');input.addEventListener('pointerdown',e=>e.stopPropagation());input.addEventListener('input',()=>{const l=getSelected();if(!l||l.kind!=='text')return;record();l.text=input.value;textChanged(l)});input.addEventListener('blur',()=>{if(input.hidden)return;const l=state.layers.find(z=>z.id===input.dataset.layer);if(l){l.editing=false;if(!l.text.trim()){l.text='Texto';textChanged(l)}}input.hidden=true;laterDraw()});input.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finishTextEdit(true)}});
 const doIt=fn=>{const l=getSelected();if(!l||l.kind!=='text')return;record();fn(l);if(l.editing)syncTextControls(l);updateControls()};
 $('textFont').onchange=e=>doIt(l=>{l.font=e.target.value;textChanged(l)});$('textSize').onchange=e=>doIt(l=>{l.fontSize=clamp(Number(e.target.value),6,500);textChanged(l)});$('textColor').oninput=e=>{const l=getSelected();if(l?.kind==='text'){l.color=e.target.value;laterDraw()}};$('textColor').onchange=e=>doIt(l=>{l.color=e.target.value});
 $('textAlpha').addEventListener('pointerdown',()=>record());$('textAlpha').oninput=e=>{const l=getSelected();if(l?.kind==='text'){l.opacity=Number(e.target.value)/100;laterDraw()}};
 $('textBold').onclick=()=>doIt(l=>{l.bold=!l.bold;textChanged(l)});$('textShadow').onclick=()=>doIt(l=>l.shadow=!l.shadow);$('textEffect').onclick=()=>doIt(l=>l.effect=l.effect==='normal'?'hundido':l.effect==='hundido'?'tinta':'normal');$('textRotate').onclick=()=>doIt(l=>l.angle=(l.angle||0)+Math.PI/12);$('textMirror').onclick=()=>doIt(l=>l.flipX=!l.flipX);$('textFlipY').onclick=()=>doIt(l=>l.flipY=!l.flipY);$('textUniform').onclick=()=>doIt(l=>l.uniformScale=l.uniformScale===false?true:false);
}
function finishTextEdit(exit){const l=getSelected();if(l?.kind==='text'&&l.editing){l.text=$('textEntry').value||'Texto';l.editing=false;textChanged(l)}hideTextEntry();state.mode=exit?'normal':'edit';updateControls()}
function editText(){if(!state.scene.w){msg('Primero importe una imagen.',true);return}const l=getSelected();if(l?.kind==='text'){state.mode='edit';showTextEntry(l);return}state.mode='text-place';msg('Toque o haga clic sobre la imagen para escribir.');updateControls()}
function modal(title,html){$('modalTitle').textContent=title;$('modalBody').innerHTML=html;$('modal').showModal()}
function closeModal(){$('modal').close()}
function help(){modal('Gran Imagen · v1.7.0',`<p>Importe imágenes locales como capas en la pestaña actual. Use + para abrir un proyecto o crear uno nuevo. Arrastrar una imagen la coloca en el punto donde la suelte, o según su referencia espacial si esta coincide con la base.</p><p>Las mediciones de distancia, área, ruta y coordenadas se basan en el EPSG y la resolución espacial de la base; no equivalen a un levantamiento topográfico. Pegue imágenes y texto mediante Ctrl+V. Eliminar no solicita confirmación porque puede deshacer con Ctrl+Z.</p><p>La vista GeoTIFF obtiene primero una panorámica y mejora el detalle visible cuando usted amplía. El indicador de carga mide etapas completadas, no bytes leídos. Para recortar, dibuje el rectángulo con el mouse o el dedo, ajuste las esquinas y confirme.</p><p>Ctrl+Z deshace y Ctrl+Y rehace. El texto se coloca tocando el mapa. Su barra permite fuente, escala uniforme o libre mediante las esquinas, rotación y simetría. Las capas se reordenan por el menú «Mover posición».</p><p>Exportar compone las capas visibles con un máximo de ocho millones de píxeles. Se conservan coordenadas GeoTIFF compatibles; no todos los metadatos originales.</p><p>Diseño: Arley Zarate. Desarrollo: NOVA. Versión 1.7.0.</p>`)}

/* Medición: origen y paso de píxel de la imagen base. No se fabrican unidades cuando el CRS es desconocido. */
function measurementGeo(){const l=state.layers.find(q=>q.kind==='base');const g=l&&state.sources.get(l.sourceId)?.geodata;if(!g||!g.epsg||!g.origin||!g.resolution||g.rotated||!g.resolution.every(v=>Number.isFinite(v))||!g.origin.every(v=>Number.isFinite(v)))return null;return g}
function measureCRS(){const g=measurementGeo();if(!g)return null;return [3116,9377,32618,32718].includes(g.epsg)?'metric':[4326,4686].includes(g.epsg)?'geographic':null}
function geoPoint(p){const g=measurementGeo();return g?{x:g.origin[0]+p.x*g.resolution[0],y:g.origin[1]+p.y*g.resolution[1]}:null}
function segmentMeters(a,b){const c=measureCRS(),u=geoPoint(a),v=geoPoint(b);if(!c||!u||!v)return null;if(c==='metric')return Math.hypot(v.x-u.x,v.y-u.y);const lat1=u.y*Math.PI/180,lat2=v.y*Math.PI/180,dlat=lat2-lat1,dlon=(v.x-u.x)*Math.PI/180;const k=Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlon/2)**2;return 6371008.8*2*Math.asin(Math.min(1,Math.sqrt(k)))}
function polyArea(points){const crs=measureCRS();if(!crs||points.length<3)return null;let ps=points.map(geoPoint);if(crs==='geographic'){const r=Math.PI/180,lat=ps.reduce((a,p)=>a+p.y,0)/ps.length*r;ps=ps.map(p=>({x:6371008.8*p.x*r*Math.cos(lat),y:6371008.8*p.y*r}))}let a=0;for(let i=0;i<ps.length;i++){const p=ps[i],q=ps[(i+1)%ps.length];a+=p.x*q.y-q.x*p.y}return Math.abs(a)/2}
const fmtMeters=n=>n==null?'Sin unidad verificable':n>=1000?(n/1000).toLocaleString('es-CO',{maximumFractionDigits:3})+' km':n.toLocaleString('es-CO',{maximumFractionDigits:n<1?3:2})+' m';
const fmtArea=n=>n==null?'Sin área verificable':n>=10000?(n/10000).toLocaleString('es-CO',{maximumFractionDigits:3})+' ha':n.toLocaleString('es-CO',{maximumFractionDigits:2})+' m²';
function measureLabel(l){const pts=l.vertices||[];if(!pts.length)return '';if(l.measureType==='point'){const pt=geoPoint(pts[0]);return pt?`EPSG:${measurementGeo().epsg}  ${pt.x.toFixed(3)}, ${pt.y.toFixed(3)}`:''}if(l.measureType==='area')return fmtArea(polyArea(pts));let d=0;for(let i=1;i<pts.length;i++)d+=(segmentMeters(pts[i-1],pts[i])||0);return fmtMeters(d)}
function drawMeasurement(c,l){const pts=l.vertices||[];if(!pts.length)return;const scale=Math.max(state.view.zoom,.000001);c.save();c.globalAlpha=clamp(l.opacity??1,0,1);c.lineWidth=clamp(Number(l.lineWidth)||2,0.5,30)/scale;c.strokeStyle=l.color||'#8af5e5';c.fillStyle=l.color||'#93ffed';c.lineJoin='round';c.setLineDash(l.preview?[6/scale,5/scale]:[]);c.beginPath();c.moveTo(pts[0].x,pts[0].y);for(const pt of pts.slice(1))c.lineTo(pt.x,pt.y);if(l.measureType==='area'&&pts.length>2){c.closePath();c.fillStyle='#4de0b633';c.fill()}if(pts.length>1)c.stroke();c.setLineDash([]);for(const pt of pts){c.beginPath();c.arc(pt.x,pt.y,4/scale,0,2*Math.PI);c.fillStyle=l.color||'#aafff4';c.fill()}const last=pts.at(-1),label=l.preview?'':measureLabel(l);if(label){const size=12/scale;c.font=`600 ${size}px Arial`;const w=c.measureText(label).width+12/scale;c.fillStyle='#092333e8';c.fillRect(last.x+8/scale,last.y-23/scale,w,21/scale);c.fillStyle='#ecfffa';c.fillText(label,last.x+14/scale,last.y-8/scale)}c.restore()}
function startMeasurement(type){if(!measurementGeo()||!measureCRS()){msg('El EPSG no permite determinar unidades métricas seguras. Use un CRS admitido (3116, 9377, UTM, WGS84).',true);return}measureType=type;measureDraft=[];measureHover=null;state.mode='measure';$('actionText').textContent={distance:'Distancia: dos puntos',route:'Ruta: marque puntos y acepte',area:'Área: dibuje polígono y acepte',point:'Coordenadas: toque un punto'}[type];updateControls();msg('Marque los puntos sobre la imagen. Para finalizar ruta o área pulse ✓.');}
function addMeasureVertex(pt){if(!measureDraft)return;measureDraft.push(pt);measureHover=null;if((measureType==='point'&&measureDraft.length===1)||(measureType==='distance'&&measureDraft.length===2))finishMeasurement();else updateControls()}
function finishMeasurement(){const minimum=measureType==='area'?3:measureType==='route'||measureType==='distance'?2:1;if(!measureDraft||measureDraft.length<minimum){msg('Marque más puntos para completar la medición.',true);return}record();const v=measureDraft.map(p=>({x:p.x,y:p.y}));const xs=v.map(p=>p.x),ys=v.map(p=>p.y),l={id:uuid(),kind:'measure',measureType,name:{point:'Coordenadas',distance:'Distancia',area:'Área',route:'Ruta'}[measureType],vertices:v,sourceId:null,x:Math.min(...xs),y:Math.min(...ys),w:Math.max(1,Math.max(...xs)-Math.min(...xs)),h:Math.max(1,Math.max(...ys)-Math.min(...ys)),angle:0,opacity:1,color:'#8af5e5',lineWidth:2,visible:true,locked:false};state.layers.push(l);state.selected=l.id;state.multi=new Set([l.id]);measureDraft=null;measureHover=null;measureType=null;state.mode='normal';updateControls();msg('Medición: '+measureLabel(l))}
function selectedDimensions(l){const geo=measurementGeo(),crs=measureCRS();if(!geo||!crs)return{width:l.w,height:l.h,unit:'px',factorX:1,factorY:1};const a={x:l.x,y:l.y},t=l.angle||0;const wx0={x:a.x+l.w*Math.cos(t),y:a.y+l.w*Math.sin(t)},hy0={x:a.x-l.h*Math.sin(t),y:a.y+l.h*Math.cos(t)};const aw=segmentMeters(a,wx0),ah=segmentMeters(a,hy0);return aw!=null&&ah!=null?{width:aw,height:ah,unit:'m',factorX:aw/Math.max(1e-8,l.w),factorY:ah/Math.max(1e-8,l.h)}:{width:l.w,height:l.h,unit:'px',factorX:1,factorY:1}}
function positionDimensions(){const panel=$('objectDims'),l=getSelected();if(!l||l.kind==='measure'||l.locked||!l.visible||!['edit'].includes(state.mode)){panel.hidden=true;return}panel.hidden=false;const d=selectedDimensions(l),fmt=v=>v.toFixed(d.unit==='px'?1:3);if(!dimensionRefresh){$('dimWidth').value=fmt(d.width);$('dimHeight').value=fmt(d.height);$('dimAngle').value=((l.angle||0)*180/Math.PI).toFixed(1)}$('dimUnit').textContent=d.unit;$('dimUniform').classList.toggle('active',l.uniformScale!==false);const vw=$('viewWidth'),vh=$('viewHeight');vw.textContent=fmt(d.width)+' '+d.unit;vh.textContent=fmt(d.height)+' '+d.unit;panel.style.left=Math.max(5,Math.min(cw()-Math.min(370,cw()-10),sx(l.x)))+'px';panel.style.top=Math.max(8,Math.min(ch()-55,sy(l.y+l.h)+35))+'px'}
function initDimensions(){const change=(name,input)=>{const l=getSelected();if(!l||l.locked||l.kind==='measure')return;const n=Number(input.value),d=selectedDimensions(l);if(!Number.isFinite(n)||n<=0)return;record();if(name==='angle'){l.angle=n*Math.PI/180}else{const originalW=l.w,originalH=l.h;if(name==='width'){l.w=n/d.factorX;if(l.uniformScale!==false)l.h=originalH*l.w/originalW}else{l.h=n/d.factorY;if(l.uniformScale!==false)l.w=originalW*l.h/originalH}}updateControls()};$('dimWidth').onchange=e=>change('width',e.target);$('dimHeight').onchange=e=>change('height',e.target);$('dimAngle').onchange=e=>change('angle',e.target);$('dimUniform').onclick=()=>{const l=getSelected();if(l){record();l.uniformScale=l.uniformScale===false;updateControls()}};for(const el of $('objectDims').querySelectorAll('input')){el.addEventListener('focus',()=>dimensionRefresh=true);el.addEventListener('blur',()=>{dimensionRefresh=false;laterDraw()});el.addEventListener('pointerdown',e=>e.stopPropagation())}}
async function onPaste(e){const target=e.target;if(target?.closest?.('input,textarea,[contenteditable],dialog'))return;const clip=e.clipboardData;if(!clip||state.busy)return;const item=[...clip.items].find(q=>q.kind==='file'&&q.type.startsWith('image/'));if(item){e.preventDefault();let f=item.getAsFile();if(!f)return;const ext=(f.type.split('/')[1]||'png').replace('jpeg','jpg');f=new File([f],`Portapapeles_${Date.now()}.${ext}`,{type:f.type||'image/png'});await loadFiles([f],false,{x:cw()/2,y:ch()/2});return}const t=clip.getData('text/plain');if(t?.trim()&&state.scene.w){e.preventDefault();createTextAt(wx(cw()/2),wy(ch()/2),t.slice(0,2000));msg('Texto pegado como una capa editable.')}}
function pointerStage(e){const r=stage.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
function wireBox(el,kind){el.addEventListener('pointerdown',e=>{if(e.button>0)return;e.stopPropagation();const target=e.target.closest('[data-handle]');const h=target?.dataset.handle||'move';const b=kind==='crop'?state.crop:getSelected();if(!b|| (kind==='selection'&&b.locked))return;if(kind==='selection')record();state.drag={kind,h,start:pointerStage(e),original:{...b}};el.setPointerCapture(e.pointerId);e.preventDefault()});el.addEventListener('pointermove',e=>{if(state.drag?.kind!==kind)return;e.stopPropagation();const d=state.drag,pt=pointerStage(e),dx=(pt.x-d.start.x)/state.view.zoom,dy=(pt.y-d.start.y)/state.view.zoom,b=kind==='crop'?state.crop:getSelected();if(!b)return;const o=d.original;if(d.h==='rotate'&&kind==='selection'){const cx=sx(o.x+o.w/2),cy=sy(o.y+o.h/2);b.angle=Math.atan2(pt.y-cy,pt.x-cx)+Math.PI/2}else if(d.h==='move'){b.x=o.x+dx;b.y=o.y+dy}else{let x=o.x,y=o.y,w=o.w,h=o.h;if(d.h.includes('w')){x=o.x+dx;w=o.w-dx}if(d.h.includes('e'))w=o.w+dx;if(d.h.includes('n')){y=o.y+dy;h=o.h-dy}if(d.h.includes('s'))h=o.h+dy;if(w>2&&h>2){if(kind==='selection'&&b.uniformScale!==false){const ratio=o.w/Math.max(1,o.h);if(Math.abs(w-o.w)>Math.abs(h-o.h)*ratio){h=w/ratio;if(d.h.includes('n'))y=o.y+o.h-h}else{w=h*ratio;if(d.h.includes('w'))x=o.x+o.w-w}}Object.assign(b,{x,y,w,h})}}laterDraw();e.preventDefault()});const end=e=>{if(state.drag?.kind===kind){e.stopPropagation();state.drag=null;updateControls()}};el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end)}
function initDock(){const bar=document.querySelector('.toolbar');if(!bar)return;const buttons=[...bar.querySelectorAll('button')];bar.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;buttons.forEach(b=>{const r=b.getBoundingClientRect(),center=r.top+r.height/2,dist=Math.abs(e.clientY-center);const scale=1+Math.max(0,1-dist/115)*.5;b.style.setProperty('--dock-scale',scale.toFixed(3));b.classList.toggle('dock-enlarged',scale>1.02)})});bar.addEventListener('pointerleave',()=>{buttons.forEach(b=>{b.style.removeProperty('--dock-scale');b.classList.remove('dock-enlarged')})})}
function wireEvents(){window.addEventListener('resize',resize);stage.addEventListener('contextmenu',e=>e.preventDefault());stage.addEventListener('wheel',e=>{e.preventDefault();const p=pointerStage(e);zoom(Math.exp(-e.deltaY*.0015),p)},{passive:false});
 stage.addEventListener('pointerdown',e=>{if(e.target!==stage&&e.target!==canvas)return;if(!state.scene.w)return;stage.setPointerCapture(e.pointerId);const p=pointerStage(e);if(state.mode==='text-place'){createTextAt(wx(p.x),wy(p.y));e.preventDefault();return}if(state.mode==='measure'){addMeasureVertex({x:wx(p.x),y:wy(p.y)});e.preventDefault();return}if(state.mode==='normal'||state.mode==='edit'){const tx=wx(p.x),ty=wy(p.y);const hit=[...state.layers].reverse().find(l=>l.kind==='text'&&l.visible&&!l.locked&&tx>=l.x&&tx<=l.x+l.w&&ty>=l.y&&ty<=l.y+l.h);if(hit){selectLayer(hit.id);return}}if(state.mode==='crop'){const l=getSelected();if(!l)return;state.crop={layerId:l.id,x:clamp(wx(p.x),l.x,l.x+l.w),y:clamp(wy(p.y),l.y,l.y+l.h),w:0,h:0};state.drag={kind:'drawcrop',pointer:e.pointerId,start:p};laterDraw();return}panPointers.set(e.pointerId,p);if(panPointers.size===2){const v=[...panPointers.values()];pinch={distance:Math.hypot(v[0].x-v[1].x,v[0].y-v[1].y),zoom:state.view.zoom,x:state.view.x,y:state.view.y,center:{x:(v[0].x+v[1].x)/2,y:(v[0].y+v[1].y)/2}}}else{state.drag={kind:'pan',pointer:e.pointerId,start:p,origX:state.view.x,origY:state.view.y};stage.classList.add('dragging')}});
 stage.addEventListener('pointermove',e=>{if(state.mode==='measure'&&measureDraft?.length){const p=pointerStage(e);measureHover={x:wx(p.x),y:wy(p.y)};laterDraw();return}if(state.drag?.kind==='drawcrop'){const l=getSelected();if(!l)return;const p=pointerStage(e),a=state.drag.start,x1=clamp(wx(a.x),l.x,l.x+l.w),y1=clamp(wy(a.y),l.y,l.y+l.h),x2=clamp(wx(p.x),l.x,l.x+l.w),y2=clamp(wy(p.y),l.y,l.y+l.h);state.crop={layerId:l.id,x:Math.min(x1,x2),y:Math.min(y1,y2),w:Math.abs(x2-x1),h:Math.abs(y2-y1)};laterDraw();return}if(!panPointers.has(e.pointerId))return;const p=pointerStage(e);panPointers.set(e.pointerId,p);if(panPointers.size===2&&pinch){const v=[...panPointers.values()],d=Math.max(1,Math.hypot(v[0].x-v[1].x,v[0].y-v[1].y));const z=clamp(pinch.zoom*d/Math.max(1,pinch.distance),1e-7,64),c={x:(v[0].x+v[1].x)/2,y:(v[0].y+v[1].y)/2};state.view.zoom=z;state.view.x=c.x-(pinch.center.x-pinch.x)*(z/pinch.zoom);state.view.y=c.y-(pinch.center.y-pinch.y)*(z/pinch.zoom);laterDraw()}else if(state.drag?.kind==='pan'&&state.drag.pointer===e.pointerId){state.view.x=state.drag.origX+p.x-state.drag.start.x;state.view.y=state.drag.origY+p.y-state.drag.start.y;laterDraw()}});
 const end=e=>{if(state.drag?.kind==='drawcrop'){state.drag=null;updateControls();return}panPointers.delete(e.pointerId);if(panPointers.size<2)pinch=null;if(state.drag?.kind==='pan'){state.drag=null;stage.classList.remove('dragging')}};stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',end);
 wireBox($('cropBox'),'crop');wireBox($('selectionBox'),'selection');$('selectionBox').addEventListener('dblclick',()=>{if(getSelected()?.kind==='text')editText()});
 for(const id of ['btnOpen','emptyOpen'])$(id).onclick=()=>{state.fileMode='insert';$('filePicker').click()};$('btnText').onclick=editText;$('btnMeasure').onclick=()=>{if(state.mode==='measure'){cancelAction();return}if(!measurementGeo()){msg('Necesita GeoTIFF georreferenciado con EPSG y resolución válidos para medir.',true);return}$('measureMenu').hidden=!$('measureMenu').hidden};document.querySelectorAll('[data-measure]').forEach(b=>b.onclick=()=>startMeasurement(b.dataset.measure));setupTextTools();$('textAccept').onclick=()=>finishTextEdit(false);$('textExit').onclick=()=>finishTextEdit(true);initDimensions();$('tabNew').onclick=()=>{$('tabMenu').hidden=true;newProject()};$('tabOpen').onclick=()=>{$('tabMenu').hidden=true;$('projectPicker').click()};$('btnUndo').onclick=undo;$('btnRedo').onclick=redo;$('filePicker').onchange=e=>{loadFiles(e.target.files);e.target.value=''};$('relinkPicker').onchange=e=>{loadFiles(e.target.files,true);e.target.value=''};$('projectPicker').onchange=e=>{if(e.target.files[0])openProject(e.target.files[0]);e.target.value=''};
 $('btnLayers').onclick=()=>showLayers();$('geoStatus').onclick=infoImage;$('closeLayers').onclick=()=>showLayers(false);$('btnCrop').onclick=startCrop;$('confirmAction').onclick=()=>state.mode==='measure'?finishMeasurement():acceptCrop();$('cancelAction').onclick=cancelAction;$('btnSave').onclick=saveProject;$('btnExport').onclick=exportVisible;$('zoomIn').onclick=()=>zoom(1.28);$('zoomOut').onclick=()=>zoom(1/1.28);$('zoomFit').onclick=fit;$('btnHelp').onclick=help;$('linkMissing').onclick=()=>$('relinkPicker').click();$('modalClose').onclick=closeModal;
 window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&document.activeElement!==$('textEntry')){e.preventDefault();e.shiftKey?redo():undo();return}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return}if((e.key==='Delete'||e.key==='Backspace')&&!e.target.closest('input,textarea,[contenteditable],dialog')&&!state.busy){e.preventDefault();deleteSelected();return}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='n'){e.preventDefault();newProject();return}if(e.key==='Escape'){if(movingLayerId){movingLayerId=null;msg('Movimiento cancelado.')}else if(state.mode==='text-place'){state.mode='normal';updateControls()}else if(state.mode==='crop'||state.mode==='measure')cancelAction();else if(state.mode==='edit'&&getSelected()?.kind==='text')finishTextEdit(true);else if($('modal').open)closeModal();else showLayers(false)}});
 window.addEventListener('paste',onPaste);let depth=0;window.addEventListener('dragenter',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();depth++;$('dropOverlay').hidden=false}});window.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault()});window.addEventListener('dragleave',e=>{if(e.dataTransfer?.types.includes('Files')){depth=Math.max(0,depth-1);if(!depth)$('dropOverlay').hidden=true}});window.addEventListener('drop',e=>{e.preventDefault();depth=0;$('dropOverlay').hidden=true;if(e.dataTransfer?.files?.length){state.fileMode='insert';loadFiles(e.dataTransfer.files,false,pointerStage(e))}});
}
function intro(){if(window.matchMedia('(prefers-reduced-motion:reduce)').matches)return;const el=$('introParticles'),c=el.getContext('2d');const dpr=Math.min(devicePixelRatio||1,2);el.width=Math.round(innerWidth*dpr);el.height=Math.round(innerHeight*dpr);el.classList.add('intro');const N=Math.min(135,innerWidth<650?70:130),pts=Array.from({length:N},(_,i)=>({angle:Math.random()*Math.PI*2,r:Math.sqrt(Math.random()),phase:Math.random()*5,size:Math.random()*1.6+0.5}));let start=performance.now();function frame(t){const f=Math.min(1,(t-start)/1750),ease=1-Math.pow(1-f,3),g=$('brand').getBoundingClientRect(),center={x:g.left+22,y:g.top+23},cx=innerWidth/2,cy=innerHeight/2;const scale=(1-ease)*Math.min(innerWidth,innerHeight)*.23+ease*20;c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,innerWidth,innerHeight);for(const p of pts){const a=p.angle+t*.0001;const origin={x:cx+Math.cos(a)*scale*(.7+p.r),y:cy+Math.sin(a)*scale*(.7+p.r)*.85};const x=origin.x+(center.x-origin.x)*ease,y=origin.y+(center.y-origin.y)*ease;c.beginPath();c.fillStyle=`rgba(103,239,235,${(.8-f*.7).toFixed(3)})`;c.arc(x,y,p.size*(1-ease*.5),0,Math.PI*2);c.fill()}if(f<1)requestAnimationFrame(frame);else{el.classList.remove('intro');c.clearRect(0,0,innerWidth,innerHeight)}}requestAnimationFrame(frame)}

/* 2026-10-28 · Gran Imagen 1.7.0 · selección múltiple y herramientas rápidas */
const GI_PATCH_VERSION='1.7.0';
let lastLayerPick=null, multiPickMode=false, moveArmed=false;
let multiTransform=null;

function rotatePoint(p,cx,cy,rad){const x=p.x-cx,y=p.y-cy,co=Math.cos(rad),si=Math.sin(rad);return{x:cx+x*co-y*si,y:cy+x*si+y*co};}
function syncVectorBounds(l){if(!l.vertices?.length)return;const xs=l.vertices.map(v=>v.x),ys=l.vertices.map(v=>v.y);l.x=Math.min(...xs);l.y=Math.min(...ys);l.w=Math.max(1,Math.max(...xs)-l.x);l.h=Math.max(1,Math.max(...ys)-l.y);}
function drawVectorNodes(){
 const container=$('vectorNodes');if(!container)return;
 const ids=currentSelectionIds(),l=ids.length===1?getSelected():null;
 const show=l?.kind==='measure' && Array.isArray(l.vertices) && !l.locked && l.visible && state.mode!=='measure';
 container.hidden=!show;
 if(!show){container.replaceChildren();return;}
 if(container.dataset.layer===l.id && container.childElementCount===l.vertices.length){
  [...container.children].forEach((handle,i)=>{handle.style.left=sx(l.vertices[i].x)+'px';handle.style.top=sy(l.vertices[i].y)+'px';});
  return;
 }
 container.replaceChildren(); container.dataset.layer=l.id;
 l.vertices.forEach((v,i)=>{
  const h=document.createElement('button');h.type='button';h.className='vector-node';h.title=`Mover nodo ${i+1}`;h.setAttribute('aria-label',`Mover nodo ${i+1}`);
  h.style.left=sx(v.x)+'px';h.style.top=sy(v.y)+'px';
  h.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();record();h.setPointerCapture(e.pointerId);h.dataset.drag='1';});
  h.addEventListener('pointermove',e=>{if(h.dataset.drag!=='1')return;const p=pointerStage(e);l.vertices[i]={x:wx(p.x),y:wy(p.y)};syncVectorBounds(l);laterDraw();e.stopPropagation();});
  const end=e=>{if(h.dataset.drag!=='1')return;delete h.dataset.drag;updateControls();e.stopPropagation();};
  h.addEventListener('pointerup',end);h.addEventListener('pointercancel',end);
  container.append(h);
 });
}
function currentSelectionIds(){ return state.multi?.size ? [...state.multi] : (state.selected ? [state.selected] : []); }
function currentSelectionLayers(){
  const ids=currentSelectionIds();
  return ids.map(id=>state.layers.find(l=>l.id===id)).filter(Boolean);
}
function deepClone(obj){ try{return structuredClone(obj);}catch(_){ return JSON.parse(JSON.stringify(obj)); } }
function layerBounds(layer){
  if(!layer) return null;
  if(layer.kind==='measure'){
    const pts=(layer.vertices||[]);
    if(!pts.length) return {x:layer.x||0,y:layer.y||0,w:layer.w||1,h:layer.h||1};
    const xs=pts.map(p=>p.x), ys=pts.map(p=>p.y);
    return {x:Math.min(...xs), y:Math.min(...ys), w:Math.max(1,Math.max(...xs)-Math.min(...xs)), h:Math.max(1,Math.max(...ys)-Math.min(...ys))};
  }
  return {x:layer.x||0,y:layer.y||0,w:Math.max(1,layer.w||1),h:Math.max(1,layer.h||1)};
}
function unionBounds(ids){
  const layers=ids.map(id=>state.layers.find(l=>l.id===id)).filter(Boolean);
  if(!layers.length) return null;
  const bounds=layers.map(layerBounds).filter(Boolean);
  const xs=bounds.map(b=>[b.x,b.x+b.w]).flat(), ys=bounds.map(b=>[b.y,b.y+b.h]).flat();
  return {x:Math.min(...xs), y:Math.min(...ys), w:Math.max(...xs)-Math.min(...xs), h:Math.max(...ys)-Math.min(...ys)};
}
function updateSelectionState(ids,last){
  const clean=(ids||[]).filter(Boolean);
  state.multi=new Set(clean);
  state.selected=(last && state.multi.has(last))?last:(clean.at(-1)||null);
  lastLayerPick=state.selected||lastLayerPick;
  state.mode=(state.selected && getSelected() && !getSelected().locked && getSelected().kind!=='base') ? 'edit' : 'normal';
  updateControls();
}
const _selectLayerOriginal = selectLayer;
selectLayer = function(id, options){
  const opts=options||{};
  if(!opts || (!opts.additive && !opts.range)) {
    _selectLayerOriginal(id);
    lastLayerPick=id;
    return;
  }
  const order=state.layers.map(l=>l.id);
  if(opts.range && (state.selected || lastLayerPick)){
    const a=order.indexOf(lastLayerPick || state.selected);
    const b=order.indexOf(id);
    if(a>-1 && b>-1){
      const [s,e]=a<b?[a,b]:[b,a];
      const ids=order.slice(s,e+1);
      updateSelectionState(ids,id);
      return;
    }
  }
  const set=new Set(currentSelectionIds());
  if(set.has(id)) set.delete(id); else set.add(id);
  if(!set.size) set.add(id);
  updateSelectionState([...set],id);
};
function duplicateSelection(){
  const layers=currentSelectionLayers().filter(l=>l.kind!=='base');
  if(!layers.length) return;
  record();
  const clones=[];
  for(const layer of layers){
    const copy=deepClone(layer);
    copy.id=uuid();
    copy.name=((layer.name||'Capa')+' copia').trim();
    copy.x=(layer.x||0)+10;
    copy.y=(layer.y||0)+10;
    if(Array.isArray(copy.vertices)) copy.vertices=copy.vertices.map(v=>({x:v.x+10,y:v.y+10}));
    const index=state.layers.findIndex(l=>l.id===layer.id);
    state.layers.splice(index+1,0,copy);
    clones.push(copy);
  }
  if(clones.length){
    updateSelectionState(clones.map(c=>c.id), clones.at(-1).id);
    laterDraw();
    msg((clones.length===1?'Capa duplicada.':'Capas duplicadas.'));
  }
}
function applyFlip(axis){
  const layers=currentSelectionLayers().filter(l=>!l.locked && l.kind!=='base');
  if(!layers.length) return;
  record();
  const bounds=unionBounds(layers.map(l=>l.id));
  const centerX=bounds.x+bounds.w/2, centerY=bounds.y+bounds.h/2;
  for(const l of layers){
    if(l.kind==='measure' && Array.isArray(l.vertices)){
      l.vertices=l.vertices.map(p=>axis==='h'?{x:centerX*2-p.x,y:p.y}:{x:p.x,y:centerY*2-p.y});
      syncVectorBounds(l);
    } else {
      if(axis==='h'){l.x=centerX*2-l.x-l.w;l.flipX=!l.flipX;}
      if(axis==='v'){l.y=centerY*2-l.y-l.h;l.flipY=!l.flipY;}
    }
  }
  laterDraw(); updateControls();
}
function rotateSelection(step){
  const layers=currentSelectionLayers().filter(l=>!l.locked && l.kind!=='base');
  if(!layers.length) return;
  record();
  const b=unionBounds(layers.map(l=>l.id));const cx=b.x+b.w/2,cy=b.y+b.h/2,rad=step*Math.PI/180;
  for(const l of layers){
    if(l.kind==='measure' && Array.isArray(l.vertices)){
      l.vertices=l.vertices.map(p=>rotatePoint(p,cx,cy,rad));syncVectorBounds(l);
    } else {
      const c=rotatePoint({x:l.x+l.w/2,y:l.y+l.h/2},cx,cy,rad);
      l.x=c.x-l.w/2;l.y=c.y-l.h/2;l.angle=(l.angle||0)+rad;
    }
  }
  laterDraw(); updateControls();
}
function pointInLayer(layer,x,y){
  if(!layer || !layer.visible || layer.locked) return false;
  const b=layerBounds(layer);
  if(layer.kind==='measure'){
    return x>=b.x-6/state.view.zoom && x<=b.x+b.w+6/state.view.zoom && y>=b.y-6/state.view.zoom && y<=b.y+b.h+6/state.view.zoom;
  }
  const cx=b.x+b.w/2, cy=b.y+b.h/2;
  let px=x-cx, py=y-cy;
  const ang=-(layer.angle||0);
  const rx=px*Math.cos(ang)-py*Math.sin(ang);
  const ry=px*Math.sin(ang)+py*Math.cos(ang);
  px=rx; py=ry;
  const localX=px + b.w/2, localY=py + b.h/2;
  return localX>=0 && localX<=b.w && localY>=0 && localY<=b.h;
}
function hitSelectable(tx,ty){
  return [...state.layers].reverse().find(l=>l.kind!=='base' && l.visible && pointInLayer(l,tx,ty));
}
function positionSelectionTools(){
  const tools=$('selectionTools'), sb=$('selectionBox');
  if(!tools || !sb) return;
  const ids=currentSelectionIds();
  if(!ids.length || !ids.some(id=>{const l=state.layers.find(x=>x.id===id);return l && !l.locked && l.kind!=='base' && l.visible}) || ['crop','measure','text-place'].includes(state.mode)){ tools.hidden=true; return; }
  const b=ids.length>1 ? unionBounds(ids) : layerBounds(getSelected());
  if(!b){ tools.hidden=true; return; }
  tools.hidden=false;
  tools.style.left=Math.max(10, Math.min(cw()-260, sx(b.x)+Math.max(0,(b.w*state.view.zoom-210)/2)))+'px';
  tools.style.top=Math.max(10, sy(b.y)-46)+'px';
}
const _positionBoxesOriginal=positionBoxes;
positionBoxes=function(){
  _positionBoxesOriginal();
  const ids=currentSelectionIds();
  const s=$('selectionBox');
  if(ids.length>1){
    const b=unionBounds(ids);
    if(b){
      s.hidden=false;
      s.classList.add('multi');
      s.style.left=sx(b.x)+'px';
      s.style.top=sy(b.y)+'px';
      s.style.width=Math.max(8,b.w*state.view.zoom)+'px';
      s.style.height=Math.max(8,b.h*state.view.zoom)+'px';
      s.style.transform='none';
      $('viewWidth').textContent=(Math.abs(b.w).toFixed(3).replace(/\.?0+$/,''))+'';
      $('viewHeight').textContent=ids.length+' seleccionados';
      $('objectDims').hidden=true;
    }
  } else {
    s.classList.remove('multi');
  }
  positionSelectionTools();
  drawVectorNodes();
}
const _renderLayersOriginal=renderLayers;
renderLayers=function(){
  _renderLayersOriginal();
  const list=$('layerList');
  const rows=[...list.querySelectorAll('.layer')];
  const mapped=[...state.layers].reverse();
  rows.forEach((row,i)=>{
    const layer=mapped[i]; if(!layer) return;
    row.dataset.layerId=layer.id;
    if(state.multi?.has(layer.id)) row.setAttribute('aria-multi','true'); else row.removeAttribute('aria-multi');
    row.onclick=(e)=>{
      if(e.target.closest('button,input,label,.layer-alpha')) return;
      if(e.shiftKey && !multiPickMode) selectLayer(layer.id,{range:true});
      else if(e.ctrlKey||e.metaKey||multiPickMode) selectLayer(layer.id,{additive:true});
      else selectLayer(layer.id);
    };
    row.onkeydown=(e)=>{
      if(e.key==='Delete'||e.key==='Backspace'){ e.preventDefault(); deleteSelected(); }
      if((e.key||'').toLowerCase()==='d' && !e.ctrlKey && !e.metaKey){ e.preventDefault(); duplicateSelection(); }
      if(e.key===' '||e.key==='Enter'){ e.preventDefault(); row.click(); }
    };
    const slider=row.querySelector('input[type="range"]');
    if(slider){
      slider.addEventListener('pointerdown',ev=>ev.stopPropagation());
      slider.addEventListener('click',ev=>ev.stopPropagation());
      slider.addEventListener('keydown',ev=>ev.stopPropagation());
    }
  });
}
function wireQuickActions(){
  $('btnDuplicateLayers')?.addEventListener('click',duplicateSelection);
  $('btnDeleteLayers')?.addEventListener('click',deleteSelected);
  $('btnMultiMode')?.addEventListener('click',()=>{multiPickMode=!multiPickMode;const b=$('btnMultiMode');b.setAttribute('aria-pressed',String(multiPickMode));b.title=multiPickMode?'Desactivar selección múltiple':'Activar selección múltiple';b.classList.toggle('active',multiPickMode);msg(multiPickMode?'Selección múltiple activada. Toque las capas u objetos.':'Selección múltiple desactivada.');});
  $('selDuplicate')?.addEventListener('click',duplicateSelection);
  $('selDelete')?.addEventListener('click',deleteSelected);
  $('selFlipH')?.addEventListener('click',()=>applyFlip('h'));
  $('selFlipV')?.addEventListener('click',()=>applyFlip('v'));
  $('selRotateL')?.addEventListener('click',()=>rotateSelection(-15));
  $('selRotateR')?.addEventListener('click',()=>rotateSelection(15));
  $('selMoveHint')?.addEventListener('click',()=>{moveArmed=!moveArmed;$('selMoveHint').classList.toggle('active',moveArmed);msg(moveArmed?'Arrastre en la imagen para mover la selección.':'Movimiento libre desactivado.');});
  $('vectorColor')?.addEventListener('change',e=>{const l=getSelected();if(l?.kind!=='measure')return;record();l.color=e.target.value;laterDraw();});
  $('vectorWidth')?.addEventListener('change',e=>{const l=getSelected();if(l?.kind!=='measure')return;record();l.lineWidth=clamp(Number(e.target.value)||2,.5,30);laterDraw();});
}
function startMultiTransform(kind,start){
  const editable=currentSelectionLayers().filter(l=>!l.locked && l.kind!=='base' && l.visible);
  if(!editable.length)return false;
  const center=unionBounds(editable.map(l=>l.id)); if(!center) return false;
  multiTransform={kind,start,center:{x:center.x+center.w/2,y:center.y+center.h/2},items:editable.map(l=>({id:l.id,x:l.x||0,y:l.y||0,angle:l.angle||0,vertices:Array.isArray(l.vertices)?l.vertices.map(v=>({x:v.x,y:v.y})):null}))};
  return true;
}
function updateMultiTransform(pt){
  if(!multiTransform) return;
  const dx=(pt.x-multiTransform.start.x)/state.view.zoom;
  const dy=(pt.y-multiTransform.start.y)/state.view.zoom;
  if(multiTransform.kind==='move'){
    multiTransform.items.forEach(item=>{
      const l=state.layers.find(x=>x.id===item.id); if(!l) return;
      if(Array.isArray(item.vertices)){l.vertices=item.vertices.map(v=>({x:v.x+dx,y:v.y+dy}));syncVectorBounds(l);}
      if(Number.isFinite(item.x)) l.x=item.x+dx;
      if(Number.isFinite(item.y)) l.y=item.y+dy;
    });
  } else if(multiTransform.kind==='rotate'){
    const c=multiTransform.center;
    const startA=Math.atan2(multiTransform.start.y-sy(c.y), multiTransform.start.x-sx(c.x));
    const nowA=Math.atan2(pt.y-sy(c.y), pt.x-sx(c.x));
    const delta=nowA-startA;
    multiTransform.items.forEach(item=>{
      const l=state.layers.find(x=>x.id===item.id); if(!l) return;
      if(Array.isArray(item.vertices)){l.vertices=item.vertices.map(p=>rotatePoint(p,c.x,c.y,delta));syncVectorBounds(l);}
      else {const center=rotatePoint({x:item.x+l.w/2,y:item.y+l.h/2},c.x,c.y,delta);l.x=center.x-l.w/2;l.y=center.y-l.h/2;l.angle=(item.angle||0)+delta;}
    });
  }
  laterDraw();
}
function stopMultiTransform(){
  if(multiTransform){ multiTransform=null; updateControls(); }
}
function installSelectionInterceptors(){
  const box=$('selectionBox');
  if(box && !box.dataset.giPatch){
    box.dataset.giPatch='1';
    box.addEventListener('pointerdown',e=>{
      const handle=e.target.closest('[data-handle]')?.dataset.handle;
      if(handle==='mirrorh' || handle==='mirrorv'){
        e.preventDefault(); e.stopImmediatePropagation();
        applyFlip(handle==='mirrorh'?'h':'v');
        return;
      }
      if(currentSelectionIds().length>1){
        if(handle==='rotate' || !handle){
          record();
          startMultiTransform(handle==='rotate'?'rotate':'move', pointerStage(e));
          box.setPointerCapture?.(e.pointerId);
          e.preventDefault(); e.stopImmediatePropagation();
        }
      }
    }, true);
    box.addEventListener('pointermove',e=>{
      if(!multiTransform) return;
      updateMultiTransform(pointerStage(e));
      e.preventDefault(); e.stopImmediatePropagation();
    }, true);
    const endMulti=(e)=>{ if(!multiTransform) return; stopMultiTransform(); e.preventDefault(); e.stopImmediatePropagation(); };
    box.addEventListener('pointerup',endMulti,true);
    box.addEventListener('pointercancel',endMulti,true);
  }
  stage.addEventListener('pointerdown',e=>{
    if(e.target!==stage && e.target!==canvas) return;
    if(!['normal','edit'].includes(state.mode)) return;
    if(e.button!==0)return;
    if(moveArmed && currentSelectionLayers().some(l=>!l.locked && l.kind!=='base' && l.visible)){
      record();startMultiTransform('move',pointerStage(e));
      stage.setPointerCapture?.(e.pointerId);
      e.preventDefault();e.stopImmediatePropagation();return;
    }
    if(!(e.ctrlKey||e.metaKey||e.shiftKey||multiPickMode)) {
      const pt=pointerStage(e), hit=hitSelectable(wx(pt.x),wy(pt.y));
      if(hit && hit.id!==state.selected) {selectLayer(hit.id);e.preventDefault();e.stopImmediatePropagation();}
      return;
    }
    const p=pointerStage(e), tx=wx(p.x), ty=wy(p.y);
    const hit=hitSelectable(tx,ty);
    if(!hit) return;
    if(e.shiftKey && !multiPickMode) selectLayer(hit.id,{range:true});
    else selectLayer(hit.id,{additive:true});
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  stage.addEventListener('pointermove',e=>{
    if(multiTransform){ updateMultiTransform(pointerStage(e)); e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  stage.addEventListener('pointerup',e=>{ if(multiTransform){ stopMultiTransform(); if(moveArmed){moveArmed=false;$('selMoveHint').classList.remove('active');}e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  stage.addEventListener('pointercancel',e=>{if(multiTransform)stopMultiTransform();moveArmed=false;$('selMoveHint').classList.remove('active');},true);
}
function patchKeyboard(){
  window.addEventListener('keydown',e=>{
    const active=document.activeElement;
    const typing=active && /input|textarea/i.test(active.tagName);
    if(!typing && (e.key||'').toLowerCase()==='d' && currentSelectionIds().length){
      e.preventDefault();
      duplicateSelection();
    }
  }, true);
}
const _updateControlsOriginal=updateControls;
updateControls=function(){
  _updateControlsOriginal();
  const many=currentSelectionIds().length>1;
  if($('btnDuplicateLayers')) $('btnDuplicateLayers').disabled=!currentSelectionIds().length;
  if($('btnDeleteLayers')) $('btnDeleteLayers').disabled=!currentSelectionIds().length;
  positionSelectionTools();
  const v=currentSelectionIds().length===1?getSelected():null;
  for(const id of ['vectorColorWrap','vectorWidthWrap'])$(id).hidden=!(v?.kind==='measure' && !v.locked);
  if(v?.kind==='measure'){$('vectorColor').value=v.color||'#8af5e5';$('vectorWidth').value=Number(v.lineWidth)||2;}
}
setTimeout(()=>{ wireQuickActions(); installSelectionInterceptors(); patchKeyboard(); updateControls(); renderLayers(); }, 0);

wireEvents();initDock();createDocument();resize();updateControls();requestAnimationFrame(intro);
})();
