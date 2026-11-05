'use strict';
(()=>{
const $=id=>document.getElementById(id), V=(x=0,y=0,z=0)=>[x,y,z],add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],len=a=>Math.hypot(...a),unit=a=>mul(a,1/(len(a)||1)),lerp=(a,b,t)=>add(mul(a,1-t),mul(b,t)),dist=(a,b)=>len(sub(a,b)),clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const TYPES={pipe:['Tuberías','#e2b54d'],fitting:['Accesorios','#f3cf7a'],valve:['Válvulas','#bbc5d0'],support:['Soportes','#e5ac53'],bolt:['Espárragos','#76899a'],gasket:['Empaques','#596d78'],weld:['Soldaduras','#ea6760'],special:['Especiales','#74b7c7'],flow:['Flujo','#63b9ff']};
const TOKENS=new Set('PIPE TUBE ELBOW BEND TEE REDUCER REDUCER-CONCENTRIC REDUCER-ECCENTRIC FLANGE VALVE BALL-VALVE GATE-VALVE CHECK-VALVE GLOBE-VALVE SUPPORT BOLT GASKET WELD FIELD-WELD SHOP-WELD INSTRUMENT COUPLING OLET CAP UNION STRAINER FILTER TRAP SPECIALTY-ITEM FLOW-ARROW END-CONNECTION-EQUIPMENT END-CONNECTION-PIPELINE'.split(' '));
const ENDKEYS=new Set(['END-POINT','START-POINT','CO-ORDS','COORDS','CENTRE-POINT','CENTER-POINT','BRANCH1-POINT','BRANCH2-POINT','SUPPORT-END-POINT','POSITION']);
// Dimensiones de referencia de bridas CL150 en mm: D exterior, PCD, espesor. Ajustar al catalogo aplicable.
const FLANGE150={'0.5':[88.9,60.3,11.2],'0.75':[98.6,69.9,12.7],'1':[108,79.2,13.8],'1.5':[127,98.4,15.9],'2':[152.4,120.7,17.5],'3':[190.5,152.4,22.3],'4':[228.6,190.5,22.3],'6':[279.4,241.3,25.4],'8':[342.9,298.5,29],'10':[406.4,362,30.2],'12':[482.6,431.8,31.8]};
function flangeRef(c){const n=c.nominal||null;const cls=(c.desc+' '+(c.attrs['PIPING-SPEC']||'')).toUpperCase();if(!n||/300|600|900|1500|2500/.test(cls))return null;return FLANGE150[String(n)]||null}
const NPS={'.125':10.3,'.25':13.7,'.375':17.1,'.5':21.3,'.75':26.7,'1':33.4,'1.25':42.2,'1.5':48.3,'2':60.3,'2.5':73,'3':88.9,'3.5':101.6,'4':114.3,'5':141.3,'6':168.3,'8':219.1,'10':273,'12':323.9,'14':355.6,'16':406.4,'18':457.2,'20':508,'24':609.6};
const state={doc:null,components:[],flowRecords:[],layers:Object.fromEntries(Object.keys(TYPES).map(k=>[k,{show:true,color:TYPES[k][1]}])),selected:new Set(),isolated:null,mode:'full',undo:[],redo:[],dirty:false,origin:[0,0,0],bounds:null,geometryDirty:true,gpuDirty:true,frameRequested:false,flowTime:0,flowTracks:[],jointPoints:[],flowOverrides:{}};
let cam={target:[0,0,0],radius:4200,yaw:-1.10,pitch:.45,fov:Math.PI/4,near:1,far:1000000,eye:[0,0,0],mvp:null,view:null},width=1,height=1,dpr=1;
const canvas=$('scene'),overlay=$('overlay'),overlayCtx=overlay.getContext('2d'),axis=$('axis'),cube=$('cube');let g2=null,gl=null,program=null,gpu=null,locs=null,fallbackCanvas=null;
const status=s=>{$('status').textContent=s},basename=n=>(n||'Modelo').replace(/\.[^./\\]+$/,'').replace(/[\\/:*?"<>|]/g,'_');
function unitScale(s,kind='coords'){switch(String(s||'MM').toUpperCase()){case 'INCH':return 25.4;case 'MM-HUNDREDTHS':return .01;case 'INCH-SIXTEENTH':return 25.4/16;case 'CM':return 10;case 'METRE':case 'METER':return 1000;default:return 1}}
function parsePCF(raw,name='modelo.pcf'){
 if(typeof raw!=='string'||raw.length>70e6)throw Error('Archivo demasiado grande. Máximo: 70 MB.');
 const eol=raw.includes('\r\n')?'\r\n':raw.includes('\r')?'\r':'\n',lines=raw.split(/\r\n|\r|\n/),doc={raw,lines,eol,name,units:{coords:'MM',bore:'MM',boltDia:'MM',boltLength:'MM'},components:[],arrows:[],materials:new Map(),pipeline:'Sin línea',spec:''};
 let comp=null,section='head',mat=null,activeLine='Sin línea',activeSpec='';
 for(let i=0;i<lines.length;i++){
   const s=lines[i],t=s.trim();if(!t)continue;
   if(/^MATERIALS\s*$/i.test(t)&&s===t){comp=null;section='materials';mat=null;continue}
   const tk=(t.match(/^([A-Za-z][A-Za-z0-9-]*)\b/)||[])[1]?.toUpperCase()||'';
   const val=t.slice(tk.length).trim();
   if(section==='materials'){
     if(tk==='MATERIAL-IDENTIFIER'&&s===t){mat={id:val,props:{}};doc.materials.set(val,mat)}
     else if(mat){mat.props[tk]=val}
     continue;
   }
   if(tk==='UNITS-CO-ORDS')doc.units.coords=val.toUpperCase();
   if(tk==='UNITS-BORE')doc.units.bore=val.toUpperCase();
   if(tk==='UNITS-BOLT-DIA')doc.units.boltDia=val.toUpperCase();
   if(tk==='UNITS-BOLT-LENGTH')doc.units.boltLength=val.toUpperCase();
   if(tk==='PIPELINE-REFERENCE' && s===t){activeLine=val;doc.pipeline=val;activeSpec='';}
   if(tk==='PIPING-SPEC'&&s===t){activeSpec=val;doc.spec=val;}
   if(s===t && TOKENS.has(tk)){
     comp={index:doc.components.length,type:tk,head:i,records:[],attrs:{},points:[],line:activeLine,spec:activeSpec,offset:[0,0,0],rawStart:i};
     if(tk==='FLOW-ARROW'){comp.flow=true;doc.arrows.push(comp)}else doc.components.push(comp);
     continue;
   }
   if(!comp)continue;
   if(s===t && /^[A-Z][A-Z0-9-]*$/.test(t) && !['FABRICATION-ITEM','ERECTION-ITEM','MESSAGE-CIRCLE'].includes(t)){
      comp=null;continue;
   }
   comp.records.push({key:tk,val,line:i});
   if(!(tk in comp.attrs))comp.attrs[tk]=val;
   if(tk==='LINE-NUMBER')comp.line=val;
   if(tk==='PIPELINE-REFERENCE')comp.line=val;
   if(tk==='PIPING-SPEC')comp.spec=val;
   if(ENDKEYS.has(tk)){
     const m=s.match(/^(\s*[A-Za-z][A-Za-z0-9-]*\s+)([-+]?\d+(?:\.\d+)?(?:[Ee][-+]?\d+)?)(\s+)([-+]?\d+(?:\.\d+)?(?:[Ee][-+]?\d+)?)(\s+)([-+]?\d+(?:\.\d+)?(?:[Ee][-+]?\d+)?)(.*)$/);
     if(m){const xyz=[+m[2],+m[4],+m[6]], extra=m[7].trim().split(/\s+/),nom=extra.length&&Number.isFinite(+extra[0])?+extra[0]:null;
      comp.points.push({key:tk,xyz,line:i,original:s,groups:m,nom});}
   }
 }
 const fac=unitScale(doc.units.coords);
 for(const c of [...doc.components,...doc.arrows]){
   c.points.forEach(p=>p.p=mul(p.xyz,fac));
   const mat=doc.materials.get(c.attrs['MATERIAL-IDENTIFIER']||'');c.material=mat||null;
   c.desc=c.attrs['COMPONENT-ATTRIBUTE2']||c.attrs.DESCRIPTION||c.type;
   c.id=c.attrs['UNIQUE-COMPONENT-IDENTIFIER']||'comp-'+c.head;
   const end=c.points.filter(p=>p.key==='END-POINT');c.ends=end;
   c.nominal=end[0]?.nom??c.points.find(p=>p.nom!==null)?.nom??null;
   c.nominalMM=c.nominal===null?null:c.nominal*unitScale(doc.units.bore);
   const od=mat?parseFloat(mat.props['OUTSIDE-DIAMETER']):NaN;
   const wall=mat?parseFloat(mat.props['WALL-THICKNESS']):NaN;
   c.od=Number.isFinite(od)&&od>0?od:(doc.units.bore==='INCH'&&c.nominal!==null?(NPS[String(c.nominal)]||c.nominal*25.4):Math.max(12,(c.nominalMM||100)*1.10));
   c.wall=Number.isFinite(wall)&&wall>0?wall:null;
   const od2=mat?parseFloat(mat.props['OUTSIDE-DIAMETER2']):NaN;
   c.od2=Number.isFinite(od2)&&od2>0?od2:(end[1]?.nom!==null&&end[1]?.nom!==undefined?(NPS[String(end[1].nom)]||end[1].nom*unitScale(doc.units.bore)):null);
   c.offset=[0,0,0]; c.colorType=typeOf(c.type);c.path=[];c.mesh=[];
 }
 return doc;
}

// Se preserva cada PCF como fuente independiente, sin reescribir sus materiales.
let documents=[],activeDocument=-1,views=[],activeViewIndex=0,viewportOffset={x:0,y:0,w:1,h:1},canvasWidth=1,canvasHeight=1,renderingMulti=false,dragPane=null,extraDocumentCount=1;
const copyLayers=()=>Object.fromEntries(Object.entries(state.layers).map(([k,v])=>[k,{...v}]));
function getSettings(){return Object.fromEntries(['floor','grid','human','flow','labels','jointCoords','welds','northToggle','multiSelect'].map(k=>[k,$(k).checked]).concat([['labelOpacity',+$('labelOpacity').value],['humanHeight',+$('humanHeight').value]]))}
function applySettings(p){for(const [k,v] of Object.entries(p||{})){if(!$(k))continue;if($(k).type==='checkbox')$(k).checked=!!v;else $(k).value=v;}updateOpacityText()}
function updateOpacityText(){$('opacityValue').textContent=$('labelOpacity').value+' %'}
function normalizeSource(doc,id,offsetMap=null,removedIds=null){
 doc.sourceId=id;for(const c of doc.components){c.sourceId=id;c.sourceName=doc.name;c.sourceUnits={...doc.units};const v=offsetMap?.get(c.id);if(v?.length===3&&v.every(Number.isFinite))c.offset=[...v];c.deleted=!!removedIds?.has(c.id)}
 for(const f of doc.arrows){f.sourceId=id;f.sourceName=doc.name;f.sourceUnits={...doc.units}}
 return doc;
}
function makeCombined(sources,name){
 if(!sources.length)throw Error('No hay fuentes PCF para combinar');
 const base=sources[0],parts=[],arrows=[];
 for(const src of sources){for(const c of src.components){c.index=parts.length;parts.push(c)}for(const a of src.arrows)arrows.push(a)}
 return {...base,name:name||base.name,components:parts,arrows,sources,raw:base.raw,lines:base.lines,eol:base.eol,units:base.units,originFile:base.name};
}
function makeBlankDoc(){let n=extraDocumentCount++;return makeCombined([normalizeSource(parsePCF('ISOGEN-FILES ISOGEN.FLS\nUNITS-BORE INCH\nUNITS-CO-ORDS MM\nPIPELINE-REFERENCE SIN_TITULO\n',`Sin título ${n}.pcf`),'src0')],`Sin título ${n}.pcf`)}
function snapshotSession(){return {doc:state.doc,selected:[...state.selected],isolated:state.isolated,mode:state.mode,undo:state.undo,redo:state.redo,dirty:state.dirty,layers:copyLayers(),settings:getSettings(),camera:{...cam,target:[...cam.target]},views:views.map(v=>({...v,cam:{...v.cam,target:[...v.cam.target]},filter:v.filter?[...v.filter]:null,packed:null})),activeViewIndex};}
function saveActiveSession(){if(activeDocument>=0&&documents[activeDocument])documents[activeDocument].session=snapshotSession()}
function restoreSession(s){
 state.doc=s.doc;state.selected=new Set(s.selected||[]);state.isolated=s.isolated||null;state.mode=s.mode||'full';state.undo=s.undo||[];state.redo=s.redo||[];state.dirty=!!s.dirty;
 state.layers=s.layers?Object.fromEntries(Object.entries(s.layers).map(([k,v])=>[k,{...v}])):copyLayers();applySettings(s.settings||{});
 views=(s.views?.length?s.views:[{cam:s.camera||{...cam,target:[...cam.target]},filter:null}]).map(v=>({...v,cam:{...v.cam,target:[...v.cam.target]},filter:v.filter?new Set(v.filter):null,packed:null}));
 activeViewIndex=clamp(s.activeViewIndex||0,0,views.length-1);cam=views[activeViewIndex].cam;
 if(state.doc?.components.length){state.bounds=findBounds(state.doc);updateGeometry();$('empty').classList.add('hidden')}
 else{state.bounds=null;state.flowTracks=[];state.jointPoints=[];$('empty').classList.remove('hidden')}
 $('filename').textContent=state.doc?.name||'Sin archivo';$('numbers').textContent=(state.doc?.components.length||0)+' componentes · '+(state.doc?.arrows.length||0)+' flechas PCF';populatePanels();inspect();renderViewportControls();updateTabs();updateCanvasSize();state.gpuDirty=true;renderSoon();syncOverlay();
}
function updateTabs(){const holder=$('documentTabs');holder.replaceChildren();holder.hidden=documents.length<2;document.documentElement.style.setProperty('--tabs-height',documents.length<2?'0px':'42px');
 documents.forEach((v,i)=>{const btn=document.createElement('div');btn.className='docTab';btn.tabIndex=0;btn.setAttribute('role','tab');btn.setAttribute('aria-selected',String(i===activeDocument));btn.title=v.session.doc.name;const name=document.createElement('span');name.className='tabName';name.textContent=v.session.doc.name+(v.session.dirty?' •':'');const cross=document.createElement('button');cross.className='tabX';cross.type='button';cross.setAttribute('aria-label','Cerrar '+v.session.doc.name);cross.textContent='×';cross.onclick=e=>{e.stopPropagation();closeDocument(i)};btn.append(name,cross);btn.onclick=()=>switchDocument(i);btn.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();switchDocument(i)}};holder.append(btn)});
}
function switchDocument(i){if(i<0||i>=documents.length||i===activeDocument)return;saveActiveSession();activeDocument=i;restoreSession(documents[i].session);status('Documento activo: '+state.doc.name)}
function closeDocument(i){if(i<0||i>=documents.length)return;if(i===activeDocument)saveActiveSession();const s=documents[i].session;if(s.dirty&&!confirm('Hay modificaciones sin guardar en «'+s.doc.name+'». ¿Cerrar el documento?'))return;
 documents.splice(i,1);if(!documents.length){activeDocument=-1;state.doc=null;state.selected.clear();views=[{cam:cloneCamera(cam),filter:null,packed:null}];activeViewIndex=0;state.bounds=null;$('empty').classList.remove('hidden');$('filename').textContent='Sin archivo';$('numbers').textContent='';updateTabs();renderViewportControls();renderSoon();return}
 if(i<activeDocument)activeDocument--;if(i===activeDocument){activeDocument=Math.min(i,documents.length-1);restoreSession(documents[activeDocument].session)}else updateTabs();}
function cloneCamera(v){return {...v,target:[...v.target],eye:v.eye?[...v.eye]:[0,0,0],mvp:null,view:null}}
function addDocumentFromRaw(raw,name){
 saveActiveSession();let previous=activeDocument>=0?documents[activeDocument].session:null;
 try{views=[{cam:cloneCamera(cam),filter:null,packed:null}];activeViewIndex=0;cam=views[0].cam;loadRaw(raw,name);const s=snapshotSession();documents.push({session:s});activeDocument=documents.length-1;if(!state.loadedViewportState){views=[{cam:cloneCamera(cam),filter:null,packed:null}];cam=views[0].cam;activeViewIndex=0;}documents[activeDocument].session=snapshotSession();updateTabs();renderViewportControls();updateCanvasSize();return true}
 catch(e){if(previous)restoreSession(previous);else{state.doc=null;$('empty').classList.remove('hidden')}throw e}
}
function newDocument(){saveActiveSession();const blank=makeBlankDoc();const fresh={doc:blank,selected:[],isolated:null,mode:'full',undo:[],redo:[],dirty:false,layers:copyLayers(),settings:getSettings(),camera:cloneCamera(cam),views:[{cam:cloneCamera(cam),filter:null}],activeViewIndex:0};documents.push({session:fresh});activeDocument=documents.length-1;restoreSession(fresh);status('Nuevo documento. Inserte un PCF o abra otro archivo.')}
let sourceSerial=0;
function getIncomingSources(raw,name){let idBase;const taken=new Set((state.doc?.sources||[]).map(x=>x.sourceId));
 do{idBase='src_'+(++sourceSerial)+'_'+documents.length+'_';}while([...taken].some(id=>id.startsWith(idBase)));
 if(/\.editapcf$/i.test(name)){
  const obj=JSON.parse(raw);if(obj.app!=='EditaPCF' || (![1,2].includes(obj.schemaVersion||1)))throw Error('Proyecto Edita PCF incompatible');
  if(Array.isArray(obj.sources)&&obj.sources.length){return obj.sources.map((r,j)=>normalizeSource(parsePCF(r.raw||r.pcf,r.name||'fuente_'+j+'.pcf'),idBase+j,new Map((r.offsets||[]).map(a=>[a[0],a.slice(1)])),new Set(r.deletedIds||[])))}
  const d=parsePCF(obj.pcf||obj.raw,obj.name||name);return [normalizeSource(d,idBase+'0',new Map((obj.offsets||[]).map(a=>[a[0],a.slice(1)])))];
 }
 return [normalizeSource(parsePCF(raw,name),idBase+'0')]
}
function insertRaw(raw,name){
 if(!state.doc){newDocument()}
 const next=getIncomingSources(raw,name);if(!next.some(s=>s.components.length))throw Error('El archivo no contiene componentes reconocidos');
 const existing=(state.doc.sources||[normalizeSource(state.doc,'src0')]).filter(src=>src.components.length>0),oldBounds=state.doc.components.length?state.bounds:null;
 const fresh=makeCombined([...existing,...next],state.doc.components.length?state.doc.name:next[0].name);
 // No modificar el estado activo hasta terminar de analizar el contenido entrante.
 const newBounds=findBounds({components:next.flatMap(src=>src.components)}); // No reasignar índices del documento combinado.
 const far=!!oldBounds&&Math.hypot(...oldBounds.center.map((n,i)=>n-newBounds.center[i]))>10000;
 state.doc=fresh;state.dirty=true;state.selected.clear();state.undo=[];state.redo=[];state.isolated=null;updateGeometry();
 if(far){setViewportLayout(2);views[0].filter=new Set(existing.map(s=>s.sourceId));views[1].filter=new Set(next.map(s=>s.sourceId));fitCameraFor(views[0],oldBounds);fitCameraFor(views[1],newBounds);activeViewIndex=1;cam=views[1].cam;status('Insertado a más de 10 m: dos vistas centradas en cada conjunto de archivos.');}
 else{for(const v of views)v.filter=null;fitView();status('PCF insertado. Se conservan por separado sus fuentes originales.');}
 $('filename').textContent=state.doc.name;$('numbers').textContent=state.doc.components.length+' componentes · '+state.doc.arrows.length+' flechas PCF';$('empty').classList.add('hidden');populatePanels();renderViewportControls();updateCanvasSize();syncOverlay();updateTabs();
}
function viewRects(){const w=Math.max(1,canvasWidth),h=Math.max(1,canvasHeight),n=views.length;
 if(n===1)return [{x:0,y:0,w,h}];if(n===2)return [{x:0,y:0,w:w/2,h},{x:w/2,y:0,w:w-w/2,h}];return [{x:0,y:0,w:w/2,h:h/2},{x:w/2,y:0,w:w-w/2,h:h/2},{x:0,y:h/2,w:w/2,h:h-h/2},{x:w/2,y:h/2,w:w-w/2,h:h-h/2}];}
function setViewportLayout(n){n=[1,2,4].includes(n)?n:1;const prev=views.length?views:[{cam:cloneCamera(cam),filter:null,packed:null}];views=Array.from({length:n},(_,i)=>prev[i]||{cam:cloneCamera(prev[0].cam),filter:null,packed:null});activeViewIndex=Math.min(activeViewIndex,n-1);cam=views[activeViewIndex].cam;renderViewportControls();updateCanvasSize();if(state.doc?.components.length){for(const v of views){let b=state.bounds;if(v.filter?.size){const src=(state.doc.sources||[]).filter(a=>v.filter.has(a.sourceId));if(src.length)b=findBounds(makeCombined(src,state.doc.name))}fitCameraFor(v,b)}}renderSoon();}
function focusView(i){if(i<0||i>=views.length)return;activeViewIndex=i;cam=views[i].cam;const r=viewRects()[i];width=r.w;height=r.h;cameraUpdate();renderViewportControls();renderSoon()}
function fitCameraFor(v,bounds){if(!bounds)return;const r=viewRects()[Math.max(0,views.indexOf(v))]||{w:canvasWidth,h:canvasHeight},oldCam=cam,oldWidth=width,oldHeight=height;cam=v.cam;width=r.w;height=r.h;const sz=bounds.size,span=Math.max(...sz,100);cam.target=[...bounds.center];cam.radius=Math.max(span*1.65,span/(2*Math.tan(cam.fov/2)*Math.min(1,width/height))*1.48,650);cam.near=Math.max(.1,span/30000);cam.far=cam.radius*300;cameraUpdate();cam=oldCam;width=oldWidth;height=oldHeight;}
function renderViewportControls(){const c=$('viewLabels');if(!c)return;c.replaceChildren();const rects=viewRects();for(let i=0;i<views.length;i++){
 const r=rects[i],tag=document.createElement('div');tag.className='viewLabel'+(i===activeViewIndex?' active':'');tag.style.left=(r.x+8)+'px';tag.style.top=(r.y+40)+'px';const b=document.createElement('button');b.textContent='Vista '+(i+1);b.onclick=()=>focusView(i);const sel=document.createElement('select');sel.setAttribute('aria-label','Contenido de vista '+(i+1));const options=[{v:'all',t:'Todo'}].concat((state.doc?.sources||[]).map(s=>({v:s.sourceId,t:s.name})));for(const a of options){const op=document.createElement('option');op.value=a.v;op.textContent=a.t;sel.append(op)}sel.value=views[i].filter?.size===1?[...views[i].filter][0]:'all';sel.onchange=()=>{views[i].filter=sel.value==='all'?null:new Set([sel.value]);views[i].packed=null;focusView(i);if(sel.value!=='all'){const src=state.doc.sources.find(x=>x.sourceId===sel.value);if(src)fitCameraFor(views[i],findBounds(makeCombined([src],src.name)))}renderSoon()};tag.append(b,sel);c.append(tag)}
 const show=views.length>1;c.style.display=show?'block':'none';}
function openViewportMenu(){openModal('Distribución de vistas','<p>Divida el espacio sin cambiar las coordenadas de los componentes.</p><div class="menurow"><button id="vOne">Una vista</button><button id="vTwo">Dos vistas</button><button id="vFour">Cuatro vistas</button></div><p class="tiny">Seleccione una vista para girar, panear o acercar. Cada vista conserva su propia cámara y puede mostrar un archivo concreto o el conjunto completo.</p>');for(const [id,num] of [['vOne',1],['vTwo',2],['vFour',4]])$(id).onclick=()=>{closeModal();setViewportLayout(num)}}

function typeOf(t){if(t==='PIPE'||t==='TUBE')return 'pipe';if(t.includes('VALVE'))return 'valve';if(t==='SUPPORT')return 'support';if(t==='BOLT')return 'bolt';if(t==='GASKET')return 'gasket';if(t.includes('WELD'))return 'weld';if('ELBOW BEND TEE REDUCER REDUCER-CONCENTRIC REDUCER-ECCENTRIC FLANGE COUPLING OLET CAP UNION'.split(' ').includes(t))return 'fitting';return 'special'}
// PCF CENTRE-POINT en codos de Isogen/CADWorx describe el vértice de tangentes,
// NO el centro del círculo. El círculo se calcula con el ángulo de deflexión.
// Los extremos originales nunca se desplazan ni se sustituyen.
function pathOf(c){const ep=c.ends,centre=c.points.find(p=>/CENTRE-POINT|CENTER-POINT/.test(p.key));
 if(['ELBOW','BEND'].includes(c.type)&&ep.length>=2&&centre){
   const a=ep[0].p,b=ep[1].p,vertex=centre.p;
   const toCorner=sub(vertex,a),fromCorner=sub(b,vertex),tA=len(toCorner),tB=len(fromCorner);
   const inDir=unit(toCorner),outDir=unit(fromCorner);
   const deflect=Math.acos(clamp(dot(inDir,outDir),-1,1));
   const normal=cross(inDir,outDir),normalLength=len(normal),nomAngle=Number(c.attrs.ANGLE)/100*Math.PI/180;
   const matchesAngle=!Number.isFinite(nomAngle)||nomAngle<=0||Math.abs(nomAngle-deflect)<.045;
   // Punto de tangencia, radio y ángulo deben ser coherentes. Si falta información
   // suficiente, no se inventa un arco certificado: se usa una Bézier tangencial.
   if(tA>1&&tB>1&&normalLength>.025&&deflect>.01&&deflect<Math.PI*.97&&matchesAngle){
     const meanT=(tA+tB)*.5,rad=meanT/Math.tan(deflect*.5);
     const axis=unit(normal),left=unit(cross(axis,inDir));
     const center=add(a,mul(left,rad));
     const ra=sub(a,center),rb=sub(b,center),lenA=len(ra),lenB=len(rb);
     const tolerance=Math.max(.1,rad*.015);
     const radialTheta=Math.acos(clamp(dot(unit(ra),unit(rb)),-1,1));
     if(Math.abs(lenA-rad)<tolerance&&Math.abs(lenB-rad)<tolerance&&Math.abs(radialTheta-deflect)<.055){
       const turnAxis=unit(cross(ra,rb)),segments=Math.max(12,Math.ceil(radialTheta*42/Math.PI));
       const pts=[];
       for(let i=0;i<=segments;i++){
         const theta=radialTheta*i/segments,v=add(add(mul(ra,Math.cos(theta)),mul(cross(turnAxis,ra),Math.sin(theta))),mul(turnAxis,dot(turnAxis,ra)*(1-Math.cos(theta))));
         pts.push(add(center,v));
       }
       pts[0]=[...a];pts[pts.length-1]=[...b];c.bendGeometry={method:'arco tangencial',radius:rad,angle:deflect*180/Math.PI,center};return pts;
     }
   }
   if(tA>1&&tB>1){
     const pts=[];for(let i=0;i<=24;i++){
       const t=i/24;pts.push(add(add(mul(a,(1-t)*(1-t)),mul(vertex,2*(1-t)*t)),mul(b,t*t)));
     }
     c.bendGeometry={method:'aproximación tangencial',angle:deflect*180/Math.PI};return pts;
   }
 }
 if(ep.length>=2)return [ep[0].p,ep[1].p];
 const cpt=c.points.find(p=>p.key==='CENTRE-POINT');const br=c.points.find(p=>p.key==='BRANCH1-POINT');
 if(cpt&&br)return[cpt.p,br.p];
 const co=c.points.find(p=>p.key==='CO-ORDS');const sup=c.points.find(p=>p.key==='SUPPORT-END-POINT');if(co&&sup)return[co.p,sup.p];
 return c.points.length? [c.points[0].p]:[];
}
// Low-level triangle meshes: every component stores vertex position and geometric normals.
function tri(arr,a,b,c,na=null,nb=null,nc=null){const n=unit(cross(sub(b,a),sub(c,a)));for(const [p,norm] of [[a,na||n],[b,nb||n],[c,nc||n]])arr.push(...p,...norm)}
function sphere(arr,center,r,steps=12,rings=7){for(let j=0;j<rings;j++){let a=-Math.PI/2+j*Math.PI/rings,b=-Math.PI/2+(j+1)*Math.PI/rings;for(let i=0;i<steps;i++){let u=i*2*Math.PI/steps,v=(i+1)*2*Math.PI/steps;const pt=(h,t)=>add(center,[r*Math.cos(h)*Math.cos(t),r*Math.cos(h)*Math.sin(t),r*Math.sin(h)]);let p=pt(a,u),q=pt(a,v),rr=pt(b,u),s=pt(b,v);tri(arr,p,q,rr,unit(sub(p,center)),unit(sub(q,center)),unit(sub(rr,center)));tri(arr,q,s,rr,unit(sub(q,center)),unit(sub(s,center)),unit(sub(rr,center)));}}}
function frame(dir){let n=unit(cross(dir,Math.abs(dir[2])<.9?[0,0,1]:[1,0,0]));return [n,unit(cross(dir,n))]}
function tube(arr,pts,r1,r2=r1,radial=22){
 if(pts.length<2)return;
 const rings=[]; let prevN=null;
 for(let i=0;i<pts.length;i++){
  const tangent=unit(sub(pts[Math.min(pts.length-1,i+1)],pts[Math.max(0,i-1)]));
  let n=prevN?sub(prevN,mul(tangent,dot(prevN,tangent))):frame(tangent)[0];
  if(len(n)<.0001)n=frame(tangent)[0];
  n=unit(n);const bi=unit(cross(tangent,n));prevN=n;
  const rad=r1+(r2-r1)*i/(pts.length-1),ring=[];
  for(let k=0;k<=radial;k++){
    const ang=k*2*Math.PI/radial,normal=add(mul(n,Math.cos(ang)),mul(bi,Math.sin(ang)));
    ring.push([add(pts[i],mul(normal,rad)),normal]);
  }
  rings.push(ring);
 }
 for(let i=0;i<rings.length-1;i++)for(let j=0;j<radial;j++){
  const a=rings[i][j],b=rings[i+1][j],c=rings[i][j+1],d=rings[i+1][j+1];
  tri(arr,a[0],b[0],c[0],a[1],b[1],c[1]);tri(arr,c[0],b[0],d[0],c[1],b[1],d[1]);
 }
 const front=unit(sub(pts[0],pts[1])),back=unit(sub(pts.at(-1),pts.at(-2)));
 for(let j=0;j<radial;j++){
  tri(arr,pts[0],rings[0][j+1][0],rings[0][j][0],front,front,front);
  tri(arr,pts.at(-1),rings.at(-1)[j][0],rings.at(-1)[j+1][0],back,back,back);
 }
}
function cyl(arr,a,b,r,radial=12){tube(arr,[a,b],r,r,radial)}
function torus(arr,center,axis,major,minor,segments=24,rings=8){let dir=unit(axis);const [n,b]=frame(dir);let ringPts=[];for(let i=0;i<=segments;i++){let ang=i*Math.PI*2/segments,radial=add(mul(n,Math.cos(ang)),mul(b,Math.sin(ang)));const ringCenter=add(center,mul(radial,major)),rr=[];for(let j=0;j<=rings;j++){let t=j*Math.PI*2/rings,nrm=add(mul(radial,Math.cos(t)),mul(dir,Math.sin(t))),p=add(ringCenter,mul(nrm,minor));rr.push([p,nrm]);}ringPts.push(rr)}for(let i=0;i<segments;i++)for(let j=0;j<rings;j++){let a=ringPts[i][j],b=ringPts[i+1][j],c=ringPts[i][j+1],d=ringPts[i+1][j+1];tri(arr,a[0],b[0],c[0],a[1],b[1],c[1]);tri(arr,c[0],b[0],d[0],c[1],b[1],d[1])}}
function box(arr,center,sx,sy,sz){const x=sx/2,y=sy/2,z=sz/2,v=[[-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z],[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]].map(p=>add(center,p));for(const q of [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]){tri(arr,v[q[0]],v[q[1]],v[q[2]]);tri(arr,v[q[0]],v[q[2]],v[q[3]])}}
function annulus(arr,pt,axis,rOuter,rInner,depth=12,segments=28){
 const u=unit(axis),[n,v]=frame(u),front=add(pt,mul(u,depth*.5)),rear=add(pt,mul(u,-depth*.5));
 const circle=(center,r,ang)=>add(center,add(mul(n,Math.cos(ang)*r),mul(v,Math.sin(ang)*r)));
 rInner=Math.max(.1,Math.min(rInner,rOuter*.92));
 for(let k=0;k<segments;k++){
  const t=2*Math.PI*k/segments,t1=2*Math.PI*(k+1)/segments;
  const of=circle(front,rOuter,t),of1=circle(front,rOuter,t1),orf=circle(rear,rOuter,t),or1=circle(rear,rOuter,t1);
  const inf=circle(front,rInner,t),in1=circle(front,rInner,t1),ir=circle(rear,rInner,t),ir1=circle(rear,rInner,t1);
  tri(arr,of,of1,in1);tri(arr,of,in1,inf);
  tri(arr,orf,ir1,or1);tri(arr,orf,ir,ir1);
  tri(arr,orf,or1,of1);tri(arr,orf,of1,of);
  tri(arr,ir,in1,ir1);tri(arr,ir,inf,in1);
 }
}
function ringDisc(arr,pt,axis,rOuter,rInner,depth=12){annulus(arr,pt,axis,rOuter,rInner,depth)}
function orientBox(arr,center,dir,width,height,length){
 const d=unit(dir),[n,v]=frame(d),basis=[mul(n,width*.5),mul(v,height*.5),mul(d,length*.5)];
 const q=(x,y,z)=>add(center,add(add(mul(basis[0],x),mul(basis[1],y)),mul(basis[2],z)));
 for(const face of [[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1]],[[1,-1,1],[-1,-1,1],[-1,1,1],[1,1,1]],[[-1,-1,1],[1,-1,1],[1,-1,-1],[-1,-1,-1]],[[1,1,1],[-1,1,1],[-1,1,-1],[1,1,-1]],[[-1,-1,1],[-1,-1,-1],[-1,1,-1],[-1,1,1]],[[1,-1,-1],[1,-1,1],[1,1,1],[1,1,-1]]]){
  const p=face.map(v=>q(...v));tri(arr,p[0],p[1],p[2]);tri(arr,p[0],p[2],p[3]);
 }
}
function gauge(arr,at,stemDir,pipeRadius){
 const up=unit(stemDir),dialRadius=Math.max(42,Math.min(90,pipeRadius*1.4)),[faceAxis,sideAxis]=frame(up);
 const shaftBase=add(at,mul(up,-dialRadius*.23)),shaftTop=add(at,mul(up,dialRadius*.10));
 cyl(arr,shaftBase,shaftTop,Math.max(6,dialRadius*.16),14);
 // Carcasa y borde circular, cara vertical normal al Norte/Sur del archivo, sin simular escala certificada.
 const dialAxis=Math.abs(dot(up,[0,1,0]))<.85?[0,1,0]:[1,0,0];
 const centre=add(at,mul(up,dialRadius*.38));
 cyl(arr,add(centre,mul(dialAxis,-dialRadius*.17)),add(centre,mul(dialAxis,dialRadius*.17)),dialRadius,28);
 torus(arr,add(centre,mul(dialAxis,dialRadius*.19)),dialAxis,dialRadius*.89,dialRadius*.065,28,8);
 // puntero y graduaciones volumétricas en el frente
 const [e1,e2]=frame(dialAxis),front=add(centre,mul(dialAxis,dialRadius*.23));
 const needle=add(front,add(mul(e1,dialRadius*.4),mul(e2,dialRadius*.28)));
 cyl(arr,front,needle,Math.max(2.5,dialRadius*.032),8);
 for(let k=0;k<11;k++){
  const ang=(k/10*.9+.05)*Math.PI*2;
  const t1=add(front,add(mul(e1,dialRadius*.70*Math.cos(ang)),mul(e2,dialRadius*.70*Math.sin(ang))));
  const t2=add(front,add(mul(e1,dialRadius*.80*Math.cos(ang)),mul(e2,dialRadius*.80*Math.sin(ang))));
  cyl(arr,t1,t2,Math.max(1.5,dialRadius*.012),6);
 }
}

