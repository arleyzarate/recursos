/* TubiTrazo v1.0.0 · Editor interactivo */
'use strict';
/* 01. CATÁLOGOS Y CONFIGURACIÓN. Preparado para mover a catalogos.js */
const $=id=>document.getElementById(id);
const {canvas,camera,gridLayer,guideLayer,aidLayer,sceneLayer,reducerPreviewLayer,draftLayer,marqueeLayer,moveLayer,copyLayer,pipeTool,moveTool,copyTool,filterTool,filterMenu,reducerTool,deleteTool,resetTool,undoTool,redoTool,colorTool,planeCaption,axisButton,planeChoices,confirm:confirmButton,cancel:cancelButton,tip,toast,propertyPanel,panelTitle,panelBody}=Object.fromEntries(['canvas','camera','gridLayer','guideLayer','aidLayer','sceneLayer','reducerPreviewLayer','draftLayer','marqueeLayer','moveLayer','copyLayer','pipeTool','moveTool','copyTool','filterTool','filterMenu','reducerTool','deleteTool','resetTool','undoTool','redoTool','colorTool','planeCaption','axisButton','planeChoices','confirm','cancel','tip','toast','propertyPanel','panelTitle','panelBody'].map(x=>[x,$(x)]));
const TWO=Math.PI*2;
const history={past:[],future:[],current:null,limit:20};
const state={reducerMode:false,reducerChoice:null,reducerLast:null,reducerSetupView:'horizontal',preferredFace:null,plane:'XY',tool:false,graph:{nodes:[],edges:[],nextNode:1,nextEdge:1,curves:[],fitServices:{},weldNodes:[],detachedNodes:[]},draft:[],view:{k:1.28,dx:0,dy:0},cursor:null,selection:new Set(),filterMode:'none',filterValue:null,filterAction:'select',isolation:null,flowSeed:null,panel:null,aidsVisible:true,aidLabels:{horizontal:'HORIZONTAL',vertical:'VERTICAL',roll:'ROLL 45°'},aidOverrides:{},pointers:new Map(),gesture:null,interaction:null,marquee:null,copy:{enabled:false,template:null,placement:null},supportMode:false,supportChoice:{kind:'cross',placement:'below'},move:{enabled:false,target:null,axis:null,drag:null,baseline:null,valid:true}};

/* CATÁLOGO DE SERVICIOS. Colores de VISTA, inspirados en la clasificación ASME A13.1-2023.
   El estándar corresponde a marcadores físicos con leyenda, NO a colores obligatorios de línea CAD.
   Gas y crudo son ambos fluidos inflamables/combustibles: familia AMARILLA. */
function serviceColor(edge){return edge.serviceColor||SERVICE_COLORS[edge.service]?.color||CAT.tubeColor}
function blendHex(hex, whiteRatio=.46){if(!/^#[0-9a-f]{6}$/i.test(hex))return CAT.fitColor;const n=parseInt(hex.slice(1),16),c=[n>>16&255,n>>8&255,n&255].map(v=>Math.round(v*(1-whiteRatio)+255*whiteRatio));return '#'+c.map(x=>x.toString(16).padStart(2,'0')).join('')}
function accessoryScale(diam){const n=Number(diam)||2;if(n<=2)return 1;return f(1+.10*CAT.nominalDN.filter(d=>d>2&&d<=n+1e-4).length)}
function fitServiceColor(fit,info){const stored=state.graph.fitServices?.[fit.node];if(stored&&SERVICE_COLORS[stored])return blendHex(SERVICE_COLORS[stored].color);
 const links=info.adj.get(fit.node)||[],codes=new Set(links.map(l=>l.edge.service).filter(Boolean));return codes.size===1?blendHex(SERVICE_COLORS[[...codes][0]]?.color||CAT.fitColor):CAT.fitColor}
/* v0.25: motor completo heredado de v0.21. */
/* 02. MODELO Y GEOMETRÍA. Coordenadas XYZ independientes de la pantalla. */
const f=n=>Math.round(n*100)/100;
const xyz=p=>`${f(p.x)},${f(p.y)}`;
const escaped=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const normalizeMaterial=v=>String(v||'ACERO AL CARBÓN').trim().toUpperCase().replace(/\s+/g,' ');
/* Un solo corte físico puede contener varias líneas cuando el vértice es curva,
   siempre que DN, SCH y material coincidan. Los nudos con soldadura NO se fusionan. */
function cuttingGroups(){
 const pipes=state.graph.edges.filter(e=>e.kind!=='reducer'&&!e.referencePort);
 const parent=new Map(pipes.map(e=>[e.id,e.id]));
 function root(id){let x=id;while(parent.get(x)!==x)x=parent.get(x);return x}
 function join(a,b){a=root(a);b=root(b);if(a!==b)parent.set(Math.max(a,b),Math.min(a,b))}
 const curves=new Set(state.graph.curves||[]);
 for(const nodeId of curves){
  const es=pipes.filter(e=>e.a===nodeId||e.b===nodeId);
  if(es.length!==2)continue;
  const [a,b]=es;
  if(Math.abs(Number(a.diam)-Number(b.diam))<1e-5 &&
     String(a.wall||'SCH 40')===String(b.wall||'SCH 40') &&
     normalizeMaterial(a.material)===normalizeMaterial(b.material))join(a.id,b.id);
 }
 const byRoot=new Map();for(const e of pipes){const id=root(e.id);if(!byRoot.has(id))byRoot.set(id,[]);byRoot.get(id).push(e)}
 return [...byRoot.values()].map(es=>es.sort((a,b)=>a.id-b.id)).sort((a,b)=>a[0].id-b[0].id);
}
function cuttingList(){return cuttingGroups().map(es=>({
 tag:es[0].tag,diam:es[0].diam,wall:es[0].wall||'SCH 40',
 material:es[0].material,segments:es.map(e=>e.id),
 // Longitud geométrica de la línea central. Aún no incluye desarrollos de curvado.
 schematicLength:es.reduce((sum,e)=>sum+dist(getNode(e.a).p,getNode(e.b).p),0)
}));}
/* Metadatos técnicos y valores predeterminados heredados del ensamble.
   Son datos de trabajo; aún NO equivalen a un PCF exportado. */
function lengthString(val,unit=state.graph.project?.lengthUnit||'mm'){
 if(!Number.isFinite(Number(val))||Number(val)<0)return '';
 const n=Number(val),digits=unit==='mm'?0:unit==='m'?2:unit==='ft'?2:3;
 return `${Number(n.toFixed(digits)).toLocaleString('en-US',{useGrouping:false,maximumFractionDigits:digits})} ${unit}`;
}
function convertLengthUnit(next){
 ensureProject();const proj=state.graph.project,old=proj.lengthUnit||'mm';
 if(!(next in LENGTH_TO_MM)||old===next)return;
 const factor=LENGTH_TO_MM[old]/LENGTH_TO_MM[next];
 // Mantener precisión interna, sin redondear medidas reales a dos decimales.
 const precise=n=>Math.round(n*1e9)/1e9;
 for(const e of state.graph.edges)if(Number.isFinite(e.realLength))e.realLength=precise(e.realLength*factor);
 for(const c of Object.values(state.graph.cutValues||{}))if(Number.isFinite(c.length)){c.length=precise(c.length*factor);c.unit=next}
 for(const sp of state.graph.supports||[]){for(const k of ['bop','distanceFromRef'])if(Number.isFinite(sp[k]))sp[k]=precise(sp[k]*factor)}
 for(const e of state.graph.edges)if(Number.isFinite(e.insulationThickness))e.insulationThickness=precise(e.insulationThickness*factor);const keys=['realLength','radius','centerLeft','centerRight','centerBranch','totalLength','insulationThickness'];
 for(const c of Object.values(state.graph.componentProps||{}))for(const k of keys)if(Number.isFinite(c[k]))c[k]=precise(c[k]*factor);
 for(const c of state.graph.dimensionCatalog||[])for(const k of keys)if(Number.isFinite(c[k]))c[k]=precise(c[k]*factor);
 proj.lengthUnit=next;
 for(const sp of state.graph.supports||[])if(Number.isFinite(sp.distanceFromRef))updateSupportRatioFromLength(sp);
 save();render();if(!$('tablesPanel').hidden)renderTables();
}
function projectDefaults(){return {projectId:'',lineId:'',description:'',spec:'150',service:'',material:'ACERO AL CARBÓN',wall:'SCH 40',lengthUnit:'mm',coordinateUnit:'mm',diameterUnit:'in',defaultStatus:'new',defaultInstallation:'aerial'}}
function ensureProject(){if(!state.graph.project)state.graph.project=projectDefaults();if(!String(state.graph.project.spec||'').trim())state.graph.project.spec='150';state.graph.componentProps||={};state.graph.cutValues||={};state.graph.equipments||=[];state.graph.supports||=[];state.graph.nextSupport||=1;state.graph.dimensionCatalog||=[];state.graph.dimensionNextId||=1}
function edgeStatus(e){ensureProject();return e.status||state.graph.project.defaultStatus||'new'}
function edgeInstallation(e){ensureProject();return e.installation||state.graph.project.defaultInstallation||'aerial'}
function componentProps(token){ensureProject();return state.graph.componentProps[token]||{}}
function fitEffective(token,attr){const own=componentProps(token)[attr];if(own)return own;const node=Number(token.slice(1)),edges=(adjacency().get(node)||[]).map(l=>l.edge).filter(e=>!e.referencePort);if(edges.length&&attr==='status'&&edges.every(e=>edgeStatus(e)===edgeStatus(edges[0])))return edgeStatus(edges[0]);if(edges.length&&attr==='installation'&&edges.every(e=>edgeInstallation(e)===edgeInstallation(edges[0])))return edgeInstallation(edges[0]);return attr==='status'?state.graph.project.defaultStatus:state.graph.project.defaultInstallation}
function ensureEdgeMetadata(){
 ensureProject();
 for(const e of state.graph.edges){if(e.referencePort)continue;
  if(!e.status)e.status=state.graph.project.defaultStatus||'new';
  if(!e.installation)e.installation=state.graph.project.defaultInstallation||'aerial';
  if(!e.wall)e.wall=state.graph.project.wall||'SCH 40';
  if(!e.spec)e.spec=state.graph.project.spec||'150';
  if(!e.material)e.material=state.graph.project.material||'ACERO AL CARBÓN';
 }

 state.graph.fitServices||={};
 const used=new Set();
 for(const e of state.graph.edges)if(e.referencePort)e.tag='';
 for(const group of cuttingGroups()){
  group.forEach(e=>e.material=normalizeMaterial(e.material));
  const proposals=group.map(e=>String(e.tag||'').trim().toUpperCase());
  let tag=proposals.find(t=>/^[A-Z]{1,3}$/.test(t)&&!used.has(t));
  if(!tag){let i=0;while(used.has(seqLabel(i)))i++;tag=seqLabel(i)}
  used.add(tag);group.forEach(e=>e.tag=tag);
 }
}

const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,n)=>a.map(v=>v*n);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=a=>Math.hypot(...a),dist=(a,b)=>norm(sub(a,b));
const project=p=>({x:ISO.X[0]*p[0]+ISO.Y[0]*p[1],y:.5*p[0]+.5*p[1]-p[2]});
const basis=pl=>pl==='XY'?[[ISO.X[0],ISO.X[1]],[ISO.Y[0],ISO.Y[1]]]:[[ISO.X[0],ISO.X[1]],[0,-1]];
const to3=(uv,a,pl)=>pl==='XY'?[uv[0],uv[1],a[2]]:[uv[0],a[1],uv[1]];
const getUV=(p,pl)=>pl==='XY'?[p[0],p[1]]:[p[0],p[2]];
const addUV=(p,u,v,pl)=>pl==='XY'?[p[0]+u,p[1]+v,p[2]]:[p[0]+u,p[1],p[2]+v];
const anchor=()=>state.draft.at(-1)||state.graph.nodes[0]?.p||[0,0,0];
const angle=(a,b)=>{let d=norm(a)*norm(b);return d<1e-9?0:Math.acos(Math.max(-1,Math.min(1,dot(a,b)/d)))*180/Math.PI};
const vecLength=v=>Math.hypot(v.x,v.y);
function fromScreen(x,y){const r=canvas.getBoundingClientRect();return{x:(x-r.left-r.width/2-state.view.dx)/state.view.k,y:(y-r.top-r.height/2-state.view.dy)/state.view.k}}
function toScreen(p){const q=project(p),r=canvas.getBoundingClientRect();return{x:r.left+r.width/2+state.view.dx+q.x*state.view.k,y:r.top+r.height/2+state.view.dy+q.y*state.view.k}}
function solveUV(s,pl,a){const [b1,b2]=basis(pl),det=b1[0]*b2[1]-b1[1]*b2[0],c=project(a),x=s.x-c.x,y=s.y-c.y;return[(x*b2[1]-y*b2[0])/det,(b1[0]*y-b1[1]*x)/det]}
function snapFirst(s){const a=anchor(),v=solveUV(s,state.plane,a);return to3(v.map(x=>Math.round(x/CAT.grid)*CAT.grid),a,state.plane)}
const lastHeading=()=>state.draft.length>1?sub(state.draft.at(-1),state.draft.at(-2)):null;
function directions(){const prev=lastHeading();return DIRS.map(([u,v])=>({u,v,vec:state.plane==='XY'?[u,v,0]:[u,0,v]})).filter(d=>!prev||[0,45,90].some(x=>Math.abs(angle(prev,d.vec)-x)<.2))}
function proposedPoint(s,origin){const a=project(origin),dx=s.x-a.x,dy=s.y-a.y;let chosen=null;
 for(const d of directions()){const p=project(addUV(origin,d.u*CAT.grid,d.v*CAT.grid,state.plane)),vx=p.x-a.x,vy=p.y-a.y,mag=vx*vx+vy*vy;if(mag<1e-5)continue;
  const n=Math.max(1,Math.min(45,Math.round((dx*vx+dy*vy)/mag))),q=addUV(origin,d.u*CAT.grid*n,d.v*CAT.grid*n,state.plane),qp=project(q),error=(qp.x-s.x)**2+(qp.y-s.y)**2;
  if(!chosen||error<chosen.error)chosen={p:q,error};
 }return chosen?.p||null;
}
const getNode=id=>state.graph.nodes.find(n=>n.id===id);
const near3=(p,q)=>dist(p,q)<.15;
function addNode(p){const old=state.graph.nodes.find(n=>near3(n.p,p));if(old)return old.id;const id=state.graph.nextNode++;state.graph.nodes.push({id,p:[...p]});return id}
function segmentParam(p,a,b){const ab=sub(b,a),len2=dot(ab,ab);if(len2<.001)return null;const t=dot(sub(p,a),ab)/len2,q=add(a,mul(ab,t));return dist(p,q)<.6?{t,q}:null}
function splitAtPoint(p){const found=state.graph.nodes.find(n=>near3(n.p,p));if(found)return found.id;
 for(const e of [...state.graph.edges]){if(e.kind==='reducer')continue;const a=getNode(e.a).p,b=getNode(e.b).p,hit=segmentParam(p,a,b);if(!hit||hit.t<.02||hit.t>.98)continue;
  const id=addNode(hit.q);state.graph.edges=state.graph.edges.filter(it=>it.id!==e.id);
  const nextId=state.graph.nextEdge++;
  state.graph.edges.push({...e,b:id},{...e,id:nextId,a:id});
  // Conservar el punto físico relativo del soporte al dividir el tubo.
  for(const sp of state.graph.supports||[]){if(sp.hostType!=='edge'||sp.hostId!==e.id)continue;
    const ratio=sp.ratio??.5;
    if(ratio<=hit.t)sp.ratio=Math.max(0,Math.min(1,ratio/Math.max(hit.t,.001)));
    else{sp.hostId=nextId;sp.ratio=Math.max(0,Math.min(1,(ratio-hit.t)/Math.max(1-hit.t,.001)));}
  }
  return id;
 }return addNode(p);
}
function inheritedDiameter(nodeId){const rs=state.graph.edges.filter(e=>e.kind==='reducer'&&e.b===nodeId);if(rs.length)return rs[0].to;const e=state.graph.edges.find(e=>e.kind!=='reducer'&&(e.a===nodeId||e.b===nodeId));return e?.diam||2}
function edgeExists(a,b){return state.graph.edges.some(e=>e.a===a&&e.b===b||e.a===b&&e.b===a)}

/* 02A. ESPACIO GRÁFICO: desplazamiento de componentes conservando la topología.
   La operación se aplica solo al insertar una bifurcación nueva; no altera DN, espesor ni flujo.
   La escala es esquemática, NO longitud de fabricación. */
const MIN_LABEL_LENGTH=146;
function pipeLabelText(edge){
  if(edge.referencePort)return '';
  const dn=dnFmt(edge.diam),wall=String(edge.wall||'SCH 40').replace(/^SCH\s*/i,'').trim();
  const measure=Number.isFinite(edge.realLength)&&edge.realLength>0?`-${lengthString(edge.realLength)}`:'';
  return `${dn}″-${wall}-${edge.tag||'A'}${measure}`;
}
function requiredPipeSpan(edge){
  const width=pipeLabelText(edge).length*7.65+23;
  // Reserva de texto y dos juntas: incluye el diámetro visual del propio tubo.
  return Math.max(MIN_LABEL_LENGTH,width+51,tubeWidth(edge.diam)*7.7);
}
function reachableBeyondEdge(fromId,blockedEdgeId){
  const seen=new Set([fromId]),queue=[fromId],adj=adjacency();
  while(queue.length){const id=queue.shift();for(const link of adj.get(id)||[]){
    if(link.edge.id===blockedEdgeId||seen.has(link.other))continue;
    seen.add(link.other);queue.push(link.other);
  }}return seen;
}
function extendPipeAwayFromTee(edge,teeId,minimum){
  if(edge.kind==='reducer')return false;
  const farId=edge.a===teeId?edge.b:edge.a;
  if(farId!==edge.a&&farId!==edge.b)return false;
  const origin=getNode(teeId)?.p,far=getNode(farId)?.p;
  if(!origin||!far)return false;
  const oldSpan=projectedDistance(origin,far),needed=minimum-oldSpan;
  if(needed<=.1)return false;
  const comp=reachableBeyondEdge(farId,edge.id);
  // Ciclos sin extremo libre no deben separarse ni deformarse.
  if(comp.has(teeId))return false;
  const v=sub(far,origin),len=norm(v);
  if(len<.1)return false;
  const vector=mul(v,(needed+8)/Math.max(oldSpan,.01));
  for(const id of comp){const node=getNode(id);if(node)node.p=add(node.p,vector)}
  return true;
}
function autoSpaceNewTees(beforeIds){
  const after=classify(),news=after.fittings.filter(f=>f.kind==='tee'&&!beforeIds.has(f.node));
  if(!news.length)return 0;
  let changes=0;
  // Crecer hacia fuera de la T, conservando ángulos y accesorios existentes.
  for(const fit of news){
    const ports=adjacency().get(fit.node)||[];
    for(const link of ports){
      if(link.edge.kind==='reducer')continue;
      if(extendPipeAwayFromTee(link.edge,fit.node,requiredPipeSpan(link.edge)))changes++;
    }
  }
  return changes;
}

function addDraftToGraph(){if(state.draft.length<2)return false;const old=JSON.stringify(state.graph);
 const teesBefore=new Set(classify().fittings.filter(f=>f.kind==='tee').map(f=>f.node));
 let ids=state.draft.map(p=>splitAtPoint(p));
 for(let i=0;i<ids.length-1;i++){if(ids[i]!==ids[i+1]&&!edgeExists(ids[i],ids[i+1])){const parent=state.graph.edges.find(e=>e.kind!=='reducer'&&(e.a===ids[i]||e.b===ids[i]))||{};state.graph.edges.push({id:state.graph.nextEdge++,a:ids[i],b:ids[i+1],diam:inheritedDiameter(ids[i]),wall:parent.wall||state.graph.project?.wall||'SCH 40',material:parent.material||state.graph.project?.material||'ACERO AL CARBÓN',kind:'pipe',service:parent.service||null,serviceColor:parent.serviceColor||null,status:parent.status||state.graph.project?.defaultStatus||'new',installation:parent.installation||state.graph.project?.defaultInstallation||'aerial'})}}
 state.draft=[];state.cursor=null;ensureEdgeMetadata();
 const shifts=autoSpaceNewTees(teesBefore);
 if(shifts)message(`${shifts} tramo(s) ajustado(s) para dejar espacio a las etiquetas.`);
 const changed=JSON.stringify(state.graph)!==old;if(changed)save();return changed;
}
function adjacency(){const map=new Map(state.graph.nodes.map(n=>[n.id,[]]));for(const e of state.graph.edges){map.get(e.a)?.push({edge:e,other:e.b});map.get(e.b)?.push({edge:e,other:e.a})}return map}
function teeInfo(n,links){if(links.length!==3||links.some(l=>l.edge.kind==='reducer'))return null;const vecs=links.map(l=>sub(getNode(l.other).p,n.p));let best={score:-Infinity,a:0,b:1};
 for(let i=0;i<3;i++)for(let j=i+1;j<3;j++){const score=-dot(vecs[i],vecs[j])/(norm(vecs[i])*norm(vecs[j]));if(score>best.score)best={score,a:i,b:j}}
 if(best.score<.92)return null;const branch=[0,1,2].find(i=>i!==best.a&&i!==best.b);const run=links[best.a].edge.diam,branchDn=links[branch].edge.diam;
 return{run,branchDn,runEdges:[links[best.a].edge.id,links[best.b].edge.id],branchEdge:links[branch].edge.id,branchNode:links[branch].other};
}

function fittingPlane(kind,node,links,angleNom=0){
 const vecs=links.map(l=>sub(getNode(l.other).p,node.p));
 const hasZ=vecs.some(v=>Math.abs(v[2])>0.01), allZ0=vecs.every(v=>Math.abs(v[2])<0.01);
 const allY0=vecs.every(v=>Math.abs(v[1])<0.01);
 // ROLL corresponde a una transición espacial, no a cualquier codo de 45°.
 const mixed=!allZ0&&!allY0;
 if(mixed)return {label:angleNom===45?'ROLL 45°':'ROLL',type:'roll'};
 return allZ0?{label:'HORIZONTAL',type:'horizontal'}:{label:'VERTICAL',type:'vertical'};
}
function classify(){const adj=adjacency(),fittings=[],curves=new Set(state.graph.curves||[]);for(const n of state.graph.nodes){const links=adj.get(n.id)||[];if(links.length===3){const t=teeInfo(n,links),plane=fittingPlane('tee',n,links);fittings.push({id:'N'+n.id,node:n.id,kind:t?'tee':'junction',detail:t,label:t?`TEE ${dnFmt(t.run)}x${dnFmt(t.branchDn)}`:'Unión',plane})}
 else if(links.length===2&&links.every(l=>l.edge.kind!=='reducer')){const v1=sub(getNode(links[0].other).p,n.p),v2=sub(getNode(links[1].other).p,n.p),turn=180-angle(v1,v2);
 if(turn>1){let nominal=Math.abs(turn-45)<12?45:Math.abs(turn-90)<12?90:Math.round(turn);const bend=curves.has(n.id);fittings.push({id:'N'+n.id,node:n.id,kind:bend?'bend':'elbow',angle:nominal,label:bend?'':`${nominal}°`,plane:fittingPlane('elbow',n,links,nominal)})}}
 else if(links.length>3)fittings.push({id:'N'+n.id,node:n.id,kind:'junction',label:`${links.length} vías`,plane:{type:'junction'}});
 }return{adj,fittings};
}
function dnFmt(d){const n=Number(d);const known=[[.25,'1/4'],[.375,'3/8'],[.5,'1/2'],[.75,'3/4'],[1.25,'1 1/4'],[1.5,'1 1/2'],[2.5,'2 1/2']].find(x=>Math.abs(x[0]-n)<.0001);return known?known[1]:Number.isInteger(n)?String(n):String(+n.toFixed(3))}
function parseDN(s){s=String(s).replace(/,/g,'.').trim();const parts=s.split(/\s+/);if(parts.length===2&&parts[1].includes('/')){const frac=parseDN(parts[1]);const lead=Number(parts[0]);return Number.isFinite(lead)&&frac!=null?lead+frac:null}if(s.includes('/')){const [a,b]=s.split('/').map(Number);return Number.isFinite(a)&&Number.isFinite(b)&&b>0?a/b:null}let n=Number(s);return Number.isFinite(n)&&n>0&&n<=100?n:null}
function groupThroughEdges(seedId){const adj=adjacency(),visited=new Set(),stack=[seedId];while(stack.length){const id=stack.pop();if(visited.has(id))continue;const e=state.graph.edges.find(x=>x.id===id);if(!e||e.kind==='reducer')continue;visited.add(id);
 for(const nId of [e.a,e.b]){const links=adj.get(nId)||[];let valid=[];
  if(links.length===2&&links.every(l=>l.edge.kind!=='reducer'))valid=links.map(l=>l.edge.id);
  if(links.length===3){const t=teeInfo(getNode(nId),links);if(t&&t.runEdges.includes(id))valid=t.runEdges}
  for(const other of valid)if(!visited.has(other))stack.push(other);
 }}return visited;
}
/* Excentricidad: desplazar en XYZ el subensamble conectado al puerto B.
   La boca queda donde inicia el tubo siguiente, no solo desplazada en la imagen.
   Valor gráfico esquemático; no reemplaza las dimensiones reales del accesorio. */
function eccNormal3(axis,view){
 let n=view==='vertical'?[axis[2],0,-axis[0]]:[-axis[1],axis[0],0];
 if(norm(n)<1e-6)n=view==='vertical'?[1,0,0]:[0,1,0];
 n=mul(n,1/norm(n));
 const q=project(n);if(q.y<0)n=mul(n,-1);
 return n;
}
function reducerRadius(d,maxDn,maxWidth){
 let r=Math.max(2,maxWidth*(.16+.84*Math.min(1,Number(d)/maxDn)));
 if(Number(d)<maxDn-.00001)r*=.5;
 return r;
}
function componentBeyondReducer(red){
 const adj=adjacency(),visited=new Set(),stack=[red.b];
 while(stack.length){const id=stack.pop();if(visited.has(id))continue;visited.add(id);
  for(const link of adj.get(id)||[]){if(link.edge.id!==red.id)stack.push(link.other)}
 }
 if(visited.has(red.a))return null;
 return visited;
}
function adjustEccentricAxes(){
 for(const red of state.graph.edges.filter(x=>x.kind==='reducer')){
  const a=getNode(red.a),b=getNode(red.b);if(!a||!b)continue;
  const old=Array.isArray(red.axisOffsetXYZ)?red.axisOffsetXYZ:[0,0,0];
  let wanted=[0,0,0];
  if(red.reducerType==='eccentric'){
   const straight=sub(sub(b.p,a.p),old),baseLength=norm(straight);
   if(baseLength<1)continue;
   const n=eccNormal3(straight,red.viewOrientation||'horizontal');
   const maxDN=Math.max(Number(red.from)||2,Number(red.to)||2),width=11*accessoryScale(maxDN);
   const l=reducerRadius(red.from||2,maxDN,width),r=reducerRadius(red.to||2,maxDN,width);
   const proj=project(n),scale=Math.max(.2,Math.hypot(proj.x,proj.y));
   const amount=(red.flatSide==='bottom'?l-r:r-l)/scale;
   wanted=mul(n,amount);
  }
  const delta=sub(wanted,old);
  if(norm(delta)<.0001){red.axisOffsetXYZ=wanted;continue;}
  const nodes=componentBeyondReducer(red);
  if(!nodes)continue; // En una malla cerrada no se mueve un lado arbitrariamente.
  for(const id of nodes){const node=getNode(id);if(node)node.p=add(node.p,delta)}
  red.axisOffsetXYZ=wanted;
 }
}
/* Con el extremo B ya desplazado, construir el cono sobre ambos centros reales. */
function eccentricConnectedProfile(a,b,red,maxWidth){
 const old=red.axisOffsetXYZ||[0,0,0],p=project(old),ax={x:b.x-a.x-p.x,y:b.y-a.y-p.y};
 const mag=Math.hypot(ax.x,ax.y)||1;
 let n={x:-ax.y/mag,y:ax.x/mag};
 if(Math.hypot(p.x,p.y)>.001){n={x:p.x/Math.hypot(p.x,p.y),y:p.y/Math.hypot(p.x,p.y)};if(n.y<0){n.x=-n.x;n.y=-n.y}}
 else if(n.y<0){n.x=-n.x;n.y=-n.y}
 const big=Math.max(Number(red.from)||2,Number(red.to)||2),
       l=reducerRadius(red.from||2,big,maxWidth),r=reducerRadius(red.to||2,big,maxWidth);
 return {
  upperLeft:{x:a.x-n.x*l,y:a.y-n.y*l},lowerLeft:{x:a.x+n.x*l,y:a.y+n.y*l},
  upperRight:{x:b.x-n.x*r,y:b.y-n.y*r},lowerRight:{x:b.x+n.x*r,y:b.y+n.y*r},
  shifted:b,axisOffset:Math.hypot(p.x,p.y)
 };
}
function syncReducers(){
 // Los dos extremos representan propiedades físicas de las tuberías contiguas.
 for(const r of state.graph.edges.filter(e=>e.kind==='reducer')){
  const left=state.graph.edges.find(e=>e.kind!=='reducer'&&(e.a===r.a||e.b===r.a));
  const right=state.graph.edges.find(e=>e.kind!=='reducer'&&(e.a===r.b||e.b===r.b));
  if(left)r.from=left.diam;
  if(right)r.to=right.diam;
  r.diam=r.to;
 }
 adjustEccentricAxes();
}
function setDiameterForPipes(ids,value){const groups=new Set();for(const id of ids)for(const g of groupThroughEdges(id))groups.add(g);for(const edge of state.graph.edges)if(groups.has(edge.id))edge.diam=value;syncReducers();return groups.size}
/* 02B. CAMBIOS DE DIÁMETRO FÍSICOS. Una T estándar mantiene DN en ambos extremos del paso.
   Si solo cambia una salida del paso, crear reducción aparte, conservando continuidad. */
function teePortKind(nodeId, edgeId){
 const n=getNode(nodeId),links=adjacency().get(nodeId)||[],t=n&&teeInfo(n,links);
 if(!t)return null;
 return {tee:t,kind:t.branchEdge===edgeId?'branch':t.runEdges.includes(edgeId)?'run':null};
}
function branchLimitedDiameter(nodeId){
 const links=adjacency().get(nodeId)||[],n=getNode(nodeId),t=n&&teeInfo(n,links);
 return t?.run ?? null;
}
function flowModeOf(e){return e.flowMode||(e.flowReversed?'reverse':'forward')}
function invertedFlowMode(mode){return mode==='forward'?'reverse':mode==='reverse'?'forward':mode}
function keepFlowOrientation(edge,originalMode,forwardAligned=true){
 const mode=forwardAligned?originalMode:invertedFlowMode(originalMode);
 edge.flowMode=mode;edge.flowReversed=mode==='reverse';
}
/* Propaga el mismo sentido físico de flujo a través de codos y reductores.
   Nunca cruza una bifurcación (grado 3 o más). No modifica geometría. */
function harmonizeFlowFromEdge(seedId){
 const seed=state.graph.edges.find(e=>e.id===seedId);if(!seed)return;
 const mode=flowModeOf(seed),ids=expandFlow(seedId),byId=new Map(state.graph.edges.map(e=>[e.id,e]));
 if(mode==='none'||mode==='both'){
  for(const id of ids){const e=byId.get(id);if(e)keepFlowOrientation(e,mode)}return;
 }
 const adj=adjacency(),visited=new Set([seedId]);
 const walk=(node,preceding,entering)=>{
  for(let safety=0;safety<200;safety++){
   const links=adj.get(node)||[];if(links.length!==2)return;
   const next=links.find(l=>l.edge.id!==preceding&&ids.has(l.edge.id));
   if(!next||visited.has(next.edge.id))return;
   const e=next.edge;visited.add(e.id);
   const from=entering?node:next.other,to=entering?next.other:node;
   keepFlowOrientation(e,e.a===from&&e.b===to?'forward':'reverse');
   preceding=e.id;node=next.other;
  }
 };
 // Con flujo directo seed.a -> seed.b, el lado A fluye hacia A y el lado B sale de B.
 const towardB=mode==='forward';
 walk(seed.a,seed.id,!towardB);
 walk(seed.b,seed.id,towardB);
}
function insertReducerNextToTee(edgeId,teeNodeId,oldDn,newDn){
 const edge=state.graph.edges.find(e=>e.id===edgeId);
 if(!edge||edge.kind==='reducer'||edge.a!==teeNodeId&&edge.b!==teeNodeId)return false;
 const otherId=edge.a===teeNodeId?edge.b:edge.a,teeP=getNode(teeNodeId)?.p,farP=getNode(otherId)?.p;
 if(!teeP||!farP)return false;
 const d=sub(farP,teeP),length=norm(d);if(length<26)return false;
 // Two spaced connections. The stub conserves the tee's port diameter.
 const t1=Math.min(.19,8/length+.03),t2=Math.min(.37,t1+Math.max(12/length,.13));
 if(t2>=.48)return false;
 const x=addNode(add(teeP,mul(d,t1))),y=addNode(add(teeP,mul(d,t2)));
 const originalForward=edge.a===teeNodeId,priorMode=flowModeOf(edge);
 // Preserve existing pipe tag/id in the long leg away from the tee.
 if(originalForward)edge.a=y;else edge.b=y;
 edge.diam=newDn;
 const stub={id:state.graph.nextEdge++,a:teeNodeId,b:x,diam:oldDn,wall:edge.wall||'SCH 40',material:edge.material,kind:'pipe',service:edge.service,serviceColor:edge.serviceColor};
 const reducer={id:state.graph.nextEdge++,a:x,b:y,from:oldDn,to:newDn,diam:newDn,kind:'reducer',material:edge.material,service:edge.service,serviceColor:edge.serviceColor};
 keepFlowOrientation(stub,priorMode,originalForward);keepFlowOrientation(reducer,priorMode,originalForward);
 state.graph.edges.push(stub,reducer);
 return true;
}
function changeDiameterKeepingTees(seedIds,desired){
 // Only follow degree-two elbows and straight connections. Never silently cross a T.
 const selected=new Set();for(const id of seedIds)for(const eId of groupBetweenJunctions(id))selected.add(eId);
 if(!selected.size)return {count:0,transitions:0};
 const adj=adjacency(),pending=[];
 for(const id of selected){const e=state.graph.edges.find(e=>e.id===id);if(!e||e.kind==='reducer')continue;
  for(const nId of [e.a,e.b]){
   const port=teePortKind(nId,e.id);
   if(!port||!port.kind)continue;
   const original=port.kind==='branch'?port.tee.branchDn:port.tee.run;
   // A standard reducing-branch T may use a smaller outlet, but not a larger outlet.
   if(port.kind==='branch'&&desired<=port.tee.run)continue;
   if(Math.abs(desired-original)<1e-5)continue;
   pending.push({edgeId:e.id,nodeId:nId,from:original});
  }
 }
 // Save all steps as one transaction, including at the two extremities of one continuous path.
 const backup=JSON.parse(JSON.stringify(state.graph));
 for(const id of selected){const e=state.graph.edges.find(x=>x.id===id);if(e&&e.kind!=='reducer')e.diam=desired}
 for(const op of pending){if(!insertReducerNextToTee(op.edgeId,op.nodeId,op.from,desired)){
   state.graph=backup;return {count:0,transitions:0,error:'Tramo demasiado corto para insertar la reducción junto a la T.'};
 }}
 syncReducers();ensureEdgeMetadata();
 return {count:selected.size,transitions:pending.length};
}
function groupBetweenJunctions(seed){
 const adj=adjacency(),visited=new Set(),stack=[seed];
 while(stack.length){const id=stack.pop();if(visited.has(id))continue;
  const e=state.graph.edges.find(x=>x.id===id);if(!e||e.kind==='reducer')continue;
  visited.add(id);
  for(const n of [e.a,e.b]){const links=adj.get(n)||[];if(links.length!==2||links.some(l=>l.edge.kind==='reducer'))continue;
   for(const link of links)if(!visited.has(link.edge.id))stack.push(link.edge.id);
  }
 }return visited;
}
function insertReducerInPipe(edgeId,position,direction,nextDiameter){
 const e=state.graph.edges.find(x=>x.id===edgeId);if(!e||e.kind==='reducer')return {error:'Seleccione un tubo.'};
 const dn=Number(nextDiameter),start=getNode(e.a)?.p,end=getNode(e.b)?.p;
 if(!start||!end||!Number.isFinite(dn)||dn<=0||Math.abs(dn-e.diam)<1e-6)return {error:'Indique un diámetro diferente.'};
 const d=sub(end,start),length=norm(d),pos=Math.max(.25,Math.min(.75,Number(position)));
 if(length<35)return {error:'El tubo es demasiado corto para insertar la reducción.'};
 const half=Math.min(13,length*.12),u=Math.max(.08,pos-half/length),v=Math.min(.92,pos+half/length);
 if(v-u<.07)return {error:'No hay espacio para la reducción.'};
 const backup=JSON.parse(JSON.stringify(state.graph)),aId=e.a,bId=e.b,origDn=e.diam,oldMode=e.flowMode||'forward';
 const p1=addNode(add(start,mul(d,u))),p2=addNode(add(start,mul(d,v)));
 let affected;
 if(direction==='ab'){
  e.b=p1; const r={id:state.graph.nextEdge++,a:p1,b:p2,kind:'reducer',from:origDn,to:dn,diam:dn,material:e.material,service:e.service,serviceColor:e.serviceColor,flowMode:oldMode};
  const next={id:state.graph.nextEdge++,a:p2,b:bId,kind:'pipe',diam:origDn,wall:e.wall,material:e.material,service:e.service,serviceColor:e.serviceColor,flowMode:oldMode};
  state.graph.edges.push(r,next); affected=next.id;
 }else{
  e.a=p2; const r={id:state.graph.nextEdge++,a:p2,b:p1,kind:'reducer',from:origDn,to:dn,diam:dn,material:e.material,service:e.service,serviceColor:e.serviceColor,flowMode:oldMode};
  const next={id:state.graph.nextEdge++,a:p1,b:aId,kind:'pipe',diam:origDn,wall:e.wall,material:e.material,service:e.service,serviceColor:e.serviceColor,flowMode:oldMode};
  state.graph.edges.push(r,next); affected=next.id;
 }
 const result=changeDiameterKeepingTees([affected],dn);
 if(result.error){state.graph=backup;return result}
 syncReducers();ensureEdgeMetadata();return {success:true,count:result.count,transitions:result.transitions};
}


/* v0.25. UNA reducción = UN componente. Los cambios de DN no añaden
   reductores auxiliares a espaldas del usuario. Se comprueba cada puerto
   de una T y de cualquier reducción ya instalada antes de modificar el grafo. */
function reducerBoundary(edgeId, endId){
 const adj=adjacency(), visited=new Set(), edgeById=id=>state.graph.edges.find(e=>e.id===id);
 let previous=edgeId, current=endId, lastPipe=edgeById(edgeId);
 for(let guard=0;guard<state.graph.edges.length+2;guard++){
  if(visited.has(current))return {kind:'loop',diam:Number(lastPipe?.diam)};
  visited.add(current);
  const links=adj.get(current)||[];
  if(links.length===1)return {kind:'free',diam:Number(lastPipe?.diam)};
  if(links.length>=3)return {kind:'tee',diam:Number(lastPipe?.diam),nodeId:current};
  const next=links.find(l=>l.edge.id!==previous);
  if(!next)return {kind:'free',diam:Number(lastPipe?.diam)};
  if(next.edge.kind==='reducer')return {kind:'reducer',diam:Number(lastPipe?.diam),nodeId:current,reducerId:next.edge.id};
  previous=next.edge.id;current=next.other;lastPipe=next.edge;
 }
 return {kind:'loop',diam:Number(lastPipe?.diam)};
}
function reducerSidePortLimits(edgeId){
 const e=state.graph.edges.find(e=>e.id===edgeId&&e.kind!=='reducer');
 if(!e)return null;
 return {a:reducerBoundary(e.id,e.a),b:reducerBoundary(e.id,e.b)};
}
function protectedDiameterError(seedId,desired){
 const ids=groupBetweenJunctions(seedId),adj=adjacency();
 for(const id of ids){
  const e=state.graph.edges.find(x=>x.id===id);
  if(!e||e.kind==='reducer')continue;
  for(const nodeId of [e.a,e.b]){
   const links=adj.get(nodeId)||[];
   if(links.length>=3&&!links.some(l=>l.edge.kind==='reducer') && Math.abs(Number(e.diam)-desired)>.00001){
    return `La T mantiene su boca de ${dnFmt(e.diam)}″. Invierta la reducción o elija un tramo libre; no se insertará otra reducción automáticamente.`;
   }
   const reducerLinks=links.filter(l=>l.edge.kind==='reducer');
   if(reducerLinks.some(l=>Math.abs(Number(l.edge.a===nodeId?l.edge.from:l.edge.to)-desired)>.00001)){
    return `La boca de una reducción existente no corresponde a ${dnFmt(desired)}″. Seleccione esa cara para continuar; no se cambiará sin confirmación.`;
   }
  }
 }
 return null;
}
function assignDiameterWithoutExtraReducer(seedId,desired){
 const err=protectedDiameterError(seedId,desired);if(err)return {error:err};
 const ids=groupBetweenJunctions(seedId);
 if(!ids.size)return {error:'No se encontró una tubería conectada.'};
 for(const id of ids){const e=state.graph.edges.find(x=>x.id===id);if(e)e.diam=desired}
 return {count:ids.size};
}
function reducerPlacementClearance(edge,t){
 const a=getNode(edge.a)?.p,b=getNode(edge.b)?.p;
 if(!a||!b)return {error:'No se encontraron los puntos del tubo.'};
 const length=projectedDistance(a,b),ports=reducerSidePortLimits(edge.id);
 if(!ports||length<55)return {error:'El tubo no tiene longitud suficiente para la reducción.'};
 // El despeje gráfico a la T protege sus tres bocas y las etiquetas próximas.
 const minA=ports.a.kind==='tee'?52:ports.a.kind==='reducer'?31:18;
 const minB=ports.b.kind==='tee'?52:ports.b.kind==='reducer'?31:18;
 const cone=20;
 if(length<minA+minB+cone)return {error:'No hay separación suficiente entre la T y la reducción. Mueva o estire el tramo antes de insertar.'};
 return {t:Math.max((minA+cone/2)/length,Math.min(1-(minB+cone/2)/length,Number(t))),ports};
}
function suggestReducerOrientation(edge){
 const bounds=reducerSidePortLimits(edge.id);if(!bounds)return null;
 // Orientación por defecto: la cara de la T/otro reductor conserva su DN.
 if(['tee','reducer'].includes(bounds.b.kind)&&!['tee','reducer'].includes(bounds.a.kind))return 'right';
 return 'left';
}

/* 02C · Reducir con dos diámetros escogidos. Ambos tubos y el reductor
   comparten orientación de nodos, preservando el sentido de flujo. */
function insertConfiguredReducerInPipe(edgeId,t,leftDN,rightDN){
 const e=state.graph.edges.find(x=>x.id===edgeId&&x.kind!=='reducer');
 if(!e)return {error:'Seleccione una tubería.'};
 if(!Number.isFinite(leftDN)||!Number.isFinite(rightDN)||Math.abs(leftDN-rightDN)<.00001)return {error:'Seleccione diámetros diferentes.'};
 const start=getNode(e.a)?.p,end=getNode(e.b)?.p;if(!start||!end)return {error:'No se encontraron extremos válidos.'};
 const ports=reducerSidePortLimits(e.id);
 for(const [side,dn] of [['a',leftDN],['b',rightDN]]){
  const port=ports?.[side];
  if(port&&['tee','reducer'].includes(port.kind)&&Math.abs(dn-port.diam)>.00001){
   return {error:`La boca ${side==='a'?'inicial':'final'} está conectada a ${port.kind==='tee'?'una T':'una reducción'} de ${dnFmt(port.diam)}″. Invierta la orientación; no se creará otra reducción.`};
  }
 }
 const clearance=reducerPlacementClearance(e,t);if(clearance.error)return {error:clearance.error};
 const backup=modelCopy(),line=sub(end,start),length=norm(line),mid=clearance.t;
 const half=Math.min(11,length*.09),u=Math.max(.07,mid-half/length),v=Math.min(.93,mid+half/length);
 if((v-u)*length<7)return {error:'Espacio insuficiente para el símbolo de reducción.'};
 const originalB=e.b,originalMode=flowModeOf(e);
 const p1=addNode(add(start,mul(line,u))),p2=addNode(add(start,mul(line,v)));
 e.b=p1;
 const reducer={id:state.graph.nextEdge++,a:p1,b:p2,kind:'reducer',diam:rightDN,from:leftDN,to:rightDN,
  material:e.material,service:e.service,serviceColor:e.serviceColor};
 const right={...e,id:state.graph.nextEdge++,a:p2,b:originalB,diam:rightDN,tag:''};
 state.graph.edges.push(reducer,right);
 keepFlowOrientation(e,originalMode);keepFlowOrientation(reducer,originalMode);keepFlowOrientation(right,originalMode);
 const leftChange=assignDiameterWithoutExtraReducer(e.id,leftDN);
 if(leftChange.error){state.graph=backup;return leftChange}
 const rightChange=assignDiameterWithoutExtraReducer(right.id,rightDN);
 if(rightChange.error){state.graph=backup;return rightChange}
 syncReducers();harmonizeFlowFromEdge(e.id);
 if(!connectedGraph()||state.graph.edges.filter(x=>x.kind==='reducer').length!==backup.edges.filter(x=>x.kind==='reducer').length+1){
  state.graph=backup;return {error:'La operación requiere más de una transición o rompería el ensamble. No se insertó nada.'};
 }
 cleanGraph();ensureEdgeMetadata();
 return {success:true,reducerId:reducer.id,left:leftDN,right:rightDN};
}
function insertConfiguredReducerOnTip(edgeId,tip,leftDN,rightDN){
 const e=state.graph.edges.find(x=>x.id===edgeId&&x.kind!=='reducer');if(!e)return {error:'No se encontró la tubería.'};
 const adj=adjacency(),free=tip==='a'?e.a:e.b;
 if((adj.get(free)||[]).length!==1)return {error:'Ese extremo está ocupado.'};
 const dnTouch=tip==='a'?rightDN:leftDN;
 if(Math.abs(Number(e.diam)-dnTouch)>.00001)return {error:`La boca conectada debe conservar ${dnFmt(e.diam)}″. Invierta los diámetros.`};
 const backup=modelCopy(),a=getNode(e.a).p,b=getNode(e.b).p,d=sub(b,a),len=norm(d);
 if(len<1)return {error:'Longitud insuficiente.'};
 const step=CAT.grid*.67,outside=tip==='a'?add(a,mul(d,-step/len)):add(b,mul(d,step/len));
 const id=addNode(outside),priorMode=flowModeOf(e);
 const r=tip==='a'?{id:state.graph.nextEdge++,a:id,b:e.a,kind:'reducer',from:leftDN,to:rightDN,diam:rightDN,material:e.material,service:e.service,serviceColor:e.serviceColor}:{id:state.graph.nextEdge++,a:e.b,b:id,kind:'reducer',from:leftDN,to:rightDN,diam:rightDN,material:e.material,service:e.service,serviceColor:e.serviceColor};
 state.graph.edges.push(r);keepFlowOrientation(r,priorMode);syncReducers();harmonizeFlowFromEdge(e.id);
 if(!connectedGraph()||state.graph.edges.filter(x=>x.kind==='reducer').length!==backup.edges.filter(x=>x.kind==='reducer').length+1){
  state.graph=backup;return {error:'La reducción no conserva la continuidad.'};
 }
 cleanGraph();ensureEdgeMetadata();return {success:true,reducerId:r.id,left:leftDN,right:rightDN};
}
function findGraphSnap(s){const radiusNode=18/state.view.k,radiusPipe=14/state.view.k;let node=null,nD=radiusNode;
 for(const n of state.graph.nodes){const p=project(n.p),d=Math.hypot(p.x-s.x,p.y-s.y);if(d<nD){node=n;nD=d}}
 if(node)return node.p;
 let best=null,dBest=radiusPipe;
 for(const e of state.graph.edges){if(e.kind==='reducer')continue;const a=getNode(e.a).p,b=getNode(e.b).p,pa=project(a),pb=project(b),dx=pb.x-pa.x,dy=pb.y-pa.y,m=dx*dx+dy*dy;if(m<1e-6)continue;
  const t=Math.max(0,Math.min(1,((s.x-pa.x)*dx+(s.y-pa.y)*dy)/m));if(t<=.03||t>=.97)continue;const q={x:pa.x+dx*t,y:pa.y+dy*t},d=Math.hypot(q.x-s.x,q.y-s.y);if(d<dBest){dBest=d;best=add(a,mul(sub(b,a),t))}}
 return best;
}
function selectHit(x,y){
 const s=fromScreen(x,y),info=classify();
 let nearestSupport=null,minSupport=17/state.view.k;
 for(const sp of state.graph.supports||[]){const token='S'+sp.id,p=supportDrawingPoint(sp)?.base;if(!p||!isolationVisible(token))continue;
  const d=Math.hypot(s.x-p.x,s.y-p.y);if(d<minSupport){nearestSupport=token;minSupport=d}}
 if(nearestSupport)return nearestSupport;
 if(state.filterMode==='weld'){
  let best=null,nearest=18/state.view.k;
  for(const w of weldRecords()){if(!isolationVisible(w.id))continue;const d=Math.hypot(w.p.x-s.x,w.p.y-s.y);if(d<nearest){nearest=d;best=w.id}}
  return best;
 }
 let best=null,dBest=17/state.view.k;
 for(const fit of info.fittings.filter(f=>f.kind!=='bend'&&isolationVisible(f.id))){const p=project(getNode(fit.node).p),d=Math.hypot(p.x-s.x,p.y-s.y);if(d<dBest){best=fit.id;dBest=d}}
 if(best)return best;dBest=15/state.view.k;
 for(const e of state.graph.edges){if(!isolationVisible(edgeSelectionToken(e)))continue;const a=project(getNode(e.a).p),b=project(getNode(e.b).p),vx=b.x-a.x,vy=b.y-a.y,m=vx*vx+vy*vy;if(m<1e-6)continue;const t=Math.max(0,Math.min(1,((s.x-a.x)*vx+(s.y-a.y)*vy)/m)),q={x:a.x+vx*t,y:a.y+vy*t},d=Math.hypot(q.x-s.x,q.y-s.y);if(d<dBest){dBest=d;best=(e.kind==='reducer'?'R':'E')+e.id}}
 return best;
}
function selectedObjects(){const info=classify();return{edges:[...state.selection].filter(x=>x[0]==='E').map(x=>state.graph.edges.find(e=>e.id===Number(x.slice(1)))).filter(e=>e&&e.kind!=='reducer'),welds:weldRecords().filter(w=>state.selection.has(w.id)),reducers:[...state.selection].filter(x=>x[0]==='R').map(x=>state.graph.edges.find(e=>e.id===Number(x.slice(1)))).filter(Boolean),fits:info.fittings.filter(x=>state.selection.has(x.id)),info}}

/* 03. ETIQUETAS EN EL EJE ISOMÉTRICO: cajas orientadas y despeje automático. */
function rec(cx,cy,w,h,angle=0){return{cx,cy,w,h,angle}}
function satOverlap(A,B,pad=4){const axes=[];for(const o of [A,B]){const t=o.angle*Math.PI/180;axes.push([Math.cos(t),Math.sin(t)],[-Math.sin(t),Math.cos(t)])}
 for(const axis of axes){const extent=o=>{const t=o.angle*Math.PI/180,u=[Math.cos(t),Math.sin(t)],v=[-Math.sin(t),Math.cos(t)];return Math.abs(dot2(axis,u))*o.w/2+Math.abs(dot2(axis,v))*o.h/2};const delta=Math.abs((A.cx-B.cx)*axis[0]+(A.cy-B.cy)*axis[1]);if(delta>extent(A)+extent(B)+pad)return false}return true}
const dot2=(a,b)=>a[0]*b[0]+a[1]*b[1];
function angle2(a,b){let t=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;return t>90?t-180:t< -90?t+180:t}
/* Detecta si una línea ocupa cualquier punto del rectángulo girado de la etiqueta.
   Evita cruces que el criterio antiguo, basado solo en la distancia al centro, omitía. */
function segmentHitsLabel(a,b,box,pad=7){
 const rad=(box.angle||0)*Math.PI/180,c=Math.cos(rad),sn=Math.sin(rad);
 const local=p=>{const x=p.x-box.cx,y=p.y-box.cy;return{x:x*c+y*sn,y:-x*sn+y*c}};
 const A=local(a),B=local(b),dx=B.x-A.x,dy=B.y-A.y,w=box.w/2+pad,h=box.h/2+pad;
 let t0=0,t1=1;
 for(const [p,q] of [[-dx,A.x+w],[dx,w-A.x],[-dy,A.y+h],[dy,h-A.y]]){
  if(Math.abs(p)<1e-10){if(q<0)return false;continue}
  const r=q/p;if(p<0){if(r>t1)return false;t0=Math.max(t0,r)}else{if(r<t0)return false;t1=Math.min(t1,r)}
 }
 return t0<=t1;
}
function labelScale(d){const n=Number(d)||2;return Math.min(1.62,1+CAT.nominalDN.filter(v=>v>2&&v<=n+1e-4).length*.065)}
let renderLabelBoxes=[];
function placeLabels(info){
 const placed=[],placements=new Map(),edgeLines=state.graph.edges.map(e=>({id:e.id,kind:e.kind,a:project(getNode(e.a).p),b:project(getNode(e.b).p)}));
 const junctions=info.fittings.map(f=>project(getNode(f.node).p));
 const clashes=(box)=>placed.reduce((n,other)=>n+(satOverlap(box,other,4)?1:0),0);
 const geometricPenalty=(box,ownId)=>{
  let p=0;
  for(const l of edgeLines){if(l.id===ownId)continue;
    if(segmentHitsLabel(l.a,l.b,box,8))p+=4200;
  }
  for(const q of junctions)if(Math.hypot(box.cx-q.x,box.cy-q.y)<Math.max(22,box.h*1.1))p+=120;
  return p;
 };
 const choose=(options)=>options.sort((a,b)=>a.score-b.score)[0];
 function store(key,text,origin,box,opts={}){placed.push(box);placements.set(key,{...box,text,origin,...opts})}
 // Los tubos conservan prioridad: su texto queda encima y paralelo al eje.
 // Se ubican primero los niples más cortos, que tienen menos posiciones válidas.
 const pipes=state.graph.edges.filter(e=>e.kind!=='reducer'&&!e.referencePort).map(e=>{
  const a=project(getNode(e.a).p),b=project(getNode(e.b).p),m=Math.hypot(a.x-b.x,a.y-b.y);
  return {e,a,b,m};
 }).sort((x,y)=>x.m-y.m||x.e.id-y.e.id);
 for(const {e,a,b,m} of pipes){
  if(m<.1)continue;
  const display=pipeLabelText(e),defaultFont=12*labelScale(e.diam);
  const fontSize=m<requiredPipeSpan(e)?Math.max(10,Math.min(defaultFont,(m-18)/(display.length*.63))):defaultFont;
  const w=Math.max(46,display.length*fontSize*.62+14),h=fontSize+11;
  const u={x:(b.x-a.x)/m,y:(b.y-a.y)/m},normal={x:-u.y,y:u.x},center={x:(a.x+b.x)/2,y:(a.y+b.y)/2},a2=angle2(a,b);
  const shift=Math.max(0,Math.min(38,(m-w)/2-13));
  const offsets=[0,-shift/2,shift/2,-shift,shift].filter((v,i,arr)=>arr.indexOf(v)===i);
  const spacing=(tubeWidth(e.diam)/2+h/2+3);
  const options=[];
  for(const side of [-1,1])for(const tangent of offsets)for(const addGap of [0,6,13,23,38,58,85]){
   const r=rec(center.x+u.x*tangent+normal.x*(spacing+addGap)*side,center.y+u.y*tangent+normal.y*(spacing+addGap)*side,w,h,a2);
   const overlap=clashes(r);
   options.push({box:r,score:overlap*18000+geometricPenalty(r,e.id)+addGap*.42+Math.abs(tangent)*.2+(side===-1?0:.7)});
  }
  const best=choose(options);
  store('E'+e.id,display,center,best.box,{onPipe:true,fontSize});
 }
 // Reducciones: texto paralelo a sus bocas, sin tapar los niples.
 for(const e of state.graph.edges.filter(e=>e.kind==='reducer')){
  const a=project(getNode(e.a).p),b=project(getNode(e.b).p),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},theta=angle2(a,b),rad=theta*Math.PI/180;
  const u={x:Math.cos(rad),y:Math.sin(rad)},n={x:-u.y,y:u.x},t=`RED ${dnFmt(e.from)}x${dnFmt(e.to)}`,fontSize=11*labelScale(Math.max(Number(e.from)||2,Number(e.to)||2)),w=Math.max(50,t.length*fontSize*.64+12),h=fontSize+6;
  const opts=[];
  const clearance=7*accessoryScale(Math.max(Number(e.from)||2,Number(e.to)||2))+h*.5+3;
  for(const side of [-1,1])for(const d of [clearance,clearance+8,clearance+17,clearance+29,clearance+43,clearance+60])for(const along of [0,-15,15]){
   const box=rec(mid.x+n.x*d*side+u.x*along,mid.y+n.y*d*side+u.y*along,w,h,theta);
   opts.push({box,score:clashes(box)*18000+geometricPenalty(box,e.id)+d*.2+Math.abs(along)*.2});
  }
  store('R'+e.id,t,mid,choose(opts).box,{fontSize});
 }
 // Codo y T: etiqueta cercana, paralela al tramo asociado, evitando cubrir tubería.
 for(const fit of info.fittings.filter(x=>x.kind!=='bend')){
  const origin=project(getNode(fit.node).p),links=info.adj.get(fit.node)||[];
  let connected=[];
  if(fit.kind==='tee'&&fit.detail)connected=links.filter(l=>fit.detail.runEdges.includes(l.edge.id));
  if(!connected.length)connected=[...links].sort((x,y)=>dist(getNode(y.other).p,getNode(fit.node).p)-dist(getNode(x.other).p,getNode(fit.node).p)).slice(0,1);
  const axis=connected.length===2?{a:project(getNode(connected[0].other).p),b:project(getNode(connected[1].other).p)}:{a:origin,b:connected[0]?project(getNode(connected[0].other).p):{x:origin.x+40,y:origin.y}};
  const rot=angle2(axis.a,axis.b),rad=rot*Math.PI/180,u={x:Math.cos(rad),y:Math.sin(rad)},n={x:-u.y,y:u.x};
  const fitDiam=fit.kind==='tee'?(Number(fit.detail?.run)||2):(Number(links[0]?.edge?.diam)||2);const fontSize=11*labelScale(fitDiam),label=fit.label,w=Math.max(34,label.length*fontSize*.64+11),h=fontSize+6,options=[];
  for(const side of [-1,1])for(const off of [Math.max(12,tubeWidth(fitDiam)/2+h/2+2),23,32,44,59])for(const along of [0,-16,16,-32,32]){
   const box=rec(origin.x+n.x*off*side+u.x*along,origin.y+n.y*off*side+u.y*along,w,h,rot);
   options.push({box,score:clashes(box)*18000+geometricPenalty(box,null)+off*.25+Math.abs(along)*.2});
  }
  store(fit.id,label,origin,choose(options).box,{fontSize});
 }
 return placements;
}