function arrow(arr,p,dir,scale){let d=unit(dir),shaftEnd=add(p,mul(d,scale*.65)),end=add(p,mul(d,scale)),r=scale*.045;cyl(arr,p,shaftEnd,r,9);tube(arr,[shaftEnd,end],scale*.14,0.1,12)}
function nearestAxis(p,comps,kind='pipe'){let best=null,min=Infinity;for(let c of comps){if((kind==='pipe'&&!['PIPE','VALVE','FLANGE','TUBE'].includes(c.type))||c.ends.length<2)continue;const a=c.ends[0].p,b=c.ends[1].p,ab=sub(b,a),t=clamp(dot(sub(p,a),ab)/(dot(ab,ab)||1),0,1),d=dist(p,add(a,mul(ab,t)));if(d<min){min=d;best=unit(ab)}}return best||[1,0,0]}
function buildComponent(c,comps){
 let a=[],p=pathOf(c),od=Math.max(c.od||80,9),r=od/2,ep=c.ends,mid=p.length>1?lerp(p[0],p.at(-1),.5):p[0]||[0,0,0],ax=p.length>1?unit(sub(p.at(-1),p[0])):[1,0,0],desc=c.desc.toUpperCase();c.path=p;
 const e1=ep[0]?.p,e2=ep[1]?.p;
 switch(c.type){
 case 'PIPE':case 'TUBE': if(p.length>=2)tube(a,p,r,r,20);break;
 case 'ELBOW':case 'BEND':if(p.length>=2)tube(a,p,r,r,22);break;
 case 'TEE': if(ep.length>=2)cyl(a,e1,e2,r,20);for(const key of ['BRANCH1-POINT','BRANCH2-POINT']){const q=c.points.find(x=>x.key===key);if(q&&mid)cyl(a,mid,q.p,(c.od2||od)*.5,18)}break;
 case 'REDUCER':case 'REDUCER-CONCENTRIC':case 'REDUCER-ECCENTRIC':{
   if(ep.length>=2){const odA=od,odB=c.od2||od*(ep[1].nom||c.nominal*.65)/(c.nominal||1);
     tube(a,[e1,e2],odA*.5,Math.max(8,odB*.5),24);
   }break;
 }
 case 'FLANGE':{
   if(e1&&e2){const ref=flangeRef(c),flangeOD=ref?ref[0]:od*2,plateThick=ref?ref[2]:Math.min(28,od*.22);
    const face=e2,other=e1,axis=unit(sub(other,face)),plateCentre=add(face,mul(axis,plateThick*.5));
    const faceRad=flangeOD*.5;
    // Cuello adaptado a los END-POINT existentes; placas con agujero real
    const neckEnd=add(face,mul(axis,plateThick));
    annulus(a,plateCentre,axis,faceRad,od*.44,plateThick,32);
    if(dist(neckEnd,other)>3)tube(a,[neckEnd,other],od*.71,od*.5,24);
    annulus(a,add(face,mul(axis,-1)),axis,od*.68,od*.46,2,32);
   }break;
 }
 case 'VALVE':case 'BALL-VALVE':case 'GATE-VALVE':case 'CHECK-VALVE':case 'GLOBE-VALVE':{
   if(!e1||!e2)break;
   // Se respeta la conexión declarada por END-POINT/SKEY. Una válvula de conexión FL
   // se une a las piezas FLANGE del PCF; no se inventan bridas duplicadas.
   const ends=c.ends.map(x=>(x.original.trim().split(/\s+/).slice(5)[0]||'').toUpperCase());
   const skey=(c.attrs.SKEY||'').toUpperCase(),connection=ends.find(x=>['FL','SC','SW','BW','TH','THD'].includes(x))||skey.slice(-2);
   c.valveConnection=connection;
   const length=dist(e1,e2),ball=/BALL|\bVB/.test(desc+' '+skey),gate=/GATE|\bVG/.test(desc+' '+skey);
   const isFlanged=connection==='FL', isSocket=connection==='SW', isThreaded=['SC','TH','THD'].includes(connection);
   const bodyR=isFlanged?Math.min(od*.61,length*.25):Math.min(od*.75,length*.32);
   const midR=Math.max(od*.43,Math.min(bodyR,length*.35));
   const throat=Math.max(od*(isFlanged?.38:.40),4);
   // Tramos de conexión y transición, sin placas para válvula FL.
   const neck=.25; tube(a,[e1,lerp(e1,e2,neck)],od*.49,throat,20);
   tube(a,[lerp(e1,e2,1-neck),e2],throat,od*.49,20);
   c.meshAccent=[];let dark=c.meshAccent;
   if(ball){sphere(dark,mid,midR,24,14);if(isFlanged){for(const p of [lerp(e1,e2,.25),lerp(e1,e2,.75)]){annulus(a,p,ax,Math.max(od*.47,midR*.78),throat*.72,Math.max(2,od*.045),24)}}}
   else if(gate){orientBox(dark,mid,ax,od*1.14,od*.78,Math.max(od*.7,length*.55));}
   else {tube(dark,[lerp(e1,e2,.23),mid,lerp(e1,e2,.77)],throat*1.12,throat*1.12,22);sphere(dark,mid,midR*.86,20,12);}
   // SC: conexiones roscadas, dos pequeños cuellos y un collar exterior.
   // SW: alojamientos soldables con sus labios, distintos de una brida.
   for(const [pt,direction] of [[e1,ax],[e2,mul(ax,-1)]]){
     if(connection==='SC'||connection==='TH'||connection==='THD'){
       const socket=add(pt,mul(direction,Math.min(od*.25,length*.20)));
       annulus(a,socket,direction,od*.56,od*.36,Math.max(3,od*.10),18);
       torus(a,add(pt,mul(direction,Math.max(3,od*.10))),direction,od*.49,Math.max(1.3,od*.018),20,6);
     } else if(connection==='SW'){
       const socket=add(pt,mul(direction,Math.min(od*.19,length*.14)));
       annulus(a,socket,direction,od*.58,od*.39,Math.max(4,od*.15),20);
       torus(a,pt,direction,od*.49,Math.max(1.7,od*.025),22,6);
     }
   }
   const sp=(c.attrs['SPINDLE-DIRECTION']||'UP').toUpperCase();
   let upright={UP:[0,0,1],DOWN:[0,0,-1],NORTH:[0,1,0],SOUTH:[0,-1,0],EAST:[1,0,0],WEST:[-1,0,0]}[sp]||[0,0,1];
   if(Math.abs(dot(upright,ax))>.92)upright=frame(ax)[0];
   const stemStart=add(mid,mul(upright,midR*.85)),stemEnd=add(mid,mul(upright,Math.max(midR*1.9,od*.96)));
   cyl(dark,stemStart,stemEnd,Math.max(2.5,od*.058),14);
   const leverBase=add(stemEnd,mul(upright,Math.max(3,od*.04)));
   if(ball){
     const across=unit(cross(ax,upright)),leverLen=clamp(od*(isFlanged?1.75:1.25),32,isFlanged?330:140);
     const level=add(leverBase,mul(upright,Math.max(4,od*.05))),end=add(level,mul(across,leverLen));
     cyl(dark,leverBase,level,Math.max(2,od*.038),10);
     orientBox(dark,lerp(level,end,.5),across,Math.max(6,od*.17),Math.max(6,od*.095),leverLen);
   }else{
     const handleRad=clamp(od*.44,18,165);
     torus(dark,stemEnd,upright,handleRad,Math.max(3,od*.044),26,8);
     const [u,v]=frame(upright);
     cyl(dark,add(stemEnd,mul(u,-handleRad)),add(stemEnd,mul(u,handleRad)),Math.max(2,od*.032),8);
     cyl(dark,add(stemEnd,mul(v,-handleRad)),add(stemEnd,mul(v,handleRad)),Math.max(2,od*.032),8);
   }
   break;
 }
 case 'SUPPORT':{
   const base=c.points.find(q=>q.key==='CO-ORDS')?.p||mid;
   const end=c.points.find(q=>q.key==='SUPPORT-END-POINT')?.p||add(base,[0,0,-240]);
   const d=unit(sub(end,base)),axis=nearestAxis(base,comps),[side]=frame(axis),postR=Math.max(7,od*.07);
   // Apoyo sencillo; SUPPORT-NAME identifica un catálogo externo no disponible en el PCF.
   cyl(a,base,end,postR,12);
   const clampCentre=add(base,mul(d,Math.min(od*.15,30)));
   cyl(a,add(clampCentre,mul(side,-od*.35)),add(clampCentre,mul(side,od*.35)),postR*.94,12);
   orientBox(a,end,axis,Math.max(30,od*.38),Math.max(35,od*.33),Math.max(12,od*.11));
   break;
 }
 case 'BOLT':{
   const q=c.points[0]?.p||mid,axis=nearestAxis(q,comps),[n,b]=frame(axis);
   const qty=clamp(parseInt(c.attrs['BOLT-QUANTITY'],10)||8,1,40),dia=+c.attrs['BOLT-DIA']*unitScale(state.doc?.units.boltDia||'INCH')||16,
        bl=+c.attrs['BOLT-LENGTH']*unitScale(state.doc?.units.boltLength||'MM')||90;
   const closest=comps.filter(x=>x.type==='FLANGE'&&x.ends.length>=2).sort((x,y)=>dist(lerp(x.ends[0].p,x.ends[1].p,.5),q)-dist(lerp(y.ends[0].p,y.ends[1].p,.5),q))[0];
   const ref=closest&&flangeRef(closest);
   const pitch=ref?ref[1]*.5:Math.max(25,nearestRadius(q,comps)*1.05);
   for(let i=0;i<qty;i++){
     const ang=i*Math.PI*2/qty,centre=add(q,add(mul(n,pitch*Math.cos(ang)),mul(b,pitch*Math.sin(ang))));
     cyl(a,add(centre,mul(axis,-bl*.5)),add(centre,mul(axis,bl*.5)),dia*.5,10);
     for(let side of [-1,1]){
       let nutPoint=add(centre,mul(axis,side*bl*.37));
       annulus(a,nutPoint,axis,dia*.94,dia*.42,Math.min(dia*.62,bl*.12),6);
     }
   }break;
 }
 case 'GASKET':{
   const axg=ep.length>=2?unit(sub(e2,e1)):nearestAxis(mid,comps);
   const thick=ep.length>=2?clamp(dist(e1,e2),1,25):3;
   annulus(a,mid,axg,od*.78,od*.45,thick,24);break;
 }
 case 'WELD':case 'FIELD-WELD':case 'SHOP-WELD':{
   const q=p[0]||[0,0,0],axt=nearestAxis(q,comps);
   torus(a,q,axt,r*.98,Math.max(3,r*.075),28,8);break;
 }
 case 'OLET':{
   const branch=c.points.find(x=>x.key==='BRANCH1-POINT')?.p;
   const base=c.points.find(x=>x.key==='CENTRE-POINT')?.p;
   if(base&&branch){const small=(c.od2||26.7)*.5;
     const end=lerp(base,branch,.90),seat=lerp(base,branch,.17);
     tube(a,[seat,end],Math.max(small*1.32,12),small,20);
     annulus(a,seat,unit(sub(branch,base)),Math.max(small*1.5,14),small*.70,Math.max(6,small*.25),20);
   }break;
 }
 case 'COUPLING':case 'UNION':{
   if(e1&&e2){
    // El texto del PCF permite distinguir niples de manómetros; no inferir catalogos no suministrados.
    if(/PRESSURE GAUGE|\bPG\b|MANOM|MANOMETER/i.test(desc)){
      const stem=unit(sub(e2,e1));
      cyl(a,e1,lerp(e1,e2,.65),Math.max(5,od*.32),14);
      gauge(a,e2,stem,Math.max(r,25));
    }else{
      cyl(a,e1,e2,r,18);
      if(!/NIPPLE/i.test(desc))annulus(a,mid,ax,r*1.16,r*.75,Math.min(18,dist(e1,e2)*.18),20);
    }
   }break;
 }
 case 'CAP':{if(p.length)sphere(a,p[0],r,18,10);break;}
 default:{if(p.length>=2)tube(a,p,r*.85);else if(p.length)sphere(a,p[0],Math.max(25,r*.5));break;}
 }
 c.mesh=a;
}
function nearestRadius(p,comps){let best=100,d=Infinity;for(let c of comps){if(!['FLANGE','PIPE','VALVE'].includes(c.type)||!c.ends[0])continue;const mid= c.ends.length>=2?lerp(c.ends[0].p,c.ends[1].p,.5):c.ends[0].p;let v=dist(mid,p);if(v<d){d=v;best=c.od*.75}}return Math.max(18,best)}
function findBounds(doc){let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let c of doc.components){if(c.deleted)continue;for(let p of c.points){const q=add(p.p,c.offset);for(let i=0;i<3;i++){min[i]=Math.min(min[i],q[i]);max[i]=Math.max(max[i],q[i])}}}if(!Number.isFinite(min[0]))return {min:[-500,-500,-500],max:[500,500,500],center:[0,0,0],size:[1000,1000,1000]};return{min,max,center:mul(add(min,max),.5),size:sub(max,min)}}
// Distancia minima del origen mundial a la caja envolvente del modelo, en mm (PCF convertido).
function originNearBounds(b){const sep=b.min.map((low,i)=>Math.max(low, -b.max[i], 0));return Math.hypot(...sep)<=10000;}
// Cada ensamble se identifica por conexiones de extremos reales en el PCF.
// Los accesorios auxiliares se vinculan al tramo mas proximo si estan dentro de
// una tolerancia relacionada con su diametro, sin crear puntos XYZ ficticios.
// Distintas fuentes PCF no se unen automaticamente: conservan sus identificadores.
function assemblyStart(a){
 const auxiliary=new Set(['SUPPORT','BOLT','GASKET','WELD','FIELD-WELD','SHOP-WELD','INSTRUMENT']);
 const bodies=a.components.filter(c=>!auxiliary.has(c.type));
 const endpoints=bodies.flatMap(c=>c.ends.map(p=>add(p.p,c.offset)));
 const candidates=endpoints.length?endpoints:a.components.flatMap(c=>c.points.map(p=>add(p.p,c.offset)));
 if(!candidates.length)return {point:a.center,originMethod:'sin puntos'};
 const tol=2.1;const unique=[];
 for(const p of candidates){let target=unique.find(n=>dist(n.p,p)<=tol);if(!target){target={p,count:0,input:0,output:0,starts:0};unique.push(target)}target.count++}
 const tracks=state.flowTracks.filter(t=>a.components.includes(t.c));
 for(const track of tracks){
  if(track.path.length<2)continue;
  const source=track.sign===1?track.path[0]:track.path.at(-1),sink=track.sign===1?track.path.at(-1):track.path[0];
  const start=unique.find(n=>dist(n.p,source)<=tol),end=unique.find(n=>dist(n.p,sink)<=tol);
  if(start){start.output++;start.starts++}
  if(end)end.input++;
 }
 let starts=unique.filter(x=>x.output>0&&x.input===0);
 if(starts.length===1)return {point:[...starts[0].p],originMethod:'flujo'};
 if(starts.length>1){
  // Cuando hay varias entradas en una red, priorizar la entrada con mayor
  // desarrollo dirigido. Mantener método 'varias entradas' para no simular certeza.
  const edges=tracks.map(t=>({u:t.sign===1?t.path[0]:t.path.at(-1),v:t.sign===1?t.path.at(-1):t.path[0],length:t.path.slice(1).reduce((n,p,i)=>n+dist(p,t.path[i]),0)}));
  const reach=start=>{let queue=[start],seen=new Set(),total=0;for(let i=0;i<queue.length&&i<edges.length+1;i++){
   for(let j=0;j<edges.length;j++){if(seen.has(j)||dist(edges[j].u,queue[i])>tol)continue;seen.add(j);total+=edges[j].length;queue.push(edges[j].v)}
  }return total};
  starts.sort((x,y)=>reach(y.p)-reach(x.p));
  return {point:[...starts[0].p],originMethod:'flujo con varias entradas'};
 }
 // Sin dirección inequívoca: escoger un extremo libre antes que el punto medio.
 // Para anillos, usar el primer extremo documentado y nunca inventar un flujo.
 const open=unique.filter(x=>x.count===1);
 const first=(open.length?open:unique)[0];
 return {point:[...first.p],originMethod:tracks.length?'flujo ambiguo':'inicio geométrico; flujo no identificado'};
}
function buildAssemblies(){
 const all=state.doc?.components||[],comps=all.filter(c=>!c.deleted),n=all.length,parent=Array.from({length:n},(_,i)=>i),rank=new Uint8Array(n);
 const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i]}return i};
 const join=(a,b)=>{a=find(a);b=find(b);if(a===b)return;if(rank[a]<rank[b])[a,b]=[b,a];parent[b]=a;if(rank[a]===rank[b])rank[a]++};
 const STEP=2;const bins=new Map();
 const key=(src,x,y,z)=>x+','+y+','+z; // unión geométrica entre archivos insertados si sus extremos coinciden
 for(const c of comps){if(!c.ends.length)continue;const src=c.sourceId||'src0';
  for(const p of c.ends){const q=add(p.p,c.offset),b=q.map(x=>Math.floor(x/STEP));
   for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
    const list=bins.get(key(src,b[0]+x,b[1]+y,b[2]+z));if(!list)continue;
    for(const e of list)if(e.i!==c.index && dist(e.q,q)<=2)join(e.i,c.index);
   }
   const k=key(src,...b);if(!bins.has(k))bins.set(k,[]);bins.get(k).push({i:c.index,q});
  }
 }
 // Soportes, empaques, pernos y elementos de instrumentacion no poseen siempre
 // extremos conectados: asignarlos visualmente sin falsear el archivo PCF.
 const aux=new Set(['SUPPORT','BOLT','GASKET','WELD','FIELD-WELD','SHOP-WELD','INSTRUMENT']);
 const mainstream=comps.filter(c=>c.path?.length>=2&&!aux.has(c.type));
 for(const c of comps){if(c.ends.length>=2&&!aux.has(c.type))continue;
  const q=c.points.find(p=>p.key==='CO-ORDS'||p.key==='CENTRE-POINT'||p.key==='END-POINT')?.p||c.points[0]?.p;
  if(!q)continue;const at=add(q,c.offset);let best=null,bestDist=Infinity;
  // Coste acotado si hay un PCF muy grande: se usan componentes del mismo origen.
  const pool=mainstream.length>20000?mainstream.slice(0,20000):mainstream;
  for(const other of pool){if(c===other)continue;const path=other.path||[];
   for(let i=1;i<path.length;i++){
    const a=add(path[i-1],other.offset),b=add(path[i],other.offset),ab=sub(b,a),t=clamp(dot(sub(at,a),ab)/(dot(ab,ab)||1),0,1);
    const d=dist(at,add(a,mul(ab,t)));if(d<bestDist){bestDist=d;best=other}
   }
  }
  if(best && bestDist<=Math.max(250,best.od*1.7))join(c.index,best.index);
 }
 const map=new Map();
 for(const c of comps){if(!c.points.length)continue;const id=find(c.index);let group=map.get(id);
  if(!group){group={id,components:[],sourceIds:new Set(),min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity],length:0,principal:0,point:null};map.set(id,group)}
  group.components.push(c);group.sourceIds.add(c.sourceId||'src0');
  for(const p of c.points){const q=add(p.p,c.offset);for(let k=0;k<3;k++){group.min[k]=Math.min(group.min[k],q[k]);group.max[k]=Math.max(group.max[k],q[k])}}
  if(!aux.has(c.type))group.principal++;
  if(c.path?.length>1)for(let j=1;j<c.path.length;j++)group.length+=dist(c.path[j-1],c.path[j]);
 }
 const assemblies=[...map.values()];
 for(const a of assemblies){a.center=mul(add(a.min,a.max),.5);a.size=sub(a.max,a.min);
  const ends=a.components.filter(c=>!aux.has(c.type)).flatMap(c=>c.ends.map(p=>add(p.p,c.offset)));
  const pts=ends.length?ends:a.components.flatMap(c=>c.points.map(p=>add(p.p,c.offset)));
  const start=assemblyStart(a);a.point=start.point;a.originMethod=start.originMethod;
 }
 state.assemblies=assemblies;
 // Areas comunes: ensambles a menos de 10 m comparten una sola superficie y figura.
 const m=assemblies.length,zparent=Array.from({length:m},(_,i)=>i);
 const fz=i=>{while(zparent[i]!==i){zparent[i]=zparent[zparent[i]];i=zparent[i]}return i};
 const jz=(a,b)=>{a=fz(a);b=fz(b);if(a!==b)zparent[b]=a};
 const boxDist=(a,b)=>Math.hypot(...[0,1,2].map(k=>Math.max(0,a.min[k]-b.max[k],b.min[k]-a.max[k])));
 // Evita comparar cada ensamble con todos si el modelo es extraordinariamente grande.
 if(m<=1500){for(let i=0;i<m;i++)for(let j=i+1;j<m;j++)if(boxDist(assemblies[i],assemblies[j])<=10000)jz(i,j)}
 else{const bins=new Map();for(let i=0;i<m;i++){const p=assemblies[i].center,kk=p.map(n=>Math.floor(n/10000)).join('/');if(bins.has(kk))jz(i,bins.get(kk));else bins.set(kk,i)}}
 const zones=new Map();for(let i=0;i<m;i++){
  const id=fz(i),a=assemblies[i];let zone=zones.get(id);
  if(!zone){zone={assemblies:[],sourceIds:new Set(),min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity],floor:[],lines:[],human:[]};zones.set(id,zone)}
  zone.assemblies.push(a);for(const src of a.sourceIds)zone.sourceIds.add(src);
  for(let k=0;k<3;k++){zone.min[k]=Math.min(zone.min[k],a.min[k]);zone.max[k]=Math.max(zone.max[k],a.max[k])}
 }
 state.floorZones=[...zones.values()];
 // Un único rótulo por ensamble, incluso cuando reúne componentes de diferentes PCF.
 state.jointPoints=assemblies.filter(a=>a.principal>0).map(a=>({point:a.point,ids:new Set(a.components.map(c=>c.index)),sources:a.sourceIds,assemblyId:a.id,originMethod:a.originMethod}));
}
function zoneVisible(zone){const filter=views[activeRenderIndex]?.filter;
 return !filter || [...zone.sourceIds].some(id=>filter.has(id));}