function seqLabel(i){let s='';i++;while(i>0){i--;s=String.fromCharCode(65+i%26)+s;i=Math.floor(i/26)}return s}
let tubeLengthBoxes=[];
function tubeRealLengthLabel(e,label,allLabels){
 if(!label)return '';
 const a=project(getNode(e.a).p),b=project(getNode(e.b).p),dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy);
 if(L<32)return '';
 const u={x:dx/L,y:dy/L},n={x:-u.y,y:u.x},center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
 const sign=(label.cx-center.x)*n.x+(label.cy-center.y)*n.y>=0?-1:1;
 const value=Number.isFinite(e.realLength)&&e.realLength>0?`${f(e.realLength)} ${state.graph.project?.lengthUnit||'mm'}`:'Pend.';
 const text='L: '+value,font=L<text.length*6.4+9?9.2:11,ang=angle2(a,b),w=text.length*font*.59+8,h=font+5;
 const oldLabels=[...(allLabels?.values()||[])];let best=null;
 const tangents=[0,-Math.min(25,L*.19),Math.min(25,L*.19)];
 for(const gap of [Math.max(18,tubeWidth(e.diam)/2+16),31,42,55])for(const shift of tangents){
  const box=rec(center.x+n.x*gap*sign+u.x*shift,center.y+n.y*gap*sign+u.y*shift,w,h,ang);
  const collisions=[...oldLabels,...tubeLengthBoxes].reduce((n,other)=>n+(satOverlap(box,other,3)?1:0),0);
  const score=collisions*1000+gap*.55+Math.abs(shift)*.17;
  if(!best||score<best.score)best={box,score};
 }
 if(!best)return '';
 const pos=best.box;tubeLengthBoxes.push(pos);
 return `<g transform="translate(${f(pos.cx)} ${f(pos.cy)}) rotate(${f(ang)})"><text class="pipe-length-text" text-anchor="middle" dominant-baseline="middle" font-size="${font}">${escaped(text)}</text></g>`;
}
function svgLabel(l,selected,kind){if(!l)return'';const css=kind==='fit'?'fitText':'pipeText';const w=l.onPipe?Math.max(52,l.text.length*(l.fontSize||12)*.61+12):l.w,h=l.h;
 // Cuando un segmento es demasiado corto, una línea guía mantiene la etiqueta vinculada a su tubo.
 let leader='';const d=l.origin?Math.hypot(l.cx-l.origin.x,l.cy-l.origin.y):0;
 if(d>37&&!l.onPipe){const ux=(l.cx-l.origin.x)/d,uy=(l.cy-l.origin.y)/d,stop={x:l.cx-ux*Math.min(w*.34,20),y:l.cy-uy*9};leader=`<path d="M${xyz(l.origin)} L${xyz(stop)}" fill="none" stroke="${selected?'#16a7cb':'#82969a'}" stroke-width=".9"/>`}
 const labelText=`<text class="${css}" x="0" y=".5" font-size="${l.fontSize||12}" dominant-baseline="middle" text-anchor="middle">${escaped(l.text)}</text>`;
 return `${leader}<g transform="translate(${f(l.cx)} ${f(l.cy)}) rotate(${f(l.angle||0)})" pointer-events="none"><rect x="${f(-w/2)}" y="${f(-h/2)}" width="${f(w)}" height="${f(h)}" rx="5" fill="${selected?'#d8f6fc':'#fafcfbe8'}"/>${labelText}</g>`}



/* 03B. AYUDAS DE ORIENTACIÓN. Polígonos 2D, sin geometría constructiva. */
function renderAids(){const info=classify();const shadows=[];for(const fit of info.fittings){if(!isolationVisible(fit.id)||fit.kind!=='elbow'||fit.angle!==45)continue;const links=info.adj.get(fit.node),p=project(getNode(fit.node).p);if(!links||links.length!==2)continue;const vers=links.map(l=>{const q=project(getNode(l.other).p),dx=q.x-p.x,dy=q.y-p.y,m=Math.hypot(dx,dy)||1;return{x:dx/m,y:dy/m}});const u=vers[0],v=vers[1],a={x:p.x+u.x*9,y:p.y+u.y*9},b={x:p.x+u.x*42,y:p.y+u.y*42},c={x:p.x+v.x*42,y:p.y+v.y*42},d={x:p.x+v.x*9,y:p.y+v.y*9};shadows.push(`<path d="M${xyz(a)} L${xyz(b)} L${xyz(c)} L${xyz(d)} Z" fill="${CAT.aidFill}" stroke="none" pointer-events="none"/>`)}aidLayer.innerHTML=shadows.join('')}

/* 04. DIBUJO SVG: tubería 2D y curvas esquemáticas */
function tubeWidth(d){const n=Number(d);if(!Number.isFinite(n)||n<=0)return 7;return f(Math.max(3.4,Math.min(21,7*Math.pow(n/2,.65))))}
function weldAt(point,diameter,selected=false){
 // Borde visible y centro blanco; el tamaño exterior es 1.2 veces el grosor gráfico.
 const r=.6*tubeWidth(diameter),border=Math.max(1.1,tubeWidth(diameter)*.16);
 return `<circle class="weld-mark" cx="${f(point.x)}" cy="${f(point.y)}" r="${f(r)}" fill="#ffffff" stroke="${selected?'#16a7cb':'#52656a'}" stroke-width="${f(border)}" pointer-events="none"/>`;
}
function pipeCutForWeld(fit,edge,nodeId,info){
 if(!fit)return 0;
 const lengths=(info.adj.get(nodeId)||[]).map(l=>{const p=project(getNode(nodeId).p),q=project(getNode(l.other).p);return Math.hypot(p.x-q.x,p.y-q.y)});
 if(fit.kind==='elbow')return Math.min(12*accessoryScale(Math.max(...(info.adj.get(nodeId)||[]).map(l=>l.edge.diam||2))),...lengths.map(L=>L*.2));
 if(fit.kind==='bend')return Math.min(21,...lengths.map(L=>L*.25));
 if(fit.kind==='tee')return Math.min(fit.detail?.runEdges.includes(edge.id)?17*accessoryScale(fit.detail.run||edge.diam):23*accessoryScale(edge.diam),Math.hypot(project(getNode(edge.b).p).x-project(getNode(edge.a).p).x,project(getNode(edge.b).p).y-project(getNode(edge.a).p).y)*.28);
 return 0;
}
/* Se derivan de la topología: cuando una boca queda libre, la soldadura desaparece.
   Identificador estable por tubo/boca o reducción/boca; no son círculos sueltos. */
function weldRecords(){
 const info=classify(),fitMap=new Map(info.fittings.map(x=>[x.node,x])),adj=info.adj,records=[],seenReducerNodes=new Set();
 for(const nodeId of state.graph.weldNodes||[]){
  const links=adj.get(nodeId)||[];if(links.length!==2||links.some(l=>l.edge.kind==='reducer'||l.edge.referencePort))continue;
  const p=getNode(nodeId)?.p;if(!p)continue;
  records.push({id:`WJOIN_${nodeId}`,p:project(p),diam:Number(links[0].edge.diam)||2,node:nodeId,kind:'tube-joint'});
 }

 for(const edge of state.graph.edges){
  if(edge.referencePort)continue;
  const aNode=getNode(edge.a),bNode=getNode(edge.b);if(!aNode||!bNode)continue;
  if(edge.kind==='reducer'){
   for(const [endId,diam] of [[edge.a,edge.from],[edge.b,edge.to]]){
    if((adj.get(endId)||[]).length<2||seenReducerNodes.has(endId))continue;
    seenReducerNodes.add(endId);
    records.push({id:`W${edge.id}_${endId}`,p:project(getNode(endId).p),diam:Number(diam)||2,part:edge.id,node:endId,kind:'reducer'});
   }
   continue;
  }
  const p=project(aNode.p),q=project(bNode.p),dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;
  for(const [nodeId,sgn] of [[edge.a,1],[edge.b,-1]]){
   const fit=fitMap.get(nodeId);
   if(edge.referencePort||!fit||!['elbow','tee','junction'].includes(fit.kind))continue;
   const cut=pipeCutForWeld(fit,edge,nodeId,info);
   const base=nodeId===edge.a?p:q;
   records.push({id:`W${edge.id}_${nodeId}`,p:{x:base.x+ux*cut*sgn,y:base.y+uy*cut*sgn},diam:Number(edge.diam)||2,part:edge.id,node:nodeId,kind:fit.kind});
  }
 }
 return records;
}
function svgWeldRecords(){return weldRecords().map(w=>`<g class="weld-item ${componentProps(w.id).status==='existing'&&!state.selection.has(w.id)?'item-existing':''}" data-weld="${w.id}">${weldAt(w.p,w.diam,state.selection.has(w.id))}</g>`).join('')}

/* Cruces solo gráficos. No cambian nodos ni conectividad XYZ.
   Si dos tubos se cruzan en proyección, el que queda atrás deja un salto.
   Al mismo nivel, el tubo vertical cede el paso al horizontal. */
function crossingBridges(){
 const pipes=state.graph.edges.filter(e=>e.kind==='pipe'&&!e.referencePort);
 const cuts=new Map();
 const cross=(a,b)=>a.x*b.y-a.y*b.x;
 const axisKind=e=>{const a=getNode(e.a).p,b=getNode(e.b).p,v=sub(b,a);
  return Math.abs(v[2])>1e-4&&Math.hypot(v[0],v[1])<1e-4?'vertical':Math.abs(v[2])<1e-4?'horizontal':'other'};
 for(let i=0;i<pipes.length;i++)for(let j=i+1;j<pipes.length;j++){
  const e=pipes[i],g=pipes[j];if(e.a===g.a||e.a===g.b||e.b===g.a||e.b===g.b)continue;
  const ea=getNode(e.a).p,eb=getNode(e.b).p,ga=getNode(g.a).p,gb=getNode(g.b).p;
  if(!ea||!eb||!ga||!gb)continue;
  const a=project(ea),b=project(eb),c=project(ga),d=project(gb),r={x:b.x-a.x,y:b.y-a.y},ss={x:d.x-c.x,y:d.y-c.y};
  const denom=cross(r,ss);if(Math.abs(denom)<.001)continue;
  const ca={x:c.x-a.x,y:c.y-a.y},t=cross(ca,ss)/denom,u=cross(ca,r)/denom;
  if(t<=.09||t>=.91||u<=.09||u>=.91)continue;
  let hidden=null,ratio=0;const zE=ea[2]+(eb[2]-ea[2])*t,zG=ga[2]+(gb[2]-ga[2])*u;
  // Diferente elevación: detrás queda el más bajo. A igual altura: vertical detrás.
  if(Math.abs(zE-zG)>1.5){hidden=zE<zG?e:g;ratio=hidden===e?t:u}
  else if(axisKind(e)==='vertical'&&axisKind(g)!=='vertical'){hidden=e;ratio=t}
  else if(axisKind(g)==='vertical'&&axisKind(e)!=='vertical'){hidden=g;ratio=u}
  if(!hidden)continue;
  const L=hidden===e?Math.hypot(r.x,r.y):Math.hypot(ss.x,ss.y);
  const gap=Math.min(.075,Math.max(5.5,tubeWidth(hidden.diam)*.7+5.5)/Math.max(1,L));
  const span=[Math.max(0,ratio-gap),Math.min(1,ratio+gap)];
  if(!cuts.has(hidden.id))cuts.set(hidden.id,[]);cuts.get(hidden.id).push(span);
 }
 for(const [id,spans] of cuts){spans.sort((a,b)=>a[0]-b[0]);const merged=[];for(const span of spans){const prev=merged.at(-1);if(prev&&span[0]<=prev[1])prev[1]=Math.max(prev[1],span[1]);else merged.push([...span])}cuts.set(id,merged)}
 return cuts;
}
function visiblePipePath(e,start,end,breaks){
 const base=project(getNode(e.a).p),finish=project(getNode(e.b).p),vx=finish.x-base.x,vy=finish.y-base.y,den=vx*vx+vy*vy;
 if(den<1e-5||!breaks?.length)return `M${xyz(start)} L${xyz(end)}`;
 let t0=((start.x-base.x)*vx+(start.y-base.y)*vy)/den,t1=((end.x-base.x)*vx+(end.y-base.y)*vy)/den;
 const intervals=[];if(t0>t1)[t0,t1]=[t1,t0];let cur=t0;
 for(const [lo,hi] of breaks){if(hi<=cur||lo>=t1)continue;if(lo>cur+1e-4)intervals.push([cur,Math.min(lo,t1)]);cur=Math.max(cur,hi);if(cur>=t1)break}
 if(cur<t1-1e-4)intervals.push([cur,t1]);
 const p=t=>({x:base.x+vx*t,y:base.y+vy*t});
 return intervals.map(([l,h])=>`M${xyz(p(l))} L${xyz(p(h))}`).join(' ');
}
/* v0.36 · Convenciones legibles del entorno sin modificar el modelo.
   Se sitúan junto a las marcas respectivas, evitando etiquetas y trazos. */
function environmentConventionLabels(info){
 const result=[],used=[...renderLabelBoxes],lines=state.graph.edges.filter(e=>!e.referencePort).map(e=>({id:e.id,a:project(getNode(e.a).p),b:project(getNode(e.b).p)}));
 function mark(a,b,entries,ownId){
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<6)return;
  const u={x:dx/len,y:dy/len},n={x:-u.y,y:u.x};
  let angle=angle2(a,b);if(angle>90||angle < -90)angle+=180;
  const text=entries.map(x=>x[0]).join(' · '),fontSize=9.4,w=Math.max(42,text.length*5.4+14),h=16;
  const color=entries.length===1?entries[0][1]:'#5c6064';
  const center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};let best=null;
  for(const sign of [-1,1])for(const distance of [20,30,43,59,78])for(const shift of [0,-.22,.22,-.36,.36]){
   const x=center.x+n.x*distance*sign+u.x*len*shift,y=center.y+n.y*distance*sign+u.y*len*shift;
   const box=rec(x,y,w,h,angle);
   const overlaps=used.reduce((v,c)=>v+(satOverlap(box,c,4)?1:0),0);
   const pipeClash=lines.reduce((v,l)=>v+((l.id===ownId)?0:(segmentHitsLabel(l.a,l.b,box,5)?1:0)),0);
   const score=overlaps*2500+pipeClash*1900+distance+Math.abs(shift)*25+(sign===1?2:0);
   if(!best||score<best.score)best={box,score,x,y};
  }
  if(!best)return;
  used.push(best.box);
  result.push(`<g pointer-events="none" transform="translate(${f(best.x)} ${f(best.y)}) rotate(${f(angle)})"><rect x="${f(-w/2)}" y="${f(-h/2)}" width="${f(w)}" height="${h}" rx="4" fill="#fafcfb" fill-opacity=".94" stroke="${color}" stroke-opacity=".18" stroke-width=".7"/><text text-anchor="middle" dominant-baseline="middle" font-size="${fontSize}" font-weight="750" fill="${color}">${escaped(text)}</text></g>`);
 }
 const entriesFor=(ins,install)=>{const rows=[];if(ins)rows.push(['AIS','#a77c00']);if(install==='buried')rows.push(['ENTERRADO','#96633a']);if(install==='channel')rows.push(['CANAL / CAJA','#74838b']);return rows};
 for(const e of state.graph.edges){if(e.referencePort||!isolationVisible(edgeSelectionToken(e)))continue;const entries=entriesFor(e.insulation===true,edgeInstallation(e));if(!entries.length)continue;const a=getNode(e.a),b=getNode(e.b);if(a&&b)mark(project(a.p),project(b.p),entries,e.id)}
 for(const fit of info.fittings){if(!isolationVisible(fit.id))continue;const entries=entriesFor(edgeInsulated(fit.id),fitEffective(fit.id,'installation'));if(!entries.length)continue;const p=getNode(fit.node);const links=info.adj.get(fit.node)||[];if(!p||!links.length)continue;const q=getNode(links[0].other);if(!q)continue;const A=project(p.p),B=project(q.p),d=Math.hypot(A.x-B.x,A.y-B.y)||1;mark(A,{x:A.x+(B.x-A.x)*Math.min(.23,26/d),y:A.y+(B.y-A.y)*Math.min(.23,26/d)},entries,null)}
 return result.join('');
}
function renderScene(){const visualCuts=crossingBridges();tubeLengthBoxes=[];ensureEdgeMetadata();const info=classify(),labels=placeLabels(info),fitMap=new Map(info.fittings.map(x=>[x.node,x])),pieces=[];
 for(const e of state.graph.edges){const n1=getNode(e.a),n2=getNode(e.b);if(!n1||!n2)continue;const a=project(n1.p),b=project(n2.p),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<.001)continue;const ux=dx/len,uy=dy/len;
 if(e.kind==='reducer'){
  const sel=state.selection.has('R'+e.id),nx=-uy,ny=ux;
  // Perfil axial cónico de contorno abierto visualmente: sin relleno ni nervio central.
  // La orientación coincide con el eje real del tramo, incluido el plano vertical.
  const first=Number(e.from)||2,last=Number(e.to)||2,maxDN=Math.max(first,last),scale=accessoryScale(maxDN);
  const half=(dn)=>{const ratio=Math.sqrt(Math.max(.01,dn/maxDN));return 3.3*scale+(ratio*3.8*scale)};
  const wide=Math.max(half(first),half(last)),small=Math.min(half(first),half(last));
  const adjust=wide-small<1.1*scale?1.1*scale-(wide-small):0;
  let hFrom=half(first),hTo=half(last);
  if(adjust){if(first<last)hFrom-=adjust;else hTo-=adjust;}
  hFrom=Math.max(2.3*scale,hFrom);hTo=Math.max(2.3*scale,hTo);
  const profile=e.reducerType==='eccentric'&&Array.isArray(e.axisOffsetXYZ)?eccentricConnectedProfile(a,b,e,11*scale):reducerProfile(a,b,first,last,e.reducerType||'concentric',e.flatSide||'top',11*scale);
  const A=profile.upperLeft,B=profile.lowerLeft,C=profile.lowerRight,D=profile.upperRight;
  const axisGuide=e.reducerType==='eccentric'?`<path d="M${f(A.x+(B.x-A.x)/2)},${f(A.y+(B.y-A.y)/2)} L${xyz(profile.shifted)}" stroke="#a3b4b7" stroke-width="1" stroke-dasharray="3 5" fill="none" pointer-events="none"/>`:'';
  const outline=sel?'#16a7cb':blendHex(serviceColor(e),.42),sw=f(Math.min(2.4,1.45*scale)),exist=edgeStatus(e)==='existing';
  const dShape=`M${xyz(A)} L${xyz(D)} M${xyz(B)} L${xyz(C)} M${xyz(A)} L${xyz(B)} M${xyz(C)} L${xyz(D)}`;
  pieces.push(`<g data-item="R${e.id}" class="${exist&&!sel?'item-existing':''}">${exist&&!sel?`<path d="${dShape}" fill="none" stroke="#6f7c80" stroke-width="${sw+1.7}"/>`:''}<path class="accessory-body" d="${dShape}" fill="none" stroke="${exist&&!sel?'#ffffff':outline}" stroke-width="${sw}" ${exist&&!sel?'stroke-dasharray="6 4"':''} stroke-linejoin="round" stroke-linecap="round"/><path d="M${xyz(a)} L${xyz(b)}" stroke="transparent" stroke-width="24" fill="none"/>${axisGuide}${svgLabel(labels.get('R'+e.id),sel,'fit')}</g>`);continue;
 }

 if(e.referencePort){
  const isSelected=state.selection.has('E'+e.id);
  pieces.push(`<g data-item="E${e.id}"><path d="M${xyz(a)} L${xyz(b)}" stroke="${isSelected?'#16a7cb':'#879ca1'}" stroke-width="2.2" stroke-dasharray="6 5" fill="none" stroke-linecap="round"/><path d="M${xyz(a)} L${xyz(b)}" stroke="transparent" stroke-width="15" fill="none"/></g>`);
  continue;
 }
 const edgeWidth=tubeWidth(e.diam),f1=fitMap.get(e.a),f2=fitMap.get(e.b),cutFor=(fit,nodeId)=>{if(!fit)return 0;if(fit.kind==='elbow'){const ls=(info.adj.get(nodeId)||[]).map(l=>{const a=project(getNode(nodeId).p),b=project(getNode(l.other).p);return Math.hypot(a.x-b.x,a.y-b.y)});return Math.min(12*accessoryScale(Math.max(...(info.adj.get(nodeId)||[]).map(l=>l.edge.diam||2))),...ls.map(L=>L*.2))}if(fit.kind==='bend'){const links=info.adj.get(nodeId)||[];const lengths=links.map(l=>{const a=getNode(nodeId).p,b=getNode(l.other).p,pa=project(a),pb=project(b);return Math.hypot(pa.x-pb.x,pa.y-pb.y)});return Math.min(21,...lengths.map(x=>x*.25))}if(fit.kind==='tee'){const inRun=fit.detail?.runEdges.includes(e.id);return Math.min((inRun?17*accessoryScale(fit.detail?.run||e.diam):23*accessoryScale(e.diam)),len*.28)}return 0};
 const cut1=cutFor(f1,e.a),cut2=cutFor(f2,e.b);const p={x:a.x+ux*cut1,y:a.y+uy*cut1},q={x:b.x-ux*cut2,y:b.y-uy*cut2},selected=state.selection.has('E'+e.id),cx=(p.x+q.x)/2,cy=(p.y+q.y)/2;
 const exist=edgeStatus(e)==='existing';
 const arrow=flowArrowMarkup(e,p,q,ux,uy,edgeWidth),visibleD=visiblePipePath(e,p,q,visualCuts.get(e.id));

 pieces.push(`<g data-item="E${e.id}" class="${exist&&!selected?'item-existing':''}">${exist&&!selected?`<path d="${visibleD}" fill="none" stroke="#667980" stroke-width="${f(edgeWidth+1.8)}" stroke-linecap="round"/>`:''}<path class="tube-body" d="${visibleD}" fill="none" stroke="${selected?'#16a7cb':exist?'#ffffff':serviceColor(e)}" stroke-width="${f(edgeWidth)}" ${exist&&!selected?'stroke-dasharray="11 7"':''} stroke-linecap="round"/>${exist&&!selected?'':arrow}${svgLabel(labels.get('E'+e.id),selected,'pipe')}</g>`);
 }
 for(const fit of info.fittings){const n=getNode(fit.node),p=project(n.p),selected=state.selection.has(fit.id),exist=fitEffective(fit.id,'status')==='existing',color=selected?'#16a7cb':exist?'#ffffff':fit.kind==='bend'?CAT.tubeColor:fitServiceColor(fit,info);
 if(fit.kind==='elbow'||fit.kind==='bend'){const links=info.adj.get(n.id),v1=project(getNode(links[0].other).p),v2=project(getNode(links[1].other).p),ax=[v1.x-p.x,v1.y-p.y],bx=[v2.x-p.x,v2.y-p.y],na=Math.hypot(...ax),nb=Math.hypot(...bx),rad=Math.min(fit.kind==='bend'?21:12*accessoryScale(Math.max(...links.map(l=>l.edge.diam||2))),na*.2,nb*.2);const q1={x:p.x+ax[0]/na*rad,y:p.y+ax[1]/na*rad},q2={x:p.x+bx[0]/nb*rad,y:p.y+bx[1]/nb*rad};pieces.push(`<g data-item="${fit.id}" class="${exist?'item-existing':''}"><path class="accessory-body" d="M${xyz(q1)} Q${xyz(p)} ${xyz(q2)}" fill="none" stroke="${color}" stroke-width="${f(tubeWidth(Math.max(...links.map(l=>l.edge.diam||2))))}" stroke-linecap="round"/>${fit.kind==='bend'?'':svgLabel(labels.get(fit.id),selected,'fit')}</g>`)
 }else if(fit.kind==='tee'){const links=info.adj.get(n.id)||[],t=fit.detail,runLinks=t?links.filter(l=>t.runEdges.includes(l.edge.id)):links.slice(0,2),branch=t?links.find(l=>l.edge.id===t.branchEdge):links[2];const dir=link=>{const q=project(getNode(link.other).p),vx=q.x-p.x,vy=q.y-p.y,m=Math.hypot(vx,vy)||1;return{x:vx/m,y:vy/m}};let marks='';if(runLinks.length===2){const u=dir(runLinks[0]),v=dir(runLinks[1]),A={x:p.x+u.x*17*accessoryScale(t?.run||2),y:p.y+u.y*17*accessoryScale(t?.run||2)},B={x:p.x+v.x*17*accessoryScale(t?.run||2),y:p.y+v.y*17*accessoryScale(t?.run||2)};marks+=`<path class="accessory-body" d="M${xyz(A)} L${xyz(p)} L${xyz(B)}" fill="none" stroke="${color}" stroke-width="${f(tubeWidth(t?.run||runLinks[0]?.edge.diam||2))}" stroke-linejoin="round" stroke-linecap="round"/>`}
 if(branch){const d=dir(branch),ratio=t?Math.min(1,Math.max(.38,t.branchDn/t.run)):1,len=23*accessoryScale(t?.branchDn||2),B={x:p.x+d.x*len,y:p.y+d.y*len};marks+=`<path class="accessory-body" d="M${xyz(p)} L${xyz(B)}" fill="none" stroke="${color}" stroke-width="${f(tubeWidth(t?.branchDn||branch.edge.diam||2))}" stroke-linecap="round"/>`}
 pieces.push(`<g data-item="${fit.id}" class="${exist?'item-existing':''}">${marks}${svgLabel(labels.get(fit.id),selected,'fit')}</g>`);
 }else pieces.push(`<g data-item="${fit.id}"><circle cx="${f(p.x)}" cy="${f(p.y)}" r="5" fill="${color}"/>${svgLabel(labels.get(fit.id),selected,'fit')}</g>`)
 }renderLabelBoxes=[...labels.values()].map(v=>rec(v.cx,v.cy,v.w,v.h,v.angle));sceneLayer.innerHTML=pieces.join('')+svgWeldRecords()+supportMarkup()+environmentConventionLabels(info)}

/* Enterrado: dos caras café transparentes detrás de la tubería y cada accesorio.
   Es una ayuda gráfica, no profundidad ni protección física. */
function burialBand(a,b,thick){
 const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy);if(L<.1)return'';
 const nx=-dy/L,ny=dx/L,outer=thick*.68+9,inner=thick*.5;
 return [-1,1].map(side=>{
  const P={x:a.x+nx*inner*side,y:a.y+ny*inner*side},Q={x:b.x+nx*inner*side,y:b.y+ny*inner*side};
  const R={x:b.x+nx*outer*side,y:b.y+ny*outer*side},S={x:a.x+nx*outer*side,y:a.y+ny*outer*side};
  return `<path d="M${xyz(P)} L${xyz(Q)} L${xyz(R)} L${xyz(S)} Z" fill="#a17446" fill-opacity=".32" stroke="none"/>`;
 }).join('');
}
function renderBuried(){
 const shapes=[],info=classify();
 for(const e of state.graph.edges){if(!isolationVisible(edgeSelectionToken(e))||e.referencePort||edgeInstallation(e)!=='buried')continue;
  const a=getNode(e.a),b=getNode(e.b);if(!a||!b)continue;
  shapes.push(burialBand(project(a.p),project(b.p),e.kind==='reducer'?Math.max(6,tubeWidth(Math.max(e.from||2,e.to||2))):tubeWidth(e.diam)));
 }
 for(const fit of info.fittings){if(!isolationVisible(fit.id)||fitEffective(fit.id,'installation')!=='buried')continue;
  const center=project(getNode(fit.node).p);
  for(const l of info.adj.get(fit.node)||[]){const far=project(getNode(l.other).p),dx=far.x-center.x,dy=far.y-center.y,m=Math.hypot(dx,dy)||1,
  len=Math.min(m*.42,29*accessoryScale(l.edge.diam||2)),end={x:center.x+dx/m*len,y:center.y+dy/m*len};
  shapes.push(burialBand(center,end,tubeWidth(l.edge.diam||2)))}
 }
 for(const w of weldRecords())if(isolationVisible(w.id)&&componentProps(w.id).installation==='buried')shapes.push(`<circle cx="${f(w.p.x)}" cy="${f(w.p.y)}" r="${f(.6*tubeWidth(w.diam)+5)}" fill="#a17446" fill-opacity=".32"/>`);
 $('subsoilLayer').innerHTML=shapes.join('')+environmentalMarkup();
}

/* Representaciones auxiliares de aislamiento térmico y canal/caja.
   Las líneas son ayudas de vista: no alteran puntos XYZ ni el sólido PCF. */
function edgeInsulated(token){const e=itemEdge(token);return e?e.insulation===true:componentProps(token).insulation===true}
function insulationValue(token){const e=itemEdge(token);const n=e?e.insulationThickness:componentProps(token).insulationThickness;return n??''}
function pairParallel(a,b,r,color,dashed){const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<1)return'';const nx=-dy/len,ny=dx/len;return [-1,1].map(side=>{const x=nx*r*side,y=ny*r*side;return `<path d="M${f(a.x+x)} ${f(a.y+y)} L${f(b.x+x)} ${f(b.y+y)}" fill="none" stroke="${color}" stroke-width="1.5" ${dashed?'stroke-dasharray="7 5"':''} stroke-linecap="round"/>`}).join('')}
function environmentalMarkup(){const out=[],info=classify();function add(a,b,ins,channel,width){if(ins)out.push(pairParallel(a,b,width/2+7,'#ba9315',true));if(channel){out.push(pairParallel(a,b,width/2+16,'#829199',false));const x=b.x-a.x,y=b.y-a.y,len=Math.hypot(x,y)||1,ux=x/len,uy=y/len,nx=-uy,ny=ux;for(let i=18;i<len-10;i+=19)for(const side of [-1,1]){const xx=a.x+ux*i+nx*(width/2+16)*side,yy=a.y+uy*i+ny*(width/2+16)*side;out.push(`<path d="M${f(xx)} ${f(yy)} l${f(nx*7*side+ux*3)} ${f(ny*7*side+uy*3)}" fill="none" stroke="#9aa6a8" stroke-width="1.1"/>`)}}}
 for(const e of state.graph.edges){if(e.referencePort||!isolationVisible(edgeSelectionToken(e)))continue;const a=getNode(e.a),b=getNode(e.b);if(!a||!b)continue;add(project(a.p),project(b.p),e.insulation===true,edgeInstallation(e)==='channel',e.kind==='reducer'?tubeWidth(Math.max(e.from||2,e.to||2)):tubeWidth(e.diam||2));}
 for(const fit of info.fittings){if(!isolationVisible(fit.id))continue;const ins=edgeInsulated(fit.id),channel=fitEffective(fit.id,'installation')==='channel';if(!ins&&!channel)continue;const p=project(getNode(fit.node).p);for(const link of info.adj.get(fit.node)||[]){const q=project(getNode(link.other).p),d=Math.hypot(q.x-p.x,q.y-p.y)||1,len=Math.min(24,d*.28);const b={x:p.x+(q.x-p.x)*len/d,y:p.y+(q.y-p.y)*len/d};add(p,b,ins,channel,tubeWidth(link.edge.diam||2))}}
 return out.join('')}

/* Vista previa: flecha de posición y sentido del reductor, siempre visible bajo la ventana flotante. */
function renderReducerPreview(){
 if(!state.reducerMode||!state.reducerChoice||!state.cursor){reducerPreviewLayer.innerHTML='';return}
 const found=nearestReducerFaceAtScreen(state.cursor)||nearestPipeAtScreen(state.cursor);
 if(!found){reducerPreviewLayer.innerHTML='';return}
 let a,b,pt;
 if(found.reducer){const r=found.reducer;const x=project(getNode(r.a).p),y=project(getNode(r.b).p),at=found.face==='a'?x:y;
  const dir=found.face==='a'?{x:x.x-y.x,y:x.y-y.y}:{x:y.x-x.x,y:y.y-x.y},m=Math.hypot(dir.x,dir.y)||1;
  a=at;b={x:at.x+dir.x/m*25,y:at.y+dir.y/m*25};pt=at;
 }else{const e=found.edge,p1=project(getNode(e.a).p),p2=project(getNode(e.b).p);const t=found.t;
  a={x:p1.x+(p2.x-p1.x)*(t-.08),y:p1.y+(p2.y-p1.y)*(t-.08)};
  b={x:p1.x+(p2.x-p1.x)*(t+.08),y:p1.y+(p2.y-p1.y)*(t+.08)};
  pt={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
 }
 const c=state.reducerChoice,z=reducerProfile(a,b,c.left,c.right,c.type,c.flat,10);
 reducerPreviewLayer.innerHTML=`<g pointer-events="none" fill="none" stroke="#0b8797" stroke-width="2.1" stroke-dasharray="5 3"><path d="M${xyz(z.upperLeft)}L${xyz(z.upperRight)} M${xyz(z.lowerLeft)}L${xyz(z.lowerRight)} M${xyz(z.upperLeft)}L${xyz(z.lowerLeft)} M${xyz(z.upperRight)}L${xyz(z.lowerRight)}"/><circle cx="${f(pt.x)}" cy="${f(pt.y)}" r="16" stroke-width="1.2"/></g>`;
}
function renderDraft(){let s='';for(let i=0;i<state.draft.length-1;i++){const a=project(state.draft[i]),b=project(state.draft[i+1]);s+=`<path d="M${xyz(a)} L${xyz(b)}" fill="none" stroke="${CAT.tubeColor}" stroke-width="${CAT.tubeWidth}" stroke-linecap="round"/>`}
 for(const p of state.draft){const q=project(p);s+=`<circle cx="${f(q.x)}" cy="${f(q.y)}" r="4" stroke="#087f8c" stroke-width="2" fill="#fff"/>`}
 draftLayer.innerHTML=s;
}
function drawGrid(){const a=anchor(),plane=state.plane,step=CAT.grid,uv=getUV(a,plane),u=Math.round(uv[0]/step)*step,v=Math.round(uv[1]/step)*step,range=30*step;let s=`<g stroke="${plane==='XY'?'#d6e4e5':'#dce2eb'}" stroke-width=".85" opacity=".77" fill="none">`;
 for(let i=-30;i<=30;i++){let p1=to3([u+i*step,v-range],a,plane),p2=to3([u+i*step,v+range],a,plane),q1=to3([u-range,v+i*step],a,plane),q2=to3([u+range,v+i*step],a,plane);s+=`<path d="M${xyz(project(p1))} L${xyz(project(p2))} M${xyz(project(q1))} L${xyz(project(q2))}"/>`}
 gridLayer.innerHTML=s+'</g>';
}
function drawGuides(){if(!state.tool||!state.draft.length){guideLayer.innerHTML='';return}const p=state.draft.at(-1),q=project(p),r=170/state.view.k;let s='<g fill="none" stroke="#159aa8" stroke-width="1.3" stroke-dasharray="5 6" opacity=".68">';
 for(const d of directions()){const t=project(addUV(p,d.u*CAT.grid,d.v*CAT.grid,state.plane)),dx=t.x-q.x,dy=t.y-q.y,m=Math.hypot(dx,dy)||1;s+=`<path d="M${xyz(q)} L${f(q.x+dx/m*r)},${f(q.y+dy/m*r)}"/>`}
 s+='</g>';if(state.cursor){const cand=proposedPoint(state.cursor,p);if(cand){const c=project(cand);s+=`<path d="M${xyz(q)} L${xyz(c)}" stroke="#0a86af" stroke-width="3" stroke-dasharray="6 4"/><circle cx="${f(c.x)}" cy="${f(c.y)}" r="5" fill="#fff" stroke="#087f8c" stroke-width="2"/>`}}
 guideLayer.innerHTML=s;
}
function renderMarquee(){if(!state.marquee){marqueeLayer.innerHTML='';return}const p=state.marquee,s=fromScreen(p.x,p.y),q=fromScreen(p.x2,p.y2),x=Math.min(s.x,q.x),y=Math.min(s.y,q.y),w=Math.abs(s.x-q.x),h=Math.abs(s.y-q.y);marqueeLayer.innerHTML=`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" stroke="#078aa0" stroke-width="1.5" stroke-dasharray="5 4" fill="#4cbed3" fill-opacity=".14"/>`}

/* 04D. MOVER/ESTIRAR. Modelo por nodos: jamás desconectamos una línea existente.
   El movimiento de una ruta recta se detiene en un codo, T o reducción. Los
   vértices de codo se desplazan con la ruta y estiran los tubos adyacentes. */
function moveClear(keepEnabled=true){
 const enabled=keepEnabled&&state.move.enabled;
 state.move={enabled,target:null,axis:null,drag:null,baseline:null,valid:true};
 if(!enabled){state.selection.clear()}
}

function selectedAssemblyMoveTarget(){
 const selectedEdges=new Set([...state.selection].filter(t=>/^[ER]\d+$/.test(t)).map(t=>Number(t.slice(1))));
 if(!selectedEdges.size)return null;
 const groups=connectedComponents(),chosen=[],edgeIds=[];
 for(const group of groups){const es=state.graph.edges.filter(e=>group.has(e.a)&&group.has(e.b));const hit=es.filter(e=>selectedEdges.has(e.id));
  if(!hit.length)continue;
  if(hit.length!==es.length)return {error:'Seleccione todo el ensamble conectado para moverlo sin deformaciones.'};
  chosen.push(...group);edgeIds.push(...es.map(e=>e.id));
 }
 if(!chosen.length||edgeIds.length!==selectedEdges.size)return null;
 return {kind:'group',nodeIds:[...new Set(chosen)],edgeIds,highlight:new Set(edgeIds.map(id=>edgeSelectionToken(state.graph.edges.find(e=>e.id===id))))};
}

function toggleMove(){
 if(state.panel)return;state.supportMode=false;cancelCopy({quiet:true});
 if(state.move.drag)moveCancel();
 const next=!state.move.enabled;
 const seed=next&&state.selection.size===1?[...state.selection][0]:null;
 const whole=next&&state.selection.size?selectedAssemblyMoveTarget():null;
 const fullGroup=whole&&!whole.error?whole:null;
 state.tool=false;state.reducerMode=false;state.reducerChoice=null;state.draft=[];state.filterMode='none';
 moveClear(false);state.move.enabled=next;
 if(next&&fullGroup){state.move.target=fullGroup;state.move.baseline=modelCopy();state.selection=new Set(fullGroup.highlight)}
 else if(next&&seed)moveSelect(seed);
 closeFilter();closeAidMenu();render();
 if(next&&whole?.error)message('Movimiento parcial: toque un tramo para desplazarlo con sus conexiones.');
 else if(next&&fullGroup)message('Ensamble seleccionado. Arrástrelo por los ejes habilitados.');
 else if(next&&!seed)message('MOVER: toque un tramo o accesorio y elija un eje.');
}
function inlineLinks(nodeId){const links=adjacency().get(nodeId)||[];return links}
function straightRun(seedId){
 const edge=state.graph.edges.find(e=>e.id===seedId);
 if(!edge||edge.kind==='reducer')return null;
 const included=new Set([seedId]);const ids=new Set([edge.a,edge.b]);
 const walk=(startId,prevEdge)=>{
  let nodeId=startId, current=prevEdge;
  for(let guard=0;guard<state.graph.edges.length+1;guard++){
   const links=inlineLinks(nodeId);
   if(links.length!==2||links.some(l=>l.edge.kind==='reducer'))break;
   const next=links.find(l=>l.edge.id!==current.id);
   if(!next||included.has(next.edge.id))break;
   const oldOther=current.a===nodeId?current.b:current.a;
   const vOld=sub(getNode(oldOther).p,getNode(nodeId).p),vNew=sub(getNode(next.other).p,getNode(nodeId).p);
   if(Math.abs(angle(vOld,vNew)-180)>.8)break;
   included.add(next.edge.id);ids.add(next.other);nodeId=next.other;current=next.edge;
  }
 };
 walk(edge.a,edge);walk(edge.b,edge);
 const edges=[...included].map(id=>state.graph.edges.find(e=>e.id===id));
 // T y bifurcaciones son puntos fijos; los extremos libres y codos sí se trasladan.
 const movable=new Set([...ids].filter(id=>inlineLinks(id).length<=2));
 return {kind:'run',edgeIds:[...included],nodeIds:[...movable],highlight:new Set(edges.map(e=>'E'+e.id))};
}
function accessoryMove(item){
 const n=Number(item.slice(1));
 if(item.startsWith('N')){
  const fit=classify().fittings.find(f=>f.node===n);
  if(!fit||!['elbow','bend'].includes(fit.kind))return {error:'Este accesorio no se puede mover individualmente.'};
  const links=inlineLinks(n);
  if(links.some(l=>l.edge.kind==='reducer'||inlineLinks(l.other).length>=3))return {error:'Accesorio unido a una T o reducción. Seleccione otro elemento.'};
  return {kind:'fitting',nodeIds:[n],highlight:new Set([item])};
 }
 if(item.startsWith('R')){
  const e=state.graph.edges.find(e=>e.id===n&&e.kind==='reducer');
  if(!e)return {error:'Reducción no encontrada.'};
  const adj=adjacency();
  for(const id of [e.a,e.b])for(const l of adj.get(id)||[]){
   if(l.edge.id!==e.id&&adj.get(l.other)?.length>=3)return{error:'La reducción está unida a una T. Movimiento bloqueado.'};
  }
  return {kind:'reducer',nodeIds:[e.a,e.b],highlight:new Set([item])};
 }
 return {error:'Seleccione un tubo, codo o reducción para mover.'};
}

/* 04D bis. Ruta desde T hasta extremo libre; sin arrastrar otras ramas. */
function teeFreeBranch(seedId){
 const adj=adjacency(),pipe=state.graph.edges.find(e=>e.id===seedId);
 if(!pipe||pipe.kind==='reducer')return null;
 const options=[];
 for(const [teeId,links] of adj){if(links.length!==3)continue;
  for(const start of links){
   const path=[teeId],edges=[],visited=new Set([teeId]);
   let nodeId=teeId,cur=start;
   while(cur&&edges.length<=state.graph.edges.length){
    edges.push(cur.edge.id);nodeId=cur.other;if(visited.has(nodeId))break;
    path.push(nodeId);visited.add(nodeId);
    const other=adj.get(nodeId)||[];
    if(other.length!==2)break;
    cur=other.find(l=>l.edge.id!==edges[edges.length-1]);
   }
   const last=adj.get(nodeId)||[];
   if(last.length===1&&edges.includes(seedId))options.push({anchor:teeId,path,edges});
  }
 }
 if(!options.length)return null;
 options.sort((a,b)=>a.edges.length-b.edges.length);
 const b=options[0];
 return {kind:'branch',anchor:b.anchor,path:b.path,edgeIds:b.edges,nodeIds:b.path.slice(1),highlight:new Set(b.edges.map(id=>(state.graph.edges.find(e=>e.id===id)?.kind==='reducer'?'R':'E')+id))};
}
function branchMovableOnAxis(target,axis,original){
 if(!target||target.kind!=='branch')return target?.nodeIds||[];
 const pById=new Map(original.nodes.map(n=>[n.id,n.p])),ax=axis.dir;
 for(let i=0;i<target.path.length-1;i++){
  const a=pById.get(target.path[i]),b=pById.get(target.path[i+1]);if(!a||!b)continue;
  const v=sub(b,a),l=norm(v),dotLen=Math.abs(dot(v,ax));
  // Debe existir al menos un tramo alineado al eje solicitado; lo demás se mueve rígidamente.
  if(l>1&&Math.abs(l-dotLen)<1e-3)return target.path.slice(i+1);
 }
 return [];
}

function moveSupportSelection(token){
 const sp=supportByToken(token);if(!sp){message('Soporte no encontrado.');return}
 state.move.target={kind:'support',supportId:sp.id,nodeIds:[],highlight:new Set([token])};
 state.move.baseline=modelCopy();state.selection=new Set([token]);state.move.valid=true;
 render();message('Soporte: mantenga pulsado su símbolo y deslícelo por el tubo; suelte en otra T o codo para reubicarlo.');
}
function moveSelect(item){
 if(supportByToken(item)){moveSupportSelection(item);return}

 let candidate=item?.startsWith('E')?(teeFreeBranch(Number(item.slice(1)))||straightRun(Number(item.slice(1)))):accessoryMove(item||'');
 if(!candidate||candidate.error||!candidate.nodeIds?.length){message(candidate?.error||'No se pudo definir el segmento.');return}
 state.move.target=candidate;state.move.axis=null;state.move.drag=null;state.move.baseline=modelCopy();state.move.valid=true;
 state.selection=new Set(candidate.highlight);
 render();message(candidate.kind==='branch'?`Ramal hasta extremo libre: ${candidate.edgeIds.length} elemento(s). Elija X o Y.`:candidate.kind==='run'?`Tramo recto: ${candidate.edgeIds.length} tubo(s). Elija un eje.`:'Accesorio seleccionado. Elija un eje.');
}
function moveCenter(){
 const t=state.move.target;if(!t)return null;
 const points=t.nodeIds.map(id=>getNode(id)?.p).filter(Boolean);
 if(!points.length)return null;
 return points.reduce((a,p)=>add(a,p),[0,0,0]).map(v=>v/points.length);
}
function moveAxes(){return state.plane==='XY'?
 [{key:'x',label:'X',dir:[1,0,0],color:'#d94e4d'}, {key:'y',label:'Y',dir:[0,1,0],color:'#258f63'}]:
 [{key:'zp',label:'+Z',dir:[0,0,1],color:'#327bd5'}, {key:'zn',label:'−Z',dir:[0,0,-1],color:'#327bd5'}]}
function moveButtons(){
 const center=moveCenter();if(!center)return[];
 const origin=project(center);const zoom=state.view.k||1;
 // Ubicación constante en píxeles aun con zoom del área de trabajo.
 const sep=49/zoom;
 return moveAxes().map(axis=>{
  const d=project(add(center,mul(axis.dir,36))),start=project(center),vx=d.x-start.x,vy=d.y-start.y,m=Math.hypot(vx,vy)||1;
  return {...axis, pos:{x:origin.x+sep*vx/m,y:origin.y+sep*vy/m},origin,rad:17/zoom};
 });
}
function moveAxisHit(x,y){
 if(!state.move.enabled||!state.move.target)return null;
 const p=fromScreen(x,y);
 return moveButtons().find(b=>Math.hypot(p.x-b.pos.x,p.y-b.pos.y)<b.rad*1.65)||null;
}
function renderMoveGizmo(){
 if(!state.move.enabled||!state.move.target||state.move.target.kind==='support'){moveLayer.innerHTML='';return}
 const center=moveCenter(),p=project(center),axisBtns=moveButtons();
 const z=state.view.k||1;
 let svg=`<g pointer-events="none"><circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(5/z)}" fill="#fff" stroke="#087f8c" stroke-width="${f(2/z)}"/>`;
 for(const b of axisBtns){
  const active=state.move.axis===b.key;
  svg+=`<path d="M${xyz(p)}L${xyz(b.pos)}" stroke="${b.color}" stroke-width="${f((active?3:2.1)/z)}" stroke-dasharray="${f(5/z)} ${f(3/z)}"/>`;
  svg+=`<circle cx="${f(b.pos.x)}" cy="${f(b.pos.y)}" r="${f(18/z)}" fill="${active?'#e6faf9':'white'}" stroke="${b.color}" stroke-width="${f((active?3:2)/z)}"/>`;
  svg+=`<text class="move-axis-label" x="${f(b.pos.x)}" y="${f(b.pos.y+4/z)}" font-size="${f(13/z)}" text-anchor="middle" fill="${b.color}" stroke-width="${f(3/z)}">${b.label}</text>`;
 }
 if(state.move.drag){svg+=`<text x="${f(p.x)}" y="${f(p.y-27/z)}" font-family="system-ui" font-size="${f(12/z)}" text-anchor="middle" fill="${state.move.valid?'#087f8c':'#c73e40'}">${state.move.valid?'DESPLAZAR':'ORIENTACIÓN NO PERMITIDA'}</text>`}
 svg+='</g>';moveLayer.innerHTML=svg;
}
function moveBeginAxis(axis,e){
 if(!axis||!state.move.target)return false;
 state.move.baseline=modelCopy();
 if(state.move.target.kind==='branch'){
   const movable=branchMovableOnAxis(state.move.target,axis,state.move.baseline);
   if(!movable.length){message(`El ramal no tiene tramo flexible paralelo a ${axis.label}. Se conserva su geometría.`);return false}
   state.move.target.nodeIds=movable;
 }
 state.move.axis=axis.key;
 state.move.drag={id:e.pointerId,x:e.clientX,y:e.clientY,axisKey:axis.key,initial:state.move.baseline,delta:0,applied:false};
 state.move.valid=true;render();return true;
}
function allowedPipeVector(v){
 if(norm(v)<5)return false;
 const components=v.filter(x=>Math.abs(x)>.001).map(Math.abs);
 return components.length<=1||(components.length===2&&Math.abs(components[0]-components[1])<=1);
}
// Si el movimiento sacaría un tramo adyacente del ángulo permitido, se arrastra
// su vértice libre, conservando la dirección y dejando los extremos de T fijos.
function stretchAdjacentLines(original,delta){
 const moved=new Set(state.move.target.nodeIds);
 const adj=adjacency();
 for(let iteration=0;iteration<state.graph.nodes.length+1;iteration++){
  let again=false;
  for(const e of state.graph.edges){
   const aMoved=moved.has(e.a),bMoved=moved.has(e.b);
   if(aMoved===bMoved)continue;
   const a=getNode(e.a).p,b=getNode(e.b).p,oldA=original.nodes.find(n=>n.id===e.a).p,oldB=original.nodes.find(n=>n.id===e.b).p;
   const originalV=sub(oldB,oldA),newV=sub(b,a);
   const invalid=e.kind==='reducer'?norm(sub(originalV,newV))>.001:!allowedPipeVector(newV);
   if(!invalid)continue;
   const other=aMoved?e.b:e.a;
   if((adj.get(other)||[]).length>=3)return false;
   const n=getNode(other);n.p=add(n.p,delta);moved.add(other);again=true;
  }
  if(!again)break;
 }
 // En caso de cierre cíclico o conexiones rígidas, no se admiten distorsiones.
 for(const e of state.graph.edges){
  const a=getNode(e.a).p,b=getNode(e.b).p,v=sub(b,a);
  if(e.kind==='reducer'){
   const oldA=original.nodes.find(n=>n.id===e.a).p,oldB=original.nodes.find(n=>n.id===e.b).p;
   if(norm(sub(v,sub(oldB,oldA)))>.001)return false;
  }else if(!allowedPipeVector(v))return false;
 }
 return true;
}
function movementValid(original,delta){
 if(state.move.target?.kind==='group'){
  for(const edge of state.graph.edges){const a=getNode(edge.a)?.p,b=getNode(edge.b)?.p;
   const oldA=original.nodes.find(n=>n.id===edge.a)?.p,oldB=original.nodes.find(n=>n.id===edge.b)?.p;
   if(!a||!b||!oldA||!oldB||norm(sub(sub(b,a),sub(oldB,oldA)))>.01)return false;
  }return true;
 }
 const moved=new Set(state.move.target?.nodeIds||[]);
 for(const e of state.graph.edges){
  const oldA=original.nodes.find(n=>n.id===e.a)?.p,oldB=original.nodes.find(n=>n.id===e.b)?.p;
  const a=getNode(e.a)?.p,b=getNode(e.b)?.p;if(!a||!b||!oldA||!oldB)return false;
  const vec=sub(b,a),old=sub(oldB,oldA);if(norm(vec)<5)return false;
  if(e.kind!=='reducer'){const originalSpan=projectedDistance(oldA,oldB),newSpan=projectedDistance(a,b);
    if(originalSpan>=MIN_LABEL_LENGTH&&newSpan<MIN_LABEL_LENGTH-.1)return false;
    if(originalSpan<MIN_LABEL_LENGTH&&newSpan<originalSpan-.1)return false;
  }
  if(e.kind==='reducer'){
   // Mantiene rigidez y orientación de la reducción. No se estira ni se inclina.
   if(norm(sub(vec,old))>.001)return false;
  }
  // Restringir todos los tubos a ejes ortogonales o diagonales de 45° en plano físico.
  if(e.kind!=='reducer'&&(moved.has(e.a)||moved.has(e.b))){
   let components=vec.filter(v=>Math.abs(v)>.001).map(v=>Math.abs(v));
   if(components.length>2)return false;
   if(components.length===2&&Math.abs(components[0]-components[1])>1)return false;
  }
 }
 // Una T mantiene sus conexiones sin cambiar su geometría de 3 bocas.
 const originalAdj=adjacency();
 for(const [nodeId,links] of originalAdj){if(links.length<3){continue}
  const center=getNode(nodeId)?.p,oldCenter=original.nodes.find(n=>n.id===nodeId)?.p;if(!center||!oldCenter)return false;
  if(norm(sub(center,oldCenter))>.001)return false;
 }
 return true;
}
function movePreview(e){
 const d=state.move.drag;if(!d)return;
 const axis=moveAxes().find(a=>a.key===d.axisKey);if(!axis)return;
 const origProj=project([0,0,0]),endProj=project(mul(axis.dir,CAT.grid));
 const vx=endProj.x-origProj.x,vy=endProj.y-origProj.y,mag=Math.hypot(vx,vy)||1;
 const px=e.clientX-d.x,py=e.clientY-d.y;
 const steps=Math.round((px*vx+py*vy)/(mag*mag*state.view.k));
 const moved=mul(axis.dir,steps*CAT.grid);
 if(steps===d.delta)return;
 d.delta=steps;
 state.graph=JSON.parse(JSON.stringify(d.initial));
 for(const n of state.graph.nodes)if(state.move.target.nodeIds.includes(n.id))n.p=add(n.p,moved);
 state.move.valid=stretchAdjacentLines(d.initial,moved)&&movementValid(d.initial,moved);
 if(!state.move.valid){state.graph=JSON.parse(JSON.stringify(d.initial));}
 render();
}
function moveCommit(){
 const d=state.move.drag;if(!d)return;
 if(!state.move.valid||!d.delta){state.graph=JSON.parse(JSON.stringify(d.initial));state.move.drag=null;render();return;}
 if(state.move.target?.kind!=='group'&&!connectedGraph()){state.graph=JSON.parse(JSON.stringify(d.initial));state.move.drag=null;render();message('El movimiento rompe el ensamble.');return;}
 const count=d.delta;state.move.drag=null;state.move.baseline=modelCopy();
 syncReducers();save();render();message(`Tramo desplazado ${Math.abs(count)} paso(s) de cuadrícula.`);
}
function moveCancel(){
 const d=state.move.drag;if(d){state.graph=JSON.parse(JSON.stringify(d.initial));state.move.drag=null;state.move.valid=true;render()}
}

function render(){const brand=$('ttWatermark');if(brand){const rr=canvas.getBoundingClientRect(),z=Math.min(1.06,Math.max(.48,rr.width/430));brand.setAttribute('transform',`translate(${f(rr.width*.5)} ${f(Math.max(117,Math.min(158,rr.height*.145)))}) scale(${f(z)})`)}const controls=$('decisions');if(state.panel&&!propertyPanel.hidden){if(controls.parentElement!==propertyPanel)propertyPanel.appendChild(controls)}else if(controls.parentElement!==$('workspace'))$('workspace').appendChild(controls);const r=canvas.getBoundingClientRect();camera.setAttribute('transform',`translate(${f(r.width/2+state.view.dx)} ${f(r.height/2+state.view.dy)}) scale(${f(state.view.k)})`);drawGrid();renderAids();renderBuried();renderScene();renderSupportReference();applyIsolationMask();renderReducerPreview();renderDraft();drawGuides();renderMarquee();renderMoveGizmo();renderCopyPreview();
 $('supportTool').classList.toggle('active',state.supportMode);$('supportTool').setAttribute('aria-pressed',String(state.supportMode));
 moveTool.classList.toggle('active',state.move.enabled);moveTool.setAttribute('aria-pressed',String(state.move.enabled));
 copyTool.classList.toggle('active',state.copy.enabled);copyTool.setAttribute('aria-pressed',String(state.copy.enabled));
 copyTool.disabled=!(state.copy.enabled||state.selection.size>0&&!state.tool&&!state.panel&&!state.reducerMode&&!state.move.enabled);
 undoTool.disabled=!history.past.length;redoTool.disabled=!history.future.length;
 deleteTool.disabled=!(state.selection.size>0&&!state.tool&&!state.panel&&!([...state.selection].every(id=>id.startsWith('W'))));colorTool.disabled=!(state.selection.size>0&&!state.tool&&!state.panel);reducerTool.classList.toggle('modeActive',state.reducerMode);reducerTool.setAttribute('aria-pressed',String(state.reducerMode));pipeTool.classList.toggle('active',state.tool);pipeTool.setAttribute('aria-pressed',String(state.tool));filterTool.classList.toggle('restricted',state.filterMode!=='none');filterTool.classList.toggle('isolated',!!state.isolation);filterTool.setAttribute('aria-pressed',String(!!state.isolation));filterTool.setAttribute('aria-label',state.isolation?'Restaurar elementos ocultos':'Filtro: seleccionar o aislar');filterTool.querySelector('span').textContent=state.isolation?'AISLADO':state.filterMode==='none'?'FILTRO':state.filterMode==='flow'?'FLUJO':state.filterMode==='diameter'?'DN':state.filterMode==='assembly'?'ENS.':'FILTRO';axisButton.classList.toggle('vertical',state.plane!=='XY');planeCaption.textContent=state.plane==='XY'?'Horizontal':'Vertical';axisButton.setAttribute('aria-label',state.plane==='XY'?'Plano horizontal XY. Tocar para cambiar a vertical':'Plano vertical Z. Tocar para cambiar a horizontal');axisButton.setAttribute('aria-pressed',String(state.plane!=='XY'));
 const hasDraft=state.draft.length>0,hasSelected=state.selection.size>0,modal=!!state.panel;
 const selectionContext=hasSelected&&!modal&&!state.tool&&!state.reducerMode&&!state.copy.enabled&&!state.move.enabled&&!state.supportMode;
 $('selectionActions').hidden=!selectionContext;
 confirmButton.disabled=modal?false:state.tool?state.draft.length<2:true;
 cancelButton.disabled=modal?false:state.reducerMode||state.supportMode?false:state.tool?!hasDraft:!state.move.enabled;
 controls.hidden=state.copy.enabled||selectionContext||(!modal&&!state.reducerMode&&!state.supportMode&&!state.move.enabled&&!state.tool)||(!modal&&confirmButton.disabled&&cancelButton.disabled);
 $('unitCaption').textContent=state.graph.project?.lengthUnit||'mm';
 if(state.copy.enabled)tip.textContent=state.copy.placement?'COPIAR · Confirme con ✓ o cambie de posición.':'COPIAR · Toque la ubicación donde desea colocar los elementos.';
 else if(modal)tip.textContent='Confirme con el ícono verde de la ventana o cancele con el rojo.';
 else if(state.supportMode)tip.textContent='SOPORTE · Toque tubo, T o codo. El TAG y la altura BOP se editan en PROPIED.';
 else if(state.move.enabled)tip.textContent=state.move.target?(state.plane==='XY'?'MOVER · Mantenga pulsado X o Y y arrastre. Rojo: cancelar.':'MOVER · Mantenga pulsado +Z o −Z y arrastre. Rojo: cancelar.'):'MOVER · Toque una tubería o un codo para seleccionar su tramo.';
 else if(state.reducerMode)tip.textContent='REDUC. · Toque un tubo o cara de reducción para elegir el nuevo diámetro. Rojo: cancelar';
 else if(state.tool){tip.textContent=hasDraft?(state.draft.length===1?'Toque otro punto. XY/XZ cambia el plano.':`${state.draft.length-1} tramo(s). Verde: terminar · Rojo: cancelar`):state.graph.edges.length?'Toque una tubería o conexión para continuar el ensamble.':'Toque el primer punto de la ruta.'}
 else tip.textContent=state.isolation?'AISLAR activo. Pulse FILTRO nuevamente para mostrar todos los elementos.':hasSelected?`${state.selection.size} seleccionado(s). Propiedades, Copiar o Mover.`:`Filtro ${filterNames[state.filterMode]} · ${state.filterAction==='isolate'?'AISLAR':'SELECCIONAR'}. Toque un elemento.`;
}

/* 05. INTERACCIÓN, SELECCIÓN Y EDICIÓN */
let toastTimer=null;
function message(m){toast.textContent=m;toast.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('visible'),1750)}
function modelCopy(){return JSON.parse(JSON.stringify(state.graph))}
function modelJSON(){return JSON.stringify(state.graph)}