function buildHelpers(){
 state.floorTriangles=[];state.floorLines=[];state.humanTriangles=[];state.flowTriangles=[];state.floorZones=[];
 if(!state.bounds)return;
 buildFlowTracks();buildAssemblies();
 const h=clamp(+$('humanHeight').value||1750,1200,2200);
 for(const zone of state.floorZones){
  const b={min:zone.min,max:zone.max},close=originNearBounds(b),z=close?0:zone.min[2]-1000;
  const dx=zone.max[0]-zone.min[0],dy=zone.max[1]-zone.min[1];
  const margin=Math.max(500,Math.min(2500,Math.max(dx,dy)*.16));
  const minX=(close?Math.min(0,zone.min[0]):zone.min[0])-margin;
  const maxX=(close?Math.max(0,zone.max[0]):zone.max[0])+margin;
  const minY=(close?Math.min(0,zone.min[1]):zone.min[1])-margin;
  const maxY=(close?Math.max(0,zone.max[1]):zone.max[1])+margin;
  zone.floorZ=z;zone.floorReason=close?'origen':'bajo modelo';
  tri(zone.floor,[minX,minY,z],[maxX,minY,z],[maxX,maxY,z]);
  tri(zone.floor,[minX,minY,z],[maxX,maxY,z],[minX,maxY,z]);
  const steps=clamp(Math.ceil(Math.max(maxX-minX,maxY-minY)/400),6,36);
  for(let i=0;i<=steps;i++){
   const x=minX+(maxX-minX)*i/steps,y=minY+(maxY-minY)*i/steps;
   zone.lines.push([x,minY,z+2],[x,maxY,z+2],[minX,y,z+2],[maxX,y,z+2]);
  }
  // Figura independiente por zona; fuera de la trayectoria real del dibujo.
  const base=[maxX-margin*.42,minY+margin*.42,z+1],hr=h*.045;
  sphere(zone.human,add(base,[0,0,h*.927]),h*.073,12,8);
  cyl(zone.human,add(base,[0,0,h*.46]),add(base,[0,0,h*.88]),h*.073,12);
  for(const side of [-1,1]){
   cyl(zone.human,add(base,[h*.08*side,0,h*.81]),add(base,[h*.17*side,0,h*.49]),hr*.62,9);
   cyl(zone.human,add(base,[h*.028*side,0,h*.47]),add(base,[h*.06*side,0,hr]),hr*.85,10);
  }
  state.floorTriangles.push(...zone.floor);state.floorLines.push(...zone.lines);state.humanTriangles.push(...zone.human);
 }
 state.floorZ=state.floorZones[0]?.floorZ??null;
 state.floorReason=state.floorZones[0]?.floorReason??null;
 for(const anchor of state.flowAnchors){
  const comp=state.doc.components[anchor.index];if(!comp||comp.ends.length<2)continue;
  const q=anchor.point,axis=unit(sub(comp.ends[1].p,comp.ends[0].p));
  const tangent=len(axis)>.9?axis:[1,0,0],length=Math.max(55,Math.min(130,comp.od*.46));
  if(anchor.code===1||anchor.code===3)arrow(state.flowTriangles,add(q,mul(tangent,-length*.42)),tangent,length);
  if(anchor.code===2||anchor.code===3)arrow(state.flowTriangles,add(q,mul(tangent,length*.42)),mul(tangent,-1),length);
 }
}