/* 05E. COPIAR. Duplica subgrafos con nuevas IDs, sin unirlos automáticamente.
   Bocas de T/codos copiados sin sus tubos usan referencias de dibujo (referencePort),
   NO son cortes ni materiales cuantificados. */
function buildCopyTemplate(){
 const tokenSet=new Set(state.selection);
 const edges=state.graph.edges.filter(e=>tokenSet.has(edgeSelectionToken(e))&&!e.referencePort);
 const fits=classify().fittings.filter(f=>tokenSet.has(f.id));
 const weldOnly=[...tokenSet].some(t=>t.startsWith('W'))&&!edges.length&&!fits.length;
 if(weldOnly)return {error:'La soldadura depende de la conexión. Seleccione y copie los componentes que la forman.'};
 if(!edges.length&&!fits.length)return {error:'Seleccione al menos un tubo, una reducción, un codo o una T.'};
 const selectedIds=new Set(edges.map(e=>e.id)),nodeIds=new Set();
 const stencil=[];
 for(const e of edges){nodeIds.add(e.a);nodeIds.add(e.b)}
 for(const fit of fits){
  nodeIds.add(fit.node);
  for(const link of adjacency().get(fit.node)||[]){
   if(selectedIds.has(link.edge.id))continue;
   const center=getNode(fit.node).p,other=getNode(link.other).p,v=sub(other,center),L=norm(v);
   if(L<1)continue;
   const scale=Math.min(.28,Math.min(45,L*.4)/L);
   const stubPt=add(center,mul(v,scale));
   stencil.push({centerId:fit.node,p:stubPt,diam:link.edge.kind==='reducer'?Number(link.edge.to)||2:Number(link.edge.diam)||2,
    wall:link.edge.wall||'SCH 40',material:link.edge.material||'ACERO AL CARBÓN',service:link.edge.service||null,serviceColor:link.edge.serviceColor||null});
  }
 }
 const templateNodes=[...nodeIds].map(id=>({id,p:[...getNode(id).p]}));
 const origin=templateNodes[0].p;
 const copyFits=Object.fromEntries(fits.filter(f=>state.graph.fitServices?.[f.node]).map(f=>[f.node,state.graph.fitServices[f.node]]));
 const copyProps=Object.fromEntries(fits.filter(f=>state.graph.componentProps?.[f.id]).map(f=>[f.node,structuredClone(state.graph.componentProps[f.id])]));
 const supportCopies=(state.graph.supports||[]).filter(sp=>tokenSet.has('S'+sp.id)||sp.hostType==='edge'&&selectedIds.has(sp.hostId)||sp.hostType==='fit'&&fits.some(f=>f.node===sp.hostId)).map(sp=>structuredClone(sp));
 return {nodes:templateNodes,edges:edges.map(e=>structuredClone(e)),stubs:stencil,supportCopies,
  curved:(state.graph.curves||[]).filter(id=>nodeIds.has(id)),weldNodes:(state.graph.weldNodes||[]).filter(id=>nodeIds.has(id)),fitServices:copyFits,componentProps:copyProps,
  origin,parts:edges.length+fits.filter(f=>!edges.some(e=>e.a===f.node||e.b===f.node)).length,
  selectedEdgeIds:new Set(edges.map(e=>e.id))};
}
function cancelCopy({quiet=false}={}){
 const was=state.copy.enabled;
 state.copy={enabled:false,template:null,placement:null};
 $('copyActions').hidden=true;copyLayer.innerHTML='';
 if(was&&!quiet)message('Copia cancelada.');
}
function startCopy(){
 if(state.copy.enabled){cancelCopy();render();return}
 if(state.panel||state.draft.length||state.reducerMode){message('Termine la acción actual antes de copiar.');return}
 const onlySupports=[...state.selection].length>0&&[...state.selection].every(id=>!!supportByToken(id));
 if(onlySupports){const arr=[...state.selection].map(id=>structuredClone(supportByToken(id)));
  state.copy={enabled:true,supports:arr,supportOnly:true,template:null,placement:null};state.tool=false;state.reducerMode=false;state.draft=[];
  closeFilter();render();message(`${arr.length} soporte(s) listos. Toque un tubo, T o codo para copiar allí.`);return}
 const template=buildCopyTemplate();if(template.error){message(template.error);return}
 if(state.move.drag)moveCancel();const keep=new Set(state.selection);moveClear(false);state.selection=keep;
 state.copy={enabled:true,template,placement:null};state.tool=false;state.reducerMode=false;state.draft=[];
 closeFilter();state.filterMode='none';
 render();message(`${template.parts} elemento(s) listos. Toque una ubicación para colocar la copia.`);
}
function chooseSupportCopyTarget(x,y){
 const t=supportTargetHit(x,y);if(!t){message('Toque un tubo, una T o un codo para copiar el soporte.');return}
 if(t.hostKind==='elbow'||t.hostKind==='bend'){
  if(state.copy.supports.some(s=>s.placement==='above')){message('Sobre codos solo se permite colocar el soporte debajo.');return}
 }
 state.copy.placement={target:t,ratio:t.hostType==='edge'?supportRatioFromPoint(state.graph.edges.find(e=>e.id===t.hostId),x,y):.5};
 render();message('Destino elegido. Confirme con ✓ para crear un soporte con TAG nuevo.');
}
function confirmSupportCopy(){
 const c=state.copy;if(!c.supportOnly||!c.placement)return;
 const {target,ratio}=c.placement,arr=c.supports;ensureProject();
 for(const [index,old] of arr.entries()){
  const id=state.graph.nextSupport++;
  const r=target.hostType==='edge'?Math.max(.04,Math.min(.96,ratio+(index-(arr.length-1)/2)*.075)):.5;
  const n={...structuredClone(old),id,hostType:target.hostType,hostId:target.hostId,hostKind:target.hostKind,ratio:r,tag:nextSupportTag()};
  n.refEnd=n.ratio<=.5?'a':'b';syncSupportAfterMove(n);state.graph.supports.push(n);
 }
 c.placement=null;save();render();message(`${arr.length} soporte(s) copiados. Toque otro destino o COPIAR para salir.`);
}
function chooseCopyPosition(screen){
 if(!state.copy.enabled||!state.copy.template)return;
 const {origin}=state.copy.template;
 const raw=solveUV(screen,state.plane,origin),u=Math.round(raw[0]/CAT.grid)*CAT.grid,v=Math.round(raw[1]/CAT.grid)*CAT.grid;
 const delta=state.plane==='XY'?[u,v,0]:[u,0,v];
 if(norm(delta)<CAT.grid*.4){message('Aleje la copia de su posición original.');return}
 state.copy.placement=delta;render();message('Vista previa lista. Confirme con verde o toque otro destino.');
}
function renderCopyPreview(){
 const c=state.copy;
 if(!c.enabled){copyLayer.innerHTML='';$('copyActions').hidden=true;return}
 $('copyActions').hidden=!c.placement;
 if(!c.placement){copyLayer.innerHTML='';return}
 if(c.supportOnly){copyLayer.innerHTML='';$('copyActions').hidden=!c.placement;return}
 const delta=c.placement,m=new Map(c.template.nodes.map(n=>[n.id,add(n.p,delta)]));
 let svg='<g opacity=".83" pointer-events="none">';
 for(const e of c.template.edges){const a=project(m.get(e.a)),b=project(m.get(e.b));
  svg+=`<path d="M${xyz(a)} L${xyz(b)}" stroke="#058d9e" stroke-width="${e.kind==='reducer'?4:tubeWidth(e.diam)}" stroke-dasharray="9 6" fill="none" stroke-linecap="round"/>`;
 }
 for(const st of c.template.stubs){const a=project(m.get(st.centerId)),b=project(add(st.p,delta));svg+=`<path d="M${xyz(a)} L${xyz(b)}" stroke="#058d9e" stroke-width="2.5" stroke-dasharray="4 5" fill="none"/>`}
 svg+='</g>';copyLayer.innerHTML=svg;
}
function copyOverlap(){
 const c=state.copy;if(!c.template||!c.placement)return false;
 const dx=c.placement;
 const segments=[...c.template.edges.map(e=>({a:c.template.nodes.find(n=>n.id===e.a).p,b:c.template.nodes.find(n=>n.id===e.b).p})),
 ...c.template.stubs.map(st=>({a:c.template.nodes.find(n=>n.id===st.centerId).p,b:st.p}))];
 return segments.some(seg=>state.graph.edges.some(e=>{
  const a=getNode(e.a)?.p,b=getNode(e.b)?.p;if(!a||!b)return false;
  const p=add(seg.a,dx),q=add(seg.b,dx);
  return (dist(a,p)<1&&dist(b,q)<1)||(dist(b,p)<1&&dist(a,q)<1);
 }));
}
function confirmCopy(){
 const c=state.copy;if(c.supportOnly){confirmSupportCopy();return}if(!c.enabled||!c.placement)return;
 if(copyOverlap()){message('Ya existe un elemento en esta posición. Elija otro destino.');return;}
 const t=c.template,d=c.placement,created=[],map=new Map(),edgeMap=new Map();
 for(const n of t.nodes){const id=state.graph.nextNode++;map.set(n.id,id);state.graph.nodes.push({id,p:add(n.p,d)});created.push(id)}
 const cutTags=new Set();
 for(const e of t.edges){
  const cl=structuredClone(e);cl.id=state.graph.nextEdge++;edgeMap.set(e.id,cl.id);cl.a=map.get(e.a);cl.b=map.get(e.b);
  // Copias nuevas siempre reciben identificaciones de corte distintas.
  if(cl.kind!=='reducer'){cl.tag='';cutTags.add(cl.id)}
  if(Array.isArray(cl.axisOffsetXYZ))cl.axisOffsetXYZ=[...cl.axisOffsetXYZ];
  state.graph.edges.push(cl);
 }
 for(const st of t.stubs){const tip=state.graph.nextNode++,edgeId=state.graph.nextEdge++;
  state.graph.nodes.push({id:tip,p:add(st.p,d)});
  state.graph.edges.push({id:edgeId,a:map.get(st.centerId),b:tip,kind:'pipe',diam:st.diam,wall:st.wall,
    material:st.material,service:st.service,serviceColor:st.serviceColor,referencePort:true,flowMode:'none',tag:''});
 }
 state.graph.curves||=[];for(const id of t.curved)if(map.has(id))state.graph.curves.push(map.get(id));
 state.graph.weldNodes||=[];for(const id of t.weldNodes)if(map.has(id))state.graph.weldNodes.push(map.get(id));
 state.graph.fitServices||={};for(const [id,key] of Object.entries(t.fitServices))if(map.has(Number(id)))state.graph.fitServices[map.get(Number(id))]=key;
 state.graph.componentProps||={};for(const [id,props] of Object.entries(t.componentProps||{}))if(map.has(Number(id)))state.graph.componentProps['N'+map.get(Number(id))]=structuredClone(props);
 for(const sp of t.supportCopies||[]){const host=sp.hostType==='edge'?edgeMap.get(sp.hostId):map.get(sp.hostId);if(!host)continue;
  const item={...structuredClone(sp),id:state.graph.nextSupport++,hostId:host,tag:nextSupportTag()};state.graph.supports.push(item)}
 state.graph.detachedNodes||=[];state.graph.detachedNodes.push(created[0]);
 ensureEdgeMetadata();syncReducers();save();
 c.placement=null;render();message('Copia creada. Toque otra ubicación para repetir, o pulse COPIAR para salir.');
}

function resetInteractionAfterHistory(){cancelCopy({quiet:true});moveClear(false);state.panel=null;propertyPanel.hidden=true;propertyPanel.classList.remove('reducer-dialog');state.supportMode=false;state.reducerMode=false;state.reducerChoice=null;state.draft=[];state.tool=false;state.selection.clear();state.cursor=null;state.filterMode='none';closeFilter()}
function save(){try{
 adjustEccentricAxes();
 ensureEdgeMetadata();const now=modelJSON();
 if(history.current===null)history.current=now;
 if(now!==history.current){history.past.push(JSON.parse(history.current));if(history.past.length>history.limit)history.past.shift();history.future=[];history.current=now;}
 localStorage.setItem(CAT.storageKey,JSON.stringify({graph:state.graph,plane:state.plane,view:state.view,aidsVisible:state.aidsVisible,aidLabels:state.aidLabels,aidOverrides:state.aidOverrides,reducerLast:state.reducerLast,reducerSetupView:state.reducerSetupView,undo:history.past,redo:history.future}));
} catch(e){console.warn('No se pudo guardar:',e.message)}}
function restore(){try{const raw=localStorage.getItem(CAT.storageKey)||localStorage.getItem('tubitrazo_v31')||localStorage.getItem('tubitrazo_v30')||localStorage.getItem('tubitrazo_v29')||localStorage.getItem('tubitrazo_v28')||localStorage.getItem('tubitrazo_v27')||localStorage.getItem('tubitrazo_v26')||localStorage.getItem('tubitrazo_v24')||localStorage.getItem('tubitrazo_v23')||localStorage.getItem('tubitrazo_v21')||localStorage.getItem('tubitrazo_v20')||localStorage.getItem('tubitrazo_v17')||localStorage.getItem('tubitrazo_v16')||localStorage.getItem('tubitrazo_v15')||localStorage.getItem('tubitrazo_v14')||localStorage.getItem('tubitrazo_v13')||localStorage.getItem('tubitrazo_v12')||localStorage.getItem('tubitrazo_v11');const data=JSON.parse(raw||'null');if(!data){history.current=modelJSON();return}if(data.graph?.nodes&&data.graph?.edges)state.graph=data.graph;syncReducers();state.graph.curves||=[];
 if(['XY','XZ'].includes(data.plane))state.plane=data.plane;if(data.view)state.view=data.view;
 if(typeof data.aidsVisible==='boolean')state.aidsVisible=data.aidsVisible;
 if(data.aidLabels)state.aidLabels={...state.aidLabels,...data.aidLabels};if(data.aidOverrides)state.aidOverrides=data.aidOverrides;
 if(data.reducerLast)state.reducerLast=data.reducerLast;if(data.reducerSetupView)state.reducerSetupView=data.reducerSetupView;
 ensureEdgeMetadata();history.current=modelJSON();history.past=Array.isArray(data.undo)?data.undo.slice(-20):[];history.future=Array.isArray(data.redo)?data.redo.slice(-20):[];
 }catch(e){console.warn('No se pudo restaurar:',e.message);history.current=modelJSON()}}
function undoAction(){if(!history.past.length)return;history.future.push(modelCopy());if(history.future.length>20)history.future.shift();state.graph=history.past.pop();ensureEdgeMetadata();history.current=modelJSON();resetInteractionAfterHistory();save();render();message('Deshacer · '+history.past.length+' operaciones anteriores')}
function redoAction(){if(!history.future.length)return;history.past.push(modelCopy());if(history.past.length>20)history.past.shift();state.graph=history.future.pop();ensureEdgeMetadata();history.current=modelJSON();resetInteractionAfterHistory();save();render();message('Rehacer')}
function changePlane(pl){if(state.copy.enabled)cancelCopy({quiet:true});if(state.move.drag)moveCancel();state.move.axis=null;state.plane=pl;state.cursor=null;planeChoices.classList.remove('open');axisButton.setAttribute('aria-expanded','false');closeFilter();closeAidMenu();save();render()}
function startTube(){if(state.panel)return;state.supportMode=false;cancelCopy({quiet:true});moveClear(false);state.reducerChoice=null;state.reducerMode=false;state.filterMode='none';closeFilter();closeAidMenu();state.tool=!state.tool;if(state.tool&&state.isolation){state.isolation=null;state.filterAction='select'}if(!state.tool&&state.draft.length){state.draft=[];message('Borrador cancelado')}state.cursor=null;state.selection.clear();render()}

/* 05A. FILTROS · seleccionar o aislar mediante un toque. */
function isolationVisible(token){return !state.isolation || state.isolation.tokens.has(token)}
function applyIsolationMask(){
 const allowed=state.isolation?.tokens;
 for(const element of sceneLayer.querySelectorAll('[data-item],[data-weld]')){
  const token=element.getAttribute('data-item')||element.getAttribute('data-weld');
  element.style.display=!allowed||allowed.has(token)?'':'none';
 }
}
function showAllElements(){
 state.isolation=null;state.filterAction='select';state.filterMode='none';state.filterValue=null;state.flowSeed=null;
 state.selection.clear();closeFilter();render();message('Todos los elementos están visibles.');
}
function filterDefaultMarkup(){
 const isolate=state.filterAction==='isolate';
 const head=`<div class="filter-action-header">ACCIÓN DEL FILTRO</div>
  <div class="filter-actions" role="group" aria-label="Acción del filtro">
   <button type="button" data-filter-action="select" class="${!isolate?'active':''}" aria-pressed="${!isolate}">✓ Seleccionar</button>
   <button type="button" data-filter-action="isolate" class="${isolate?'active':''}" aria-pressed="${isolate}">◉ Aislar</button>
  </div><div class="filter-action-explain">${isolate?'Toque un elemento. Se ocultará el resto sin borrar nada.':'Toque un elemento. Se seleccionará lo que cumpla la condición.'}</div>`;
 const options=[
 ['none','Sin filtro','Selección libre de elementos'],
 ['assembly','Ensamble','Solo los componentes conectados al elemento tocado'],
 ['diameter','Diámetro','Elementos del mismo diámetro nominal'],
 ['material','Material','Elementos del mismo material'],
 ['line','Número de línea','Misma referencia de línea de las propiedades'],
 ['flow','Flujo','Continuidad hasta una bifurcación']
 ];
 return head+options.map(([code,title,desc])=>`<button type="button" class="filterOption ${state.filterMode===code?'active':''}" data-filter="${code}"><strong>${title}${state.filterMode===code?' ✓':''}</strong><small>${desc}</small></button>`).join('');
}
function closeFilter(){filterMenu.classList.remove('open');filterTool.classList.remove('active');filterTool.setAttribute('aria-expanded','false');filterMenu.innerHTML=filterDefaultMarkup()}
function openFilter(){filterMenu.innerHTML=filterDefaultMarkup();filterMenu.classList.add('open');filterTool.classList.add('active');filterTool.setAttribute('aria-expanded','true')}
function setFilterMode(mode){
 state.supportMode=false;state.isolation=null;state.reducerMode=false;state.filterMode=mode;state.filterValue=null;state.flowSeed=null;state.tool=false;state.draft=[];state.cursor=null;state.selection.clear();
 closeFilter();render();message(mode==='none'?'Selección libre':`Filtro ${filterNames[mode]} · ${state.filterAction==='isolate'?'Aislar':'Seleccionar'}. Toque un elemento.`);
}
const filterNames={none:'libre',assembly:'ensamble',diameter:'diámetro',material:'material',line:'número de línea',tag:'identificador',flow:'flujo'};
function groupConnectedTo(token){
 // La identidad de ensamble se establece por conexiones reales (nodos compartidos),
 // nunca por proximidad visual, color, material ni un antiguo identificador común.
 const seedEdge=itemEdge(token),seedFit=classify().fittings.find(f=>f.id===token),seedWeld=weldRecords().find(w=>w.id===token);
 const roots=[];
 if(seedEdge)roots.push(seedEdge.a,seedEdge.b);
 else if(seedFit)roots.push(seedFit.node);
 else if(seedWeld)roots.push(seedWeld.node);
 else if(supportByToken(token)){const sp=supportByToken(token);if(sp.hostType==='fit')roots.push(sp.hostId);else{const e=state.graph.edges.find(e=>e.id===sp.hostId);if(e)roots.push(e.a,e.b)}}
 else return new Set();
 const adj=adjacency(),visitedNodes=new Set(),visitedEdges=new Set(),pending=[...roots];
 while(pending.length){const id=pending.pop();if(visitedNodes.has(id))continue;visitedNodes.add(id);
  for(const link of adj.get(id)||[]){visitedEdges.add(link.edge.id);if(!visitedNodes.has(link.other))pending.push(link.other)}
 }
 const out=new Set();
 for(const e of state.graph.edges)if(visitedEdges.has(e.id))out.add(edgeSelectionToken(e));
 for(const fit of classify().fittings)if(visitedNodes.has(fit.node))out.add(fit.id);
 for(const w of weldRecords())if(visitedNodes.has(w.node)&&(!w.part||visitedEdges.has(w.part)))out.add(w.id);
 for(const sp of state.graph.supports||[])if(sp.hostType==='edge'?visitedEdges.has(sp.hostId):visitedNodes.has(sp.hostId))out.add('S'+sp.id);
 return out;
}
function keepAssociatedFittings(tokens){
 // Añade las uniones visibles vinculadas al material o DN, sin mostrar tubos de otros grupos.
 const matchingEdges=new Set([...tokens].filter(t=>/^[ER]\d+$/.test(t)).map(t=>Number(t.slice(1))));
 const info=classify();
 for(const fit of info.fittings){const links=info.adj.get(fit.node)||[];
  if(links.length&&links.some(l=>matchingEdges.has(l.edge.id)))tokens.add(fit.id);
 }
 for(const w of weldRecords())if(matchingEdges.has(w.part))tokens.add(w.id);
 return tokens;
}
function itemEdge(token){return /^[ER]\d+$/.test(token||'')?state.graph.edges.find(e=>e.id===Number(token.slice(1))):null}
function expandFlow(seedId){
 // Se atraviesan uniones de grado dos, incluso codos y reductores; nunca una bifurcación.
 const adj=adjacency(),edgeById=new Map(state.graph.edges.map(e=>[e.id,e]));
 const result=new Set(),stack=[seedId];
 while(stack.length){const id=stack.pop(),edge=edgeById.get(id);if(!edge||result.has(id))continue;
 result.add(id);
 for(const node of [edge.a,edge.b]){
  const connections=adj.get(node)||[];
  if(connections.length!==2)continue;
  for(const link of connections)if(!result.has(link.edge.id))stack.push(link.edge.id);
 }
 }
 return result;
}
function edgeSelectionToken(edge){return (edge.kind==='reducer'?'R':'E')+edge.id}

/* 04F · Soportes: entidades separadas unidas a una boca, T o codo.
   BOP y TAG son datos reales editables; el símbolo es esquemático. */
function supportByToken(token){return /^S\d+$/.test(token||'')?(state.graph.supports||[]).find(s=>'S'+s.id===token):null}
/* Soporte: referencia física A/B, distancia editable y posición proporcional.
   Nunca se deduce una longitud real a partir del dibujo sin escala. */
function supportEdge(sp){return sp.hostType==='edge'?state.graph.edges.find(e=>e.id===sp.hostId&&!e.referencePort):null}
function supportRef(sp){return sp.refEnd==='a'||sp.refEnd==='b'?sp.refEnd:((sp.ratio??.5)<=.5?'a':'b')}
function supportRealSpan(sp){const e=supportEdge(sp);return Number.isFinite(e?.realLength)&&e.realLength>0?e.realLength:null}
function supportPhysicalDistance(sp){const len=supportRealSpan(sp);if(Number.isFinite(sp.distanceFromRef))return sp.distanceFromRef;if(len===null)return null;return f((supportRef(sp)==='a'?(sp.ratio??.5):1-(sp.ratio??.5))*len)}
function syncSupportAfterMove(sp){const len=supportRealSpan(sp);sp.refEnd=supportRef(sp);sp.distanceFromRef=len===null?null:f((sp.refEnd==='a'?(sp.ratio??.5):1-(sp.ratio??.5))*len)}
function updateSupportRatioFromLength(sp){const span=supportRealSpan(sp);if(span===null||!Number.isFinite(sp.distanceFromRef))return;sp.ratio=Math.max(.001,Math.min(.999,sp.refEnd==='b'?1-sp.distanceFromRef/span:sp.distanceFromRef/span))}
function renderSupportReference(){const layer=$('supportReferenceLayer');if(!layer)return;const panel=state.panel;
 if(!panel||panel.mode!=='supportProps'){layer.innerHTML='';return}
 const sp=(state.graph.supports||[]).find(s=>s.id===panel.supportId),e=sp&&supportEdge(sp);if(!sp||!e){layer.innerHTML='';return}
 const liveRef=$('spRef')?.value||supportRef(sp),n=getNode(liveRef==='a'?e.a:e.b),q=supportDrawingPoint(sp);if(!n||!q){layer.innerHTML='';return}
 const o=project(n.p),tip=q.host;const color='#ec8a18',r=14/Math.max(.7,state.view.k);
 layer.innerHTML=`<g pointer-events="none"><path d="M${xyz(o)} L${xyz(tip)}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="6 4"/><circle cx="${f(o.x)}" cy="${f(o.y)}" r="${f(r)}" fill="#fff8dd" stroke="${color}" stroke-width="3"/><text x="${f(o.x)}" y="${f(o.y-r-8)}" text-anchor="middle" font-size="12" font-weight="800" fill="#975000">ORIGEN ${liveRef.toUpperCase()}</text></g>`;
}
function supportHost(sp){
 if(sp.hostType==='edge'){
  const edge=state.graph.edges.find(e=>e.id===sp.hostId&&!e.referencePort);if(!edge)return null;
  const a=getNode(edge.a),b=getNode(edge.b);if(!a||!b)return null;
  return {kind:'pipe',p:add(a.p,mul(sub(b.p,a.p),sp.ratio??.5)),edge};
 }
 const fit=classify().fittings.find(f=>f.node===sp.hostId);
 if(!fit||!['tee','elbow','bend'].includes(fit.kind))return null;
 return {kind:fit.kind,p:getNode(fit.node).p,fit};
}
function supportDrawingPoint(sp){const h=supportHost(sp);if(!h)return null;const center=project(h.p),side=sp.placement==='above'?-1:1;
 return {host:center,base:{x:center.x,y:center.y+side*27},sign:side};}
function nextSupportTag(){const used=new Set((state.graph.supports||[]).map(s=>s.tag));let i=1;while(used.has('SUP-'+String(i).padStart(3,'0')))i++;return 'SUP-'+String(i).padStart(3,'0')}
function supportMarkup(){const result=[],occupied=[...renderLabelBoxes];for(const s of state.graph.supports||[]){const token='S'+s.id,geo=supportDrawingPoint(s);if(!geo||!isolationVisible(token))continue;
 const {host:p,base:q,sign}=geo,col='#802b30',sel=state.selection.has(token);const cube=s.kind==='concrete';
 const body=cube?`<path class="support-body" d="M${f(q.x-13)} ${f(q.y-8*sign)}h26v${f(17*sign)}h-26Z" fill="#802b30" fill-opacity=".2" stroke="${col}" stroke-width="2.1"/>`:
 `<path class="support-body" d="M${f(q.x-15)} ${f(q.y)}h30 M${f(q.x)} ${f(q.y-8*sign)}v${f(15*sign)} M${f(q.x-9)} ${f(q.y+10*sign)}h18" fill="none" stroke="${col}" stroke-width="3.2"/>`;
 const host=supportHost(s),e=host?.edge;let refMark='',dir={x:1,y:0},labelCenter={x:q.x+22,y:q.y+sign*28};
 if(e){const pa=project(getNode(e.a).p),pb=project(getNode(e.b).p),x=pb.x-pa.x,y=pb.y-pa.y,len=Math.hypot(x,y)||1;dir={x:x/len,y:y/len};const origin=project(getNode((s.refEnd||'a')==='b'?e.b:e.a).p);const tp={x:p.x+(origin.x-p.x)*.22,y:p.y+(origin.y-p.y)*.22};refMark=`<circle cx="${f(origin.x)}" cy="${f(origin.y)}" r="3.7" fill="${col}"/><path d="M${xyz(p)} L${xyz(tp)}" stroke="${col}" stroke-dasharray="4 3" stroke-width="1.7" fill="none"/>`;
 labelCenter={x:q.x+dir.y*sign*28,y:q.y-dir.x*sign*28};}
 else if(host?.fit){const links=classify().adj.get(host.fit.node)||[];if(links.length){const pt=project(getNode(links[0].other).p);const x=pt.x-p.x,y=pt.y-p.y,l=Math.hypot(x,y)||1;dir={x:x/l,y:y/l}}}
 let rot=Math.atan2(dir.y,dir.x)*180/Math.PI;if(rot>90||rot< -90)rot+=180;
 const str=`${s.tag}${Number.isFinite(s.distanceFromRef)?' · '+lengthString(s.distanceFromRef)+' / '+String(s.refEnd||'a').toUpperCase():''}`;
 if(e){const nx=-dir.y,ny=dir.x,center=q;let best=null;for(const side of [-1,1])for(const offset of [28,42,59,78])for(const along of [0,-20,20]){const pos={x:center.x+nx*offset*side+dir.x*along,y:center.y+ny*offset*side+dir.y*along};const box=rec(pos.x,pos.y,Math.max(60,str.length*6.1),16,rot);const overlaps=occupied.reduce((v,other)=>v+(satOverlap(box,other,3)?1:0),0);const score=overlaps*10000+offset*.5+Math.abs(along)*.15+(side===sign?0:4);if(!best||score<best.score)best={pos,box,score}}if(best){labelCenter=best.pos;occupied.push(best.box)}}
 result.push(`<g class="support-entry ${sel?'selected':''}" data-item="${token}"><path class="support-body" d="M${xyz(p)} L${xyz(q)}" stroke="${col}" stroke-width="2.4" fill="none"/><circle cx="${f(p.x)}" cy="${f(p.y)}" r="3.3" fill="${col}"/>${body}${refMark}<text class="support-tag" transform="translate(${f(labelCenter.x)} ${f(labelCenter.y)}) rotate(${f(rot)})" text-anchor="middle">${escaped(str)}</text><circle cx="${f(q.x)}" cy="${f(q.y)}" r="21" fill="transparent" stroke="${sel?'#11a8ca':'none'}" stroke-width="1.5"/></g>`);
 }return result.join('')}
function supportTargetHit(x,y){const token=selectHit(x,y);if(!token)return null;
 const e=itemEdge(token),fit=classify().fittings.find(f=>f.id===token);
 if(e&&e.kind==='pipe'&&!e.referencePort)return {hostType:'edge',hostId:e.id,hostKind:'pipe'};
 if(fit&&['tee','elbow','bend'].includes(fit.kind))return {hostType:'fit',hostId:fit.node,hostKind:fit.kind};
 return null;
}
function supportToolToggle(){if(state.panel)return;
 if(state.supportMode){state.supportMode=false;render();message('Inserción de soportes desactivada.');return}
 state.tool=false;state.reducerMode=false;state.draft=[];state.selection.clear();state.move.enabled=false;cancelCopy({quiet:true});state.filterMode='none';closeFilter();
 state.panel={mode:'supportSetup'};panelTitle.textContent='Insertar soporte';
 panelBody.innerHTML=`<div class="support-properties">
 ${propSelect('supportKind','Símbolo',[['cross','Metálico · poste y cruceta'],['concrete','Dado de concreto']],state.supportChoice.kind)}
 ${propSelect('supportPlacement','Ubicación',[['below','Debajo'],['above','Encima']],state.supportChoice.placement)}
 <div class="full prop-note">Encima o debajo de tubos y T; debajo de codos. Después de confirmar, toque el elemento que llevará el soporte.</div></div>`;
 propertyPanel.hidden=false;render();
}
function supportRatioFromPoint(edge,x,y){const p=fromScreen(x,y),a=project(getNode(edge.a).p),b=project(getNode(edge.b).p),v={x:b.x-a.x,y:b.y-a.y},den=v.x*v.x+v.y*v.y;
 return den<.0001?.5:Math.max(.04,Math.min(.96,((p.x-a.x)*v.x+(p.y-a.y)*v.y)/den));}
function placeSupportFromTap(x,y){const found=supportTargetHit(x,y);if(!found){message('Toque un tubo, T o codo para colocar el soporte.');return}
 if((found.hostKind==='elbow'||found.hostKind==='bend')&&state.supportChoice.placement==='above'){message('Los soportes de codo solo se insertan debajo.');return}
 ensureProject();const id=state.graph.nextSupport++,support={id,...found,kind:state.supportChoice.kind,placement:state.supportChoice.placement,tag:nextSupportTag(),bop:null,ratio:found.hostType==='edge'?supportRatioFromPoint(state.graph.edges.find(e=>e.id===found.hostId),x,y):.5};
 support.refEnd=support.ratio<=.5?'a':'b';syncSupportAfterMove(support);
 state.graph.supports.push(support);save();render();message(`Soporte ${support.tag} insertado. Toque PROPIED. para asignar su altura al BOP.`);
}
function showSupportProperties(){const s=supportByToken([...state.selection][0]);if(!s)return;
 closeFilter();state.panel={mode:'supportProps',supportId:s.id};panelTitle.textContent='Soporte';
 panelBody.innerHTML=`<p class="panelhint">Soporte ${s.kind==='concrete'?'dado de concreto':'metálico'} · ${s.placement==='above'?'Sobre':'Bajo'} el elemento. TAG independiente de la línea.</p>
 <div class="support-properties"><div>${propertyField('spTag','TAG del soporte',s.tag)}</div>
 <div>${propertyField('spBop','Altura al BOP ('+state.graph.project.lengthUnit+')',s.bop??'','number','step="any" inputmode="decimal" placeholder="Por definir"')}</div>
 ${s.hostType==='edge'?`${propSelect('spRef','Origen de medición',[['a','Extremo A'],['b','Extremo B']],supportRef(s))}<div>${propertyField('spDistance','Distancia desde el origen ('+state.graph.project.lengthUnit+')',supportPhysicalDistance(s)??'','number','min="0" step="any" inputmode="decimal" placeholder="Pendiente"')}</div>`:'<div class="full prop-note">En T y codos, la ubicación del soporte es su centro. La distancia desde extremos solo corresponde a tubos.</div>'}
 <div class="full prop-note">El origen resaltado en naranja es el extremo utilizado como referencia. Si no existe longitud real del tubo, la distancia se conserva sin calcular una posición física.</div></div>`;
 propertyPanel.hidden=false;decoratePropertiesHeader('item');render();$('spTag')?.focus({preventScroll:true});$('spTag')?.select();
 $('spRef')?.addEventListener('change',()=>{const span=supportRealSpan(s),ref=$('spRef').value;const x=span===null?null:f((ref==='a'?(s.ratio??.5):1-(s.ratio??.5))*span);$('spDistance').value=x??'';renderSupportReference()});
 $('spDistance')?.addEventListener('focus',renderSupportReference);
}
function applySupportProperties(){const s=(state.graph.supports||[]).find(s=>s.id===state.panel.supportId);if(!s)return false;
 const tag=$('spTag')?.value.trim(),raw=$('spBop')?.value.trim();
 if(!tag){message('El TAG del soporte es obligatorio.');return false}
 if(state.graph.supports.some(o=>o.id!==s.id&&o.tag.toUpperCase()===tag.toUpperCase())){message('El TAG de soporte debe ser único.');return false}
 if(raw!==''&&!Number.isFinite(Number(raw))){message('Altura al BOP inválida.');return false}
 if(s.hostType==='edge'){
  const span=supportRealSpan(s),ref=$('spRef')?.value||supportRef(s),rawDist=$('spDistance')?.value.trim()||'';
  if(rawDist!==''&&(!Number.isFinite(Number(rawDist))||Number(rawDist)<0)){message('La distancia debe ser positiva o cero.');return false}
  if(rawDist!==''&&span!==null&&Number(rawDist)>span){message('La distancia no puede superar la longitud real del tubo.');return false}
  s.refEnd=ref;s.distanceFromRef=rawDist===''?null:Number(rawDist);
  if(span!==null&&s.distanceFromRef!==null)updateSupportRatioFromLength(s);
 }
 s.tag=tag;s.bop=raw===''?null:Number(raw);return true;
}
function lineForToken(token){ensureProject();const edge=itemEdge(token);if(edge)return String(edge.lineId||state.graph.project.lineId||'').trim();
 const support=supportByToken(token);if(support)return lineForToken(support.hostType==='edge'?'E'+support.hostId:'N'+support.hostId);
 const w=weldRecords().find(w=>w.id===token);if(w){if(componentProps(token).lineId)return componentProps(token).lineId;const e=state.graph.edges.find(e=>e.id===w.part)||adjacency().get(w.node)?.[0]?.edge;return String(e?.lineId||state.graph.project.lineId||'').trim()}
 const fit=classify().fittings.find(f=>f.id===token);if(fit){const meta=componentProps(token);const link=(adjacency().get(fit.node)||[]).find(l=>!l.edge.referencePort);return String(meta.lineId||link?.edge.lineId||state.graph.project.lineId||'').trim()}
 return '';
}

/* FLUJO. Estados: sin flujo, directo, inverso y bidireccional.
   Directo e inverso son relativos a los dos nodos del segmento inicialmente tocado. */
function setSelectedFlow(mode){
 const ids=new Set([...state.selection].filter(x=>/^[ER]\d+$/.test(x)).map(x=>Number(x.slice(1))));
 const adj=adjacency(),byId=new Map(state.graph.edges.map(e=>[e.id,e]));
 const firstId=ids.has(state.flowSeed)?state.flowSeed:[...ids][0];
 if(firstId==null)return 0;
 let seed=byId.get(firstId);if(!seed)return 0;
 if(mode==='none'||mode==='both'){
  for(const id of ids){const e=byId.get(id);if(e){e.flowMode=mode;e.flowReversed=false}}
  return [...ids].filter(id=>byId.get(id)?.kind!=='reducer').length;
 }
 // Route-specific alignment. Do not traverse degree-three junctions.
 const pending=[[seed.a,seed.id,'up'],[seed.b,seed.id,'down']];
 const direct=(mode==='right');
 const assign=(edge,from,to)=>{edge.flowMode=edge.a===from&&edge.b===to?'forward':'reverse';edge.flowReversed=edge.flowMode==='reverse'};
 assign(seed,direct?seed.a:seed.b,direct?seed.b:seed.a);
 const visited=new Set([seed.id]);
 while(pending.length){const [node,previous,side]=pending.pop();const links=adj.get(node)||[];
  if(links.length!==2)continue;
  const next=links.find(l=>l.edge.id!==previous&&ids.has(l.edge.id));
  if(!next||visited.has(next.edge.id))continue;
  visited.add(next.edge.id);
  const from=side==='down'?(direct?node:next.other):(direct?next.other:node);
  const to=side==='down'?(direct?next.other:node):(direct?node:next.other);
  assign(next.edge,from,to);pending.push([next.other,next.edge.id,side]);
 }
 return [...ids].filter(id=>byId.get(id)?.kind!=='reducer').length;
}
function flowArrowMarkup(e,p,q,ux,uy,edgeWidth){
 const mode=e.flowMode||(e.flowReversed?'reverse':'forward');if(mode==='none')return '';
 const cx=(p.x+q.x)/2,cy=(p.y+q.y)/2,L=Math.min(26,Math.max(14,edgeWidth*2.35));
 const iconStroke=(e.service==='gas'||e.service==='crude')?'#18272c':'#fff';
 const head=(pt,dir)=>{const fx=ux*dir,fy=uy*dir;return `M${f(pt.x-fx*6-fy*4)},${f(pt.y-fy*6+fx*4)} L${xyz(pt)} L${f(pt.x-fx*6+fy*4)},${f(pt.y-fy*6-fx*4)}`};
 const a={x:cx-ux*L/2,y:cy-uy*L/2},b={x:cx+ux*L/2,y:cy+uy*L/2};
 const both=mode==='both';
 const path=both?`M${xyz(a)} L${xyz(b)} ${head(a,-1)} ${head(b,1)}`:
 (mode==='reverse'?`M${xyz(b)} L${xyz(a)} ${head(a,-1)}`:`M${xyz(a)} L${xyz(b)} ${head(b,1)}`);
 return `<path d="${path}" stroke="${iconStroke}" stroke-width="${f(Math.min(3.5,Math.max(2,edgeWidth*.33)))}" fill="none" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>`;
}
function expandFilterSelection(item){
 if(!item)return new Set();
 const mode=state.filterMode,info=classify(),edge=itemEdge(item),fit=info.fittings.find(f=>f.id===item);
 if(mode==='none')return new Set([item]);
 if(mode==='weld')return item.startsWith('W')&&weldRecords().some(w=>w.id===item)?new Set([item]):new Set();
 if(mode==='accessories')return (item.startsWith('R')||(fit&&['tee','elbow','junction'].includes(fit.kind)))?new Set([item]):new Set();
 if(mode==='assembly')return groupConnectedTo(item);
 if(mode==='line')return lineTokens(lineForToken(item));
 if(mode==='tag')return edge&&edge.kind!=='reducer'?new Set([item]):new Set();
 if(mode==='flow'){
  if(!edge||edge.kind==='reducer')return new Set();
  const paths=expandFlow(edge.id),out=new Set();
  for(const id of paths){const e=state.graph.edges.find(x=>x.id===id);if(e)out.add(edgeSelectionToken(e))}
  for(const fit of info.fittings){if(fit.kind==='elbow'||fit.kind==='bend'){
   const connections=info.adj.get(fit.node)||[];
   if(connections.length===2&&connections.every(l=>paths.has(l.edge.id)))out.add(fit.id);
  }}
  return out;
 }
 if((mode==='diameter'||mode==='material')&&edge){
  const candidates=state.graph.edges.filter(e=>mode==='diameter'?Math.abs((e.kind==='reducer'?e.from:e.diam)-edge.diam)<.0001||e.kind==='reducer'&&Math.abs(e.to-edge.diam)<.0001:normalizeMaterial(e.material)===normalizeMaterial(edge.material));
  return keepAssociatedFittings(new Set(candidates.map(edgeSelectionToken)));
 }
 return new Set();
}
function selectByTap(item){
 if(state.filterMode==='flow'){const seed=itemEdge(item);if(seed&&seed.kind!=='reducer')state.flowSeed=seed.id}
 const group=expandFilterSelection(item);
 if(state.filterMode==='line'&&group.size){const ln=lineForToken(item);message(`Línea ${ln||'sin número'} · ${group.size} elemento(s).`)}
 if(group.size===0){message('El elemento no cumple el filtro.');return}
 if(state.filterAction==='isolate'){state.isolation={tokens:group,mode:state.filterMode,seed:item};state.selection.clear();closeFilter();render();message(`${group.size} elemento(s) visibles. Pulse FILTRO para mostrar todo.`);return}
 const already=[...group].every(id=>state.selection.has(id));
 for(const id of group)already?state.selection.delete(id):state.selection.add(id);
 render();
}
function selectByRectangleToken(item){const eligible=expandFilterSelection(item);for(const id of eligible)state.selection.add(id)}
function bindFilterMenu(){filterMenu.addEventListener('click',e=>{const action=e.target.closest('[data-filter-action]');if(action){state.filterAction=action.dataset.filterAction;filterMenu.innerHTML=filterDefaultMarkup();return}const b=e.target.closest('[data-filter]');if(!b)return;setFilterMode(b.dataset.filter)})}
/* Ayudas automáticas localizadas: sin controles ni etiquetas. */
function closeAidMenu(){}
function syncAidUI(){}
/* No escala de fabricación: reservar longitud gráfica para etiquetas legibles. */
// Longitud mínima definida en 02A: se calcula también por etiqueta y por diámetro.
function projectedDistance(p,q){const a=project(p),b=project(q);return Math.hypot(a.x-b.x,a.y-b.y)}
function enoughLabelSpace(origin,end,minimum=MIN_LABEL_LENGTH){
 const span=projectedDistance(origin,end);if(span>=minimum-.01)return end;
 if(span<.01)return null;
 const target=Math.ceil((minimum+3)/CAT.grid)*CAT.grid;
 return add(origin,mul(sub(end,origin),target/span));
}
function onTap(x,y){if(state.panel)return;closeFilter();const s=fromScreen(x,y);if(state.supportMode){placeSupportFromTap(x,y);return;}if(state.copy.enabled){if(state.copy.supportOnly){chooseSupportCopyTarget(x,y);return}chooseCopyPosition(s);return;}
 if(state.move.enabled){const item=selectHit(x,y);if(item)moveSelect(item);else {state.move.target=null;state.selection.clear();render()}return;} 
 if(state.reducerMode){reducerPickAt(s);return;}
 if(state.tool){if(!state.draft.length){const snap=state.graph.edges.length?findGraphSnap(s):snapFirst(s);if(!snap){message('Para continuar, toque una tubería del ensamble.');return}state.draft=[snap];render();return}
  const candidate=proposedPoint(s,state.draft.at(-1));if(!candidate)return;let dest=candidate;const snap=findGraphSnap(s);
  if(snap&&dist(snap,state.draft.at(-1))>1&&Math.hypot(project(snap).x-project(candidate).x,project(snap).y-project(candidate).y)<CAT.grid*.55){const diff=sub(snap,state.draft.at(-1));if(!lastHeading()||[0,45,90].some(a=>Math.abs(angle(lastHeading(),diff)-a)<.5))dest=snap}
  if(dist(dest,state.draft.at(-1))<1)return;
  const initial=state.draft.at(-1);
  const pendingDN=state.graph.edges.length?Number(state.graph.edges.find(e=>e.kind!=='reducer'&&segmentParam(initial,getNode(e.a).p,getNode(e.b).p))?.diam||inheritedDiameter(state.graph.nodes.find(n=>near3(n.p,initial))?.id)||2):2;
  const required=Math.max(MIN_LABEL_LENGTH,Math.ceil(requiredPipeSpan({diam:pendingDN,wall:'SCH 40',tag:'A'})));
  if(projectedDistance(initial,dest)<required){
    if(snap&&near3(snap,dest)){message('Espacio insuficiente para la etiqueta. Aleje el punto de conexión.');return;}
    dest=enoughLabelSpace(initial,dest,required);if(!dest)return;
  }
  state.draft.push(dest);state.cursor=null;render();return;
 }
 const item=selectHit(x,y);if(item)selectByTap(item);else{state.selection.clear();render()}
}
function rectContains(p,r){return p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h}
function lineHitsRect(a,b,r){if(rectContains(a,r)||rectContains(b,r))return true;
 const edges=[[[r.x,r.y],[r.x+r.w,r.y]],[[r.x+r.w,r.y],[r.x+r.w,r.y+r.h]],[[r.x+r.w,r.y+r.h],[r.x,r.y+r.h]],[[r.x,r.y+r.h],[r.x,r.y]]];
 for(const [v,w] of edges){const c={x:v[0],y:v[1]},d={x:w[0],y:w[1]},z=(x,y,q)=> (y.x-x.x)*(q.y-x.y)-(y.y-x.y)*(q.x-x.x),x1=z(a,b,c),x2=z(a,b,d),y1=z(c,d,a),y2=z(c,d,b);if(x1*x2<=0&&y1*y2<=0)return true}return false;
}
function toScreenWeld(p){const r=canvas.getBoundingClientRect();return{x:r.left+r.width/2+state.view.dx+p.x*state.view.k,y:r.top+r.height/2+state.view.dy+p.y*state.view.k}}
function selectRectangle(m){const oldSelection=state.filterAction==='isolate'?new Set(state.selection):null;const r={x:Math.min(m.x,m.x2),y:Math.min(m.y,m.y2),w:Math.abs(m.x-m.x2),h:Math.abs(m.y-m.y2)};if(r.w<8&&r.h<8)return;
 if(state.filterMode==='weld'){for(const w of weldRecords())if(isolationVisible(w.id)&&rectContains(toScreenWeld(w.p),r))state.selection.add(w.id);if(oldSelection!==null)finishIsolateRectangle(oldSelection);return}
 for(const e of state.graph.edges){if(!isolationVisible(edgeSelectionToken(e)))continue;const a=toScreen(getNode(e.a).p),b=toScreen(getNode(e.b).p);if(lineHitsRect(a,b,r))selectByRectangleToken(edgeSelectionToken(e))}
 for(const fit of classify().fittings){if(isolationVisible(fit.id)&&rectContains(toScreen(getNode(fit.node).p),r))selectByRectangleToken(fit.id)}
 if(oldSelection!==null)finishIsolateRectangle(oldSelection);
}
function finishIsolateRectangle(original){const tokens=new Set([...state.selection].filter(t=>!original.has(t)));state.selection.clear();if(tokens.size){state.isolation={tokens,mode:state.filterMode,seed:null};closeFilter();message(`${tokens.size} elemento(s) aislados. Pulse FILTRO para mostrar todos.`)}}
/* 05C. INSERCIÓN DE REDUCCIÓN Y EDICIÓN SEGURA DEL GRAFO */
function cleanGraph(){
 const used=new Set();for(const e of state.graph.edges){used.add(e.a);used.add(e.b)}
 state.graph.nodes=state.graph.nodes.filter(n=>used.has(n.id));
 state.graph.curves=(state.graph.curves||[]).filter(id=>used.has(id));
 state.graph.weldNodes=(state.graph.weldNodes||[]).filter(id=>used.has(id));
 state.graph.detachedNodes=(state.graph.detachedNodes||[]).filter(id=>used.has(id));
 state.graph.supports=(state.graph.supports||[]).filter(sp=>sp.hostType==='edge'?state.graph.edges.some(e=>e.id===sp.hostId):classify().fittings.some(f=>f.node===sp.hostId&&['tee','elbow','bend'].includes(f.kind)));
 for(const id of Object.keys(state.graph.fitServices||{}))if(!used.has(Number(id)))delete state.graph.fitServices[id];
 ensureEdgeMetadata();
 // When all the pieces are connected again, the temporary detached markers are no longer needed.
 if(connectedComponents().length<=1)state.graph.detachedNodes=[];
}
function isTerminalEdge(e,graph=state.graph){const adj=adjacency();return (adj.get(e.a)?.length===1)||(adj.get(e.b)?.length===1)}
function terminalPipeSelection(){if(state.selection.size!==1)return null;const id=[...state.selection][0];if(!id.startsWith('E'))return null;const e=state.graph.edges.find(e=>e.id===Number(id.slice(1)));return e&&e.kind!=='reducer'&&isTerminalEdge(e)?e:null}
function addReducer(edgeId,to){const pipe=state.graph.edges.find(e=>e.id===edgeId);if(!pipe||pipe.kind==='reducer'||!isTerminalEdge(pipe))return false;const adj=adjacency(),free=adj.get(pipe.a).length===1?pipe.a:pipe.b,at=getNode(free).p,other=getNode(free===pipe.a?pipe.b:pipe.a).p,d=sub(at,other),m=norm(d);if(m<.01)return false;const next=add(at,mul(d,(CAT.grid*.67)/m)),newId=addNode(next);state.graph.edges.push({id:state.graph.nextEdge++,a:free,b:newId,from:pipe.diam,to,diam:to,kind:'reducer',material:pipe.material,service:pipe.service,serviceColor:pipe.serviceColor});syncReducers();return true}
/* 05C · Edición puntual. Retirar una T no borra toda la derivación.
   Se separa el ramal conservando cada tubo y sus propiedades; los dos tubos
   principales siguen unidos y reciben una soldadura como entidad calculada.
   La geometría real continúa siendo un solo grafo con componentes autorizados
   tras una desconexión explícita. */
function branchComponent(teeNodeId,branchNeighbor,runOtherNodes){
 const adj=adjacency(),visited=new Set(),stack=[branchNeighbor];
 while(stack.length){const id=stack.pop();if(id===teeNodeId||visited.has(id))continue;
  if(runOtherNodes.has(id))return null; // Un lazo no puede romperse automáticamente.
  visited.add(id);
  for(const l of adj.get(id)||[])if(l.other!==teeNodeId)stack.push(l.other);
 }
 return visited;
}
function removeTee(tee){
 if(!tee?.detail)return false;
 const links=adjacency().get(tee.node)||[], run=links.filter(l=>tee.detail.runEdges.includes(l.edge.id)), branch=links.find(l=>l.edge.id===tee.detail.branchEdge);
 if(run.length!==2||!branch||branch.edge.kind==='reducer')return false;
 if(run.some(l=>l.edge.kind==='reducer'))return false;
 if(Math.abs(Number(run[0].edge.diam)-Number(run[1].edge.diam))>.0001)return false;
 if(normalizeMaterial(run[0].edge.material)!==normalizeMaterial(run[1].edge.material))return false;
 const toShift=branchComponent(tee.node,branch.other,new Set(run.map(l=>l.other)));
 if(!toShift)return false;
 const at=getNode(tee.node).p,out=getNode(branch.other).p,v=sub(out,at),L=norm(v);
 if(L<.01)return false;
 // Desplazar el ramal completo mantiene intactas longitudes, codos y etiquetas.
 const gap=Math.min(CAT.grid*.46,Math.max(10,L*.22)),delta=mul(v,gap/L);
 const fresh={id:state.graph.nextNode++,p:add(at,delta)};
 for(const nid of toShift){const node=getNode(nid);if(node)node.p=add(node.p,delta)}
 state.graph.nodes.push(fresh);
 if(branch.edge.a===tee.node)branch.edge.a=fresh.id;else branch.edge.b=fresh.id;
 state.graph.weldNodes ||= [];if(!state.graph.weldNodes.includes(tee.node))state.graph.weldNodes.push(tee.node);
 state.graph.detachedNodes ||= [];if(!state.graph.detachedNodes.includes(fresh.id))state.graph.detachedNodes.push(fresh.id);
 return true;
}
function connectedComponents(){
 const adj=adjacency(),seen=new Set(),out=[];
 for(const n of state.graph.nodes){if(!adj.get(n.id)?.length||seen.has(n.id))continue;
  const group=new Set(),stack=[n.id];while(stack.length){const id=stack.pop();if(seen.has(id))continue;seen.add(id);group.add(id);for(const l of adj.get(id)||[])stack.push(l.other)}out.push(group);
 }return out;
}
function connectedGraph(){
 const groups=connectedComponents();if(groups.length<=1)return true;
 // Una segunda pieza solo es válida si procede de la eliminación deliberada de una T.
 const detached=new Set(state.graph.detachedNodes||[]);
 return groups.filter(g=>[...g].some(n=>detached.has(n))).length>=groups.length-1;
}
/* Retiro intencional de un accesorio interno: extremos libres, sin borrar tubos. */
function detachFitting(nodeId){
 const node=getNode(nodeId),links=adjacency().get(nodeId)||[];
 if(!node||links.length<2||links.some(l=>l.edge.kind==='reducer'))return false;
 const origin=[...node.p];
 for(const link of links){
  const neighbor=getNode(link.other)?.p;if(!neighbor)return false;
  const vec=sub(neighbor,origin),L=norm(vec),proj=Math.hypot(project(neighbor).x-project(origin).x,project(neighbor).y-project(origin).y);
  if(L<.1||proj<.1)return false;
 }
 for(const link of links){
  const neighbor=getNode(link.other).p,vec=sub(neighbor,origin),proj=Math.hypot(project(neighbor).x-project(origin).x,project(neighbor).y-project(origin).y);
  const gap=Math.min(15,proj*.21),newNodeId=state.graph.nextNode++;
  state.graph.nodes.push({id:newNodeId,p:add(origin,mul(vec,gap/proj))});
  if(link.edge.a===nodeId)link.edge.a=newNodeId;else link.edge.b=newNodeId;
 }
 state.graph.curves=(state.graph.curves||[]).filter(id=>id!==nodeId);
 state.graph.weldNodes=(state.graph.weldNodes||[]).filter(id=>id!==nodeId);
 delete (state.graph.fitServices||{})[nodeId];
 return true;
}
function simulateDelete(ids,allowBreak=false){
 const backup=modelCopy(),report=[];let changed=0;
 for(const token of ids){
  if(token[0]==='S'){if(supportByToken(token)){changed++;report.push('Soporte eliminado sin afectar la tubería')}continue}
  if(token[0]==='N'){
   const fit=classify().fittings.find(f=>f.id===token);if(!fit)continue;
   if(allowBreak&&['elbow','tee','bend'].includes(fit.kind)){if(detachFitting(fit.node)){changed++;report.push('Accesorio retirado: conexiones separadas, tubos conservados')}else report.push('Este accesorio no se puede separar en esta posición')}
   else if(fit.kind==='elbow'){state.graph.curves||=[];if(!state.graph.curves.includes(fit.node)){state.graph.curves.push(fit.node);changed++;report.push('Codo seleccionado → curva')}}
   else if(fit.kind==='tee'){if(removeTee(fit)){changed++;report.push('T seleccionada → unión soldada; ramal conservado y desconectado')}else report.push('Esta T no puede retirarse sin afectar una conexión especial')}
   else report.push('El accesorio seleccionado no admite esta eliminación');
  }else if(token[0]==='E'||token[0]==='R'){
   const e=state.graph.edges.find(x=>x.id===Number(token.slice(1)));if(!e)continue;
   if(isTerminalEdge(e)||allowBreak){state.graph.edges=state.graph.edges.filter(x=>x.id!==e.id);changed++;report.push(isTerminalEdge(e)?'Tramo terminal eliminado':'Tramo interno eliminado; extremos independientes')}
   else report.push('Tramo interno protegido: marque Desconectar para retirarlo');
  }
 }
 const result={success:changed,report};state.graph=backup;return result;
}
function performDeletion(ids,allowBreak=false){
 const backup=modelCopy();let changed=0,detachedTee=false;
 for(const token of ids){
  if(token[0]==='S'){const before=(state.graph.supports||[]).length;state.graph.supports=(state.graph.supports||[]).filter(s=>'S'+s.id!==token);if(state.graph.supports.length<before)changed++;continue}
  if(token[0]==='N'){
   const fit=classify().fittings.find(f=>f.id===token);if(!fit)continue;
   if(allowBreak&&['elbow','tee','bend'].includes(fit.kind)){if(detachFitting(fit.node))changed++}
   else if(fit.kind==='elbow'){state.graph.curves||=[];if(!state.graph.curves.includes(fit.node)){state.graph.curves.push(fit.node);changed++}}
   else if(fit.kind==='tee'&&removeTee(fit)){changed++;detachedTee=true}
  }else if(token[0]==='E'||token[0]==='R'){
   const e=state.graph.edges.find(x=>x.id===Number(token.slice(1)));if(e&&(isTerminalEdge(e)||allowBreak)){
    state.graph.edges=state.graph.edges.filter(x=>x.id!==e.id);changed++;
   }
  }
 }
 cleanGraph();
 if(allowBreak){state.graph.detachedNodes=[];for(const component of connectedComponents())state.graph.detachedNodes.push([...component][0]);}
 if(!connectedGraph()){state.graph=backup;message('La operación separaría una conexión no permitida.');return 0}
 if(detachedTee)message('T retirada: ramal conservado y separado; unión principal soldada.');
 return changed;
}
function openDelete(){
 if(!state.selection.size||state.panel)return;closeFilter();
 state.panel={mode:'delete',allowBreak:false};panelTitle.textContent='Borrar o transformar';
 panelBody.innerHTML=`<div id="deleteReport"></div><label class="break-option"><input type="checkbox" id="allowBreak"> Desconectar: borrar tubos o accesorios internos</label><p class="panelhint">Solo se modifica la selección. Sin Desconectar: codo → curva y T → unión soldada. Con Desconectar: los extremos quedan libres sin borrar tubos vecinos.</p>`;
 const update=()=>{const allowed=$('allowBreak').checked;state.panel.allowBreak=allowed;const preview=simulateDelete([...state.selection],allowed);
 $('deleteReport').innerHTML=`<p class="panelhint">${preview.success} modificación(es) posibles.</p><p class="panelhint">${preview.report.map(escaped).join('<br>')}</p>`};
 $('allowBreak').addEventListener('change',update);update();propertyPanel.hidden=false;render();
}
function openReset(){if(state.panel)return;cancelCopy({quiet:true});closeFilter();state.tool=false;state.draft=[];state.panel={mode:'reset'};panelTitle.textContent='Nuevo ensamble';panelBody.innerHTML='<p class="panelhint">Se iniciará un ensamble nuevo. Puede deshacer esta acción desde el historial.</p><p class="panelhint">Verde: reiniciar · Rojo: conservar.</p>';propertyPanel.hidden=false;render()}
// 05B. INSERCIÓN DIRECTA DE REDUCCIÓN (sin diálogos).
function nextCatalogDiameter(d){return CAT.nominalDN.find(x=>x>Number(d)+1e-5)??null}
function nearestPipeAtScreen(s){
 let chosen=null,threshold=22/state.view.k;
 for(const edge of state.graph.edges){
  if(edge.kind==='reducer')continue;
  const na=getNode(edge.a),nb=getNode(edge.b);if(!na||!nb)continue;
  const a=project(na.p),b=project(nb.p),dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
  if(den<.001)continue;
  const t=Math.max(0,Math.min(1,((s.x-a.x)*dx+(s.y-a.y)*dy)/den));
  const d=Math.hypot(s.x-(a.x+t*dx),s.y-(a.y+t*dy));
  if(d<threshold){threshold=d;chosen={edge,t,d};}
 }
 return chosen;
}
function straightReach(edge,nodeId){
 // Sumar segmentos colineales hasta codo, reducción, T o extremo.
 const adj=adjacency(),node=(id)=>getNode(id)?.p;
 let from=edge.a===nodeId?edge.b:edge.a,curr=nodeId,prev=edge,total=0;
 let incoming=sub(node(curr),node(from));
 for(let guard=0;guard<100;guard++){
  const links=adj.get(curr)||[];if(links.length!==2)break;
  const next=links.find(l=>l.edge.id!==prev.id);
  if(!next||next.edge.kind==='reducer')break;
  const outward=sub(node(next.other),node(curr));
  if(angle(incoming,outward)>1)break;
  total+=norm(outward);from=curr;curr=next.other;prev=next.edge;incoming=outward;
 }
 return total;
}
function respectsPlane(edge){
 const a=getNode(edge.a)?.p,b=getNode(edge.b)?.p;if(!a||!b)return false;
 const d=sub(b,a);
 return state.plane==='XY'?Math.abs(d[2])<.001:Math.abs(d[1])<.001;
}
function suggestedReducerDN(){
 const pipes=state.graph.edges.filter(e=>e.kind!=='reducer');
 const counts=new Map();for(const e of pipes)counts.set(e.diam,(counts.get(e.diam)||0)+1);
 let suggested=2,best=-1;
 for(const [d,count] of counts){if(count>best){best=count;suggested=d}}
 const selected=[...state.selection].map(itemEdge).find(e=>e&&e.kind!=='reducer');
 return selected?.diam||suggested;
}
function reducerProfile(a,b,dLeft,dRight,type='concentric',flat='top',maxWidth=9){
 const dx=b.x-a.x,dy=b.y-a.y,m=Math.hypot(dx,dy)||1,ux=dx/m,uy=dy/m;
 let nx=-uy,ny=ux;
 if(ny>0||(Math.abs(ny)<.0001&&nx>0)){nx=-nx;ny=-ny}
 const big=Math.max(dLeft,dRight,.01);
 // Diferencia visual cónica más visible; escala esquemática, no una dimensión real.
 const half=dn=>Math.max(2,maxWidth*(.16+.84*Math.min(1,dn/big)));
 let l=half(dLeft),r=half(dRight);
 // Acentuar el perfil: la boca menor queda a la mitad de su ancho anterior.
 // Misma función para el dibujo y para la ventana de vista previa.
 if(Math.abs(dLeft-dRight)>1e-5){
  if(dLeft<dRight)l*=.5;else r*=.5;
 }
 const move=type==='eccentric'?(flat==='top'?l-r:r-l):0;
 const shifted={x:b.x+nx*move,y:b.y+ny*move};
 return {
  upperLeft:{x:a.x+nx*l,y:a.y+ny*l},lowerLeft:{x:a.x-nx*l,y:a.y-ny*l},
  upperRight:{x:shifted.x+nx*r,y:shifted.y+ny*r},lowerRight:{x:shifted.x-nx*r,y:shifted.y-ny*r},
  shifted,normal:{x:nx,y:ny},diameterLeft:l*2,diameterRight:r*2,axisOffset:move
 };
}
function reducerGraphicSvg(left,right,type='concentric',view='horizontal',flat='top'){
 const start={x:82,y:68},end={x:238,y:68},profile=reducerProfile(start,end,left,right,type,flat,45);
 const {upperLeft:ul,lowerLeft:ll,upperRight:ur,lowerRight:lr,shifted}=profile;
 const cone=`<path d="M${xyz(ul)} L${xyz(ur)} L${xyz(lr)} L${xyz(ll)} Z" fill="none" stroke="#506c76" stroke-width="2.5" stroke-linejoin="round"/><path d="M25 68H82" stroke="#243c45" stroke-width="3"/><path d="M${xyz(shifted)} L${f(shifted.x+50)} ${f(shifted.y)}" stroke="#243c45" stroke-width="3"/><path d="M83 68 L${xyz(shifted)}" stroke="#aec4c7" stroke-width="1" stroke-dasharray="5 6"/>`;
 const transform=view==='vertical'?'translate(160 68) rotate(-90) scale(.57) translate(-160 -68)':'';
 const caption=type==='eccentric'?`Excéntrica, cara plana ${flat==='top'?'arriba':'abajo'}; ejes desplazados`:'Concéntrica; mismo eje';
 return `<svg viewBox="0 0 320 136" role="img" aria-label="${caption}, ${dnFmt(left)} y ${dnFmt(right)} pulgadas, orientación ${view}"><g transform="${transform}" class="animated-cone">${cone}</g><text x="62" y="127" text-anchor="middle" font-size="13" font-weight="700" fill="#273e45">${dnFmt(left)}″</text><text x="258" y="127" text-anchor="middle" font-size="13" font-weight="700" fill="#273e45">${dnFmt(right)}″</text></svg>`;
}
function refreshReducerGraphic(){
 const a=$('reducerLeft'),b=$('reducerRight'),graphic=$('reducerGraphic');if(!a||!b||!graphic)return;
 const type=state.panel?.reducerType||'concentric',flat=state.panel?.flatSide||'top',view=state.panel?.reducerView||'horizontal';
 graphic.innerHTML=reducerGraphicSvg(Number(a.value),Number(b.value),type,view,flat);
 $('reducerFlat').hidden=type!=='eccentric';
 for(const btn of panelBody.querySelectorAll('[data-reducer-type]'))btn.setAttribute('aria-pressed',String(btn.dataset.reducerType===type));
 for(const btn of panelBody.querySelectorAll('[data-reducer-view]'))btn.setAttribute('aria-pressed',String(btn.dataset.reducerView===view));
 for(const btn of panelBody.querySelectorAll('[data-flat-side]'))btn.setAttribute('aria-pressed',String(btn.dataset.flatSide===flat));
}
function showReducerSetup({continuation=false,reducerId=null,face='b'}={}){
 if(state.panel)return;
 if(state.tool&&state.draft.length){message('Confirme o cancele el trazado antes de insertar.');return}
 const previous=state.graph.edges.find(e=>e.id===reducerId&&e.kind==='reducer');
 const defaultFace=previous?(face==='a'?previous.from:previous.to):null;
 const base=defaultFace??state.reducerLast?.right??suggestedReducerDN();
 let left=CAT.nominalDN.includes(base)?base:2;
 let right=nextCatalogDiameter(left)??CAT.nominalDN.find(v=>v<left)??left;
 if(!continuation&&state.reducerLast){left=state.reducerLast.left;right=state.reducerLast.right;}
 if(continuation&&face==='a'){right=left;left=nextCatalogDiameter(right)??CAT.nominalDN.find(v=>v<right)??right}
 state.reducerMode=false;state.reducerChoice=null;state.tool=false;state.draft=[];state.selection.clear();state.filterMode='none';closeFilter();
 state.panel={mode:'reducerSetup',reducerType:state.reducerLast?.type||'concentric',flatSide:state.reducerLast?.flat||'top',reducerView:state.reducerSetupView||'horizontal'};
 panelTitle.textContent='Reducción';
 const opts=value=>CAT.nominalDN.map(d=>`<option value="${d}"${Math.abs(d-value)<1e-6?' selected':''}>${dnFmt(d)}″</option>`).join('');
 panelBody.innerHTML=`
 <div class="reducer-types" role="group" aria-label="Tipo de reducción">
  <button type="button" class="reducer-mini" data-reducer-type="concentric"><svg viewBox="0 0 36 26" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M2 5L34 10M2 21L34 16M2 5V21M34 10V16"/></svg>Concéntrica</button>
  <button type="button" class="reducer-mini" data-reducer-type="eccentric"><svg viewBox="0 0 36 26" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M2 5H34M2 21L34 12M2 5V21M34 5V12"/></svg>Excéntrica</button>
 </div>
 <div class="reducer-graphic" id="reducerGraphic"></div>
 <div class="reducer-ports"><div><label for="reducerLeft">Diámetro izquierdo</label><select id="reducerLeft">${opts(left)}</select></div><div><label for="reducerRight">Diámetro derecho</label><select id="reducerRight">${opts(right)}</select></div></div>
 <div class="reducer-direction"><button type="button" id="reducerSwap" class="reducer-flip" aria-label="Invertir diámetros" title="Invertir"><svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M4 9H24M18 4L24 9L18 14M24 19H4M10 14L4 19L10 24"/></svg>Invertir</button></div>
 <div class="reducer-section-name">VISTA PREVIA</div>
 <div class="reducer-view" role="group" aria-label="Vista del símbolo"><button type="button" class="reducer-mini" data-reducer-view="horizontal" aria-label="Vista horizontal" title="Horizontal"><svg viewBox="0 0 36 26" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 13H32"/></svg>Horizontal</button><button type="button" class="reducer-mini" data-reducer-view="vertical" aria-label="Vista vertical" title="Vertical"><svg viewBox="0 0 36 26" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 2V24"/></svg>Vertical</button></div>
 <div class="reducer-flat" id="reducerFlat" role="group" aria-label="Orientación de cara plana"><button type="button" class="reducer-mini" data-flat-side="top" title="Cara plana arriba">▱ ↑ Arriba</button><button type="button" class="reducer-mini" data-flat-side="bottom" title="Cara plana abajo">▱ ↓ Abajo</button></div>
 <p class="reducer-caption">Los íconos ✓ y × confirman o cancelan. Después toque el punto del dibujo. Para otra reducción, se abrirá esta ventana nuevamente.</p>`;
 propertyPanel.classList.add('reducer-dialog');propertyPanel.hidden=false;
 $('reducerLeft').addEventListener('change',refreshReducerGraphic);$('reducerRight').addEventListener('change',refreshReducerGraphic);
 $('reducerSwap').addEventListener('click',()=>{const a=$('reducerLeft'),b=$('reducerRight'),v=a.value;a.value=b.value;b.value=v;refreshReducerGraphic()});
 for(const button of panelBody.querySelectorAll('[data-reducer-type]'))button.addEventListener('click',()=>{state.panel.reducerType=button.dataset.reducerType;refreshReducerGraphic()});
 for(const button of panelBody.querySelectorAll('[data-reducer-view]'))button.addEventListener('click',()=>{state.panel.reducerView=button.dataset.reducerView;state.reducerSetupView=button.dataset.reducerView;refreshReducerGraphic()});
 for(const button of panelBody.querySelectorAll('[data-flat-side]'))button.addEventListener('click',()=>{state.panel.flatSide=button.dataset.flatSide;refreshReducerGraphic()});
 refreshReducerGraphic();render();
}