// Etiquetas: el tamaño procede de END-POINT. No convertir diámetro exterior (OD) en NPS.
function inchFraction(n){
 if(!Number.isFinite(n)||n<=0)return null;
 const whole=Math.floor(n+1e-6),part=n-whole,fracs=[[0,''],[.125,'⅛'],[.25,'¼'],[.375,'⅜'],[.5,'½'],[.625,'⅝'],[.75,'¾'],[.875,'⅞']];
 const f=fracs.find(x=>Math.abs(x[0]-part)<.008);
 if(f)return whole&&f[0]?String(whole)+f[1]:whole?String(whole):f[1];
 return String(Number(n.toFixed(3)));
}
function nominalLabel(n,unitType=state.doc?.units.bore){
 if(!Number.isFinite(n)||n<=0)return null;
 if(String(unitType||'').toUpperCase()==='INCH')return inchFraction(n)+'"';
 return 'DN'+String(Number(n.toFixed(2)));
}
function angleOf(c){
 const raw=Number(c.attrs.ANGLE);
 if(Number.isFinite(raw)&&raw>0&&raw<=36000)return raw/100;
 const p=c.ends,centre=c.points.find(v=>v.key==='CENTRE-POINT'||v.key==='CENTER-POINT');
 if(p.length<2||!centre)return null;
 const v1=unit(sub(p[0].p,centre.p)),v2=unit(sub(p[1].p,centre.p));
 const angle=Math.acos(clamp(dot(v1,v2),-1,1))*180/Math.PI;
 return angle>0&&angle<=180?angle:null;
}
function ratingOf(c){
 const text=(c.desc+' '+(c.attrs['RATING']||'')+' '+(c.attrs['PRESSURE-CLASS']||'')).toUpperCase();
 let m=text.match(/\b(?:CLASS|CL(?:ASS)?\.?|RATING)\s*[-:#]?\s*(150|300|600|900|1500|2500)\b/) || text.match(/\b(150|300|600|900|1500|2500)\s*(?:LB|LBS|#)\b/);
 if(m)return {value:m[1],source:'atributo o descripción'};
 const spec=(c.spec||c.attrs['PIPING-SPEC']||'').trim();
 m=spec.match(/^(150|300|600|900|1500|2500)[_-]/i);
 return m?{value:m[1],source:'nombre de la especificación, no clase verificada'}:null;
}
function labelOf(c){
 if(c.type==='SUPPORT'){
   const name=(c.attrs['SUPPORT-NAME']||'').trim();
   return name ? 'SOP · '+name.slice(0,54) : 'SOPORTE';
 }
 const diameter=nominalLabel(c.ends[0]?.nom,c.sourceUnits?.bore);
 if(!diameter)return null;
 if(c.type.includes('VALVE')){const r=ratingOf(c);return diameter+(r?'-'+r.value:'');}
 if(c.type==='ELBOW'||c.type==='BEND'){
  const angle=angleOf(c);return angle===null?diameter:diameter+'-'+Number(angle.toFixed(2))+'°';
 }
 if(c.type==='REDUCER'||c.type==='REDUCER-CONCENTRIC'||c.type==='REDUCER-ECCENTRIC'){
  const other=c.ends[1]?.nom; if(!Number.isFinite(other)||other<=0)return null;
  // Convención de rotulación mayor x menor; no altera el sentido ni el orden en el PCF.
  return nominalLabel(Math.max(c.ends[0].nom,other),c.sourceUnits?.bore)+'x'+nominalLabel(Math.min(c.ends[0].nom,other),c.sourceUnits?.bore);
 }
 return null;
}
function labelAnchor(c){
 if(c.type==='SUPPORT')return c.points.find(p=>p.key==='CO-ORDS')?.p||c.points[0]?.p||null;
 let path=c.path||[];if(!path.length)return null;
 if((c.type==='ELBOW'||c.type==='BEND')&&path.length>2)return path[Math.floor(path.length/2)];
 if(c.ends.length>=2)return lerp(c.ends[0].p,c.ends[1].p,.5);
 return path[Math.floor(path.length/2)];
}
function closestOnPath(q,path){
 let best={dist:Infinity,point:null},acc=0;
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],ab=sub(b,a),length=len(ab),t=clamp(dot(sub(q,a),ab)/(length*length||1),0,1),p=add(a,mul(ab,t)),d=dist(p,q);
  if(d<best.dist)best={dist:d,point:p,at:acc+length*t};acc+=length;
 }
 return best;
}
// Propagación visual por extremos coincidentes, no simulación hidráulica.
// Los tramos sin conexión reconocida no reciben un sentido inventado.
function buildFlowTracks(){
 state.flowTracks=[];state.flowAnchors=[];state.flowWarnings=[];
 if(!state.doc)return;
 const allowed=/^(PIPE|TUBE|ELBOW|BEND|REDUCER(?:-CONCENTRIC|-ECCENTRIC)?|VALVE|BALL-VALVE|GATE-VALVE|CHECK-VALVE|GLOBE-VALVE|FLANGE|GASKET|COUPLING|UNION)$/;
 const edges=state.doc.components.filter(c=>!c.deleted&&allowed.test(c.type)&&c.ends.length>=2&&c.path.length>=2&&dist(c.path[0],c.path.at(-1))>.01);
 const key=(p,source)=>source+'|'+p.map(v=>Math.round(v*10)).join('/'); // 0,1 mm, documentos aislados
 const nodes=new Map();
 for(const c of edges)for(let end=0;end<2;end++){
  const pos=add(end===0?c.path[0]:c.path.at(-1),c.offset),k=key(pos,c.sourceId||'src0');
  if(!nodes.has(k))nodes.set(k,[]);nodes.get(k).push({c,end});
 }
 const seeded=[];
 for(const flow of state.doc.arrows){
  const q=flow.points.find(p=>p.key==='CO-ORDS')?.p||flow.points[0]?.p;
  const code=Number(flow.attrs.FLOW);if(!q||![1,2,3].includes(code))continue;
  let seed=null,d=Infinity;
  for(const c of edges){if(!['PIPE','TUBE'].includes(c.type)||c.sourceId!==flow.sourceId||c.line!==flow.line||(flow.spec&&c.spec&&flow.spec!==c.spec))continue;
   const match=closestOnPath(q,c.path);if(match.dist<d){d=match.dist;seed=c;}
  }
  // La marca de Isogen solo determina el sentido de su tubería asociada.
  if(!seed||d>Math.max(12,seed.od*.60)){
   state.flowWarnings.push('FLOW-ARROW sin tubería asociada: '+flow.head);continue;
  }
  seeded.push({flow,seed,q,code,signs:code===1?[1]:code===2?[-1]:[1,-1]});
 }
 const directions=new Map(),blocked=new Set();
 // Cada símbolo tiene prioridad en su pieza. Si dos símbolos se contradicen,
 // se detiene la representación en esa pieza, sin simular un sentido hidráulico.
 for(const anchor of seeded){
  for(const sign of anchor.signs){
   const old=directions.get(anchor.seed.index);
   if(old!==undefined&&old!==sign){
     if(anchor.code===3||old===0)directions.set(anchor.seed.index,0);
     else{blocked.add(anchor.seed.index);directions.delete(anchor.seed.index);}
   }
   else if(!blocked.has(anchor.seed.index))directions.set(anchor.seed.index,sign);
  }
 }
 // Propagar hacia tramos consecutivos SOLO cuando el encuentro es no ambiguo.
 // No asignar direcciones a ramas de una TEE sin una marca propia.
 for(const anchor of seeded)for(const sign of anchor.signs){
  if(blocked.has(anchor.seed.index))continue;
  const queue=[{c:anchor.seed,sign}],visited=new Set();
  for(let h=0;h<queue.length&&h<200000;h++){
   const {c,sign:dir}=queue[h];if(visited.has(c.index))continue;visited.add(c.index);
   if(blocked.has(c.index))continue;
   if(directions.has(c.index)&&directions.get(c.index)!==dir){
     if(anchor.code===3||directions.get(c.index)===0)directions.set(c.index,0);
     else{blocked.add(c.index);directions.delete(c.index);state.flowWarnings.push('Marcas de flujo contradictorias en '+c.type+' '+c.id);continue;}
   }else directions.set(c.index,dir);
   for(const end of [0,1]){
    const pos=add(end===0?c.path[0]:c.path.at(-1),c.offset),joining=nodes.get(key(pos,c.sourceId||'src0'))||[];
    // Si hay 3 o más componentes en la unión, no escoger rama por azar.
    if(joining.length>2)continue;
    for(const next of joining){
     if(next.c===c||groupKey(next.c)!==groupKey(c)||visited.has(next.c.index))continue;
     const isExit=dir===1?end===1:end===0;
     const nextDir=isExit?(next.end===0?1:-1):(next.end===0?-1:1);
     if(!directions.has(next.c.index)||directions.get(next.c.index)===nextDir||directions.get(next.c.index)===0||anchor.code===3)queue.push({c:next.c,sign:nextDir});
     else{blocked.add(next.c.index);directions.delete(next.c.index);}
    }
   }
  }
 }
 state.flowAnchors=seeded.map(x=>({type:x.seed.type,index:x.seed.index,code:x.code,sign:x.code===3?0:x.code===1?1:-1,point:add(x.q,x.seed.offset)}));
 state.flowTracks=[...directions.entries()].filter(([id])=>!blocked.has(id)).flatMap(([id,value])=>{
  const c=state.doc.components[id];return (value===0?[1,-1]:[value]).map(sign=>({c,sign,path:c.path.map(p=>add(p,c.offset))}));
 });
 if(blocked.size)state.flowWarnings.push(blocked.size+' piezas con marcas de flujo ambiguas');
}
function pointOnTrack(path,t){
 if(!path.length)return null;let length=0;
 for(let i=1;i<path.length;i++)length+=dist(path[i-1],path[i]);
 if(length<.01)return null;let target=clamp(t,0,1)*length;
 for(let i=1;i<path.length;i++){
  const L=dist(path[i-1],path[i]);if(target<=L||i===path.length-1){const f=clamp(target/(L||1),0,1);return{p:lerp(path[i-1],path[i],f),direction:unit(sub(path[i],path[i-1])),length};}
  target-=L;
 }
 return null;
}
function drawTechnicalOverlay(time=performance.now()){
const ctx=overlayCtx; if(!ctx)return;if(!renderingMulti){ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,canvasWidth,canvasHeight);}
 if(!state.doc)return;
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 if($('flow').checked&&state.layers.flow.show){
  const color=state.layers.flow.color,clock=reduced?0:time*.00028;let emitted=0;
  for(const track of state.flowTracks){
   if(emitted>=350)break;
   const c=track.c,opacity=vis(c);if(opacity<0||opacity<.3)continue;
   if(!['PIPE','TUBE','ELBOW','BEND','REDUCER','REDUCER-CONCENTRIC','REDUCER-ECCENTRIC','VALVE','FLANGE'].includes(c.type))continue;
   const overall=pointOnTrack(track.path,.5);if(!overall)continue;
   let n=clamp(Math.ceil(overall.length/500),1,4);
   for(let j=0;j<n;j++){
    if(emitted>=350)break;
    const frac=(clock*(Math.max(70,overall.length)/500)+(j+.5)/n+((c.index*0.131)%1))%1;
    const sample=pointOnTrack(track.path,track.sign===1?frac:1-frac);if(!sample)continue;
    const tangent=track.sign===1?sample.direction:mul(sample.direction,-1);
    const q=project(sample.p),ahead=project(add(sample.p,mul(tangent,Math.min(130,Math.max(25,c.od*.5)))));
    if(!q||!ahead||q[0]<12||q[1]<55||q[0]>width-12||q[1]>height-12)continue;
    const delta=[ahead[0]-q[0],ahead[1]-q[1]],length=Math.hypot(...delta);if(length<2)continue;
    const ux=delta[0]/length,uy=delta[1]/length,sz=clamp(c.od*height/(Math.max(1,cam.radius)*.8),8,13);
    ctx.save();ctx.translate(q[0],q[1]);ctx.rotate(Math.atan2(uy,ux));ctx.strokeStyle=color;ctx.fillStyle=color;
    ctx.shadowColor=color;ctx.shadowBlur=reduced?0:8;ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(-sz*.78,-sz*.40);ctx.lineTo(0,0);ctx.lineTo(-sz*.78,sz*.40);ctx.stroke();
    ctx.globalAlpha=.6;ctx.beginPath();ctx.moveTo(-sz*.98,0);ctx.lineTo(-sz*1.6,0);ctx.stroke();ctx.restore();emitted++;
   }
  }
 }
 if(!$('labels')?.checked&&!$('jointCoords')?.checked)return;const opacity=clamp((+$('labelOpacity').value||85)/100,.15,1);
 const items=[];const drawLabels=$('labels').checked;
 for(const c of (drawLabels?state.doc.components:[])){if(c.deleted||vis(c)<.4)continue;const txt=labelOf(c),anchor=labelAnchor(c);if(!txt||!anchor)continue;
  const p=project(add(anchor,c.offset));if(!p||p[0]<30||p[0]>width-30||p[1]<68||p[1]>height-28)continue;
  // Las etiquetas técnicas dependen de la vista; se limitan en encuadres lejanos.
  const projectedOD=c.od*height/(Math.max(1,cam.radius)*.85);
  if(projectedOD<5)continue;
  items.push({c,txt,p});
 }
 items.sort((a,b)=>a.c.type.includes('VALVE')?-1:b.c.type.includes('VALVE')?1:a.c.type.includes('REDUCER')?-1:b.c.type.includes('REDUCER')?1:a.c.index-b.c.index);
 const boxes=[];
 if(axis.dataset.position==='origen'){
   const a=project([0,0,0]);
   if(a)boxes.push([a[0]-38,a[1]-42,a[0]+57,a[1]+29]);
 }
 for(const item of items.slice(0,125)){
  const ctxFont='600 13px system-ui';ctx.font=ctxFont;const ww=Math.ceil(ctx.measureText(item.txt).width)+20,h=25;
  const baseX=item.p[0]-ww/2,baseY=item.p[1]-Math.max(30,Math.min(52,item.c.od*.16))-h;
  let candidate=null;
  for(const [dx,dy] of [[0,0],[0,-28],[0,28],[0,-56],[53,-18],[-53,-18],[0,56],[53,-49],[-53,-49],[72,13],[-72,13],[0,-85],[53,-83],[-53,-83],[90,-50],[-90,-50],[0,86],[60,76],[-60,76]]){
   const x=clamp(baseX+dx,6,Math.max(6,width-ww-6)),y=baseY+dy;
   if(y<64||y>height-h-10)continue;
   const rect=[x,y,x+ww,y+h];
   const collision=boxes.some(b=>rect[0]<b[2]+5&&rect[2]>b[0]-5&&rect[1]<b[3]+4&&rect[3]>b[1]-4);
   const overCube=x>width-150&&y<208;
   if(!collision&&!overCube){candidate=rect;break;}
  }
  if(!candidate)continue;boxes.push(candidate);
  const [x,y]=candidate;
  const centerX=x+ww*.5,closestY=y>item.p[1]?y:y+h;
  if(Math.hypot(centerX-item.p[0],closestY-item.p[1])>56){
    ctx.beginPath();ctx.moveTo(centerX,closestY);ctx.lineTo(item.p[0],item.p[1]);
    ctx.strokeStyle='rgba(162,190,217,.42)';ctx.lineWidth=1;ctx.stroke();
  }
   ctx.save();ctx.globalAlpha=opacity;ctx.beginPath();ctx.roundRect(x,y,ww,h,7);ctx.fillStyle='rgba(8,22,36,.87)';ctx.fill();
  ctx.strokeStyle=item.c.type.includes('VALVE')?'rgba(207,224,244,.75)':item.c.type==='SUPPORT'?'rgba(247,171,89,.86)':'rgba(248,212,133,.72)';ctx.lineWidth=1;ctx.stroke();
  ctx.fillStyle='#f5f8ff';ctx.font=ctxFont;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(item.txt,x+ww/2,y+h/2+.3);ctx.restore();
  }
  if($('jointCoords').checked){
   ctx.save();ctx.globalAlpha=opacity;
   let count=0;
   for(const joint of state.jointPoints){if(count>=40)break;
    const filter=views[activeRenderIndex]?.filter;if(filter&&![...joint.sources].some(id=>filter.has(id)))continue;
    const p=project(joint.point);if(!p||p[0]<8||p[0]>width-8||p[1]<80||p[1]>height-20)continue;
    // Dos niveles: coordenadas separadas por comas; debajo, el eje de cada dato.
    // El lienzo conserva etiquetas en PNG y permite tocarlas para editar el ensamble.
    const valueStrings=joint.point.map(n=>Number(n.toFixed(2)).toLocaleString('en-US',{useGrouping:false,maximumFractionDigits:2}));
    ctx.font='600 11px system-ui';const cols=valueStrings.map(n=>Math.max(42,Math.ceil(ctx.measureText(n).width)+14));
    const ww=cols.reduce((s,n)=>s+n,0)+29,hh=39;
    const directions=(p[0]>width*.5?[-1,1]:[1,-1]);let rect=null,sg=1;
    // En pantallas estrechas, situar las fichas en el espacio superior disponible
    // antes de recurrir a una posición que tape la geometría 3D.
    if(width<550){
     const bx=6;
     for(let by=125;by<height-hh-45;by+=hh+9){
      const r=[bx,by,bx+ww,by+hh];
      if(r[2]>width-5||boxes.some(b=>r[0]<b[2]+5&&r[2]>b[0]-5&&r[1]<b[3]+5&&r[3]>b[1]-5))continue;
      rect=r;sg=1;break;
     }
    }
    for(const sign of (rect?[]:directions)){
     for(const dy of [-48,48,-86,86,-121,121,0]){
      const bx=clamp(p[0]+sign*86+(sign<0?-ww:0),5,Math.max(5,width-ww-5));
      const by=clamp(p[1]+dy,65,Math.max(65,height-hh-8));
      const r=[bx,by,bx+ww,by+hh];
      if(boxes.some(b=>r[0]<b[2]+5&&r[2]>b[0]-5&&r[1]<b[3]+5&&r[3]>b[1]-5))continue;
      if(bx>width-145&&by<188)continue;
      rect=r;sg=sign;break;
     }
     if(rect)break;
    }
    if(!rect)continue;
    const [bx,by]=rect;boxes.push(rect);
    ctx.strokeStyle='#a8c6df';ctx.lineWidth=1;ctx.setLineDash([3,4]);
    ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(sg>0?bx:bx+ww,by+hh*.5);ctx.stroke();ctx.setLineDash([]);
    ctx.beginPath();ctx.arc(p[0],p[1],3.5,0,Math.PI*2);ctx.fillStyle='#f7d184';ctx.fill();
    ctx.beginPath();ctx.roundRect(bx,by,ww,hh,6);ctx.fillStyle='rgba(13,32,49,.94)';ctx.fill();ctx.strokeStyle='#7094ad';ctx.stroke();
    let cursor=bx+5;const axes=['X','Y','Z'];
    for(let k=0;k<3;k++){
     ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 11px system-ui';ctx.fillStyle='#f0f5fb';
     ctx.fillText(valueStrings[k],cursor+cols[k]/2,by+12);
     if(k<2){ctx.fillStyle='#c4d3df';ctx.fillText(',',cursor+cols[k]-3,by+12)}
     ctx.font='700 10px system-ui';ctx.fillStyle=['#fa9b81','#9ed6b4','#81bbff'][k];
     ctx.fillText(axes[k],cursor+cols[k]/2,by+28);cursor+=cols[k];
    }
    ctx.font='10px system-ui';ctx.fillStyle='#b8cadb';ctx.textAlign='center';ctx.fillText('mm',bx+ww-17,by+19);
    coordHitBoxes.push({view:activeRenderIndex,x:bx+viewportOffset.x,y:by+viewportOffset.y,w:ww,h:hh,assemblyId:joint.assemblyId,ids:[...joint.ids]});
    count++;
   }
   ctx.restore();
  }
 }
// Animar únicamente la capa 2D: los sólidos 3D y sus buffers permanecen inmóviles.
let overlayLoop=0,overlayLast=0;
function animateOverlay(t){
 overlayLoop=0;
 if(document.hidden)return;
 if(!state.doc)return;
 if(!$('flow').checked||!state.layers.flow.show||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){drawTechnicalOverlay(t);return}
if(t-overlayLast>=32){overlayLast=t;drawAllOverlays(t)}
 overlayLoop=requestAnimationFrame(animateOverlay);
}
function syncOverlay(){
 if(overlayLoop){cancelAnimationFrame(overlayLoop);overlayLoop=0}
 drawAllOverlays();
 if(state.doc&&$('flow').checked&&state.layers.flow.show&&!document.hidden&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)overlayLoop=requestAnimationFrame(animateOverlay);
}
document.addEventListener('visibilitychange',syncOverlay);
window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change',syncOverlay);

function updateGeometry(){if(!state.doc)return;state.bounds=findBounds(state.doc);for(const c of state.doc.components)buildComponent(c,state.doc.components);buildHelpers();state.geometryDirty=false;state.gpuDirty=true;renderSoon()}
function rgb(color){let h=(color||'#ffffff').replace('#','');if(h.length===3)h=h.split('').map(v=>v+v).join('');return [parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4,6),16)/255]}
function vis(c){if(c.deleted)return -1;if(!state.layers[c.colorType].show)return -1;if(views[activeRenderIndex]?.filter&&!views[activeRenderIndex].filter.has(c.sourceId))return -1; if(state.isolated && state.isolated!==groupKey(c))return state.mode==='partial'?.12:-1;return 1}
function groupKey(c){return (c.sourceId||'src0')+'|'+(c.line||'Sin línea')+'|'+(c.spec||'Sin spec')}
function payload(arr,geometry,col,alpha=1,offset=[0,0,0]){const [r,g,b]=rgb(col);for(let k=0;k<geometry.length;k+=6){arr.push(geometry[k]+offset[0],geometry[k+1]+offset[1],geometry[k+2]+offset[2],geometry[k+3],geometry[k+4],geometry[k+5],r,g,b,alpha)}}
function shadeValveColor(color){return '#'+rgb(color).map(n=>Math.round(clamp(n*.37,0,1)*255).toString(16).padStart(2,'0')).join('');}
function packScene(){const floor=[],solid=[],grid=[],ghost=[];
 for(const zone of state.floorZones||[]){if(!zoneVisible(zone))continue;
  if($('floor').checked)payload(floor,zone.floor,'#24415d',.38);
  if($('grid').checked)for(const p of zone.lines)grid.push(...p,0,0,1,...rgb('#527391'),.43);
  if($('human').checked)payload(solid,zone.human,'#80b5d5',.42);
 }
 if($('flow').checked)payload(solid,state.flowTriangles,state.layers.flow.color,.97);
 for(const c of state.doc?.components||[]){if(c.deleted)continue;let opacity=vis(c);if(opacity<0)continue;if(c.colorType==='weld'&&!$('welds').checked)continue;let color=state.selected.has(c.index)?'#67e2fc':state.layers[c.colorType].color;
  payload(opacity<1?ghost:solid,c.mesh,color,opacity,c.offset);
  if(c.meshAccent?.length)payload(opacity<1?ghost:solid,c.meshAccent,state.selected.has(c.index)?'#67e2fc':shadeValveColor(state.layers.valve.color),opacity,c.offset);}

 return{floor:new Float32Array(floor),solid:new Float32Array(solid),grid:new Float32Array(grid),ghost:new Float32Array(ghost)};
}
function mMultiply(a,b){const r=new Array(16).fill(0);for(let j=0;j<4;j++)for(let i=0;i<4;i++)for(let k=0;k<4;k++)r[j*4+i]+=a[k*4+i]*b[j*4+k];return r}
function lookAt(eye,target,up){let f=unit(sub(target,eye)),s=unit(cross(f,up)),u=cross(s,f);return[s[0],u[0],-f[0],0,s[1],u[1],-f[1],0,s[2],u[2],-f[2],0,-dot(s,eye),-dot(u,eye),dot(f,eye),1]}
function perspective(fov,aspect,near,far){let f=1/Math.tan(fov/2),a=(far+near)/(near-far),b=2*far*near/(near-far);return [f/aspect,0,0,0,0,f,0,0,0,0,a,-1,0,0,b,0]}
function cameraUpdate(){const rad=cam.radius,cp=Math.cos(cam.pitch);cam.eye=add(cam.target,[Math.cos(cam.yaw)*rad*cp,Math.sin(cam.yaw)*rad*cp,Math.sin(cam.pitch)*rad]);cam.view=lookAt(cam.eye,cam.target,[0,0,1]);cam.mvp=mMultiply(perspective(cam.fov,width/height,cam.near,cam.far),cam.view)}
function project(p){const m=cam.mvp,x=p[0],y=p[1],z=p[2],w=m[3]*x+m[7]*y+m[11]*z+m[15];if(w<=0.01)return null;let a=(m[0]*x+m[4]*y+m[8]*z+m[12])/w,b=(m[1]*x+m[5]*y+m[9]*z+m[13])/w;return[(a*.5+.5)*width,(-b*.5+.5)*height,w]}
function fitView(){if(!state.bounds)return;let b=state.bounds;const sel=views[activeViewIndex]?.filter;if(sel&&state.doc?.sources){const parts=state.doc.sources.filter(src=>sel.has(src.sourceId));if(parts.length)b=findBounds(makeCombined(parts,state.doc.name))}let s=b.size,span=Math.max(s[0],s[1],s[2],100),center=b.center;cam.target=[...center];cam.radius=Math.max(span*1.65,span/(2*Math.tan(cam.fov/2)*Math.min(1,width/height))*1.42,650);cam.near=Math.max(.1,span/30000);cam.far=cam.radius*300;cameraUpdate();renderSoon()}
function activateCanvasFallback(err){
 if(!fallbackCanvas){fallbackCanvas=document.createElement('canvas');fallbackCanvas.id='fallback3d';fallbackCanvas.setAttribute('aria-hidden','true');fallbackCanvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1';canvas.insertAdjacentElement('afterend',fallbackCanvas)}
 if(fallbackCanvas.width!==canvas.width)fallbackCanvas.width=canvas.width;
 if(fallbackCanvas.height!==canvas.height)fallbackCanvas.height=canvas.height;
 g2=fallbackCanvas.getContext('2d');gl=null;state.gpuDirty=true;
 status('Vista de respaldo Canvas activada. Motivo: '+String(err||'WebGL no disponible').slice(0,140));renderSoon();
}
function setupGL(){let err='';try{gl=canvas.getContext('webgl2',{antialias:true,alpha:false,preserveDrawingBuffer:true})||canvas.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:true});}catch(e){err=e.message}
 if(!gl){g2=canvas.getContext('2d');status('Vista alternativa Canvas; WebGL no disponible. '+err);return}
 const vs=`attribute vec3 aPos; attribute vec3 aNormal; attribute vec4 aColor; uniform mat4 uMvp; varying vec4 vColor; varying vec3 vNormal; void main(){gl_Position=uMvp*vec4(aPos,1.0);vColor=aColor;vNormal=aNormal;}`;
 const fs=`precision mediump float; varying vec4 vColor; varying vec3 vNormal; void main(){vec3 n=normalize(vNormal); vec3 l=normalize(vec3(0.4,-0.25,0.85));float d=max(dot(n,l),0.0);float rim=pow(max(0.0,1.0-abs(n.z)),2.0)*0.09;float light=.38+.56*d+rim;gl_FragColor=vec4(vColor.rgb*light,vColor.a);}`;
 function shader(type,source){let o=gl.createShader(type);gl.shaderSource(o,source);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(o));return o}
 try{program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);locs={p:gl.getAttribLocation(program,'aPos'),n:gl.getAttribLocation(program,'aNormal'),c:gl.getAttribLocation(program,'aColor'),m:gl.getUniformLocation(program,'uMvp')};gpu=gl.createBuffer();gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.CULL_FACE)}catch(e){activateCanvasFallback(e.message)}
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();activateCanvasFallback('Contexto gráfico perdido')});
}
let packed=null;
function updateCanvasSize(){const r=canvas.getBoundingClientRect();canvasWidth=Math.max(1,r.width);canvasHeight=Math.max(1,r.height);width=canvasWidth;height=canvasHeight;dpr=Math.min(devicePixelRatio||1,2);let pw=Math.max(1,Math.round(width*dpr)),ph=Math.max(1,Math.round(height*dpr));if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph}if(overlay.width!==pw||overlay.height!==ph){overlay.width=pw;overlay.height=ph}if(fallbackCanvas){fallbackCanvas.width=pw;fallbackCanvas.height=ph}if(gl)gl.viewport(0,0,pw,ph);renderViewportControls();cameraUpdate();renderSoon()}
function drawBuffer(data,mode){if(!gl||!data.length)return;gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);const stride=40;gl.enableVertexAttribArray(locs.p);gl.enableVertexAttribArray(locs.n);gl.enableVertexAttribArray(locs.c);gl.vertexAttribPointer(locs.p,3,gl.FLOAT,false,stride,0);gl.vertexAttribPointer(locs.n,3,gl.FLOAT,false,stride,12);gl.vertexAttribPointer(locs.c,4,gl.FLOAT,false,stride,24);gl.drawArrays(mode,0,data.length/10)}
function drawGL(){gl.clearColor(.028,.065,.105,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);if(state.doc){const v=views[activeRenderIndex];if(!v.packed||state.gpuDirty){v.packed=packScene()}packed=v.packed;gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,gpu);gl.uniformMatrix4fv(locs.m,false,new Float32Array(cam.mvp));gl.depthMask(false);drawBuffer(packed.floor,gl.TRIANGLES);drawBuffer(packed.grid,gl.LINES);drawBuffer(packed.ghost,gl.TRIANGLES);gl.depthMask(true);drawBuffer(packed.solid,gl.TRIANGLES)}}
function drawFallback(){
const ctx=g2;if(!ctx)return;ctx.clearRect(0,0,width,height);
 const grad=ctx.createRadialGradient(width*.48,height*.38,10,width*.48,height*.38,Math.max(width,height));grad.addColorStop(0,'#1c3548');grad.addColorStop(1,'#07131e');ctx.fillStyle=grad;ctx.fillRect(0,0,width,height);
 if(!state.doc)return;
 const right=unit(cross(unit(sub(cam.target,cam.eye)),[0,0,1])),face=unit(sub(cam.eye,cam.target));
 const light=unit([.4,-.25,.85]);const triangles=[];const cache=new Map();
 function shaded(hex,brightness,alpha){let i=clamp(Math.floor(brightness*12),0,16),key=hex+':'+i+':'+alpha;if(cache.has(key))return cache.get(key);let col=rgb(hex),c='rgba('+col.map(v=>Math.round(clamp(v*(.34+i/12),0,1)*255)).join(',')+','+alpha+')';cache.set(key,c);return c}
 function pushGeom(a,color,opacity,offset=[0,0,0],max=20000){if(!a?.length)return;for(let j=0;j<a.length;j+=18){let A=add(a.slice(j,j+3),offset),B=add(a.slice(j+6,j+9),offset),C=add(a.slice(j+12,j+15),offset);let pa=project(A),pb=project(B),pc=project(C);if(!pa||!pb||!pc)continue;let cx=(pa[0]+pb[0]+pc[0])/3,cy=(pa[1]+pb[1]+pc[1])/3;if(cx< -200||cx>width+200||cy< -200||cy>height+200)continue;
  let area=(pb[0]-pa[0])*(pc[1]-pa[1])-(pb[1]-pa[1])*(pc[0]-pa[0]);if(Math.abs(area)<.06)continue;
  let n=unit(a.slice(j+3,j+6)),lum=clamp(dot(n,light),0,1)*.63+.16;
  triangles.push({a:pa,b:pb,c:pc,z:dot(sub(mul(add(add(A,B),C),1/3),cam.eye),face),fill:shaded(color,lum,opacity)});
 }}
 for(const zone of state.floorZones||[]){if(!zoneVisible(zone))continue;
  if($('floor').checked)pushGeom(zone.floor,'#264765',.40);
  if($('human').checked)pushGeom(zone.human,'#91c9e6',.50);
 }
 if($('flow').checked)pushGeom(state.flowTriangles,state.layers.flow.color,.95);
 for(const c of state.doc.components){let opacity=vis(c);if(opacity<0)continue;if(c.colorType==='weld'&&!$('welds').checked)continue;pushGeom(c.mesh,state.selected.has(c.index)?'#65e2ff':state.layers[c.colorType].color,opacity,c.offset);if(c.meshAccent?.length)pushGeom(c.meshAccent,state.selected.has(c.index)?'#65e2ff':shadeValveColor(state.layers.valve.color),opacity,c.offset)}
 triangles.sort((a,b)=>a.z-b.z);
 for(const t of triangles){ctx.fillStyle=t.fill;ctx.beginPath();ctx.moveTo(t.a[0],t.a[1]);ctx.lineTo(t.b[0],t.b[1]);ctx.lineTo(t.c[0],t.c[1]);ctx.closePath();ctx.fill()}
 if($('grid').checked){ctx.strokeStyle='#4d729280';ctx.lineWidth=.75;for(const zone of state.floorZones||[]){if(!zoneVisible(zone))continue;for(let i=0;i<zone.lines.length;i+=2){let a=project(zone.lines[i]),b=project(zone.lines[i+1]);if(!a||!b)continue;ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke()}}}
}
function drawAxis(){
 const ctx=axis.getContext('2d'),w=axis.width,h=axis.height;ctx.clearRect(0,0,w,h);
 const anchor=state.doc && state.bounds && originNearBounds(state.bounds)?project([0,0,0]):null;
 const canPlace=anchor&&anchor[0]>55&&anchor[0]<width-55&&anchor[1]>90&&anchor[1]<height-45;
 if(canPlace){
  axis.style.left=(viewportOffset.x+anchor[0]-32)+'px';axis.style.top=(viewportOffset.y+anchor[1]-75)+'px';axis.style.right='auto';axis.style.bottom='auto';axis.dataset.position='origen';
 }else{
  axis.style.left=(viewportOffset.x+Math.max(0,viewportOffset.w-193))+'px';axis.style.top=(viewportOffset.y+viewportOffset.h-150)+'px';axis.style.right='auto';axis.style.bottom='auto';axis.dataset.position='fijo';
 }
 const x=32,y=75,axes=[[[1,0,0],'X','#ee7b6b'],[[0,1,0],'Y','#83d99d'],[[0,0,1],'Z','#7bbcff']];
 const right=unit(cross(unit(sub(cam.target,cam.eye)),[0,0,1])),up=unit(cross(right,unit(sub(cam.target,cam.eye))));
 for(const [v,label,color] of axes){
  const px=dot(v,right)*32,py=-dot(v,up)*32;
  ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+px,y+py);ctx.stroke();
  ctx.fillStyle=color;ctx.font='bold 13px system-ui';ctx.fillText(label,x+px+3,y+py+3);
 }
 ctx.fillStyle='#e8f0fa';ctx.beginPath();ctx.arc(x,y,2.8,0,2*Math.PI);ctx.fill();
}
let cubeFaces=[];
function drawCube(){const ctx=cube.getContext('2d'),w=cube.width,h=cube.height;ctx.clearRect(0,0,w,h);let center=[w/2,h/2+6],scale=32,axes=[[1,0,0],[0,1,0],[0,0,1]],verts=[];
 let facing=unit(sub(cam.eye,cam.target)),right=unit(cross(unit(sub(cam.target,cam.eye)),[0,0,1])),up=unit(cross(right,unit(sub(cam.target,cam.eye))));const pr=v=>[center[0]+dot(v,right)*scale,center[1]-dot(v,up)*scale];
 for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])verts.push([x,y,z]);
 const faces=[{v:[[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]],normal:[1,0,0],txt:'E'},{v:[[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]],normal:[-1,0,0],txt:'O'},{v:[[-1,1,-1],[-1,1,1],[1,1,1],[1,1,-1]],normal:[0,1,0],txt:'N'},{v:[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]],normal:[0,-1,0],txt:'S'},{v:[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],normal:[0,0,1],txt:'ARRIBA'},{v:[[-1,-1,-1],[-1,1,-1],[1,1,-1],[1,-1,-1]],normal:[0,0,-1],txt:'ABAJO'}];
 cubeFaces=[];let shown=faces.filter(f=>dot(f.normal,facing)>.015).sort((a,b)=>dot(a.normal,facing)-dot(b.normal,facing));for(const f of shown){const ps=f.v.map(pr);ctx.beginPath();ps.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle= f.txt==='ARRIBA'?'#d3dfeb':'#a8b7c9';ctx.strokeStyle='#365372';ctx.lineWidth=2;ctx.fill();ctx.stroke();const cx=ps.reduce((a,p)=>a+p[0],0)/4,cy=ps.reduce((a,p)=>a+p[1],0)/4;ctx.fillStyle='#1b344d';ctx.font=(f.txt.length>1?'bold 9px system-ui':'bold 14px system-ui');ctx.textAlign='center';ctx.fillText(f.txt,cx,cy+4);cubeFaces.push({...f,ps});}
 if($('northToggle').checked){ctx.fillStyle='#f4ca7c';ctx.font='bold 12px system-ui';ctx.textAlign='center';ctx.fillText('N ↑',w/2,13);}
}
let activeRenderIndex=0,coordHitBoxes=[];
function drawAllOverlays(time=performance.now()){
 if(!overlayCtx)return;const ctx=overlayCtx;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,canvasWidth,canvasHeight);
 const selected=activeViewIndex,rects=viewRects(),oldcam=cam,oldw=width,oldh=height;renderingMulti=true;coordHitBoxes=[];
 for(let i=0;i<views.length;i++){activeRenderIndex=i;viewportOffset=rects[i];cam=views[i].cam;width=rects[i].w;height=rects[i].h;cameraUpdate();ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.beginPath();ctx.rect(rects[i].x,rects[i].y,width,height);ctx.clip();ctx.translate(rects[i].x,rects[i].y);drawTechnicalOverlay(time);ctx.restore()}
 renderingMulti=false;cam=views[selected].cam;width=rects[selected].w;height=rects[selected].h;viewportOffset=rects[selected];cameraUpdate();
}
function render(){state.frameRequested=false;const rects=viewRects();const active=activeViewIndex;
 if(gl)gl.enable(gl.SCISSOR_TEST);
 for(let i=0;i<views.length;i++){activeRenderIndex=i;viewportOffset=rects[i];cam=views[i].cam;width=rects[i].w;height=rects[i].h;cameraUpdate();
  if(gl){try{const x=Math.round(rects[i].x*dpr),y=Math.round((canvasHeight-rects[i].y-rects[i].h)*dpr),w=Math.max(1,Math.round(width*dpr)),h=Math.max(1,Math.round(height*dpr));gl.viewport(x,y,w,h);gl.scissor(x,y,w,h);drawGL()}catch(e){activateCanvasFallback(e.message);g2.save();g2.setTransform(dpr,0,0,dpr,0,0);g2.beginPath();g2.rect(rects[i].x,rects[i].y,width,height);g2.clip();g2.translate(rects[i].x,rects[i].y);drawFallback();g2.restore();}}
  else{g2.save();g2.setTransform(dpr,0,0,dpr,0,0);g2.beginPath();g2.rect(rects[i].x,rects[i].y,width,height);g2.clip();g2.translate(rects[i].x,rects[i].y);drawFallback();g2.restore();}
 }
 if(gl)gl.disable(gl.SCISSOR_TEST);state.gpuDirty=false;
 cam=views[active].cam;width=rects[active].w;height=rects[active].h;viewportOffset=rects[active];cameraUpdate();
 if(views.length>1){if(!gl){g2.save();g2.setTransform(dpr,0,0,dpr,0,0);g2.strokeStyle='#527799';g2.lineWidth=2;for(let i=1;i<rects.length;i++){let r=rects[i];g2.strokeRect(r.x,r.y,r.w,r.h)}g2.restore()}}
 cube.style.right=Math.max(0,canvasWidth-(viewportOffset.x+viewportOffset.w)+10)+'px';cube.style.top=(viewportOffset.y+ (window.innerWidth<700?90:70))+'px';
 drawCube();drawAxis();drawAllOverlays();}