/* Los dos puertos de cada reducción son reales en el grafo. Cuando se elige una
   cara, el extremo nuevo que toca esa cara debe conservar el mismo DN.
   Se acorta la tubería colindante o se prolonga una cara libre. */

/* v0.16 · Selección primero; único DN libre después de tocar el trazado. */
function reducerPickAt(s){
 const face=nearestReducerFaceAtScreen(s);
 const pipe=nearestPipeAtScreen(s);
 // Priorizar el tubo cuando se toca su línea, en lugar de una reducción vecina.
 const useFace=face&&(!pipe||face.d+4/state.view.k<pipe.d);
 if(!useFace&&!pipe){message('Toque una tubería o la cara de una reducción.');return}
 let context;
 if(useFace){
  const e=face.reducer;
  context={kind:'face',reducerId:e.id,face:face.face,
   baseDN:Number(face.face==='a'?e.from:e.to),
   fixedSide:face.face==='a'?'right':'left',canSwap:false};
 }else{
  if(!respectsPlane(pipe.edge)){message('Active el plano correspondiente a ese tubo antes de insertar.');return}
  const edge=pipe.edge,adj=adjacency(),isA=(adj.get(edge.a)||[]).length===1,isB=(adj.get(edge.b)||[]).length===1;
  const tip=(isA&&pipe.t<.055)?'a':(isB&&pipe.t>.945)?'b':null;
  const limits=reducerSidePortLimits(edge.id);
  const secured=(limits&&limits.a.kind==='tee')||(limits&&limits.b.kind==='tee');
  context={kind:'pipe',edgeId:edge.id,t:pipe.t,tip,
   baseDN:Number(edge.diam),fixedSide:tip==='a'?'right':tip==='b'?'left':suggestReducerOrientation(edge),canSwap:!tip&&!secured,
   teeProtected:!!secured};
 }
 const newDN=nextCatalogDiameter(context.baseDN)??CAT.nominalDN.find(x=>x<context.baseDN)??context.baseDN;
 state.panel={mode:'reducerPick',context,otherDN:newDN,
   reducerType:state.reducerLast?.type||'concentric',flatSide:state.reducerLast?.flat||'top',reducerView:state.reducerSetupView||'horizontal'};
 state.reducerChoice=null;
 panelTitle.textContent='Reducción';
 const options=CAT.nominalDN.filter(d=>Math.abs(d-context.baseDN)>.00001).map(d=>`<option value="${d}"${Math.abs(d-newDN)<.0001?' selected':''}>${dnFmt(d)}″</option>`).join('');
 panelBody.innerHTML=`
 <div class="reducer-types" role="group" aria-label="Tipo de reducción">
  <button type="button" class="reducer-mini" data-reducer-type="concentric"><svg viewBox="0 0 36 26" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M2 5L34 10M2 21L34 16M2 5V21M34 10V16"/></svg>Concéntrica</button>
  <button type="button" class="reducer-mini" data-reducer-type="eccentric"><svg viewBox="0 0 36 26" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M2 5H34M2 21L34 12M2 5V21M34 5V12"/></svg>Excéntrica</button>
 </div>
 <div class="reducer-graphic" id="reducerGraphic"></div>
 <div class="reducer-ports">
  <div><div class="reducer-port-title">DN de conexión</div><div class="reducer-fixed" id="reducerKnown" aria-label="Diámetro detectado del elemento">${dnFmt(context.baseDN)}″</div></div>
  <div><label for="reducerOther">Nuevo diámetro</label><select id="reducerOther" aria-label="Nuevo diámetro nominal">${options}</select></div>
 </div>
 <div class="reducer-direction"><button type="button" id="reducerSwap" class="reducer-flip" ${context.canSwap?'':'disabled'} title="${context.canSwap?'Invertir lado modificado':'La conexión fija exige esta orientación'}"><svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M4 9H24M18 4L24 9L18 14M24 19H4M10 14L4 19L10 24"/></svg>Invertir</button></div>
 <div class="reducer-section-name">VISTA PREVIA</div>
 <div class="reducer-view" role="group" aria-label="Vista del símbolo"><button type="button" class="reducer-mini" data-reducer-view="horizontal">━ Horizontal</button><button type="button" class="reducer-mini" data-reducer-view="vertical">┃ Vertical</button></div>
 <div class="reducer-flat" id="reducerFlat" role="group" aria-label="Orientación de cara plana"><button type="button" class="reducer-mini" data-flat-side="top">▱ ↑ Arriba</button><button type="button" class="reducer-mini" data-flat-side="bottom">▱ ↓ Abajo</button></div>
 <p class="reducer-note">Se conserva el diámetro de conexión. Si hay una T, esa boca queda protegida: se inserta una sola reducción y nunca otra automáticamente. ✓ Aplicar · × Cancelar.</p>`;
 propertyPanel.hidden=false;propertyPanel.classList.add('reducer-dialog');
 $('reducerOther').addEventListener('change',refreshPickedReducerGraphic);
 $('reducerSwap').addEventListener('click',()=>{if(!state.panel.context.canSwap)return;state.panel.context.fixedSide=state.panel.context.fixedSide==='left'?'right':'left';refreshPickedReducerGraphic()});
 for(const b of panelBody.querySelectorAll('[data-reducer-type]'))b.addEventListener('click',()=>{state.panel.reducerType=b.dataset.reducerType;refreshPickedReducerGraphic()});
 for(const b of panelBody.querySelectorAll('[data-reducer-view]'))b.addEventListener('click',()=>{state.panel.reducerView=b.dataset.reducerView;state.reducerSetupView=b.dataset.reducerView;refreshPickedReducerGraphic()});
 for(const b of panelBody.querySelectorAll('[data-flat-side]'))b.addEventListener('click',()=>{state.panel.flatSide=b.dataset.flatSide;refreshPickedReducerGraphic()});
 refreshPickedReducerGraphic();render();
}
function pickedReducerDiameters(){
 const p=state.panel,other=Number($('reducerOther')?.value ?? p.otherDN),base=p.context.baseDN;
 return p.context.fixedSide==='left'?{left:base,right:other}:{left:other,right:base};
}
function refreshPickedReducerGraphic(){
 const p=state.panel;if(!p||p.mode!=='reducerPick')return;
 const {left,right}=pickedReducerDiameters();
 $('reducerGraphic').innerHTML=reducerGraphicSvg(left,right,p.reducerType,p.reducerView,p.flatSide);
 $('reducerFlat').hidden=p.reducerType!=='eccentric';
 for(const b of panelBody.querySelectorAll('[data-reducer-type]'))b.setAttribute('aria-pressed',String(b.dataset.reducerType===p.reducerType));
 for(const b of panelBody.querySelectorAll('[data-reducer-view]'))b.setAttribute('aria-pressed',String(b.dataset.reducerView===p.reducerView));
 for(const b of panelBody.querySelectorAll('[data-flat-side]'))b.setAttribute('aria-pressed',String(b.dataset.flatSide===p.flatSide));
}
function applyPickedReducer(){
 const p=state.panel,choice=pickedReducerDiameters();
 if(!Number.isFinite(choice.left)||!Number.isFinite(choice.right)||choice.left===choice.right){message('Seleccione dos diámetros diferentes.');return}
 const c=p.context,backup=modelCopy();let outcome;
 if(c.kind==='face'){
  const edge=state.graph.edges.find(e=>e.id===c.reducerId&&e.kind==='reducer');
  if(!edge){message('No se encontró la cara de conexión.');return}
  outcome=insertConsecutiveReducer({reducer:edge,face:c.face},choice);
 }else{
  const edge=state.graph.edges.find(e=>e.id===c.edgeId&&e.kind!=='reducer');
  if(!edge){message('No se encontró el tubo original.');return}
  if(c.tip)outcome=insertConfiguredReducerOnTip(edge.id,c.tip,choice.left,choice.right);
  else{
    const sourceLength=Math.hypot(project(getNode(edge.a).p).x-project(getNode(edge.b).p).x,project(getNode(edge.a).p).y-project(getNode(edge.b).p).y);
    if(sourceLength<54){message('Este tramo no permite colocar la reducción sin superponer conexiones.');return}
    // Ajuste a los despejes de las bocas de T sin alterar sus DN.
    outcome=insertConfiguredReducerInPipe(edge.id,c.t,choice.left,choice.right);
  }
  if(outcome?.success){const reducer=state.graph.edges.find(e=>e.id===outcome.reducerId);if(reducer){reducer.reducerType=p.reducerType;reducer.flatSide=p.flatSide;reducer.viewOrientation=p.reducerView;}}
 }
 if(outcome?.error||!outcome?.success){state.graph=backup;message(outcome?.error||'No fue posible insertar la reducción.');render();return}
 state.reducerLast={...choice,type:p.reducerType,flat:p.flatSide,view:p.reducerView};
 state.panel=null;propertyPanel.hidden=true;propertyPanel.classList.remove('reducer-dialog');
 state.selection.clear();state.cursor=null;state.reducerChoice=null;
 // Mantiene activo REDUC. para permitir tocar otra boca o tubo sin abrir ventanas solas.
 state.reducerMode=true;
 cleanGraph();save();render();
 message(`RED ${dnFmt(choice.left)}×${dnFmt(choice.right)} colocada. Toque otro punto o cancele REDUC.`);
}

function nearestReducerFaceAtScreen(s){
 let best=null,limit=13/state.view.k;
 for(const e of state.graph.edges.filter(x=>x.kind==='reducer')){
  for(const side of ['a','b']){
   const q=project(getNode(e[side]).p),d=Math.hypot(q.x-s.x,q.y-s.y);
   if(d<limit){limit=d;best={reducer:e,face:side,d}}
  }
 }
 return best;
}
function insertConsecutiveReducer(hit,choice){
 const old=hit.reducer,face=hit.face,nId=face==='a'?old.a:old.b,port=face==='a'?Number(old.from):Number(old.to);
 const touching=face==='a'?choice.right:choice.left;
 if(Math.abs(port-touching)>.0001)return {error:`La cara ${face==='a'?'izquierda':'derecha'} de esta reducción es DN ${dnFmt(port)}″. Seleccione ese diámetro en la boca que hará contacto.`};
 const links=adjacency().get(nId)||[],others=links.filter(l=>l.edge.id!==old.id);
 if(others.length>1)return {error:'La cara ya tiene múltiples conexiones. Seleccione otra ubicación.'};
 const backup=JSON.parse(JSON.stringify(state.graph));
 let fresh,downstream=null;
 if(others.length===1){
  const next=others[0].edge;
  if(next.kind==='reducer')return {error:'Esta cara ya tiene otra reducción. Seleccione el extremo exterior de la última.'};
  const start=getNode(nId).p,far=getNode(others[0].other).p,d=sub(far,start),len=norm(d);
  if(len<30)return {error:'La tubería junto a esa cara es demasiado corta para insertar otra reducción.'};
  const step=Math.min(23,len*.34),newId=addNode(add(start,mul(d,step/len)));
  if(next.a===nId)next.a=newId;else next.b=newId;
  const nr=face==='b'?{a:nId,b:newId,from:choice.left,to:choice.right}:{a:newId,b:nId,from:choice.left,to:choice.right};
  fresh={id:state.graph.nextEdge++,kind:'reducer',...nr,diam:nr.to,material:next.material,service:next.service,serviceColor:next.serviceColor,reducerType:choice.type,flatSide:choice.flat,viewOrientation:choice.view};
  state.graph.edges.push(fresh);downstream=next.id;
  const change=assignDiameterWithoutExtraReducer(downstream,face==='b'?choice.right:choice.left);
  if(change.error){state.graph=backup;return change}
  harmonizeFlowFromEdge(next.id);
 }else{
  const inside=getNode(nId).p,other=getNode(face==='a'?old.b:old.a).p,d=sub(inside,other),len=norm(d);
  if(len<.01)return {error:'La reducción no tiene orientación válida.'};
  const newId=addNode(add(inside,mul(d,Math.min(24,CAT.grid)/len)));
  const nr=face==='b'?{a:nId,b:newId,from:choice.left,to:choice.right}:{a:newId,b:nId,from:choice.left,to:choice.right};
  fresh={id:state.graph.nextEdge++,kind:'reducer',...nr,diam:nr.to,material:old.material,service:old.service,serviceColor:old.serviceColor,reducerType:choice.type,flatSide:choice.flat,viewOrientation:choice.view};
  state.graph.edges.push(fresh);
  keepFlowOrientation(fresh,flowModeOf(old));harmonizeFlowFromEdge(old.id);
 }
 syncReducers();cleanGraph();
 if(!connectedGraph()){state.graph=backup;return {error:'Esta inserción rompería la continuidad del ensamble.'}}
 return {success:true,reducerId:fresh.id};
}
function insertChosenReducerAt(s){
 const choice=state.reducerChoice;if(!choice)return message('Configure la reducción primero.');
 const contact=nearestReducerFaceAtScreen(s),found=contact?null:nearestPipeAtScreen(s);
 if(!contact&&!found){message('Toque un tubo o una cara de reducción.');return}
 let output;
 if(contact){output=insertConsecutiveReducer(contact,choice)}
 else{
  const {edge,t}=found;
  if(!respectsPlane(edge)){message('Cambie al plano del tubo (XY o XZ).');return}
  const adj=adjacency(),isA=(adj.get(edge.a)||[]).length===1,isB=(adj.get(edge.b)||[]).length===1;
  if(isA&&t<.055)output=insertConfiguredReducerOnTip(edge.id,'a',choice.left,choice.right);
  else if(isB&&t>.945)output=insertConfiguredReducerOnTip(edge.id,'b',choice.left,choice.right);
  else output=insertConfiguredReducerInPipe(edge.id,t,choice.left,choice.right);
  if(output.success){const r=state.graph.edges.find(e=>e.id===output.reducerId);if(r){r.reducerType=choice.type;r.flatSide=choice.flat;r.viewOrientation=choice.view;}}
 }
 if(output?.error||!output?.success){message(output?.error||'No se pudo colocar la reducción.');render();return}
 state.reducerMode=false;state.reducerChoice=null;state.cursor=null;state.selection.clear();cleanGraph();save();render();
 message(`Reducción ${dnFmt(choice.left)}×${dnFmt(choice.right)} insertada. Puede continuar.`);
 // Se propone una nueva reducción. Al cancelar, lo ya insertado permanece guardado.
 showReducerSetup({continuation:true,reducerId:output.reducerId,face:'b'});
}
function insertDirectReducerAt(s){
 const found=nearestPipeAtScreen(s);
 if(!found){message('Toque una tubería para insertar la reducción.');return;}
 const {edge,t}=found,oldDn=Number(edge.diam),nextDn=nextCatalogDiameter(oldDn);
 if(nextDn==null){message(`DN ${dnFmt(oldDn)}″: no hay diámetro superior en el catálogo.`);return;}
 if(!respectsPlane(edge)){
  message(`La tubería pertenece a otro plano. Active el plano correspondiente.`);return;
 }
 const adj=adjacency(),terminalAtA=(adj.get(edge.a)||[]).length===1,terminalAtB=(adj.get(edge.b)||[]).length===1;
 const length=dist(getNode(edge.a).p,getNode(edge.b).p);
 if(length<34){message('Tubería muy corta para insertar una reducción.');return;}
 const saved=JSON.parse(JSON.stringify(state.graph));
 let result=null;
 // Toque sobre una boca libre: extender la reducción hacia el exterior.
 if((terminalAtA&&t<.08)||(terminalAtB&&t>.92)){
  result=addReducer(edge.id,nextDn)?{success:true}:{error:'No fue posible colocarla en el extremo.'};
 }else{
  const left=length*t+straightReach(edge,edge.a),right=length*(1-t)+straightReach(edge,edge.b);
  // Mayor diámetro únicamente sobre el lado geométricamente más corto.
  const side=left<right?'ba':'ab';
  result=insertReducerInPipe(edge.id,Math.max(.12,Math.min(.88,t)),side,nextDn);
 }
 if(result?.error||!result?.success){state.graph=saved;message(result?.error||'No se pudo insertar la reducción.');render();return;}
 if(!connectedGraph()){
  state.graph=saved;message('La operación afectaba la continuidad del ensamble.');render();return;
 }
 cleanGraph();syncReducers();ensureEdgeMetadata();state.selection.clear();save();render();
 message(`Reducción ${dnFmt(oldDn)}x${dnFmt(nextDn)} insertada.`);
}
function openReducer(){state.supportMode=false;cancelCopy({quiet:true});moveClear(false);if(state.panel)return;state.reducerMode=!state.reducerMode;state.reducerChoice=null;state.tool=false;state.draft=[];state.selection.clear();closeFilter();render();if(state.reducerMode)message('Toque una tubería o una cara de reducción.')}


/* 05D. Propiedades generales y específicas del ensamble. */
const tablesState={tab:'lines',mode:'total'};
function propertyTabs(active){return ''} /* Proyecto y propiedades se abren por accesos independientes. */
function propertyField(id,label,value='',kind='text',extra=''){
 return `<div><label for="${id}">${escaped(label)}</label><input id="${id}" type="${kind}" value="${escaped(value)}" ${extra}></div>`;
}
function propSelect(id,label,options,selected){return `<div><label for="${id}">${escaped(label)}</label><select id="${id}">${options.map(([v,t])=>`<option value="${escaped(v)}" ${String(v)===String(selected)?'selected':''}>${escaped(t)}</option>`).join('')}</select></div>`}
function bindPropertyTabs(){panelBody.querySelectorAll('[data-prop-tab]').forEach(btn=>btn.addEventListener('click',()=>{
 if(!state.panel||!['projectProps','itemProps'].includes(state.panel.mode))return;
 state.panel.mode=btn.dataset.propTab==='general'?'projectProps':'itemProps';renderPropertyForm();
 }))}
/* v0.36 · Cabecera contextual única: ícono del componente, catálogo y configuración. */
function propertyKind(){
 const token=[...state.selection][0];if(state.selection.size>1)return 'multi';
 if(supportByToken(token))return 'support';
 const edge=itemEdge(token);if(edge)return edge.kind==='reducer'?'reducer':'pipe';
 const fit=classify().fittings.find(f=>f.id===token);if(fit)return fit.kind;
 return token?.startsWith('W')?'weld':'item';
}
function propertyIcon(kind){
 const paths={
  pipe:'<path d="M3 16H29M3 11V21M29 11V21"/>',
  tee:'<path d="M4 15H28M16 15V29"/>',
  elbow:'<path d="M5 26H14Q24 26 24 16V6"/>',
  bend:'<path d="M5 26H14Q24 26 24 16V6"/>',
  reducer:'<path d="M3 7L28 13V19L3 25Z"/>',
  support:'<path d="M3 9H29M16 9V26M7 26H25"/>',
  weld:'<circle cx="16" cy="16" r="9"/>',
  multi:'<path d="M3 9H29M3 16H29M3 23H29"/>',
  project:'<circle cx="16" cy="16" r="9"/><circle cx="16" cy="16" r="3"/>',
  item:'<path d="M8 4H22L27 9V28H8Z"/>'
 };
 return `<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${paths[kind]||paths.item}</svg>`;
}
function decoratePropertiesHeader(mode='item'){
 const kind=mode==='project'?'project':mode==='multi'?'multi':propertyKind();
 const kinds={pipe:'Tubería',tee:'T',elbow:'Codo C2',bend:'Curva',reducer:'Reducción',support:'Soporte',weld:'Soldadura',multi:'Selección múltiple',item:'Propiedades',project:'Configuración'};
 const text=mode==='project'?'Proyecto':(kinds[kind]||'Propiedades');
 panelTitle.innerHTML=`<span class="prop-heading">${propertyIcon(kind)}<span>${escaped(text)}</span></span><span class="prop-quick">${mode==='project'||kind==='support'||(kind==='multi'&&[...state.selection].every(t=>!!supportByToken(t)))?'':`<button class="prop-shortcut tt-insulation-quick" type="button" id="propInsulationIcon" title="Aislamiento térmico" aria-label="Mostrar u ocultar aislamiento térmico" aria-expanded="false"><svg viewBox="0 0 36 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M3 9H33M3 23H33" stroke-dasharray="5 4"/><path d="M4 16H32" stroke-width="3"/></svg></button><button class="prop-shortcut" type="button" id="propCatalogIcon" aria-label="Catálogo de ${escaped(text)}" title="Catálogo del elemento">▦</button><button class="prop-shortcut" type="button" id="propProjectIcon" aria-label="Configuración del proyecto" title="Configuración">⚙</button>`}</span>`;
 const insButton=$('propInsulationIcon');if(insButton){
  const first=[...state.selection][0];const active=state.selection.size===1&&edgeInsulated(first);
  insButton.classList.toggle('has-insulation',active);
  insButton.addEventListener('click',()=>{
   const wasOn=insButton.getAttribute('aria-pressed')==='true';const wasOpen=propertyPanel.classList.contains('tt-insulation-open');const on=wasOn&&!wasOpen?true:!wasOn;
   insButton.setAttribute('aria-pressed',String(on));insButton.classList.toggle('open',on);insButton.classList.toggle('has-insulation',on);
   propertyPanel.classList.toggle('tt-insulation-open',on);
   const control=$('eInsulated')||$('multi_insulation');if(control){control.value=on?'on':'off';control.dataset.dirty='1'}
   if(on){const fld=$('eInsulationThickness')||$('multi_insulationThickness');fld?.focus({preventScroll:true});}
  });
  insButton.setAttribute('aria-pressed',String(active));
 }
 $('propCatalogIcon')?.addEventListener('click',()=>{
  if(mode==='multi'){message('Seleccione un solo componente para consultar su catálogo.');return}
  openDimensionCatalog();
 });
 $('propProjectIcon')?.addEventListener('click',()=>{
  if(mode==='project')return;
  // Los cambios sin confirmar del formulario no se guardan al cambiar de ventana.
  if(!window.confirm('Ir a configuración sin aplicar cambios de este elemento?'))return;
  state.panel={mode:'projectProps'};renderPropertyForm();
 });
}
function openProjectConfig(){
 if(state.panel||state.copy.enabled||state.reducerMode||state.draft.length){message('Termine la operación actual para abrir configuración.');return}
 $('unitsMenu').hidden=true;closeFilter();state.panel={mode:'projectProps'};renderPropertyForm();
}

/* Catálogo técnico interno: NO se calculan dimensiones de fabricante a partir del dibujo. */
function dimIdentity(){const token=[...state.selection][0],edge=itemEdge(token),fit=classify().fittings.find(f=>f.id===token);
 if(!edge&&!fit){const sp=supportByToken(token);if(!sp)return null;const host=sp.hostType==='edge'?state.graph.edges.find(e=>e.id===sp.hostId):null;return{type:'support',d:Number(host?.diam)||2,wall:host?.wall||state.graph.project.wall||'SCH 40',spec:host?.spec||state.graph.project.spec||'150',token};}
 const type=edge?(edge.kind==='reducer'?(edge.reducerType==='eccentric'?'eccentric':'concentric'):'pipe'):(fit.kind||'accessory');
 const d=edge?(edge.kind==='reducer'?Math.max(Number(edge.from)||2,Number(edge.to)||2):Number(edge.diam)||2):fit.kind==='tee'?Number(fit.detail?.run)||2:Number((adjacency().get(fit.node)||[])[0]?.edge.diam)||2;
 const wall=edge?.wall||state.graph.project.wall||'SCH 40';const spec=edge?.spec||componentProps(token).spec||((adjacency().get(fit.node)||[])[0]?.edge?.spec)||state.graph.project.spec||'150';return{type,d,wall,token,spec};
}
function catalogFamily(type){return ({pipe:'Tubería',elbow:'C2 · Codo',tee:'T · Tee',concentric:'Reducción concéntrica',eccentric:'Reducción excéntrica',bend:'Curva',support:'Soporte',valve:'Válvula',flange:'Brida'})[type]||type}
function catalogFields(type){return type==='support'?[['realLength','Altura / dimensión']]:type==='tee'?[['centerLeft','Boca principal 1 a centro'],['centerRight','Centro a boca principal 2'],['centerBranch','Centro a derivación'],['totalLength','Longitud total principal']]:type==='elbow'||type==='bend'?[['realLength','Longitud real'],['radius','Radio']]:[['realLength','Longitud axial']];}
function closeDimensionCatalog(){$('dimensionsPanel').hidden=true;if(state.panel)propertyPanel.hidden=false;render()}
function openDimensionCatalog(fromProject=false){ensureProject();const identity=dimIdentity()||(fromProject?{type:'pipe',d:2,wall:state.graph.project.wall||'SCH 40',spec:state.graph.project.spec||'150'}:null);if(!identity)return;
 const {type,d,wall,spec}=identity,fields=catalogFields(type),saved=(state.graph.dimensionCatalog||[]).find(o=>o.type===type&&Number(o.d)===d&&o.wall===wall&&(o.spec||'150')===spec);
 const current=Object.fromEntries([['realLength','ePartLength'],['radius','eRadius'],['centerLeft','eLeft'],['centerRight','eRight'],['centerBranch','eBranch'],['totalLength','eTotal']].map(([key,id])=>[key,$(id)?.value||'']));
 $('dimensionsContent').innerHTML=`<div class="dimgrid">
 <div><label>Familia</label><select id="dimType">${['pipe','elbow','tee','concentric','eccentric','bend','support','valve','flange'].map(t=>`<option value="${escaped(t)}" ${t===type?'selected':''}>${escaped(catalogFamily(t))}</option>`).join('')}</select></div>
 <div><label>Especificación</label><input id="dimSpec" list="catalogSpecs" type="text" value="${escaped(spec)}"><datalist id="catalogSpecs">${[...new Set(['150',state.graph.project.spec,...state.graph.dimensionCatalog.map(r=>r.spec||'150')])].map(v=>`<option value="${escaped(v)}"></option>`).join('')}</datalist></div>
 <div><label>DN (pulgadas)</label><input type="text" id="dimDN" inputmode="decimal" value="${dnFmt(d)}"></div>
 <div style="grid-column:1/-1"><label>Espesor / SCH</label><input id="dimWall" type="text" value="${escaped(wall)}"></div>
 <div id="dimFields" style="display:contents">${fields.map(([field,label])=>`<div><label>${escaped(label)} (${state.graph.project.lengthUnit})</label><input type="number" min="0" step="any" inputmode="decimal" data-dim-field="${field}" value="${escaped(saved?.[field]??current[field]??'')}" placeholder="Por definir"></div>`).join('')}</div>
 <div style="grid-column:1/-1"><button type="button" id="dimLoad">Buscar valores guardados</button></div>
 <div style="grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button type="button" id="dimApply">Aplicar a propiedades</button><button type="button" class="dim-save" id="dimSave">Guardar en catálogo y aplicar</button></div></div>
 <p>Válvulas y otros accesorios quedan preparados para futuras incorporaciones. No se incluyen valores normativos inventados.</p>`;
 $('dimensionsPanel').hidden=false;propertyPanel.hidden=true;
 $('dimType').addEventListener('change',()=>{const tt=$('dimType').value,dn=parseDN($('dimDN').value),w=$('dimWall').value.trim();const record=state.graph.dimensionCatalog.find(o=>o.type===tt&&o.d===dn&&o.wall===w&&(o.spec||'150')===($('dimSpec').value.trim()||'150'));
  $('dimFields').innerHTML=catalogFields(tt).map(([key,label])=>`<div><label>${escaped(label)} (${state.graph.project.lengthUnit})</label><input type="number" min="0" step="any" data-dim-field="${key}" value="${escaped(record?.[key]??'')}" placeholder="Por definir"></div>`).join('');
 });
 const load=()=>{const t=$('dimType').value,dn=parseDN($('dimDN').value),w=$('dimWall').value.trim();const record=(state.graph.dimensionCatalog||[]).find(o=>o.type===t&&Number(o.d)===dn&&o.wall===w&&(o.spec||'150')===($('dimSpec').value.trim()||'150'));
 if(!record){message('No hay dimensiones guardadas para esa combinación.');return}
 for(const inp of $('dimensionsContent').querySelectorAll('[data-dim-field]'))inp.value=record[inp.dataset.dimField]??'';
 message('Dimensiones del catálogo recuperadas.');};
 $('dimLoad').addEventListener('click',load);
 function apply(store){const t=$('dimType').value,dn=parseDN($('dimDN').value),w=$('dimWall').value.trim(),catalogSpec=$('dimSpec').value.trim();if(dn==null||!w||!catalogSpec){message('Indique especificación, diámetro y espesor válidos.');return}
  const vals={};for(const inp of $('dimensionsContent').querySelectorAll('[data-dim-field]')){const v=inp.value.trim();if(v!==''&&(!Number.isFinite(Number(v))||Number(v)<=0)){message('Dimensión inválida.');return}vals[inp.dataset.dimField]=v===''?null:Number(v)}
  if(t==='tee'&&Number.isFinite(vals.centerLeft)&&Number.isFinite(vals.centerRight)){
    vals.totalLength=f(vals.centerLeft+vals.centerRight);
  }
  if(store){const all=state.graph.dimensionCatalog,idx=all.findIndex(o=>o.type===t&&o.d===dn&&o.wall===w&&(o.spec||'150')===catalogSpec);const rec={type:t,spec:catalogSpec,d:dn,wall:w,...vals};if(idx>=0)all[idx]=rec;else all.push(rec);save()}
  if(t===type&&Math.abs(dn-d)<1e-5){const inputs={realLength:'ePartLength',radius:'eRadius',centerLeft:'eLeft',centerRight:'eRight',centerBranch:'eBranch',totalLength:'eTotal'};
   for(const [key,val] of Object.entries(vals))if($(inputs[key]))$(inputs[key]).value=val??'';
  }else message('Valores registrados para otro tipo o diámetro. No se alteran las propiedades del componente actual.');
  closeDimensionCatalog();
 }
 $('dimApply').addEventListener('click',()=>apply(false));$('dimSave').addEventListener('click',()=>apply(true));
}
/* Edición múltiple: solo modifica los campos que el usuario marca expresamente.
   Los valores heterogéneos aparecen como «Valores diferentes». */
function multiPropertiesMarkup(){
 const tokens=[...state.selection],supports=tokens.map(supportByToken).filter(Boolean),ordinary=tokens.filter(id=>!supportByToken(id));
 let html=`<p class="panelhint">${tokens.length} seleccionados. Edite solo lo necesario.</p>`;
 const field=(key,label,type,options)=>{
  const control=options?`<select id="multi_${key}"><option value="">Sin cambios</option>${options.map(([v,t])=>`<option value="${escaped(v)}">${escaped(t)}</option>`).join('')}</select>`:type==='area'?`<textarea id="multi_${key}" placeholder="Sin cambios"></textarea>`:`<input id="multi_${key}" type="${type||'text'}" placeholder="Sin cambios">`;
  return `<div class="multi-field"><label for="multi_${key}">${label}</label>${control}</div>`;
 };
 if(ordinary.length){html+=`<div class="prop-grid"><div class="full prop-note">${ordinary.length} elementos.</div>`;
 html+=field('status','Condición',null,[['new','Nuevo'],['existing','Existente']]);
 html+=field('installation','Instalación',null,[['aerial','Aéreo'],['buried','Enterrado'],['channel','Canal / caja']]);html+='<div class="full insulation-set tt-insulation-fields"><input id="multi_insulation" type="hidden" value="">'+field('insulationThickness','Espesor de aislamiento ('+state.graph.project.lengthUnit+')','number')+'</div>';
 html+=field('lineId','Número de línea');html+=field('spec','Especificación');html+=field('material','Material');html+=field('wall','Espesor / SCH');html+=field('service','Servicio');html+=field('description','Descripción','area');html+='</div>'}
 if(supports.length){html+=`<div class="prop-grid"><div class="full prop-note">${supports.length} soportes. TAG individual.</div>`;
 html+=field('supportKind','Tipo de soporte',null,[['cross','Metálico'],['concrete','Dado de concreto']]);
 html+=field('supportPlacement','Ubicación',null,[['above','Encima'],['below','Debajo']]);
 html+=field('supportBop','Altura BOP ('+state.graph.project.lengthUnit+')','number');html+='</div>'}
 return html;
}
function applyMultiTechnicalProperties(){
 const selected=[...state.selection],checked=key=>!!$('multi_'+key)?.dataset.dirty,
 val=key=>($('multi_'+key)?.value??'').trim();
 const specs=['status','installation','lineId','spec','material','wall','service','description','insulation'];
 for(const k of specs)if(checked(k)&&!val(k)&&k!=='description'){message(`Indique un valor para ${k}.`);return false}
 if(checked('insulationThickness')&&val('insulationThickness')!==''&&(!Number.isFinite(Number(val('insulationThickness')))||Number(val('insulationThickness'))<0)){message('Espesor de aislamiento inválido.');return false}
 if(checked('supportBop')&&val('supportBop')!==''&&(!Number.isFinite(Number(val('supportBop')))||Number(val('supportBop'))<0)){message('Altura BOP inválida.');return false}
 if(checked('supportPlacement')&&val('supportPlacement')==='above'&&selected.some(id=>{const s=supportByToken(id);return s&&s.hostType==='fit'&&['elbow','bend'].includes(s.hostKind)})){message('No se permite ubicar soportes sobre codos.');return false}
 for(const token of selected){const sp=supportByToken(token);
  if(sp){if(checked('supportKind'))sp.kind=val('supportKind');if(checked('supportPlacement'))sp.placement=val('supportPlacement');if(checked('supportBop'))sp.bop=val('supportBop')===''?null:Number(val('supportBop'));continue}
  const e=itemEdge(token),m=e||((state.graph.componentProps||={})[token]||={});
  for(const k of specs)if(checked(k))m[k]=k==='material'?normalizeMaterial(val(k)):k==='insulation'?val(k)==='on':val(k);if(checked('insulationThickness'))m.insulationThickness=val('insulationThickness')===''?null:Number(val('insulationThickness'));
 }
 message('Propiedades comunes actualizadas sin cambiar los demás valores.');return true;
}
function renderPropertyForm(){propertyPanel.classList.remove('tt-insulation-open');ensureProject();const proj=state.graph.project,mode=state.panel.mode,objects=selectedObjects(),hasSelection=state.selection.size>0;
 const cur=mode==='projectProps'?'general':'element';panelTitle.textContent=cur==='general'?'Configuración':'Propiedades';
 let html=propertyTabs(cur);
 if(cur==='element'&&state.selection.size>1){
  panelTitle.textContent='Selección múltiple';panelBody.innerHTML=html+multiPropertiesMarkup();propertyPanel.hidden=false;decoratePropertiesHeader('multi');
  panelBody.querySelectorAll('[id^="multi_"]').forEach(el=>{el.addEventListener('input',()=>el.dataset.dirty='1');el.addEventListener('change',()=>el.dataset.dirty='1')});
  bindPropertyTabs();render();return;
 }
 if(cur==='general'){
  html+=`<div class="prop-grid">${propertyField('pLine','Línea (PIPELINE-REFERENCE)',proj.lineId,'text','placeholder="Ej.: L-001"')}${propertyField('pProject','Proyecto',proj.projectId)}
  ${propertyField('pSpec','Especificación del proyecto',proj.spec)}${propertyField('pService','Servicio',proj.service)}
  ${propertyField('pMaterial','Material predeterminado',proj.material,'text','list="materialOptions"')}${propertyField('pWall','Espesor / SCH predeterminado',proj.wall)}
  ${propSelect('pUnits','Unidades de longitud',[['mm','mm · Milímetros'],['m','m · Metros'],['ft','ft · Pies'],['in','in · Pulgadas']],proj.lengthUnit)}${propSelect('pCoord','Unidades XYZ',[['mm','mm'],['m','m'],['ft','ft'],['in','in']],proj.coordinateUnit)}
  ${propSelect('pStatus','Estado inicial',[['new','Nuevo'],['existing','Existente']],proj.defaultStatus)}${propSelect('pInstall','Instalación inicial',[['aerial','Aéreo'],['buried','Enterrado'],['channel','Canal / caja']],proj.defaultInstallation)}
  <div class="full"><label for="pDescription">Descripción del proyecto</label><textarea id="pDescription">${escaped(proj.description)}</textarea></div>
  <div class="full"><button class="dim-launch" id="openProjectCatalog" type="button">▦  Catálogo de la especificación ${escaped(proj.spec||'150')}</button></div></div>`;
 }else if(!hasSelection){
  html+=`<p class="panelhint">Seleccione un tubo, una reducción, un codo, una T o una soldadura y abra PROPIED. para editarlo.</p>`;
 }else{
  const first=[...state.selection][0],e=itemEdge(first),fit=objects.fits.find(f=>f.id===first),w=objects.welds.find(w=>w.id===first),count=state.selection.size;
  const meta=e?e:componentProps(first);const status=e?edgeStatus(e):fit?fitEffective(first,'status'):(meta.status||proj.defaultStatus);
  const installation=e?edgeInstallation(e):fit?fitEffective(first,'installation'):(meta.installation||proj.defaultInstallation);
  const kind=e?(e.kind==='reducer'?(e.reducerType==='eccentric'?'Reducción excéntrica':'Reducción concéntrica'):'Tubo'):fit?({tee:'T',elbow:'Codo',bend:'Curva'}[fit.kind]||'Accesorio'):w?'Soldadura':'Elementos';
  const material=e?(e.material||proj.material):(meta.material||proj.material);
  const desc=e?(e.description||''):(meta.description||'');
  html+=`<div class="prop-grid">
   ${propSelect('eStatus','Condición',[['new','Nuevo'],['existing','Existente']],status)}
   ${propSelect('eInstallation','Instalación',[['aerial','Aéreo'],['buried','Enterrado'],['channel','Canal / caja']],installation)}
   <div class="full insulation-set"><input id="eInsulated" type="hidden" value="${edgeInsulated(first)?'on':'off'}"><div id="eInsulationThicknessWrap">${propertyField('eInsulationThickness','Espesor de aislamiento ('+proj.lengthUnit+')',insulationValue(first),'number','min="0" step="any"')}</div></div>
   ${count===1?`${propertyField('eLine','Número de línea',e?.lineId||meta.lineId||proj.lineId||'')}${propertyField('eMaterial','Material',material,'text','list="materialOptions"')}${propertyField('eWall','Espesor / SCH',e?.wall||proj.wall||'SCH 40')}${propertyField('eSpec','Especificación',e?.spec||meta.spec||proj.spec||'150')}${propertyField('eService','Servicio',e?.service||meta.service||proj.service||'')}`:''}
   ${count===1&&e&&e.kind==='pipe'?`${propertyField('eDn','DN (pulgadas)',dnFmt(e.diam),'text','inputmode="decimal" list="diamOptions"')}${propertyField('eLength','Longitud real del tramo ('+proj.lengthUnit+')',e.realLength??'','number','min="0" step="any" placeholder="Sin definir"')}`:''}
   ${count===1&&e&&e.kind==='reducer'?`<div class="full prop-note">Boca 1: ${dnFmt(e.from)}″ · Boca 2: ${dnFmt(e.to)}″. Los diámetros se cambian respetando las conexiones existentes.</div>`:''}
   ${count===1&&e&&e.kind==='reducer'?propertyField('ePartLength','Longitud real reducción ('+proj.lengthUnit+')',e.realLength??'','number','min="0" step="any" placeholder="Pendiente"'):''}
   ${count===1&&fit&&['elbow','bend'].includes(fit.kind)?`${propertyField('ePartLength','Longitud real del codo/curva ('+proj.lengthUnit+')',meta.realLength??'','number','min="0" step="any" placeholder="Pendiente"')}${propertyField('eRadius','Radio de curvatura ('+proj.lengthUnit+')',meta.radius??'','number','min="0" step="any" placeholder="Pendiente"')}`:''}
   ${count===1&&fit&&fit.kind==='tee'?`${propertyField('eLeft','Boca principal 1 al centro ('+proj.lengthUnit+')',meta.centerLeft??'','number','min="0" step="any" placeholder="Pendiente"')}${propertyField('eRight','Centro a boca principal 2 ('+proj.lengthUnit+')',meta.centerRight??'','number','min="0" step="any" placeholder="Pendiente"')}${propertyField('eBranch','Centro a boca derivación ('+proj.lengthUnit+')',meta.centerBranch??'','number','min="0" step="any" placeholder="Pendiente"')}${propertyField('eTotal','Longitud total principal ('+proj.lengthUnit+')',meta.totalLength??(Number.isFinite(meta.centerLeft)&&Number.isFinite(meta.centerRight)?f(meta.centerLeft+meta.centerRight):''),'number','min="0" step="any" placeholder="Pendiente"')}`:''}
   

   ${count===1&&fit&&fit.kind==='tee'?`<div class="full prop-note">DN principal: ${dnFmt(fit.detail.run)}″ · DN derivación: ${dnFmt(fit.detail.branchDn)}″. </div>`:''}
   ${count===1?`<div class="full"><label for="eDesc">Descripción</label><textarea id="eDesc">${escaped(desc)}</textarea></div>`:''}
   
  </div>`;
 }
 html+=`<datalist id="materialOptions">${MATERIALS.map(m=>`<option value="${escaped(m)}"></option>`).join('')}</datalist><datalist id="diamOptions">${CAT.nominalDN.map(d=>`<option value="${dnFmt(d)}"></option>`).join('')}</datalist>`;
 panelBody.innerHTML=html;propertyPanel.hidden=false;decoratePropertiesHeader(cur==='general'?'project':'item');render();bindPropertyTabs();$('openDimensions')?.addEventListener('click',openDimensionCatalog);$('openProjectCatalog')?.addEventListener('click',()=>openDimensionCatalog(true));
 const preferred=cur==='general'?'pLine':'eLength';const el=$(preferred);if(el){el.focus({preventScroll:true});if(el.value&&el.select)el.select()}
}
function openProperties(){if(state.panel||state.tool||state.copy.enabled||state.reducerMode)return;if(!state.selection.size){message('Seleccione un elemento para abrir sus propiedades. Configuración: barra superior.');return}if(state.selection.size===1&&supportByToken([...state.selection][0])){showSupportProperties();return}
 closeFilter();state.panel={mode:state.selection.size?'itemProps':'projectProps'};renderPropertyForm()}
function applyTechnicalProperties(){const proj=state.graph.project;
 if(state.panel.mode==='projectProps'){
  const line=$('pLine').value.trim(),project=$('pProject').value.trim(),spec=$('pSpec').value.trim(),service=$('pService').value.trim(),material=$('pMaterial').value.trim(),wall=$('pWall').value.trim();
  if(!material||!wall){message('Material y espesor no pueden quedar vacíos.');return false}
  const newUnit=$('pUnits').value;
  if(newUnit!==proj.lengthUnit)convertLengthUnit(newUnit);
  state.graph.project={...proj,lineId:line,projectId:project,spec,service,material:normalizeMaterial(material),wall,description:$('pDescription').value.trim(),lengthUnit:newUnit,coordinateUnit:$('pCoord').value,defaultStatus:$('pStatus').value,defaultInstallation:$('pInstall').value};
  message('Propiedades generales guardadas.');return true;
 }
 if(state.panel.mode==='itemProps'){
  if(state.selection.size>1)return applyMultiTechnicalProperties();
  const status=$('eStatus')?.value,installation=$('eInstallation')?.value;if(!status||!installation){message('Seleccione estado e instalación.');return false}
  const selected=[...state.selection],rawMaterial=$('eMaterial')?.value.trim(),wall=$('eWall')?.value.trim();
  if(selected.length===1&&(!rawMaterial||!wall)){message('Material y espesor son obligatorios.');return false}
  const token=selected[0],edge=itemEdge(token);const insulated=$('eInsulated')?.value==='on',insRaw=$('eInsulationThickness')?.value.trim()||'';if(insulated&&insRaw!==''&&(!Number.isFinite(Number(insRaw))||Number(insRaw)<0)){message('Espesor de aislamiento inválido.');return false}
  if(selected.length===1&&edge?.kind==='pipe'&&$('eDn')){
   const dn=parseDN($('eDn').value);if(dn==null){message('DN inválido.');return false}
   const backup=modelCopy(),out=changeDiameterKeepingTees([edge.id],dn);
   if(out.error){state.graph=backup;message(out.error);return false}
  }
  const entryFields=[['ePartLength','realLength'],['eRadius','radius'],['eLeft','centerLeft'],['eRight','centerRight'],['eBranch','centerBranch'],['eTotal','totalLength']];
  const dimValues={};for(const [htmlKey,field] of entryFields){const input=$(htmlKey);if(!input)continue;
   const txt=input.value.trim();if(txt!==''&&(!Number.isFinite(Number(txt))||Number(txt)<=0)){message('Ingrese una dimensión positiva en '+htmlKey);input.focus();return false}
   dimValues[field]=txt===''?null:Number(txt);
  }
  if($('eLeft')&&$('eRight')&&Number.isFinite(dimValues.centerLeft)&&Number.isFinite(dimValues.centerRight)){
   const sum=f(dimValues.centerLeft+dimValues.centerRight);
   if(dimValues.totalLength===null)dimValues.totalLength=sum;
   if(Number.isFinite(dimValues.totalLength)&&Math.abs(dimValues.totalLength-sum)>1e-3){message('La longitud total de la T debe ser la suma de sus dos distancias al centro.');return false}
  }
  const lengthInput=$('eLength'),lengthVal=lengthInput?.value.trim();
  if(lengthInput&&lengthVal!==''&&(!Number.isFinite(Number(lengthVal))||Number(lengthVal)<=0)){message('La longitud real debe ser positiva.');return false}
  state.graph.componentProps||={};
  for(const id of selected){const e=itemEdge(id);if(e){e.status=status;e.installation=installation;
     if(selected.length===1){e.insulation=insulated;e.insulationThickness=insRaw===''?null:Number(insRaw);e.lineId=$('eLine')?.value.trim()||'';e.material=normalizeMaterial(rawMaterial);e.wall=wall;e.spec=$('eSpec')?.value.trim()||proj.spec||'150';e.description=$('eDesc')?.value.trim()||'';e.service=$('eService')?.value.trim()||null;if(e.kind==='pipe'){e.realLength=lengthVal===''?null:Number(lengthVal);for(const sp of state.graph.supports||[])if(sp.hostType==='edge'&&sp.hostId===e.id&&Number.isFinite(sp.distanceFromRef)&&Number.isFinite(e.realLength)&&e.realLength>0)updateSupportRatioFromLength(sp)}Object.assign(e,dimValues)}
   }else{const meta=state.graph.componentProps[id]||{};Object.assign(meta,{status,installation});
    if(selected.length===1)Object.assign(meta,{insulation:insulated,insulationThickness:insRaw===''?null:Number(insRaw),lineId:$('eLine')?.value.trim()||'',material:normalizeMaterial(rawMaterial),wall,spec:$('eSpec')?.value.trim()||proj.spec||'150',description:$('eDesc')?.value.trim()||'',service:$('eService')?.value.trim()||null});Object.assign(meta,dimValues);state.graph.componentProps[id]=meta;}
  }
  message('Propiedades de elemento(s) guardadas.');return true;
 }
 return false;
}
/* TABLAS: cuantificación real de piezas, sin inventar longitudes ni equipos. */
function defaultComponentDescription(kind,diam,wall,type){
 const dn=dnFmt(diam)+'″';return kind==='pipe'?`Tubería ${dn} · ${wall||'SCH 40'}`:kind==='reducer'?`${type==='eccentric'?'Reducción excéntrica':'Reducción concéntrica'} ${dn}`:kind==='tee'?`T ${dn}`:kind==='elbow'?`Codo ${dn}`:kind==='bend'?`Curva ${dn}`:'Accesorio '+dn;
}
function tableMaterials(){ensureEdgeMetadata();const rows=[];
 for(const g of cuttingGroups()){const e=g[0];rows.push({kind:'Tubo',diam:e.diam,description:e.description||defaultComponentDescription('pipe',e.diam,e.wall),material:e.material,status:edgeStatus(e),location:edgeInstallation(e),qty:1})}
 for(const e of state.graph.edges.filter(e=>e.kind==='reducer'&&!e.referencePort)){rows.push({kind:'Reducción',diam:e.to,description:e.description||`${e.reducerType==='eccentric'?'Reducción excéntrica':'Reducción concéntrica'} ${dnFmt(e.from)}x${dnFmt(e.to)}`,material:e.material,status:edgeStatus(e),location:edgeInstallation(e),qty:1})}
 const info=classify();for(const fit of info.fittings){if(!['tee','elbow'].includes(fit.kind))continue;
  const edges=(info.adj.get(fit.node)||[]).map(l=>l.edge),d=fit.kind==='tee'?fit.detail?.run:edges[0]?.diam||2,m=state.graph.componentProps?.[fit.id]||{};
  rows.push({kind:fit.kind==='tee'?'T':'Codo',diam:d||2,description:m.description||fit.label,material:m.material||edges[0]?.material||state.graph.project.material,status:fitEffective(fit.id,'status'),location:fitEffective(fit.id,'installation'),qty:1})}
 // Curvas quedan incluidas en las piezas de corte; no se duplican como accesorios.
 const grouped=new Map();for(const r of rows){const key=[r.kind,r.diam,r.description,r.material,r.status,r.location].join('|');if(grouped.has(key))grouped.get(key).qty+=r.qty;else grouped.set(key,{...r})}return [...grouped.values()];
}
function tableMaterialEntries(){
 const rows=[];for(const es of cuttingGroups()){const e=es[0];rows.push({token:'E'+e.id,kind:'Tubo',dn:e.diam,desc:e.description||defaultComponentDescription('pipe',e.diam,e.wall),material:e.material,wall:e.wall,status:edgeStatus(e),spec:e.spec||state.graph.project.spec||'150',group:es.map(o=>o.id)})}
 for(const e of state.graph.edges.filter(o=>o.kind==='reducer'&&!o.referencePort))rows.push({token:'R'+e.id,kind:'Reducción',dn:e.from,desc:e.description||`Reducción ${dnFmt(e.from)}x${dnFmt(e.to)}`,material:e.material,wall:e.wall,status:edgeStatus(e),spec:e.spec||state.graph.project.spec||'150',group:[e.id]});
 const info=classify();for(const fit of info.fittings.filter(f=>['tee','elbow'].includes(f.kind))){const m=componentProps(fit.id),edge=info.adj.get(fit.node)?.[0]?.edge;rows.push({token:fit.id,kind:fit.kind==='tee'?'T':'Codo',dn:fit.kind==='tee'?fit.detail?.run:edge?.diam,desc:m.description||fit.label,material:m.material||edge?.material||state.graph.project.material,wall:m.wall||edge?.wall||state.graph.project.wall,status:fitEffective(fit.id,'status'),spec:m.spec||edge?.spec||state.graph.project.spec||'150',group:[]})}
 return rows;
}
function effectiveCutLength(c){const saved=state.graph.cutValues?.[String(Math.min(...c.segments))];if(Number.isFinite(saved?.length))return saved.length;const edges=c.segments.map(id=>state.graph.edges.find(e=>e.id===id));return edges.length&&edges.every(e=>Number.isFinite(e?.realLength)&&e.realLength>0)?f(edges.reduce((sum,e)=>sum+e.realLength,0)):null}
function canonicalLine(value){return String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleUpperCase('es-CO')}
function lineTokens(key){const desired=canonicalLine(key==='Sin especificar'?'':key),out=new Set();
 const edges=new Set(),nodes=new Set();for(const e of state.graph.edges){if(e.referencePort)continue;if(canonicalLine(lineForToken(edgeSelectionToken(e)))!==desired)continue;out.add(edgeSelectionToken(e));edges.add(e.id);nodes.add(e.a);nodes.add(e.b)}
 const inf=classify();for(const fit of inf.fittings){const explicit=canonicalLine(componentProps(fit.id).lineId);if(explicit?explicit===desired:(inf.adj.get(fit.node)||[]).some(l=>edges.has(l.edge.id)))out.add(fit.id)}
 for(const w of weldRecords())if(canonicalLine(componentProps(w.id).lineId)===desired&&componentProps(w.id).lineId||edges.has(w.part)||(!componentProps(w.id).lineId&&nodes.has(w.node)))out.add(w.id);
 for(const sp of state.graph.supports||[])if(canonicalLine(lineForToken('S'+sp.id))===desired)out.add('S'+sp.id);
 return out;
}
function lineEntries(){ensureProject();const lines=new Map();for(const e of state.graph.edges.filter(e=>!e.referencePort)){
 const line=String(e.lineId||state.graph.project.lineId||'').trim(),key=line||'Sin especificar';if(!lines.has(key))lines.set(key,{line,key,edgeIds:[],service:e.service||state.graph.project.service||'',spec:e.spec||state.graph.project.spec||'',description:e.lineDescription||state.graph.project.description||''});lines.get(key).edgeIds.push(e.id)}
 if(!lines.size)lines.set('Sin especificar',{line:'',key:'Sin especificar',edgeIds:[],service:state.graph.project.service||'',spec:state.graph.project.spec||'',description:state.graph.project.description||''});return [...lines.values()].sort((a,b)=>a.key.localeCompare(b.key,'es'));
}
function frameLineTokens(tokens){const pts=[];const info=classify();for(const t of tokens){const edge=itemEdge(t);if(edge){for(const id of [edge.a,edge.b]){const n=getNode(id);if(n)pts.push(project(n.p))}continue}const sp=supportByToken(t);if(sp){const h=supportHost(sp);if(h)pts.push(project(h.p));continue}const ft=info.fittings.find(f=>f.id===t);if(ft){const n=getNode(ft.node);if(n)pts.push(project(n.p))}}
 if(!pts.length)return;const minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x)),minY=Math.min(...pts.map(p=>p.y)),maxY=Math.max(...pts.map(p=>p.y));const box=canvas.getBoundingClientRect();const k=Math.max(.08,Math.min(CAT.maxZoom,(box.width-75)/Math.max(maxX-minX,60),(box.height-135)/Math.max(maxY-minY,60)));state.view={k,dx:-(minX+maxX)*k/2,dy:-(minY+maxY)*k/2};}
function lineTableAction(key,action){const tokens=lineTokens(key);if(!tokens.size){message('No hay elementos de esa línea.');return}state.tool=false;state.reducerMode=false;state.selection.clear();state.isolation=null;state.filterMode='none';state.filterAction='select';if(action==='isolate'){state.isolation={tokens,mode:'line',seed:null}}else state.selection=new Set(tokens);
 closeTables();frameLineTokens(tokens);render();message(`${action==='isolate'?'Aislados':'Seleccionados'}: ${key} (${tokens.size}).`)}

function editBox(value,scope,key,token,wide=false){return `<input type="text" data-edit="${escaped(scope)}" data-key="${escaped(key)}" data-token="${escaped(token)}" value="${escaped(value??'')}" aria-label="Editar ${escaped(key)}" style="${wide?'min-width:170px':''}">`}
function editNum(value,scope,key,token){return `<input type="number" step="any" class="small-number" inputmode="decimal" data-edit="${escaped(scope)}" data-key="${escaped(key)}" data-token="${escaped(token)}" value="${escaped(value??'')}" placeholder="Pendiente">`}
/* v0.36: Agregación de componentes físicos; no se suman dimensiones desconocidas.
   En vista Individual se mantienen las mismas filas y funciones de edición. */