function renderSoon(){if(!state.frameRequested){state.frameRequested=true;requestAnimationFrame(render)}}
function populatePanels(){const doc=state.doc;if(!doc)return;
 const groups=new Map();for(const c of doc.components){if(c.deleted)continue;let key=groupKey(c),g=groups.get(key)||{name:c.line||'Sin línea',spec:c.spec||'Sin especificación',source:c.sourceName||'',parts:[]};g.parts.push(c);groups.set(key,g)}
 const list=$('lineList');list.replaceChildren();for(const [key,g] of groups){let div=document.createElement('div');div.className='lineitem'+(state.isolated===key?' active':'');let title=document.createElement('span');title.className='linename';title.textContent=g.name;let detail=document.createElement('small');detail.textContent=(state.doc.sources?.length>1?g.source+' · ':'')+g.spec+' · '+g.parts.length+' componentes';let btn=document.createElement('button');btn.textContent=state.isolated===key?'Aislada':'Aislar';btn.setAttribute('aria-label','Aislar '+g.name+' '+g.spec);btn.onclick=()=>{state.isolated=key;state.mode=$('isolateMode').value;populatePanels();state.gpuDirty=true;renderSoon();status('Línea aislada: '+g.name+' · '+g.spec)};div.append(title,detail,btn);list.appendChild(div)}$('lineCount').textContent=groups.size+' conjuntos de línea/especificación';
 const layers=$('layerList');layers.replaceChildren();for(const [key,meta] of Object.entries(state.layers)){let div=document.createElement('div');div.className='layerrow';const check=document.createElement('input');check.type='checkbox';check.id='layer'+key;check.checked=meta.show;check.onchange=()=>{meta.show=check.checked;state.gpuDirty=true;renderSoon();if(key==='flow')syncOverlay();};const label=document.createElement('label');label.htmlFor=check.id;label.textContent=TYPES[key][0];let color=document.createElement('input');color.type='color';color.value=meta.color;color.setAttribute('aria-label','Color de '+TYPES[key][0]);color.oninput=()=>{meta.color=color.value;state.gpuDirty=true;renderSoon()};div.append(check,label,color);layers.appendChild(div)}
}
function showPanel(id){for(const other of ['panelLines','panelLayers','panelSettings'])if(other!==id)$(other).classList.add('hidden');$(id).classList.toggle('hidden');}
function inspect(){const s=state.selected,box=$('panelInspector'),d=$('inspectorDetails');if(!s.size){box.classList.add('hidden');d.replaceChildren();return}box.classList.remove('hidden');d.replaceChildren();let ar=[...s].map(i=>state.doc.components[i]);let a=ar[0];$('inspectorTitle').textContent=s.size===1?'Componente':'Selección ('+s.size+')';function line(t){const p=document.createElement('div');p.style.margin='4px 0';p.textContent=t;d.appendChild(p)}line(s.size===1?(a.type+' · '+a.desc):s.size+' componentes seleccionados');line('Archivo: '+(a.sourceName||state.doc.name));line('Línea: '+(a.line||'—')+' · Spec: '+(a.spec||'—'));line('Diámetro exterior: '+a.od.toFixed(1)+' mm');if(s.size===1){line('ID: '+a.id);line('Coordenadas: '+a.points.filter(x=>x.key==='END-POINT').map(x=>x.xyz.join(', ')).join(' / '));}}
function pick(x,y){if(!state.doc)return null;let best=null,md=Infinity;for(const c of state.doc.components){if(c.deleted||vis(c)<0||c.path.length===0)continue;const pp=c.path.map(p=>project(add(p,c.offset)));for(let i=0;i<pp.length;i++){let d;if(i===0){let q=pp[i];if(!q)continue;d=Math.hypot(x-q[0],y-q[1])}else{let a=pp[i-1],b=pp[i];if(!a||!b)continue;let dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1),0,1);d=Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)}let threshold=clamp(c.od*height/(cam.radius*.9),9,33);if(d<Math.max(13,threshold)&&d<md){md=d;best=c;}}}return best}
function select(c,multi=false){if(!multi)state.selected.clear();if(c){if(multi&&state.selected.has(c.index))state.selected.delete(c.index);else state.selected.add(c.index)}inspect();state.gpuDirty=true;renderSoon()}
function redrawModel(){state.gpuDirty=true;views.forEach(v=>v.packed=null);renderSoon()}
function toggleConfig(){state.gpuDirty=true;renderSoon()}
function download(name,blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1800);status('Archivo preparado para descargar: '+name)}
 function saveProject(){if(!state.doc){status('Primero abra un archivo PCF');return}
 const data={format:'EditaPCF',schemaVersion:2,app:'EditaPCF',appVersion:'0.4.2',name:state.doc.name,
  sources:(state.doc.sources||[]).map(src=>({id:src.sourceId,name:src.name,raw:src.raw,offsets:src.components.map(c=>[c.id,...c.offset]),deletedIds:src.components.filter(c=>c.deleted).map(c=>c.id)})),
  colors:Object.fromEntries(Object.entries(state.layers).map(([k,v])=>[k,v.color])),
  visible:Object.fromEntries(Object.entries(state.layers).map(([k,v])=>[k,v.show])),
  camera:{target:cam.target,radius:cam.radius,yaw:cam.yaw,pitch:cam.pitch},settings:getSettings(),humanHeight:+$('humanHeight').value,
  viewportState:{active:activeViewIndex,views:views.map(v=>({filter:v.filter?[...v.filter]:null,camera:{target:v.cam.target,radius:v.cam.radius,yaw:v.cam.yaw,pitch:v.cam.pitch,near:v.cam.near,far:v.cam.far,fov:v.cam.fov}}))}}
 download(basename(state.doc.name)+'.editapcf',new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));state.dirty=false;updateTabs();}