function ttTotalMarkup(table,tab){
 const cell=escaped;const totals=(list,keyFn)=>{const grouped=new Map();for(const item of list){const key=keyFn(item);if(!grouped.has(key))grouped.set(key,{...item,qty:0,items:[]});const dest=grouped.get(key);dest.qty++;dest.items.push(item)}return [...grouped.values()]};
 const countFooter=(col,count,label='TOTAL')=>`<tfoot><tr class="tt-grand-total"><th colspan="${col}">${label}</th><th>${count}</th></tr></tfoot>`;
 const nformat=v=>Number.isFinite(v)?lengthString(v,state.graph.project.lengthUnit):'Sin definir';
 const messageForEdit='<p class="t-note">Para editar cada componente, cambie a Individual.</p>';
 if(tab==='materials'){
  const items=tableMaterialEntries();const grouped=totals(items,r=>JSON.stringify([r.kind,String(r.desc||'').trim().toLocaleUpperCase('es-CO'),Number(r.dn||0),normalizeMaterial(r.material),r.wall||'',r.spec||'',r.status||'']));
  table.innerHTML=grouped.length?`<table class="tt-total-table"><thead><tr><th>Tipo</th><th>DN</th><th>Descripción</th><th>Material</th><th>SCH</th><th>Espec.</th><th>Estado</th><th>Cant.</th></tr></thead><tbody>${grouped.map(r=>`<tr><td>${cell(r.kind)}</td><td>${dnFmt(r.dn)}″</td><td>${cell(r.desc)}</td><td>${cell(r.material)}</td><td>${cell(r.wall)}</td><td>${cell(r.spec||'150')}</td><td>${r.status==='existing'?'Existente':'Nuevo'}</td><td>${r.qty}</td></tr>`).join('')}</tbody>${countFooter(7,items.length)}</table>`:'<p class="t-note">Sin materiales.</p>';
 }else if(tab==='welds'){
  const items=weldRecords();const grouped=totals(items,r=>String(Number(r.diam)||0)).sort((a,b)=>Number(a.diam)-Number(b.diam));
  table.innerHTML=grouped.length?`<table class="tt-total-table"><thead><tr><th>DN soldadura</th><th>Cantidad</th></tr></thead><tbody>${grouped.map(r=>`<tr><td>${dnFmt(r.diam)}″</td><td>${r.qty}</td></tr>`).join('')}</tbody>${countFooter(1,items.length)}</table>`:'<p class="t-note">No hay soldaduras.</p>';
 }else if(tab==='supports'){
  const items=state.graph.supports||[];const grouped=totals(items,r=>JSON.stringify([r.kind||'cross',r.placement||'below']));
  table.innerHTML=grouped.length?`<table class="tt-total-table"><thead><tr><th>Descripción</th><th>Posición</th><th>Cantidad</th></tr></thead><tbody>${grouped.map(r=>`<tr><td>${r.kind==='concrete'?'Dado de concreto':'Soporte metálico'}</td><td>${r.placement==='above'?'Encima':'Debajo'}</td><td>${r.qty}</td></tr>`).join('')}</tbody>${countFooter(2,items.length)}</table>`:'<p class="t-note">No hay soportes.</p>';
 }else if(tab==='equipment'){
  const items=state.graph.equipments||[];const grouped=totals(items,r=>JSON.stringify([String(r.description||'').trim().toLocaleUpperCase('es-CO'),String(r.connection||'').trim().toLocaleUpperCase('es-CO')]));
  table.innerHTML=`<button type="button" id="addEquipment" class="filterOption" style="margin:7px 0;padding:9px">+ Agregar equipo</button>`+(grouped.length?`<table class="tt-total-table"><thead><tr><th>Descripción</th><th>Conexión</th><th>Cantidad</th></tr></thead><tbody>${grouped.map(r=>`<tr><td>${cell(r.description||'Sin descripción')}</td><td>${cell(r.connection||'Sin definir')}</td><td>${r.qty}</td></tr>`).join('')}</tbody>${countFooter(2,items.length)}</table>`:'<p class="t-note">Sin equipos.</p>');
  $('addEquipment')?.addEventListener('click',()=>{state.graph.equipments.push({tag:'EQ-'+String(state.graph.equipments.length+1).padStart(3,'0'),description:'',connection:''});save();renderTables()});
 }else if(tab==='cuts'){
  const items=cuttingList();const grouped=totals(items,r=>JSON.stringify([Number(r.diam||0),r.wall||'',normalizeMaterial(r.material)]));
  table.innerHTML=grouped.length?`<table class="tt-total-table"><thead><tr><th>DN</th><th>SCH</th><th>Material</th><th>Piezas</th><th>Longitud total (${cell(state.graph.project.lengthUnit)})</th></tr></thead><tbody>${grouped.map(r=>{const lengths=r.items.map(c=>effectiveCutLength(c));const allKnown=lengths.every(v=>Number.isFinite(v));return `<tr><td>${dnFmt(r.diam)}″</td><td>${cell(r.wall)}</td><td>${cell(r.material)}</td><td>${r.qty}</td><td>${allKnown?nformat(lengths.reduce((a,b)=>a+b,0)):'Sin definir'}</td></tr>`}).join('')}</tbody><tfoot><tr class="tt-grand-total"><th colspan="3">TOTAL PIEZAS</th><th>${items.length}</th><th>${items.every(c=>Number.isFinite(effectiveCutLength(c)))?nformat(items.reduce((sum,c)=>sum+effectiveCutLength(c),0)):'Sin definir'}</th></tr></tfoot></table>`:'<p class="t-note">No hay cortes.</p>';
 }
 table.innerHTML+=messageForEdit;
}
function renderTables(){const table=$('tablesContent');const tab=tablesState.tab;
 const totalButton=$('tablesAggregationToggle');if(totalButton){totalButton.textContent=tablesState.mode==='total'?'∑ Total':'≡ Individual';totalButton.classList.toggle('active',tablesState.mode==='total');totalButton.setAttribute('aria-pressed',String(tablesState.mode==='total'));}
 if(tablesState.mode==='total'&&tab!=='lines'){document.querySelectorAll('#tablesPanel [data-table]').forEach(b=>b.classList.toggle('active',b.dataset.table===tab));ttTotalMarkup(table,tab);return}
const _ttTableOffset=0;document.querySelectorAll('#tablesPanel [data-table]').forEach(b=>b.classList.toggle('active',b.dataset.table===tab));
 const escape=escaped;
 if(tab==='materials'){
  const rows=tableMaterialEntries();table.innerHTML=rows.length?`<table><thead><tr><th>Tipo</th><th>DN</th><th>Descripción</th><th>Material</th><th>SCH</th><th>Espec.</th><th>Estado</th><th>Cant.</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escaped(r.kind)} <span class="row-ref">${escaped(r.token)}</span></td><td>${dnFmt(r.dn||2)}″</td><td>${editBox(r.desc,'material','description',r.token,true)}</td><td>${editBox(r.material,'material','material',r.token)}</td><td>${editBox(r.wall,'material','wall',r.token)}</td><td>${escaped(r.spec||'150')}</td><td><select data-edit="material" data-key="status" data-token="${r.token}"><option value="new" ${r.status==='new'?'selected':''}>Nuevo</option><option value="existing" ${r.status==='existing'?'selected':''}>Existente</option></select></td><td>1</td></tr>`).join('')}</tbody></table>`:'<p class="t-note">Sin materiales.</p>';
  table.innerHTML+='<p class="t-note">Edite las propiedades de cada componente. Las cantidades y los diámetros se calculan desde el ensamble y no se cambian desde esta tabla.</p>';
 }else if(tab==='cuts'){
  const cuts=cuttingList();table.innerHTML=cuts.length?`<table><thead><tr><th>Corte</th><th>DN</th><th>Espesor</th><th>Material</th><th>Tramos</th><th>Longitud (${escape(state.graph.project.lengthUnit)})</th></tr></thead><tbody>${cuts.map(c=>{const key=String(Math.min(...c.segments)),saved=state.graph.cutValues?.[key];return `<tr><td>${escape(c.tag)}</td><td>${dnFmt(c.diam)}″</td><td>${editBox(c.wall,'cut','wall',key)}</td><td>${editBox(c.material,'cut','material',key)}</td><td>${c.segments.length}</td><td><input type="number" min="0" step="any" inputmode="decimal" aria-label="Longitud corte ${escape(c.tag)}" data-cut="${key}" value="${effectiveCutLength(c)??''}" placeholder="Pendiente"></td></tr>`}).join('')}</tbody></table>`:'<p class="t-note">No hay cortes de tubería.</p>';
  table.innerHTML+='<p class="t-note">Las letras y las agrupaciones se generan automáticamente. Indique las longitudes reales de fabricación; la geometría isométrica de pantalla no se usa como longitud de corte.</p>';
 }else if(tab==='welds'){
  const welds=weldRecords();
  table.innerHTML=welds.length?`<table><thead><tr><th>Unión</th><th>DN</th><th>Tipo</th><th>Línea</th><th>Estado</th></tr></thead><tbody>${welds.map(w=>{const p=componentProps(w.id);return `<tr><td>${escaped(w.id)}</td><td>${dnFmt(w.diam)}″</td><td>${editBox(p.weldType||w.kind,'weld','weldType',w.id)}</td><td>${editBox(p.lineId||lineForToken(w.id)||'','weld','lineId',w.id)}</td><td><select data-edit="weld" data-key="status" data-token="${w.id}"><option value="new" ${p.status!=='existing'?'selected':''}>Nuevo</option><option value="existing" ${p.status==='existing'?'selected':''}>Existente</option></select></td></tr>`}).join('')}</tbody></table>`:'<p class="t-note">No hay soldaduras registradas en las conexiones.</p>';
  table.innerHTML+='<p class="t-note">Las soldaduras se calculan desde las conexiones; no se suman como tubos.</p>';
 }else if(tab==='supports'){
  const supports=state.graph.supports||[];
  table.innerHTML=supports.length?`<table><thead><tr><th>TAG</th><th>Tipo</th><th>Posición</th><th>Elemento</th><th>Altura BOP (${escaped(state.graph.project.lengthUnit)})</th></tr></thead><tbody>${supports.map(sp=>`<tr><td>${editBox(sp.tag,'support','tag',sp.id)}</td><td><select data-edit="support" data-key="kind" data-token="${sp.id}"><option value="cross" ${sp.kind==='cross'?'selected':''}>Metálico</option><option value="concrete" ${sp.kind==='concrete'?'selected':''}>Dado de concreto</option></select></td><td><select data-edit="support" data-key="placement" data-token="${sp.id}"><option value="below" ${sp.placement==='below'?'selected':''}>Debajo</option><option value="above" ${sp.placement==='above'?'selected':''}>Encima</option></select></td><td>${sp.hostType==='edge'?'Tubo':'Accesorio'} ${sp.hostId}</td><td>${editNum(sp.bop,'support','bop',sp.id)}</td></tr>`).join('')}</tbody></table>`:'<p class="t-note">Todavía no se han insertado soportes. Utilice SOPORTE y toque un tubo, T o codo.</p>';
 }else if(tab==='lines'){
  const lines=lineEntries();table.innerHTML=`<table><thead><tr><th class="tt-action-head">Acciones</th><th>Número de línea</th><th>Servicio</th><th>Especificación</th><th>Descripción</th><th>Componentes</th></tr></thead><tbody>${lines.map((r,i)=>`<tr><td class="tt-line-ops"><button type="button" class="line-table-action" data-line-action="select" data-line-key="${escaped(r.key)}" title="Seleccionar y encajar" aria-label="Seleccionar ${escaped(r.key)}">◎</button><button type="button" class="line-table-action" data-line-action="isolate" data-line-key="${escaped(r.key)}" title="Aislar y encajar" aria-label="Aislar ${escaped(r.key)}">◉</button></td><td>${editBox(r.line,'line','lineId',r.key,true).replace('value=""','value="Sin especificar"')}</td><td>${editBox(r.service,'line','service',r.key)}</td><td>${editBox(r.spec,'line','spec',r.key)}</td><td>${editBox(r.description,'line','lineDescription',r.key,true)}</td><td>${r.edgeIds.length}</td></tr>`).join('')}</tbody></table><p class="t-note">Cambiar el número de línea actualizará los componentes de esa referencia y el filtro Número de línea. Las líneas distintas no se fusionan físicamente.</p>`;if(tablesState.mode==='total')table.innerHTML+=`<p class="tt-lines-summary"><b>TOTAL:</b> ${lines.length} línea(s) · ${lines.reduce((s,r)=>s+r.edgeIds.length,0)} componente(s) principales.</p>`;
 }else{
  const es=state.graph.equipments||[];
  table.innerHTML=`<button type="button" id="addEquipment" class="filterOption" style="margin:7px 0;padding:9px">+ Agregar registro de equipo</button>`+(es.length?`<table><thead><tr><th>TAG</th><th>Descripción</th><th>Conexión</th></tr></thead><tbody>${es.map((e,i)=>`<tr><td>${editBox(e.tag||'','equipment','tag',i)}</td><td>${editBox(e.description||'','equipment','description',i,true)}</td><td>${editBox(e.connection||'','equipment','connection',i)}</td></tr>`).join('')}</tbody></table>`:'<p class="t-note">Sin equipos. Puede preparar registros; la inserción gráfica de equipos será una etapa posterior.</p>');
  $('addEquipment')?.addEventListener('click',()=>{state.graph.equipments.push({tag:'EQ-'+String(state.graph.equipments.length+1).padStart(3,'0'),description:'',connection:''});save();renderTables()});

 }
}
function applyTableEdit(el){
 const scope=el.dataset.edit,key=el.dataset.key,token=el.dataset.token;
 const raw=el.value.trim();ensureProject();const numeric=['bop'].includes(key);
 if(numeric&&raw!==''&&(!Number.isFinite(Number(raw))||Number(raw)<0)){message('Valor numérico inválido.');renderTables();return}
 if(scope==='material'||scope==='cut'){
  const first=scope==='cut'?state.graph.edges.find(e=>e.id===Number(token)):itemEdge(token);
  if(scope==='material'&&first){const group=first.kind==='pipe'?cuttingGroups().find(g=>g.some(e=>e.id===first.id))||[first]:[first];for(const e of group){if(key==='material')e.material=normalizeMaterial(raw);else if(key==='wall')e.wall=raw;else if(key==='status')e.status=raw;else if(key==='description')e.description=raw}}
  else if(scope==='material'){state.graph.componentProps[token]||={};state.graph.componentProps[token][key]=key==='material'?normalizeMaterial(raw):raw}
  else if(first){const group=cuttingGroups().find(g=>g.some(e=>e.id===first.id))||[first];for(const e of group)if(key==='material')e.material=normalizeMaterial(raw);else if(key==='wall')e.wall=raw}
 }else if(scope==='support'){
  const sp=state.graph.supports.find(o=>o.id===Number(token));if(!sp)return;
  if(key==='tag'&&(!raw||state.graph.supports.some(o=>o!==sp&&o.tag.toUpperCase()===raw.toUpperCase()))){message('TAG duplicado o vacío.');renderTables();return}
  if(key==='placement'&&raw==='above'&&sp.hostType==='fit'&&['elbow','bend'].includes(sp.hostKind)){message('Un codo solo admite soporte debajo.');renderTables();return}
  sp[key]=key==='bop'?(raw===''?null:Number(raw)):raw;
 }else if(scope==='weld'){state.graph.componentProps[token]||={};state.graph.componentProps[token][key]=raw;
 }else if(scope==='equipment'){const item=state.graph.equipments[Number(token)];if(!item)return;if(key==='tag'&&state.graph.equipments.some((e,i)=>i!==Number(token)&&e.tag.toUpperCase()===raw.toUpperCase())){message('TAG de equipo duplicado.');renderTables();return}item[key]=raw;
 }else if(scope==='line'){
  const old=token==='Sin especificar'?'':token;
  const affected=state.graph.edges.filter(e=>!e.referencePort&&String(e.lineId||state.graph.project.lineId||'').trim()===old);
  if(key==='lineId'&&(lineEntries().some(r=>canonicalLine(r.line)===canonicalLine(raw==='Sin especificar'?'':raw)&&canonicalLine(r.line)!==canonicalLine(old)))){message('Número de línea vacío o duplicado.');renderTables();return}
  for(const e of affected)e[key]=key==='lineId'&&raw==='Sin especificar'?'':raw;
  if(state.graph.project.lineId===old||!state.graph.project.lineId){state.graph.project[key]=raw}
  if(key==='lineId')for(const meta of Object.values(state.graph.componentProps||{}))if(String(meta.lineId||'').trim()===old)meta.lineId=raw;
 }
 ensureEdgeMetadata();save();render();renderTables();message('Tabla actualizada.');
}
function openTables(){if(state.panel||state.copy.enabled||state.reducerMode||state.draft.length){message('Termine la operación actual antes de abrir tablas.');return}closeFilter();ensureEdgeMetadata();$('tablesPanel').hidden=false;renderTables()}
function closeTables(){$('tablesPanel').hidden=true;render()}

/* 05C. PROPIEDADES DE ELEMENTOS */
function openPanel(){propertyPanel.classList.remove('reducer-dialog');const objects=selectedObjects(),count=state.selection.size;if(!count)return;if(count===1&&supportByToken([...state.selection][0])){showSupportProperties();return}closeAidMenu();closeFilter();
 state.panel={mode:'selection',inputIds:objects.edges.map(e=>e.id),fitting:objects.fits.length===1&&count===1?objects.fits[0]:null};
 let html='';const single=state.panel.fitting;
 if(objects.welds.length===1&&count===1){const w=objects.welds[0];state.panel.mode='weldInfo';panelTitle.textContent='Soldadura de unión';html=`<p class="panelhint">Soldadura entre componentes conectados. Diámetro nominal: ${dnFmt(w.diam)}″.</p><p class="panelhint">Centro blanco y borde oscuro. La soldadura se elimina del gráfico automáticamente al desconectar o borrar uno de los componentes.</p>`;}
 else 
 if(state.filterMode==='flow'&&count>0){
  panelTitle.textContent='Flujo';state.panel.mode='flow';state.panel.flowChoice='right';
  // Sólo símbolos visuales. Etiquetas accesibles ocultas para lectores de pantalla.
  html=`<div class="flowIconGrid" role="radiogroup" aria-label="Sentido de flujo">
   <button type="button" class="flowIcon" data-flow="none" role="radio" aria-checked="false" aria-label="Sin flujo" title="Sin flujo"><svg viewBox="0 0 44 30"><circle cx="22" cy="15" r="8"/><path d="M14 23L30 7"/></svg></button>
   <button type="button" class="flowIcon on" data-flow="right" role="radio" aria-checked="true" aria-label="Hacia el segundo punto" title="Hacia el segundo punto"><svg viewBox="0 0 44 30"><path d="M5 15H38M29 6L38 15L29 24"/></svg></button>
   <button type="button" class="flowIcon" data-flow="left" role="radio" aria-checked="false" aria-label="Hacia el primer punto" title="Hacia el primer punto"><svg viewBox="0 0 44 30"><path d="M39 15H6M15 6L6 15L15 24"/></svg></button>
   <button type="button" class="flowIcon" data-flow="both" role="radio" aria-checked="false" aria-label="Bidireccional" title="Bidireccional"><svg viewBox="0 0 44 30"><path d="M6 15H38M15 6L6 15L15 24M29 6L38 15L29 24"/></svg></button>
  </div>`;
 }else if(single?.kind==='tee'){
  const t=single.detail;panelTitle.textContent='T · propiedades de derivación';state.panel.mode='tee';state.panel.tee=single;
  html=`<p class="panelhint">Diámetro principal: <strong>${dnFmt(t.run)}″</strong>. La línea principal conserva sus dos bocas iguales. Si la derivación supera el principal, se añade una reducción independiente.</p>
  <label for="diamInput">DN secundario (pulgadas)</label><input id="diamInput" type="text" inputmode="decimal" list="diamOptions" value="${dnFmt(t.branchDn)}" autocomplete="off">
  <p class="panelhint">Seleccionar BORRAR permite retirar el accesorio.</p>`;
 }else if(single?.kind==='elbow'){
  panelTitle.textContent=`Codo ${single.angle}°`;state.panel.mode='fitting';state.panel.fitting=single;
  html=`<p class="panelhint">Codo reconocido por la orientación de los tramos. Use BORRAR para transformarlo en una curva de tubería.</p>`;
 }else if(objects.reducers.length===1&&count===1){state.panel.mode='reducerProps';panelTitle.textContent=(objects.reducers[0].reducerType==='eccentric'?'Reducción excéntrica':'Reducción concéntrica');const r=objects.reducers[0];state.panel.reducerId=r.id;html=`<p class="panelhint">Entrada: ${dnFmt(r.from)}″. Salida: ${dnFmt(r.to)}″. Puede reducir o ampliar, respetando las conexiones.</p><label for="diamInput">DN de salida (pulgadas)</label><input id="diamInput" type="text" inputmode="decimal" list="diamOptions" value="${dnFmt(r.to)}">`;
 }else if(objects.edges.length>0&&objects.fits.length===0&&objects.reducers.length===0){
  panelTitle.textContent=objects.edges.length===1?`Tubo (${objects.edges[0].tag})`:`${objects.edges.length} tubos seleccionados`;state.panel.mode='pipes';
  const base=objects.edges[0];html=`<p class="panelhint">El diámetro se propaga por los tramos conectados sin reducción. El material se aplica a los tubos seleccionados.</p>
  <label for="diamInput">Diámetro nominal (pulgadas)</label><input id="diamInput" type="text" inputmode="decimal" list="diamOptions" value="${dnFmt(base.diam)}" autocomplete="off">
  <label for="materialInput">Material</label><input id="materialInput" type="text" maxlength="65" list="materialOptions" value="${escaped(normalizeMaterial(base.material))}" autocomplete="off">
  <p class="panelhint">La identificación del corte se genera automáticamente en TABLAS → Cortes.</p>`;
 }else{
  panelTitle.textContent=`Selección de ${count} elemento(s)`;state.panel.mode='summary';html=`<p class="panelhint">${objects.edges.length} tubo(s), ${objects.fits.filter(f=>f.kind==='elbow').length} codo(s), ${objects.fits.filter(f=>f.kind==='tee').length} T(s), ${objects.reducers.length} reducción(es).</p>`;
 }
 const dnOptions=CAT.nominalDN.map(n=>`<option value="${dnFmt(n)}"></option>`).join(''),matOptions=MATERIALS.map(n=>`<option value="${escaped(n)}"></option>`).join('');
 if(state.panel.mode!=='flow'){
   const first=[...state.selection][0],e=itemEdge(first),fit=objects.fits.find(f=>f.id===first),meta=componentProps(first);
   const initialStatus=e?edgeStatus(e):fit?fitEffective(first,'status'):(meta.status||state.graph.project.defaultStatus),
      initialInstall=e?edgeInstallation(e):fit?fitEffective(first,'installation'):(meta.installation||state.graph.project.defaultInstallation);
   html=html+`<div class="prop-grid" style="margin-top:11px">${propSelect('commonStatus','Condición',[['new','Nuevo'],['existing','Existente']],initialStatus)}${propSelect('commonInstall','Instalación',[['aerial','Aéreo'],['buried','Enterrado'],['channel','Canal / caja']],initialInstall)}
   ${count===1?`<div class="full"><label for="commonDescription">Descripción adicional</label><textarea id="commonDescription">${escaped(e?.description||meta.description||'')}</textarea></div>`:''}</div>`;
 }
 panelBody.innerHTML=html+`<datalist id="diamOptions">${dnOptions}</datalist><datalist id="materialOptions">${matOptions}</datalist><p class="panelhint">Verde: aplicar · Rojo: volver.</p>`;
 propertyPanel.hidden=false;render();panelBody.querySelectorAll('[data-prop-tab]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.propTab==='general'){state.panel={mode:'projectProps'};renderPropertyForm()}}));if(state.panel?.mode==='flow')panelBody.querySelectorAll('[data-flow]').forEach(button=>button.addEventListener('click',()=>{state.panel.flowChoice=button.dataset.flow;panelBody.querySelectorAll('[data-flow]').forEach(b=>{const on=b===button;b.classList.toggle('on',on);b.setAttribute('aria-checked',String(on))})}));const field=$('diamInput');if(field){field.focus({preventScroll:true});field.select()}
}
function openColorPanel(){
 if(state.panel||state.tool||state.selection.size===0)return;
 closeFilter();state.panel={mode:'serviceColor',serviceChoice:'water'};
 panelTitle.textContent='Color por servicio';
 panelBody.innerHTML=`<div class="serviceRows">${SERVICE_KEYS.map((id,i)=>{const s=SERVICE_COLORS[id];return `<button type="button" class="serviceOption ${i===0?'on':''}" data-service="${id}" aria-pressed="${i===0?'true':'false'}"><span class="serviceDot" style="background:${s.color}"></span><span><b>${s.name}</b><small>${s.hazard}</small></span></button>`}).join('')}</div><p class="panelhint">Vista gráfica inspirada en ASME A13.1-2023. Verde: aplicar · Rojo: volver.</p>`;
 propertyPanel.hidden=false;render();panelBody.querySelectorAll('[data-service]').forEach(b=>b.addEventListener('click',()=>{
  state.panel.serviceChoice=b.dataset.service;
  panelBody.querySelectorAll('[data-service]').forEach(x=>{const on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-pressed',String(on))});
 }));
}
function applyServiceToSelection(key){
 if(!SERVICE_COLORS[key])return 0;
 state.graph.fitServices ||= {};
 let count=0;for(const token of state.selection){
  const edge=itemEdge(token);if(edge){edge.service=key;edge.serviceColor=SERVICE_COLORS[key].color;count++;continue}
  if(token.startsWith('N')){const id=Number(token.slice(1));if(Number.isInteger(id)){state.graph.fitServices[id]=key;count++}}
 }
 return count;
}
function applyPanel(){if(!state.panel)return;const mode=state.panel.mode;
 if(mode==='supportSetup'){
  state.supportChoice={kind:$('supportKind')?.value||'cross',placement:$('supportPlacement')?.value||'below'};
  state.panel=null;propertyPanel.hidden=true;state.supportMode=true;render();message('SOPORTE activo. Toque un tubo, T o codo.');return;
 }
 if(mode==='supportProps'){
  if(!applySupportProperties())return;
  state.panel=null;propertyPanel.hidden=true;state.selection.clear();save();render();message('Soporte actualizado.');return;
 }
 if(mode==='projectProps'||mode==='itemProps'){if(!applyTechnicalProperties())return;state.panel=null;propertyPanel.hidden=true;state.selection.clear();cleanGraph();ensureEdgeMetadata();save();render();return;} 
 if(mode==='reducerPick'){applyPickedReducer();return;}
 if(mode==='reducerSetup'){
  const left=parseDN($('reducerLeft')?.value),right=parseDN($('reducerRight')?.value);
  if(left==null||right==null||Math.abs(left-right)<1e-6){message('Seleccione diámetros diferentes para la reducción.');return}
  state.reducerChoice={left,right,type:state.panel.reducerType||'concentric',flat:state.panel.flatSide||'top',view:state.panel.reducerView||'horizontal'};state.reducerLast={...state.reducerChoice};state.reducerMode=true;state.panel=null;
  propertyPanel.hidden=true;propertyPanel.classList.remove('reducer-dialog');save();render();message('Configurada. Toque la tubería donde desea insertarla.');return;
 }
 if(mode==='weldInfo'){state.panel=null;propertyPanel.hidden=true;state.selection.clear();render();return}
 if(mode==='serviceColor'){const key=state.panel.serviceChoice;const n=applyServiceToSelection(key);message(`${n} elemento(s) con servicio ${SERVICE_COLORS[key].name}`)}
 else if(mode==='reset'){state.graph={nodes:[],edges:[],nextNode:1,nextEdge:1,curves:[],fitServices:{},weldNodes:[],detachedNodes:[],project:projectDefaults(),componentProps:{},cutValues:{},equipments:[],supports:[],nextSupport:1};state.draft=[];state.selection.clear();state.tool=false;state.reducerMode=false;state.reducerChoice=null;state.view={k:1.28,dx:0,dy:0};message('Nuevo ensamble creado')}
 else if(mode==='flow'){const modeFlow=state.panel.flowChoice||'right';const count=setSelectedFlow(modeFlow);message(`${count} tubo(s) actualizados: ${modeFlow==='none'?'sin flujo':modeFlow==='both'?'bidireccional':modeFlow==='right'?'derecha':'izquierda'}`)}
 else if(mode==='delete'){const ids=[...state.selection];const n=performDeletion(ids,!!state.panel.allowBreak);message(n?`${n} operación(es) completada(s)`:'No se modificó el ensamble')}
 else if(mode==='newReducer'){
  const to=parseDN($('diamInput')?.value),id=state.panel.edgeId,pipe=state.graph.edges.find(e=>e.id===id);
  if(!pipe||to==null||Math.abs(to-pipe.diam)<.0001){message('Seleccione un diámetro diferente al tubo.');return}
  const placement=$('reducerPosition')?.value||'.5',direction=$('reducerDirection')?.value||'ab';
  if(placement==='end'){
   if(!isTerminalEdge(pipe)){message('El extremo está ocupado. Seleccione una posición media.');return}
   if(!addReducer(id,to)){message('No se pudo insertar en el extremo.');return}
  }else{
   const outcome=insertReducerInPipe(id,Number(placement),direction,to);
   if(outcome.error){message(outcome.error);return}
  }
  message(`Reducción ${dnFmt(pipe.diam)}x${dnFmt(to)} insertada`)
 }
 else if(mode==='reducerProps'){const r=state.graph.edges.find(e=>e.id===state.panel.reducerId);const to=parseDN($('diamInput')?.value);if(!r||to==null||Math.abs(to-r.from)<1e-5){message('El diámetro debe ser distinto al de entrada.');return}const before=JSON.parse(JSON.stringify(state.graph));r.to=to;r.diam=to;const downstream=state.graph.edges.find(e=>e.kind!=='reducer'&&(e.a===r.b||e.b===r.b));if(downstream){const changed=changeDiameterKeepingTees([downstream.id],to);if(changed.error){state.graph=before;message(changed.error);return}}syncReducers();message('Reducción actualizada')}
 else if(mode==='tee'||mode==='pipes'){const value=parseDN($('diamInput')?.value);if(value==null){message('Indique un diámetro válido.');$('diamInput')?.focus();return}
 if(mode==='tee'){const t=state.panel.tee.detail;const change=changeDiameterKeepingTees([t.branchEdge],value);if(change.error){message(change.error);return}message(change.transitions?`T ${dnFmt(t.run)}x${dnFmt(t.run)} y reducción automática hacia ${dnFmt(value)}″`:`${change.count} tramo(s) actualizado(s). T ${dnFmt(t.run)}x${dnFmt(value)}`)}
 else{const ids=state.panel.inputIds,raw=String($('materialInput')?.value||'').trim();if(!raw){message('Ingrese un material.');return}const ti=$('tagInput');if(ti){const tag=ti.value.trim().toUpperCase();if(!/^[A-Z]{1,3}$/.test(tag)||state.graph.edges.some(e=>e.id!==ids[0]&&e.tag===tag&&!cuttingGroups().some(g=>g.some(x=>x.id===ids[0])&&g.some(x=>x.id===e.id)))){message('Identificador inválido o duplicado.');return}const e=state.graph.edges.find(e=>e.id===ids[0]);if(e)e.tag=tag}const change=changeDiameterKeepingTees(ids,value);if(change.error){message(change.error);return}for(const e of state.graph.edges)if(ids.includes(e.id))e.material=normalizeMaterial(raw);message(`${change.count} tubo(s) actualizados${change.transitions?`, ${change.transitions} reducción(es) añadidas junto a la T`:''}`)}}
 if($('commonStatus')&&$('commonInstall')){
  const status=$('commonStatus').value,installation=$('commonInstall').value,one=state.selection.size===1,desc=$('commonDescription')?.value.trim();
  for(const id of state.selection){const e=itemEdge(id);if(e){e.status=status;e.installation=installation;if(one&&desc!==undefined)e.description=desc}
   else {state.graph.componentProps||={};const m=state.graph.componentProps[id]||{};m.status=status;m.installation=installation;if(one&&desc!==undefined)m.description=desc;state.graph.componentProps[id]=m}}
 }
 state.panel=null;propertyPanel.hidden=true;propertyPanel.classList.remove('reducer-dialog');state.selection.clear();cleanGraph();save();render()}
function confirmAction(){if(state.copy.enabled){if(state.copy.placement)confirmCopy();else message('Toque el destino de la copia.');return}if(state.move.enabled&&!state.panel){if(state.move.drag)moveCommit();else message('Seleccione un eje y arrástrelo para mover.');return}if(state.panel){applyPanel();return}if(state.tool){if(state.draft.length>=2){const changed=addDraftToGraph();state.selection.clear();render();message(changed?'Ruta incorporada al ensamble':'Sin cambios en el ensamble')}return}if(state.selection.size)openPanel()}
function cancelAction(){if(!$('dimensionsPanel').hidden){closeDimensionCatalog();return}if(state.supportMode&&!state.panel){state.supportMode=false;render();message('Inserción de soportes cancelada.');return}if(state.copy.enabled){cancelCopy();render();return}if(state.move.enabled&&!state.panel){if(state.move.drag)moveCancel();moveClear(false);render();return}if(state.panel){state.panel=null;propertyPanel.hidden=true;propertyPanel.classList.remove('reducer-dialog');render();return}if(state.reducerMode){state.reducerMode=false;state.reducerChoice=null;render();message('Reducción cancelada');return}if(state.tool){if(state.draft.length){state.draft=[];state.cursor=null;render();message('Borrador cancelado')}}else{state.selection.clear();render()}}
function zoomAt(mult,x,y){const old=fromScreen(x,y),k=Math.max(CAT.minZoom,Math.min(CAT.maxZoom,state.view.k*mult)),r=canvas.getBoundingClientRect();state.view.k=k;state.view.dx=x-r.left-r.width/2-old.x*k;state.view.dy=y-r.top-r.height/2-old.y*k;render()}
let heldTimeout=null;
function stopHeld(){clearTimeout(heldTimeout);heldTimeout=null}
function onPointerDown(e){if(state.move.enabled){
  const supportHit=selectHit(e.clientX,e.clientY);
  if(supportByToken(supportHit)){
   e.preventDefault();canvas.setPointerCapture(e.pointerId);
   state.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(state.move.target?.kind!=='support'||state.move.target.supportId!==supportByToken(supportHit).id)moveSupportSelection(supportHit);
   state.supportDrag={pointerId:e.pointerId,supportId:supportByToken(supportHit).id,baseline:modelCopy(),x:e.clientX,y:e.clientY};
   state.interaction=null;return;
  }
  const b=moveAxisHit(e.clientX,e.clientY);if(b){e.preventDefault();canvas.setPointerCapture(e.pointerId);state.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});state.interaction=null;moveBeginAxis(b,e);return}}if(e.pointerType==='mouse'&&e.button!==0)return;if(state.panel)return;canvas.setPointerCapture(e.pointerId);state.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});stopHeld();if(state.pointers.size===2){const pts=[...state.pointers.values()],cx=(pts[0].x+pts[1].x)/2,cy=(pts[0].y+pts[1].y)/2;state.gesture={kind:'pinch',d:Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y),k:state.view.k,anchor:fromScreen(cx,cy)};state.interaction=null;return}
 state.interaction={id:e.pointerId,x:e.clientX,y:e.clientY,dx:state.view.dx,dy:state.view.dy,moved:false,long:false};
 if(!state.tool&&!state.reducerMode&&!state.move.enabled&&!state.copy.enabled){heldTimeout=setTimeout(()=>{if(!state.interaction||state.interaction.moved||state.pointers.size!==1)return;state.interaction.long=true;state.marquee={x:state.interaction.x,y:state.interaction.y,x2:state.interaction.x,y2:state.interaction.y};renderMarquee();},430)}
}
function onPointerMove(e){if(state.supportDrag?.pointerId===e.pointerId){
  const d=state.supportDrag,s=state.graph.supports.find(s=>s.id===d.supportId);if(!s)return;
  d.x=e.clientX;d.y=e.clientY;
  if(s.hostType==='edge'){const edge=state.graph.edges.find(e=>e.id===s.hostId);if(edge){s.ratio=supportRatioFromPoint(edge,e.clientX,e.clientY);syncSupportAfterMove(s)}}
  render();return;
 }if(state.move.drag&&state.move.drag.id===e.pointerId){movePreview(e);return}if(!state.pointers.has(e.pointerId)){if(e.pointerType==='mouse'&&((state.tool&&state.draft.length)||state.reducerMode)){state.cursor=fromScreen(e.clientX,e.clientY);if(state.reducerMode)renderReducerPreview();else drawGuides()}return}
 state.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(state.gesture?.kind==='pinch'&&state.pointers.size===2){const pts=[...state.pointers.values()],cx=(pts[0].x+pts[1].x)/2,cy=(pts[0].y+pts[1].y)/2,d=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y),r=canvas.getBoundingClientRect(),k=Math.max(CAT.minZoom,Math.min(CAT.maxZoom,state.gesture.k*d/Math.max(1,state.gesture.d)));state.view.k=k;state.view.dx=cx-r.left-r.width/2-state.gesture.anchor.x*k;state.view.dy=cy-r.top-r.height/2-state.gesture.anchor.y*k;render();return}
 const it=state.interaction;if(!it||it.id!==e.pointerId)return;const dx=e.clientX-it.x,dy=e.clientY-it.y;if(Math.hypot(dx,dy)>7){it.moved=true;if(!it.long)stopHeld()}
 if(state.marquee){state.marquee.x2=e.clientX;state.marquee.y2=e.clientY;renderMarquee();return}
 if(it.moved){state.view.dx=it.dx+dx;state.view.dy=it.dy+dy;render()}
}
function onPointerEnd(e,allowed){if(state.supportDrag?.pointerId===e.pointerId){
  const d=state.supportDrag,s=state.graph.supports.find(s=>s.id===d.supportId);state.supportDrag=null;state.pointers.delete(e.pointerId);
  if(!allowed||!s){state.graph=d.baseline;render();return}
  const hit=supportTargetHit(e.clientX,e.clientY);
  if(hit&&hit.hostType==='fit'&&hit.hostKind==='elbow'&&s.placement==='above'){
   state.graph=d.baseline;render();message('El soporte sobre un codo no está permitido.');return}
  if(hit){s.hostId=hit.hostId;s.hostType=hit.hostType;s.hostKind=hit.hostKind;s.ratio=hit.hostType==='edge'?supportRatioFromPoint(state.graph.edges.find(v=>v.id===hit.hostId),e.clientX,e.clientY):.5;s.refEnd=s.ratio<=.5?'a':'b';syncSupportAfterMove(s)}
  else if(s.hostType!=='edge'){state.graph=d.baseline;render();message('En T y codos, el soporte debe quedar en el centro.');return}
  save();render();message('Soporte reubicado en su elemento.');return;
 }if(state.move.drag&&state.move.drag.id===e.pointerId){state.pointers.delete(e.pointerId);if(allowed)moveCommit();else moveCancel();state.interaction=null;return}const had=state.pointers.has(e.pointerId);state.pointers.delete(e.pointerId);if(!had)return;stopHeld();const it=state.interaction;const accept=allowed&&it&&!it.moved&&!it.long&&state.pointers.size===0&&!state.gesture;
 if(state.marquee){if(allowed)selectRectangle(state.marquee);state.marquee=null;render()}
 else if(accept)onTap(e.clientX,e.clientY);
 if(state.pointers.size===0){state.interaction=null;state.gesture=null;save()}
}
canvas.addEventListener('pointerdown',onPointerDown);canvas.addEventListener('pointermove',onPointerMove);canvas.addEventListener('pointerup',e=>onPointerEnd(e,true));canvas.addEventListener('pointercancel',e=>onPointerEnd(e,false));
canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('wheel',e=>{e.preventDefault();zoomAt(e.deltaY<0?1.12:1/1.12,e.clientX,e.clientY)},{passive:false});

/* Guardar: persiste en el navegador y descarga una copia portátil del ensamble. */
function saveProject(){
 if(state.panel&&!propertyPanel.hidden){message('Confirme o cancele la ventana antes de guardar.');return}
 if(state.draft.length){message('Confirme el trazado pendiente antes de guardar.');return}if(state.copy.enabled){message('Termine o cancele COPIAR antes de guardar.');return}
 try{
  save();
  const payload={format:'TubiTrazo',version:'1.0.0',project:state.graph.project,cuts:cuttingList().map(c=>({...c,actualLength:effectiveCutLength(c),actualLengthUnit:state.graph.project?.lengthUnit||'mm'})),materials:tableMaterials(),welds:weldRecords(),supports:state.graph.supports||[],dimensionCatalog:state.graph.dimensionCatalog||[],lines:lineEntries(),equipments:state.graph.equipments||[],routes:connectedComponents().map((nodes,i)=>({routeId:'R'+(i+1),edgeIds:state.graph.edges.filter(e=>!e.referencePort&&nodes.has(e.a)&&nodes.has(e.b)).map(e=>e.id)})).filter(r=>r.edgeIds.length),savedAt:new Date().toISOString(),graph:JSON.parse(JSON.stringify(state.graph)),plane:state.plane,view:state.view,aidLabels:state.aidLabels,aidOverrides:state.aidOverrides,reducerLast:state.reducerLast};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  const stamp=new Date().toISOString().slice(0,10).replace(/-/g,'');
  link.href=url;link.download='TubiTrazo_Ensamble_'+stamp+'.json';
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  message('Ensamble guardado. Respaldo JSON generado.');
 }catch(error){console.warn(error);message('No se pudo generar el respaldo.');}
}

$('selCancel').addEventListener('click',()=>{state.selection.clear();render()});
$('selProperties').addEventListener('click',openProperties);
$('selCopy').addEventListener('click',startCopy);
$('selMove').addEventListener('click',toggleMove);
$('unitsTool').addEventListener('click',()=>{if(state.panel||state.draft.length||state.copy.enabled){message('Termine la operación actual para cambiar unidades.');return}const menu=$('unitsMenu');menu.hidden=!menu.hidden;menu.querySelectorAll('button').forEach(b=>b.classList.toggle('current',b.dataset.unit===state.graph.project.lengthUnit))});
$('projectConfigTool').addEventListener('click',openProjectConfig);
$('unitsMenu').addEventListener('click',ev=>{const btn=ev.target.closest('[data-unit]');if(!btn)return;convertLengthUnit(btn.dataset.unit);$('unitsMenu').hidden=true;message('Unidades: '+btn.dataset.unit)});
pipeTool.addEventListener('click',startTube);moveTool.addEventListener('click',toggleMove);copyTool.addEventListener('click',startCopy);$('copyApply').addEventListener('click',confirmCopy);$('copyCancel').addEventListener('click',()=>{cancelCopy();render()});
$('tablesTool').addEventListener('click',()=>{if($('tablesPanel').hidden)openTables();else closeTables()});
$('attributesTool').addEventListener('click',openProperties);$('supportTool').addEventListener('click',supportToolToggle);
$('closeTables').addEventListener('click',closeTables);$('closeDimensions').addEventListener('click',closeDimensionCatalog);
document.querySelectorAll('#tablesPanel [data-table]').forEach(b=>b.addEventListener('click',()=>{tablesState.tab=b.dataset.table;renderTables()}));
$('tablesAggregationToggle').addEventListener('click',()=>{tablesState.mode=tablesState.mode==='total'?'individual':'total';renderTables()});
$('tablesContent').addEventListener('click',ev=>{const b=ev.target.closest('[data-line-action]');if(b)lineTableAction(b.dataset.lineKey,b.dataset.lineAction)});
$('tablesContent').addEventListener('change',ev=>{const edited=ev.target.closest('[data-edit]');if(edited){applyTableEdit(edited);return}const inp=ev.target.closest('input[data-cut]');if(!inp)return;const value=inp.value.trim();if(value!==''&&(!Number.isFinite(Number(value))||Number(value)<=0)){message('Longitud inválida');renderTables();return}state.graph.cutValues||={};if(value==='')delete state.graph.cutValues[inp.dataset.cut];else state.graph.cutValues[inp.dataset.cut]={length:Number(value),unit:state.graph.project.lengthUnit};const gg=cuttingGroups().find(g=>g.some(e=>e.id===Number(inp.dataset.cut)));if(gg?.length===1)gg[0].realLength=value===''?null:Number(value);save();message('Longitud de corte guardada');});
filterTool.addEventListener('click',()=>{if(state.panel)return;if(state.isolation){showAllElements();return}if(filterMenu.classList.contains('open'))closeFilter();else openFilter()});
bindFilterMenu();
confirmButton.addEventListener('click',confirmAction);cancelButton.addEventListener('click',cancelAction);
undoTool.addEventListener('click',undoAction);redoTool.addEventListener('click',redoAction);$('saveTool').addEventListener('click',saveProject);
reducerTool.addEventListener('click',openReducer);colorTool.addEventListener('click',openColorPanel);deleteTool.addEventListener('click',openDelete);resetTool.addEventListener('click',openReset);axisButton.addEventListener('click',()=>changePlane(state.plane==='XY'?'XZ':'XY'));
document.querySelectorAll('[data-plane]').forEach(b=>b.addEventListener('click',()=>changePlane(b.dataset.plane)));
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();(e.shiftKey?redoAction:undoAction)();return}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redoAction();return}if(e.key==='Escape')cancelAction();if(e.key==='Enter'){if(state.panel||state.draft.length>=2){e.preventDefault();confirmAction()}}});window.addEventListener('resize',render);
/* La altura visible se recalcula cuando aparece el teclado móvil. */
function updateVisibleViewport(){const vh=window.visualViewport?.height||window.innerHeight;document.documentElement.style.setProperty('--tt-visual-height',`${Math.round(vh)}px`)}
window.visualViewport?.addEventListener('resize',updateVisibleViewport);
window.visualViewport?.addEventListener('scroll',updateVisibleViewport);
updateVisibleViewport();
/* v0.36 · Ventanas flotantes con marco táctil, cuatro bordes y esquinas.
   En cualquier zona libre se arrastran; campos y controles conservan su interacción. */
(function(){
 const names=['propertyPanel','tablesPanel','dimensionsPanel'];let active=null;
 const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
 const viewport=()=>({width:$('workspace').clientWidth,height:window.visualViewport?.height||window.innerHeight});
 const isInput=node=>!!node.closest('button,input,textarea,select,option,a,[contenteditable="true"],label,[role="button"],.tt-insulation-quick');
 function rectLimits(panel){const parent=$('workspace').getBoundingClientRect(),r=panel.getBoundingClientRect();return {parent,left:r.left-parent.left,top:r.top-parent.top,width:r.width,height:r.height}}
 function borders(r,e){const margin=15,x=e.clientX-r.left,y=e.clientY-r.top;
   return {left:x<=margin,right:x>=r.width-margin,top:y<=margin,bottom:y>=r.height-margin}}
 function applyRect(panel,l,t,w,h){panel.style.transform='none';panel.style.animation='none';panel.classList.add('tt-custom-window');panel.style.left=l+'px';panel.style.top=t+'px';panel.style.setProperty('width',w+'px','important');panel.style.setProperty('height',h+'px','important');panel.style.setProperty('max-height','calc(var(--tt-visual-height, 100dvh) - 30px)','important');}
 for(const name of names){const panel=$(name);if(!panel)continue;panel.querySelector('.tt-resize-handle')?.remove();
  panel.classList.add('tt-four-edges');
  panel.addEventListener('pointerdown',ev=>{
   if(ev.button!==0&&ev.pointerType==='mouse')return;
   const raw=panel.getBoundingClientRect(),edges=borders(raw,ev);const onEdge=Object.values(edges).some(Boolean);
   if(!onEdge&&isInput(ev.target))return;
   if(!onEdge&&(ev.target.closest('.table-tabs, .table-tabs *, .tt-dont-drag')||ev.target.closest('[data-table]')))return;
   const initial=rectLimits(panel);const dims=viewport();
   active={panel,id:ev.pointerId,startX:ev.clientX,startY:ev.clientY,...initial,mode:onEdge?'resize':'move',edges,dims};
   applyRect(panel,initial.left,initial.top,initial.width,initial.height);
   panel.classList.toggle('tt-resizing',onEdge);panel.classList.toggle('tt-moving',!onEdge);
   ev.preventDefault();ev.stopPropagation();panel.setPointerCapture(ev.pointerId);
  });
  panel.addEventListener('pointermove',ev=>{
   if(!active||active.panel!==panel||active.id!==ev.pointerId)return;
   const dX=ev.clientX-active.startX,dY=ev.clientY-active.startY,v=viewport();
   let left=active.left,top=active.top,width=active.width,height=active.height;
   if(active.mode==='move'){
    left=clamp(left+dX,0,Math.max(0,v.width-width));top=clamp(top+dY,0,Math.max(0,v.height-height-16));
   }else{
    const minW=Math.min(270,v.width-12),minH=Math.min(180,v.height-60);
    if(active.edges.left){const newL=clamp(active.left+dX,0,active.left+active.width-minW);width=active.width+active.left-newL;left=newL}
    if(active.edges.right)width=clamp(active.width+dX,minW,v.width-left);
    if(active.edges.top){const newT=clamp(active.top+dY,0,active.top+active.height-minH);height=active.height+active.top-newT;top=newT}
    if(active.edges.bottom)height=clamp(active.height+dY,minH,v.height-top-12);
   }
   applyRect(panel,Math.round(left),Math.round(top),Math.round(width),Math.round(height));
  });
  function stop(e){if(active?.panel===panel&&active.id===e.pointerId){panel.classList.remove('tt-moving','tt-resizing');active=null}}
  panel.addEventListener('pointerup',stop);panel.addEventListener('pointercancel',stop);
 }
})();

restore();ensureEdgeMetadata();adjustEccentricAxes();history.current=modelJSON();render();$('editingDock').scrollLeft=0;