function readProject(obj,name){
 if(!obj || obj.app!=='EditaPCF' || ![1,2].includes(obj.schemaVersion||1))throw Error('Proyecto .editapcf incompatible; no se modificó el documento');
 let d;
 if(Array.isArray(obj.sources)&&obj.schemaVersion===2){
   const sources=obj.sources.map((r,i)=>normalizeSource(parsePCF(r.raw||r.pcf||'',r.name||'fuente_'+i+'.pcf'),r.id||('src'+i),new Map((r.offsets||[]).map(a=>[a[0],a.slice(1)])),new Set(r.deletedIds||[])));
   if(!sources.length)throw Error('Proyecto sin fuentes PCF');d=makeCombined(sources,obj.name||name.replace(/\.editapcf$/i,'.pcf'));
 }else{
   let original=parsePCF(obj.pcf||obj.raw||'',obj.name||name.replace(/\.editapcf$/i,'.pcf'));
   d=makeCombined([normalizeSource(original,'src0',new Map((obj.offsets||[]).map(a=>[a[0],a.slice(1)])))],original.name);
 }
 for(const [k,col] of Object.entries(obj.colors||{}))if(state.layers[k]&&/^#[0-9a-f]{6}$/i.test(col))state.layers[k].color=col;
 for(const [k,v] of Object.entries(obj.visible||{}))if(state.layers[k])state.layers[k].show=!!v;
 for(const [k,v] of Object.entries(obj.settings||{}))if($(k)){$(k).type==='checkbox'?$(k).checked=!!v:$(k).value=v}
 if(typeof obj.humanHeight==='number')$('humanHeight').value=clamp(obj.humanHeight,1200,2200);updateOpacityText();
 return {doc:d,camera:obj.camera,viewportState:obj.viewportState};
}
function loadRaw(raw,name){let doc,pr=null,prViews=null;if(name.toLowerCase().endsWith('.editapcf')){let obj=JSON.parse(raw);const result=readProject(obj,name);doc=result.doc;pr=result.camera;prViews=result.viewportState}else doc=parsePCF(raw,name);
 if(!doc.components.length)throw Error('El documento no contiene componentes PCF reconocidos. El modelo actual se conserva.');if(!doc.sources)doc=makeCombined([normalizeSource(doc,'src0')],doc.name);state.doc=doc;state.selected.clear();state.isolated=null;state.undo=[];state.redo=[];state.dirty=false;state.bounds=findBounds(doc);updateGeometry();fitView();if(pr&&typeof pr==='object'&&Number.isFinite(pr.radius)&&pr.radius>0){cam.radius=pr.radius;cam.yaw=pr.yaw??cam.yaw;cam.pitch=clamp(pr.pitch??cam.pitch,-1.5,1.5);if(Array.isArray(pr.target)&&pr.target.length===3)cam.target=pr.target;cameraUpdate()}
  state.loadedViewportState=!!(prViews?.views?.length && [1,2,4].includes(prViews.views.length));if(state.loadedViewportState){views=prViews.views.map(v=>({cam:cloneCamera(v.camera||cam),filter:v.filter?new Set(v.filter):null,packed:null}));activeViewIndex=Math.min(prViews.active||0,views.length-1);cam=views[activeViewIndex].cam;}
  $('filename').textContent=doc.name;$('numbers').textContent=doc.components.length+' componentes · '+doc.arrows.length+' flechas PCF';$('empty').classList.add('hidden');populatePanels();inspect();state.gpuDirty=true;renderSoon();syncOverlay();status('Archivo leído. Vista 3D experimental, contraste con el PCF original.');}
async function loadFile(file,mode='open'){if(!file)return;try{if(file.size>70e6)throw Error('Archivo mayor de 70 MB');const raw=await file.text();if(mode==='insert')insertRaw(raw,file.name);else addDocumentFromRaw(raw,file.name)}catch(e){status('No se abrió: '+e.message);console.error(e)}}
function snap(){return {offsets:state.doc?.components.map(c=>[...c.offset])||[],deleted:state.doc?.components.map(c=>!!c.deleted)||[]}}
function pushHistory(){state.undo.push(snap());if(state.undo.length>40)state.undo.shift();state.redo=[]}
function restoreOffsets(v){if(!state.doc||!v)return;const arr=Array.isArray(v)?v:v.offsets;if(!arr||arr.length!==state.doc.components.length)return;
 arr.forEach((p,i)=>{state.doc.components[i].offset=[...p];state.doc.components[i].deleted=!!(v.deleted?.[i])});
 state.dirty=true;state.bounds=findBounds(state.doc);buildHelpers();state.selected.clear();inspect();populatePanels();updateTabs();redrawModel();syncOverlay();}

function moveSelected(){if(!state.selected.size)return;let v=['dx','dy','dz'].map(k=>+$(k).value);if(v.some(x=>!Number.isFinite(x)))return status('Desplazamiento no válido');if(v.every(x=>x===0))return status('Ingrese un desplazamiento');if(!state.doc) return;pushHistory();for(const id of state.selected){let c=state.doc.components[id];c.offset=add(c.offset,mul(v,unitScale(state.doc.units.coords)))}state.dirty=true;state.bounds=findBounds(state.doc);buildHelpers();inspect();updateTabs();redrawModel();syncOverlay();status('Desplazamiento aplicado. La exportación PCF verificará las conexiones reconocidas.')}
function removeSelected(){if(!state.doc||!state.selected.size)return;
 const ids=[...state.selected].filter(i=>state.doc.components[i]&&!state.doc.components[i].deleted);
 if(!ids.length)return;
 openModal('Retirar componentes',`<p>Se retirarán ${ids.length} componente(s) del modelo. Puede deshacer esta acción. La exportación PCF modificada quedará bloqueada mientras haya componentes retirados.</p><div class="menurow"><button id="confirmRemove" class="kbtn">Retirar del modelo</button><button id="cancelRemove" class="kbtn">Cancelar</button></div>`);
 $('cancelRemove').onclick=closeModal;$('confirmRemove').onclick=()=>{closeModal();pushHistory();for(const i of ids)state.doc.components[i].deleted=true;
 state.selected.clear();state.dirty=true;state.bounds=findBounds(state.doc);buildHelpers();populatePanels();inspect();updateTabs();redrawModel();syncOverlay();status('Componente retirado. Los ensambles se recalcularon. Use Deshacer para recuperarlo.');};
}
function undo(){if(!state.undo.length)return;state.redo.push(snap());restoreOffsets(state.undo.pop());status('Deshecho')}
function redo(){if(!state.redo.length)return;state.undo.push(snap());restoreOffsets(state.redo.pop());status('Rehecho')}
function checkConnections(){const d=state.doc,eps=d.components.flatMap(c=>c.ends.map(p=>({c,p:p.p}))),bad=[];const seen=new Set();for(let i=0;i<eps.length;i++){const a=eps[i];for(let j=i+1;j<eps.length;j++){let b=eps[j];if(a.c===b.c||dist(a.p,b.p)>.5)continue;const x=dist(add(a.p,a.c.offset),add(b.p,b.c.offset));if(x>1){let k=a.c.index+'_'+b.c.index;if(!seen.has(k)){bad.push([a.c.type,b.c.type,x]);seen.add(k)}}}}return bad}
function fmtCoord(old,v){const m=old.match(/\.(\d+)/),digits=m?m[1].length:4;let out=(v).toFixed(Math.min(8,Math.max(0,digits)));if(out[0]==='-'&&+out===0)out=out.slice(1);return out}
function applyLineOffset(p,offset,fac){let m=p.groups;return m[1]+fmtCoord(m[2],+m[2]+offset[0]/fac)+m[3]+fmtCoord(m[4],+m[4]+offset[1]/fac)+m[5]+fmtCoord(m[6],+m[6]+offset[2]/fac)+m[7]}
function exportPCF(){if(!state.doc)return status('Primero abra un archivo PCF');const doc=state.doc;if(doc.components.some(c=>c.deleted)){openModal('PCF: eliminación pendiente de validar','<p>Hay componentes retirados del modelo. El proyecto .editapcf conserva la edición y permite Deshacer; la exportación PCF modificada queda bloqueada hasta implementar la reescritura y validación topológica de componentes eliminados.</p>');return;}if((doc.sources||[]).length>1){openModal('PCF: fuentes independientes','<p>El documento reúne varios PCF con catálogos y encabezados propios. Unirlos en un solo archivo PCF no es seguro sin remapear materiales y validar todas las especificaciones.</p><p>Guarde el proyecto .editapcf para conservar el conjunto. Puede descargar los PCF originales por separado, sin aplicar las modificaciones del editor.</p><div class="menurow"><button id="saveAllOriginals">Descargar originales (ZIP)</button></div>');$('saveAllOriginals').onclick=()=>{closeModal();downloadSourcesZip(doc.sources)};return}const changed=doc.components.some(c=>len(c.offset)>.00001);if(!changed){download(basename(doc.name)+'.pcf',new Blob([doc.raw],{type:'text/plain;charset=utf-8'}));return}
 const bad=checkConnections();if(bad.length){status('PCF bloqueado: '+bad.length+' uniones originalmente coincidentes quedaron separadas.');openModal('Exportación bloqueada',`<p>El desplazamiento separó ${bad.length} conexiones que coincidían en el archivo original.</p><p>No se exportó un PCF modificado. Seleccione los componentes asociados y muévalos juntos, o use Deshacer.</p>`);return}
 const lines=[...doc.lines],used=new Set();for(const c of doc.components)if(len(c.offset)>.00001)for(const p of c.points){if(used.has(p.line)){status('Líneas de coordenadas ambiguas; exportación detenida');return}lines[p.line]=applyLineOffset(p,c.offset,unitScale(doc.units.coords));used.add(p.line)}
 // Flow arrows anchored to moved pipe must follow that pipe if nearest original segment is within its radius.
 for(const f of doc.arrows){let p=f.points.find(q=>q.key==='CO-ORDS');if(!p)continue;let best=null,d=Infinity;for(let c of doc.components){if(!['PIPE','TUBE'].includes(c.type)||c.ends.length<2)continue;let a=c.ends[0].p,b=c.ends[1].p,ab=sub(b,a),t=clamp(dot(sub(p.p,a),ab)/(dot(ab,ab)||1),0,1),dd=dist(p.p,add(a,mul(ab,t)));if(dd<d){d=dd;best=c}}if(best&&d<best.od*.85&&len(best.offset)>.00001){lines[p.line]=applyLineOffset(p,best.offset,unitScale(doc.units.coords));}}
 openModal('Confirmar PCF modificado',`<p>Las uniones entre extremos originalmente coincidentes no muestran separaciones superiores a 1 mm.</p><p>Esta validación es parcial: no certifica códigos Isogen, topología completa, longitudes ni conectividad industrial. Conserve el original y verifique el resultado en su sistema CAD.</p><div class="menurow"><button id="confirmExport">Descargar PCF modificado</button></div>`);$('confirmExport').onclick=()=>{closeModal();download(basename(doc.name)+'_editado.pcf',new Blob([lines.join(doc.eol)],{type:'text/plain;charset=utf-8'}))}
}
 function crc32(data){let crc=0xffffffff;for(let b of data){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return (crc^0xffffffff)>>>0}
 function downloadSourcesZip(sources){const enc=new TextEncoder(),local=[],central=[];let offset=0;
 function u16(a,n){a.push(n&255,n>>>8&255)}function u32(a,n){a.push(n&255,n>>>8&255,n>>>16&255,n>>>24&255)}
 sources.forEach((src,i)=>{const filename=basename(src.name)+'_'+(i+1)+'.pcf',name=enc.encode(filename),contents=enc.encode(src.raw),crc=crc32(contents),hdr=[];
 u32(hdr,0x04034b50);u16(hdr,20);u16(hdr,0x800);u16(hdr,0);u16(hdr,0);u16(hdr,0);u32(hdr,crc);u32(hdr,contents.length);u32(hdr,contents.length);u16(hdr,name.length);u16(hdr,0);
 const localBlock=new Uint8Array([...hdr,...name,...contents]);local.push(localBlock);const c=[];
 u32(c,0x02014b50);u16(c,20);u16(c,20);u16(c,0x800);u16(c,0);u16(c,0);u16(c,0);u32(c,crc);u32(c,contents.length);u32(c,contents.length);u16(c,name.length);u16(c,0);u16(c,0);u16(c,0);u16(c,0);u32(c,0);u32(c,offset);central.push(new Uint8Array([...c,...name]));offset+=localBlock.length;
 });const cOffset=offset,cSize=central.reduce((a,b)=>a+b.length,0),end=[];u32(end,0x06054b50);u16(end,0);u16(end,0);u16(end,central.length);u16(end,central.length);u32(end,cSize);u32(end,cOffset);u16(end,0);
 download(basename(state.doc?.name||'EditaPCF')+'_fuentes_originales.zip',new Blob([...local,...central,new Uint8Array(end)],{type:'application/zip'}));}
 function compositedView(){render();const out=document.createElement('canvas');out.width=canvas.width;out.height=canvas.height;const g=out.getContext('2d');g.drawImage(fallbackCanvas||canvas,0,0);g.drawImage(overlay,0,0);return out}
function pngBlob(){return new Promise(resolve=>{compositedView().toBlob(blob=>resolve(blob),'image/png')})}
async function exportPNG(){if(!state.doc)return status('Primero abra un archivo PCF');render();let blob=await pngBlob();if(blob)download(basename(state.doc.name)+'.png',blob);else status('No se pudo generar PNG')}
function exportPDF(){if(!state.doc)return status('Primero abra un archivo PCF');render();$('printImage').src=compositedView().toDataURL('image/png');$('printName').textContent=state.doc.name+' · '+state.doc.components.length+' componentes';status('Use la opción Guardar como PDF del cuadro de impresión');window.print()}
function openModal(title,html){$('modal').querySelector('.modalbox').classList.remove('compact');$('modalTitle').textContent=title;$('modalBody').innerHTML=html;$('modal').hidden=false;$('modalClose').focus()}
function closeModal(){$('modal').hidden=true;$('modal').querySelector('.modalbox').classList.remove('compact')}
function exportMenu(){if(!state.doc)return status('Primero abra un archivo PCF');openModal('Exportar',`<p>El PCF de un archivo se conserva íntegro sin cambios. Si insertó otras fuentes, puede descargar sus originales por separado; el proyecto .editapcf conserva todas las fuentes.</p><div class="menurow"><button id="mPCF">PCF</button><button id="mProject">Proyecto .editapcf</button><button id="mPNG">Imagen PNG</button><button id="mPDF">PDF (imprimir)</button></div>`);$('mPCF').onclick=()=>{closeModal();exportPCF()};$('mProject').onclick=()=>{closeModal();saveProject()};$('mPNG').onclick=()=>{closeModal();exportPNG()};$('mPDF').onclick=()=>{closeModal();exportPDF()};}
function about(){const original=$('aboutStatic').cloneNode(true);original.removeAttribute('hidden');original.id='aboutVisible';original.querySelector('h2')?.remove();openModal('Acerca de','');$('modalBody').append(original);const nav=document.createElement('div');nav.className='menurow';for(const [name,content] of [['Intención','Reconstruir y revisar modelos PCF conservando sus datos originales; ampliar progresivamente la fidelidad geométrica, los accesorios y la edición con exportación segura.'],['Instrucciones','Abra o arrastre un archivo PCF. Gire arrastrando la vista; panee manteniendo pulsada la rueda central; acerque con la rueda o dos dedos. Seleccione componentes con clic o toque; active selección múltiple en Configuración. Abra Líneas para aislar y Capas para mostrar u ocultar categorías. Guarde el proyecto .editapcf o exporte PCF, imagen o PDF desde Exportar.']]){let btn=document.createElement('button');btn.textContent=name;btn.onclick=()=>openModal(name,'<p>'+content+'</p><button id="goBack" class="kbtn">Volver a Acerca de</button>');btn.addEventListener('click',()=>{$('goBack').onclick=about});nav.append(btn)}$('modalBody').append(nav)}
function openExample(){const q=$('file');q.click()}
$('open').onclick=$('openMain').onclick=openExample;$('file').addEventListener('change',e=>{loadFile(e.target.files[0],'open');e.target.value=''});$('insert').onclick=()=>$('insertFile').click();$('insertFile').addEventListener('change',e=>{loadFile(e.target.files[0],'insert');e.target.value=''});$('newDoc').onclick=newDocument;$('vports').onclick=openViewportMenu;
$('save').onclick=saveProject;$('export').onclick=exportMenu;$('lines').onclick=()=>showPanel('panelLines');$('layers').onclick=()=>showPanel('panelLayers');$('settings').onclick=()=>showPanel('panelSettings');$('aboutBtn').onclick=about;
document.querySelectorAll('[data-close]').forEach(x=>x.onclick=()=>$(x.dataset.close).classList.add('hidden'));
$('modalClose').onclick=closeModal;$('modal').addEventListener('pointerdown',e=>{if(e.target===$('modal'))closeModal()});
$('showAll').onclick=()=>{state.isolated=null;populatePanels();redrawModel();status('Todas las líneas visibles')};
$('isolateMode').onchange=()=>{state.mode=$('isolateMode').value;redrawModel()};
for(const id of ['floor','grid','human','flow','labels','jointCoords','welds'])$(id).addEventListener('change',()=>{state.gpuDirty=true;renderSoon();if(id==='flow'||id==='labels')syncOverlay()});
$('labelOpacity').oninput=()=>{updateOpacityText();syncOverlay();renderSoon()};$('northToggle').onchange=renderSoon;$('humanHeight').onchange=()=>{let x=+$('humanHeight').value;if(x<1200||x>2200)$('humanHeight').value=clamp(x||1750,1200,2200);if(state.doc){buildHelpers();redrawModel()}};
$('resetColors').onclick=()=>{for(const [k,v] of Object.entries(TYPES))state.layers[k].color=v[1];populatePanels();redrawModel()};
$('clearSelect').onclick=()=>select(null);$('move').onclick=moveSelected;$('selectGroup').onclick=()=>{let i=state.selected.values().next().value;if(i===undefined)return;let k=groupKey(state.doc.components[i]);state.selected.clear();for(let c of state.doc.components)if(groupKey(c)===k)state.selected.add(c.index);inspect();redrawModel()};$('undo').onclick=undo;$('redo').onclick=redo;$('remove').onclick=removeSelected;
$('plus').onclick=()=>{cam.radius=clamp(cam.radius*.78,10,1e10);renderSoon()};$('minus').onclick=()=>{cam.radius=clamp(cam.radius*1.28,10,1e10);renderSoon()};$('fit').onclick=fitView;
let active=new Map(),previous=null,gesture=null;
function viewAt(x,y){const rects=viewRects();for(let i=0;i<rects.length;i++){const r=rects[i];if(x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h)return i}return activeViewIndex}
 function pointerPos(e){let r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,v=viewRects()[dragPane??activeViewIndex];return[x-v.x,y-v.y]}
function coordinateHitAt(x,y,view){return coordHitBoxes.findLast(h=>h.view===view&&x>=h.x&&x<=h.x+h.w&&y>=h.y&&y<=h.y+h.h)}
function editAssemblyCoordinates(hit){
 const a=(state.assemblies||[]).find(a=>a.id===hit.assemblyId && hit.ids.some(i=>a.components.some(c=>c.index===i)));
 if(!a)return status('El ensamble cambió. Seleccione nuevamente su coordenada.');
 const origin=[...a.point];const desc=a.originMethod==='flujo'?'Inicio determinado a partir de la dirección de flujo reconocida.':
 a.originMethod==='flujo con varias entradas'?'Existen varias entradas de flujo. Verifique cuál debe usarse como origen.':
 'Inicio geométrico. La dirección del flujo no está comprobada para este ensamble.';
 openModal('Coordenadas del ensamble',`<p class="tiny" id="assemblyMethod"></p><div class="coordInputs"><label>X (mm)<input id="assemblyX" type="number" step="any" required></label><label>Y (mm)<input id="assemblyY" type="number" step="any" required></label><label>Z (mm)<input id="assemblyZ" type="number" step="any" required></label></div><div class="menurow"><button id="assemblyApply" class="kbtn">Aplicar desplazamiento</button><button id="assemblyCancel" class="kbtn">Cancelar</button></div>`);
 $('assemblyMethod').textContent=desc;
 ['assemblyX','assemblyY','assemblyZ'].forEach((id,i)=>$(id).value=String(Number(origin[i].toFixed(4))));
 $('assemblyCancel').onclick=closeModal;
 const apply=()=>{const els=['assemblyX','assemblyY','assemblyZ'].map(id=>$(id));
  if(els.some(el=>el.value.trim()===''||!el.validity.valid))return status('Ingrese coordenadas numéricas válidas.');
  const target=els.map(el=>Number(el.value));
  if(target.some(v=>!Number.isFinite(v)||Math.abs(v)>1e10))return status('Las coordenadas exceden los límites admitidos.');
  const delta=sub(target,origin);if(len(delta)<.000001){closeModal();return status('Coordenadas sin cambios.');}
  pushHistory();for(const c of a.components)c.offset=add(c.offset,delta);
  state.dirty=true;state.bounds=findBounds(state.doc);buildHelpers();inspect();updateTabs();populatePanels();redrawModel();syncOverlay();
  closeModal();if(len(delta)>Math.max(...state.bounds.size))fitView();status('Ensamble desplazado: '+a.components.length+' componentes. Las coordenadas originales del PCF se conservan hasta exportar.');
 };
 $('assemblyApply').onclick=apply;
 for(const id of ['assemblyX','assemblyY','assemblyZ'])$(id).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();apply()}});
 $('assemblyX').focus();$('assemblyX').select();
}
function panCamera(dx,dy){let front=unit(sub(cam.target,cam.eye)),right=unit(cross(front,[0,0,1])),up=unit(cross(right,front)),fac=2*cam.radius*Math.tan(cam.fov/2)/height;cam.target=add(cam.target,add(mul(right,-dx*fac),mul(up,dy*fac)));}
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);const r=canvas.getBoundingClientRect();dragPane=viewAt(e.clientX-r.left,e.clientY-r.top);focusView(dragPane);let p=pointerPos(e);active.set(e.pointerId,p);previous={start:performance.now(),x:p[0],y:p[1],button:e.button,moved:0,multi:e.shiftKey||e.ctrlKey||e.metaKey||$('multiSelect').checked};if(e.button===1)e.preventDefault();canvas.classList.add('dragging');gesture={pointerType:e.pointerType,pan:e.shiftKey||e.button===1||e.button===2||e.buttons===4||e.buttons===2};});
canvas.addEventListener('pointermove',e=>{if(!active.has(e.pointerId))return;let p=pointerPos(e),old=active.get(e.pointerId);active.set(e.pointerId,p);if(active.size===1){let dx=p[0]-old[0],dy=p[1]-old[1];if(gesture?.pan)panCamera(dx,dy);else{cam.yaw-=dx*.006;cam.pitch=clamp(cam.pitch+dy*.006,-1.52,1.52)}if(previous)previous.moved=(previous.moved||0)+Math.abs(dx)+Math.abs(dy)}else if(active.size===2){const points=[...active.values()],a=points[0],b=points[1],d=Math.hypot(a[0]-b[0],a[1]-b[1]),mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];if(gesture?.pinchDist){cam.radius*=gesture.pinchDist/Math.max(1,d);panCamera(mid[0]-gesture.mid[0],mid[1]-gesture.mid[1]);}gesture={...gesture,pinchDist:d,mid};if(previous)previous.moved=999}renderSoon()});
canvas.addEventListener('pointerup',e=>{if(!active.has(e.pointerId))return;let p=pointerPos(e);active.delete(e.pointerId);if(!active.size){canvas.classList.remove('dragging');if(previous?.button===0&&(previous?.moved||0)<8){const rect=canvas.getBoundingClientRect(),hit=coordinateHitAt(e.clientX-rect.left,e.clientY-rect.top,dragPane??activeViewIndex);if(hit)editAssemblyCoordinates(hit);else{const c=pick(p[0],p[1]);select(c,previous?.multi)}}previous=null;gesture=null;dragPane=null}else gesture=null;});
canvas.addEventListener('pointercancel',e=>{active.delete(e.pointerId);if(!active.size){canvas.classList.remove('dragging');dragPane=null}});
canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault()});
canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();focusView(viewAt(e.clientX-r.left,e.clientY-r.top));cam.radius=clamp(cam.radius*Math.exp(e.deltaY*.0011),10,1e10);renderSoon()},{passive:false});
function cubeDirection(dir){const rad=cam.radius;cam.target=[...cam.target];cam.yaw=Math.atan2(dir[1],dir[0]);cam.pitch=clamp(Math.asin(dir[2]/(len(dir)||1)),-1.52,1.52);renderSoon()}
function inPoly(x,y,pts){let ok=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){let a=pts[i],b=pts[j];if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1]||.00001)+a[0]))ok=!ok}return ok}
let cubeStart=null;
cube.addEventListener('pointerdown',e=>{cube.setPointerCapture(e.pointerId);cubeStart=[e.offsetX,e.offsetY]});
cube.addEventListener('pointerup',e=>{let dx=e.offsetX-(cubeStart?.[0]||e.offsetX),dy=e.offsetY-(cubeStart?.[1]||e.offsetY);if(Math.hypot(dx,dy)>8){cam.yaw-=dx*.012;cam.pitch=clamp(cam.pitch+dy*.012,-1.5,1.5);renderSoon();return}let px=e.offsetX*cube.width/cube.clientWidth,py=e.offsetY*cube.height/cube.clientHeight;let hit=[...cubeFaces].reverse().find(f=>inPoly(px,py,f.ps));if(hit)cubeDirection(hit.normal);});
cube.addEventListener('dblclick',()=>{cam.yaw=-1.10;cam.pitch=.45;renderSoon()});cube.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();cam.yaw=-1.10;cam.pitch=.45;renderSoon()}});
window.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();for(const p of ['panelLines','panelLayers','panelSettings'])$(p).classList.add('hidden');return}let tag=document.activeElement?.tagName;if(['INPUT','SELECT','TEXTAREA'].includes(tag))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return}if(e.key.toLowerCase()==='f')fitView();if(e.key==='1')cubeDirection([0,-1,0]);if(e.key==='2')cubeDirection([1,0,0]);if(e.key==='3')cubeDirection([0,0,1]);if(e.key==='4'){cam.yaw=-1.1;cam.pitch=.45;renderSoon()}});
let dragDepth=0;for(const type of ['dragenter','dragover','dragleave','drop'])window.addEventListener(type,e=>{if(!e.dataTransfer?.types.includes('Files'))return;e.preventDefault();if(type==='dragenter')dragDepth++;if(type==='dragleave')dragDepth=Math.max(0,dragDepth-1);if(type==='drop'){dragDepth=0;let f=e.dataTransfer.files[0];if(f){if(!state.doc?.components?.length){loadFile(f,'open')}else{openModal('Archivo PCF','<p class="dropName" id="dropName"></p><div class="menurow compactActions"><button id="dropInsert">Insertar</button><button id="dropOpen">Abrir</button></div>');$('dropName').textContent=f.name;$('modal').querySelector('.modalbox').classList.add('compact');$('dropOpen').onclick=()=>{closeModal();loadFile(f,'open')};$('dropInsert').onclick=()=>{closeModal();loadFile(f,'insert')}}}}$('drop').style.display=dragDepth?'flex':'none';});
window.addEventListener('resize',updateCanvasSize);if('ResizeObserver' in window)new ResizeObserver(updateCanvasSize).observe(canvas);
setupGL();views=[{cam:cloneCamera(cam),filter:null,packed:null}];updateOpacityText();updateCanvasSize();renderSoon();
// Accessible integration-test interface, not used by the application to fake results.
window.EditaPCF={parsePCF,loadRaw,exportPCF,saveProject,openAsDocument:addDocumentFromRaw,insertRaw,setViewportLayout,focusView,getDocuments:()=>documents.map(x=>x.session.doc.name),getViews:()=>views.map(x=>({filter:x.filter?[...x.filter]:null,target:[...x.cam.target]})),getSession:()=>({documents:documents.length,activeDocument,views:views.length,sourceCount:state.doc?.sources?.length||0,joints:state.jointPoints?.length||0,coordinateLabels:(state.jointPoints||[]).map(j=>({point:[...j.point],originMethod:j.originMethod,ids:[...j.ids]})),coordinateHitRegions:coordHitBoxes.map(h=>({...h})),assemblies:state.assemblies?.length||0,assemblyInfo:(state.assemblies||[]).map(a=>({ids:a.components.map(c=>c.index),sources:[...a.sourceIds],min:a.min,max:a.max,start:[...a.point],originMethod:a.originMethod})),floorZones:state.floorZones?.length||0,floors:(state.floorZones||[]).map(z=>({floorZ:z.floorZ,sources:[...z.sourceIds],assemblies:z.assemblies.length,bounds:[z.min,z.max]})),labelOpacity:+$('labelOpacity').value,activeFile:state.doc?.name}),getState:()=>({components:state.doc?.components.length||0,arrows:state.doc?.arrows.length||0,isolate:state.isolated,selected:[...state.selected],mode:gl?'webgl':'canvas',file:state.doc?.name||null,edited:state.dirty,floorZ:state.floorZ,axisPosition:axis.dataset.position,modelOriginNearby:state.bounds?originNearBounds(state.bounds):null,flowTracks:state.flowTracks.length,flowAnchors:state.flowAnchors||[],flowWarnings:state.flowWarnings||[],bendChecks:state.doc?.components.filter(c=>['ELBOW','BEND'].includes(c.type)).map(c=>({index:c.index,geometry:c.bendGeometry,first:c.path[0],last:c.path.at(-1)}))||[],valveConnections:state.doc?.components.filter(c=>c.type.includes('VALVE')).map(c=>({index:c.index,kind:c.valveConnection}))||[],flowAnimating:!!overlayLoop,labels:state.doc?.components.map(c=>labelOf(c)).filter(Boolean)||[],camera:{target:[...cam.target],yaw:cam.yaw,pitch:cam.pitch,radius:cam.radius}}),setSelection:(ids)=>{state.selected=new Set(ids);inspect();redrawModel()},move:(dx,dy,dz)=>{for(let [k,v] of [['dx',dx],['dy',dy],['dz',dz]])$(k).value=v;moveSelected()},editAssembly:(i,coordinates)=>{const a=state.assemblies[i];if(!a)return false;const hit={assemblyId:a.id,ids:a.components.map(c=>c.index)};editAssemblyCoordinates(hit);if(coordinates){['assemblyX','assemblyY','assemblyZ'].forEach((id,j)=>$(id).value=coordinates[j]);$('assemblyApply').click()}return true;},removeSelected,showAll:()=>{$('showAll').click()}};
})();
