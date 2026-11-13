/* NodoLibre Excel · módulo autónomo de datos XLSX. Sin red ni ejecución de macros. */
(function(global){'use strict';
const encoder=new TextEncoder(),decoder=new TextDecoder();
const MAX_BYTES=35*1024*1024,MAX_CELLS=300000;
function colNumber(s){let n=0;for(const c of s.toUpperCase())n=n*26+c.charCodeAt(0)-64;return n-1}
function colName(n){let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s}
function xml(s){if(/<!DOCTYPE|<!ENTITY/i.test(s))throw Error('XML con entidades no admitidas');const d=new DOMParser().parseFromString(s,'application/xml');if(d.querySelector('parsererror'))throw Error('XML no válido');return d}
function tags(el,name){return [...el.getElementsByTagName('*')].filter(x=>x.localName===name)}
function child(el,name){return [...el.children].find(x=>x.localName===name)}
function str(el){return el?.textContent||''}
function u16(b,i){return b[i]|b[i+1]<<8}
function u32(b,i){return (b[i]|b[i+1]<<8|b[i+2]<<16|b[i+3]<<24)>>>0}
async function unzip(buffer){const b=new Uint8Array(buffer),end=Math.max(0,b.length-65557);let pos=-1;for(let i=b.length-22;i>=end;i--){if(u32(b,i)===0x06054b50){pos=i;break}}if(pos<0)throw Error('No es un archivo ZIP/XLSX válido');const count=u16(b,pos+10),offset=u32(b,pos+16),files=new Map();if(count>3000)throw Error('Demasiadas entradas en XLSX');let p=offset,totalExpanded=0;
 for(let j=0;j<count;j++){if(u32(b,p)!==0x02014b50)throw Error('Índice ZIP dañado');const method=u16(b,p+10),size=u32(b,p+20),nameLen=u16(b,p+28),extra=u16(b,p+30),comment=u16(b,p+32),start=u32(b,p+42),name=decoder.decode(b.subarray(p+46,p+46+nameLen));p+=46+nameLen+extra+comment;if(!(/\.(?:xml|rels)$/i.test(name)))continue;if(name.includes('..')||size>MAX_BYTES*5)throw Error('Entrada XLSX demasiado grande');if(u32(b,start)!==0x04034b50)throw Error('Entrada ZIP inválida');const ix=start+30+u16(b,start+26)+u16(b,start+28),data=b.slice(ix,ix+size);let raw;if(method===0)raw=data;else if(method===8){if(!global.DecompressionStream)throw Error('Este navegador no admite descompresión XLSX');try{const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));raw=new Uint8Array(await new Response(stream).arrayBuffer())}catch(e){throw Error('No fue posible descomprimir XLSX: '+e.message)}}else throw Error('Compresión XLSX no compatible');if(raw.length>MAX_BYTES*6||(totalExpanded+=raw.length)>MAX_BYTES*9)throw Error('Libro XLSX demasiado grande');files.set(name,decoder.decode(raw))}
 return files;
}
function cellValue(c,shared){const type=c.getAttribute('t')||'',v=child(c,'v'),inline=child(c,'is'),f=child(c,'f');let value=str(v);if(type==='s')value=shared[+value]??'';else if(type==='inlineStr')value=str(inline);else if(type==='b')value=value==='1'?'VERDADERO':'FALSO';else if(type==='e')value=value||'#ERROR';else if(type!=='str'&&type!=='d'){if(value!==''){const n=Number(value);if(Number.isFinite(n)){value=Number.isSafeInteger(n)?n:String(value)}}}if(f&&!v&&!inline)value='';return value}
// Formato BIFF8 sobre CFB (Excel 97-2003), sin macros ni cálculo de fórmulas.
function binaryXls(bytes,fileName){
 const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const u16o=(o)=>dv.getUint16(o,true),u32o=(o)=>dv.getUint32(o,true);
 if(bytes.length<512||u32o(0)!==0xe011cfd0||u32o(4)!==0xe11ab1a1)throw Error('XLS no tiene una cabecera OLE válida');
 const shift=u16o(30),mShift=u16o(32),sectorSize=2**shift,miniSize=2**mShift;
 if(![9,12].includes(shift)||mShift!==6)throw Error('Sector XLS no compatible');
 const at=(id)=>512+id*sectorSize;
 const fatIDs=[];for(let i=0;i<109;i++){const q=u32o(76+i*4);if(q<0xfffffffa)fatIDs.push(q)}
 let difat=u32o(68),nDifat=u32o(72),limit=0;
 while(difat<0xfffffffa&&limit++<nDifat){const off=at(difat);if(off+sectorSize>bytes.length)throw Error('DIFAT corrupta');for(let i=0;i<sectorSize/4-1;i++){const q=u32o(off+i*4);if(q<0xfffffffa)fatIDs.push(q)}difat=u32o(off+sectorSize-4)}
 const fat=[];for(const id of fatIDs){const p=at(id);if(p+sectorSize>bytes.length)throw Error('FAT corrupta');for(let j=0;j<sectorSize;j+=4)fat.push(u32o(p+j))}
 function chain(id,length,sz,next,container){const chunks=[];let count=0,size=0;const seen=new Set();while(id<0xfffffffa&&id>=0&&size<length){if(seen.has(id)||count++>100000)throw Error('Cadena XLS cíclica');seen.add(id);const st=id*sz;const data=container===bytes?container.slice(512+st,512+st+sz):container.slice(st,st+sz);if(!data.length)throw Error('Cadena XLS incompleta');chunks.push(data);size+=data.length;id=next[id]}const out=new Uint8Array(Math.min(length,size));let j=0;for(const d of chunks){out.set(d.slice(0,Math.min(d.length,out.length-j)),j);j+=Math.min(d.length,out.length-j)}return out}
 const dir=chain(u32o(48),Math.min(bytes.length*2,20*1024*1024),sectorSize,fat,bytes);
 const dirs=[];for(let p=0;p+128<=dir.length;p+=128){const len=dir[p+64]|dir[p+65]<<8;if(len<2||len>64)continue;let name='';for(let j=0;j<len-2;j+=2)name+=String.fromCharCode(dir[p+j]|dir[p+j+1]<<8);dirs.push({name,type:dir[p+66],first:u32arr(dir,p+116),size:u32arr(dir,p+120)})}
 function u32arr(arr,p){return (arr[p]|arr[p+1]<<8|arr[p+2]<<16|arr[p+3]<<24)>>>0}
 const root=dirs.find(d=>d.type===5),stream=dirs.find(d=>d.type===2&&/^(workbook|book)$/i.test(d.name));if(!root||!stream)throw Error('El XLS no contiene el libro de Excel');
 if(stream.size>MAX_BYTES*3)throw Error('XLS demasiado grande');let data;
 if(stream.size>=u32o(56)){data=chain(stream.first,stream.size,sectorSize,fat,bytes)}else{
  const mini=chain(root.first,root.size,sectorSize,fat,bytes),miniFAT=chain(u32o(60),u32o(64)*sectorSize,sectorSize,fat,bytes);const next=[];for(let i=0;i+4<=miniFAT.length;i+=4)next.push(u32arr(miniFAT,i));data=chain(stream.first,stream.size,miniSize,next,mini)
 }
 const r16=(p)=>data[p]|data[p+1]<<8,r32=(p)=>(data[p]|data[p+1]<<8|data[p+2]<<16|data[p+3]<<24)>>>0;
 const records=[];for(let p=0;p+4<=data.length;){const type=r16(p),size=r16(p+2);if(p+4+size>data.length)break;records.push({type,offset:p+4,data:data.subarray(p+4,p+4+size)});p+=4+size}
 const bof=records.find(r=>r.type===0x0809);if(!bof||bof.data.length<4||((bof.data[0]|bof.data[1]<<8)!==0x0600))throw Error('Se requiere un XLS BIFF8 (Excel 97-2003)');
 const readStr=(arr,p,len,compressed)=>{let t='';for(let i=0;i<len;i++){if(compressed){if(p>=arr.length)break;t+=String.fromCharCode(arr[p++])}else{if(p+1>=arr.length)break;t+=String.fromCharCode(arr[p]|arr[p+1]<<8);p+=2}}return{t,p}};
 const sheets=[];let shared=[];let sheetOffsets=[];
 for(let index=0;index<records.length;index++){
  const rec=records[index],b=rec.data;
  if(rec.type===0x0085&&b.length>=8){const count=b[6],compressed=!(b[7]&1),nm=readStr(b,8,count,compressed).t;sheetOffsets.push({offset:r32(rec.offset),name:nm||'Hoja',visibility:(b[4]&3)===0?'visible':(b[4]&3)===1?'hidden':'veryHidden'})}
  if(rec.type===0x00fc){ // SST, rechazar registros CONTINUE no interpretados para evitar pérdida silenciosa.
   const arrays=[b];let ii=index+1;while(records[ii]?.type===0x003c){arrays.push(records[ii].data);ii++}if(arrays.length>1)throw Error('Este XLS contiene cadenas compartidas fragmentadas; convierta una copia a XLSX para importarlo con seguridad');const full=new Uint8Array(arrays.reduce((x,y)=>x+y.length,0));let kk=0;for(const x of arrays){full.set(x,kk);kk+=x.length}
   const n=full.length>=8?u32arr(full,4):0;let p=8;shared=[];
   for(let j=0;j<Math.min(n,MAX_CELLS)&&p+3<=full.length;j++){
    const len=full[p]|full[p+1]<<8,flag=full[p+2];p+=3;let rich=0,phon=0;if(flag&8){if(p+2>full.length)break;rich=full[p]|full[p+1]<<8;p+=2}if(flag&4){if(p+4>full.length)break;phon=u32arr(full,p);p+=4}const o=readStr(full,p,len,!(flag&1));shared.push(o.t);p=o.p+rich*4+phon;
   }
  }
 }
 let total=0;
 for(let si=0;si<sheetOffsets.length;si++){
  const item=sheetOffsets[si],start=records.findIndex(r=>r.offset-4===item.offset);if(start<0)continue;
  const cells=[],hiddenRows=[],hiddenCols=[];let lastR=0,lastC=0;
  function push(r,c,v){if(v===''||v===null||v===undefined)return;if(r<0||r>1048575||c<0||c>16383)return;cells.push([r,c,v]);lastR=Math.max(lastR,r+1);lastC=Math.max(lastC,c+1);if(++total>MAX_CELLS)throw Error('El libro supera 300.000 celdas')}
  function rk(n){const isInt=n&2;const value=isInt?(n>>2):(()=>{const b=new ArrayBuffer(8),dv=new DataView(b);dv.setUint32(4,n&0xfffffffc,true);return dv.getFloat64(0,true)})();return(n&1)?value/100:value}
  for(let i=start+1;i<records.length;i++){
   const x=records[i];if(x.type===0x000a)break;const b=x.data;if(b.length<6)continue;const row=b[0]|b[1]<<8,col=b[2]|b[3]<<8;
   if(x.type===0x00fd&&b.length>=10){const ix=u32arr(b,6);if(ix>=shared.length)throw Error('Tabla de textos XLS incompleta');push(row,col,shared[ix]);}
   else if(x.type===0x0203&&b.length>=14){const num=new DataView(b.buffer,b.byteOffset+6,8).getFloat64(0,true);push(row,col,Number.isSafeInteger(num)?num:String(num))}
   else if(x.type===0x027e&&b.length>=10){const v=rk(u32arr(b,6));push(row,col,Number.isSafeInteger(v)?v:String(v))}
   else if(x.type===0x00bd&&b.length>=12){const last=b[b.length-2]|b[b.length-1]<<8;for(let c=col,o=4;c<=last&&o+6<=b.length-2;c++,o+=6){const v=rk(u32arr(b,o+2));push(row,c,Number.isSafeInteger(v)?v:String(v))}}
   else if(x.type===0x0204&&b.length>=8){const len=b[6]|b[7]<<8;push(row,col,readStr(b,8,len,true).t)}
   else if(x.type===0x0205&&b.length>=8)push(row,col,b[6]?(b[7]?'#ERROR':'VERDADERO'):'FALSO');
   else if(x.type===0x0006&&b.length>=14){const v=new DataView(b.buffer,b.byteOffset+6,8).getFloat64(0,true);if(Number.isFinite(v))push(row,col,Number.isSafeInteger(v)?v:String(v))}
   else if(x.type===0x0208&&b.length>=16){const flags=b[12]|b[13]<<8;if(flags&0x0020)hiddenRows.push(row+1)}
   else if(x.type===0x007d&&b.length>=12){const flags=b[8]|b[9]<<8;if(flags&1)hiddenCols.push([row+1,col+1])}
  }
  sheets.push({name:item.name,visibility:item.visibility,rows:lastR,columns:lastC,hiddenRows,hiddenCols,cells});
 }
 if(!sheets.length)throw Error('No fue posible extraer hojas del XLS');return{format:'NLExcelData',schemaVersion:1,name:fileName,sheets,totalCells:total};
}
async function read(file){
 if(!file||file.size>MAX_BYTES)throw Error('El libro supera 35 MB');
 if(!/\.(?:xls|xlsx|xlsm)$/i.test(file.name||''))throw Error('Seleccione un archivo XLS, XLSX o XLSM');
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(bytes.length<8)throw Error('El libro está vacío o incompleto');
 const ole=bytes[0]===0xd0&&bytes[1]===0xcf&&bytes[2]===0x11&&bytes[3]===0xe0&&bytes[4]===0xa1&&bytes[5]===0xb1&&bytes[6]===0x1a&&bytes[7]===0xe1;
 const zip=bytes[0]===0x50&&bytes[1]===0x4b&&bytes[2]===0x03&&bytes[3]===0x04;
 if(ole)return binaryXls(bytes,file.name);
 if(!zip)throw Error('Formato interno no reconocido: no es XLS binario ni libro XML de Excel');
 // Los libros de Smart3D pueden llamarse .xls y contener XLSM.
 // Nunca se ejecuta VBA ni se decodifican entradas .bin.
 const files=await unzip(bytes),w=files.get('xl/workbook.xml');if(!w)throw Error('Falta el libro XLSX');const wd=xml(w),rels=xml(files.get('xl/_rels/workbook.xml.rels')||'<Relationships/>'),relmap=new Map(tags(rels,'Relationship').map(r=>[r.getAttribute('Id'),r.getAttribute('Target')]));const sharedDoc=files.get('xl/sharedStrings.xml');const shared=sharedDoc?tags(xml(sharedDoc),'si').map(s=>tags(s,'t').map(t=>t.textContent).join('')):[];let total=0,formulasWithoutCachedValue=0;const sheets=[];
 for(const s of tags(wd,'sheet')){const name=s.getAttribute('name')||'Hoja',rid=s.getAttribute('r:id')||s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'),target=relmap.get(rid);if(!target)continue;let path=target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');path=path.replace(/\/[^/]+\/\.\.\//g,'/');const sheet=files.get(path);if(!sheet)throw Error('No se encontró la hoja '+name);const doc=xml(sheet),cells=[];let rowLast=0,colLast=0;
  for(const c of tags(doc,'c')){const addr=c.getAttribute('r')||'',match=/^([A-Z]+)(\d+)$/i.exec(addr);if(!match)continue;const row=Number(match[2])-1,col=colNumber(match[1]);if(row<0||row>1048575||col<0||col>16383)throw Error('Coordenada fuera de Excel');if(child(c,'f')&&!str(child(c,'v'))&&!str(child(c,'is')))formulasWithoutCachedValue++;const value=cellValue(c,shared);if(value===''||value===null)continue;cells.push([row,col,value]);rowLast=Math.max(rowLast,row+1);colLast=Math.max(colLast,col+1);if(++total>MAX_CELLS)throw Error('El proyecto supera el límite de 300.000 celdas. No se importó parcialmente.')}
  const hiddenRows=tags(doc,'row').filter(r=>r.getAttribute('hidden')==='1').map(r=>Number(r.getAttribute('r'))).filter(Number.isInteger);const hiddenCols=tags(doc,'col').filter(c=>c.getAttribute('hidden')==='1').map(c=>[+c.getAttribute('min'),+c.getAttribute('max')]);sheets.push({name,visibility:s.getAttribute('state')||'visible',rows:rowLast,columns:colLast,hiddenRows,hiddenCols,cells});}
 return{format:'NLExcelData',schemaVersion:1,name:file.name,sheets,totalCells:total,formulasWithoutCachedValue};}
function listValues(text){const out=[];let token='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){token+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){if(token.trim())out.push(token.trim());token=''}else token+=c}if(token.trim())out.push(token.trim());return out}
function connectedAnalysis(books,expression){
 const fields=String(expression||'').split(/\r?\n/);
 const get=k=>{const line=fields.find(x=>new RegExp('^\\s*'+k+'\\s*:','i').test(x));return line?line.slice(line.indexOf(':')+1).trim():''};
 const validColumn=value=>/^[A-Z]{1,3}$/.test(value)&&colNumber(value)<=16383;
 const columns=listValues(get('listarcolumna')).map(x=>x.toUpperCase());
 if(!columns.length||columns.some(x=>!validColumn(x)))throw Error('Seleccione columnas válidas, por ejemplo: A,B');
 if(new Set(columns).size!==columns.length)throw Error('No repita la misma columna en la selección');
 const fileNames=listValues(get('archivo')).map(x=>x.toLocaleLowerCase('es-CO'));
 const sheetNames=listValues(get('hoja')).map(x=>x.toLocaleLowerCase('es-CO'));
 const anySheet=!sheetNames.length||sheetNames.includes('*');
 let sources=books;if(fileNames.length){for(const requested of fileNames){const matches=books.filter(b=>b.name.toLocaleLowerCase('es-CO')===requested);if(matches.length!==1)throw Error(matches.length?'Hay archivos conectados con nombres duplicados: '+requested:'No está conectado el archivo: '+requested)}sources=books.filter(x=>fileNames.includes(x.name.toLocaleLowerCase('es-CO')))}
 if(!sources.length)throw Error('Conecte un bloque Excel');
 if(!anySheet){for(const name of sheetNames)if(!sources.some(b=>b.sheets.some(s=>s.name.toLocaleLowerCase('es-CO')===name)))throw Error('No existe una hoja conectada llamada: '+name)}
 const parsedFilters=[],sorts=[];
 for(const line of fields){
  if(/^\s*filtro\s*:/i.test(line)){
   const raw=line.slice(line.indexOf(':')+1).trim(),parts=raw.split('|');const col=(parts.shift()||'').trim().toUpperCase(),op=(parts.shift()||'').trim().toLowerCase(),value=parts.join('|');
   if(!columns.includes(col))throw Error('El filtro requiere la columna seleccionada '+col);
   if(!['igual','noigual','comienza','termina','contiene','nocontiene'].includes(op))throw Error('Filtro desconocido para '+col);
   parsedFilters.push({col,op,value});
  }
  if(/^\s*ordenar\s*:/i.test(line)){
   const raw=line.slice(line.indexOf(':')+1),[col,order]=raw.split('|').map(x=>x.trim().toLowerCase()),upper=col.toUpperCase();
   if(!columns.includes(upper)||!['asc','desc'].includes(order))throw Error('Orden no válido en la columna '+upper);
   if(!sorts.some(s=>s.col===upper))sorts.push({col:upper,order});
  }
 }
 const dedupRaw=get('duplicados').toLowerCase();
 if(dedupRaw&&!['eliminar','conservar'].includes(dedupRaw))throw Error('Use duplicados: eliminar o duplicados: conservar');
 const dedup=dedupRaw==='eliminar';
 const text=v=>String(v??'').toLocaleLowerCase('es-CO');
 const passes=vals=>parsedFilters.every(f=>{const cell=text(vals[columns.indexOf(f.col)]),value=text(f.value);switch(f.op){case 'igual':return cell===value;case 'noigual':return cell!==value;case 'comienza':return cell.startsWith(value);case 'termina':return cell.endsWith(value);case 'contiene':return cell.includes(value);case 'nocontiene':return !cell.includes(value)}return false});
 let out=[],removedDuplicates=0;const seen=dedup?new Set():null,selected=columns.map(colNumber),lookup=new Set(selected);
 for(const b of sources)for(const sh of b.sheets){
  if(!anySheet&&!sheetNames.includes(sh.name.toLocaleLowerCase('es-CO')))continue;
  const rows=new Map();for(const [r,c,v] of sh.cells){if(!lookup.has(c))continue;let values=rows.get(r);if(!values){values=new Map();rows.set(r,values)}values.set(c,v)}
  for(const [r,values] of rows){
   const vals=selected.map(c=>values.get(c)??'');
   if(vals.every(v=>v===''||v===null)||!passes(vals))continue;
   if(dedup){const key=JSON.stringify(vals.map(v=>String(v??'')));if(seen.has(key)){removedDuplicates++;continue}seen.add(key)}
   out.push({file:b.name,hoja:sh.name,fila:r+1,values:vals});
   if(out.length>MAX_CELLS)throw Error('El resultado supera 300.000 registros. Aplique filtros para reducirlo');
  }
 }
 if(sorts.length){
  const indexes=sorts.map(s=>({i:columns.indexOf(s.col),direction:s.order==='desc'?-1:1}));
  const number=v=>{if(typeof v==='number'&&Number.isSafeInteger(v))return v;const s=String(v);return /^-?(?:0|[1-9]\d*)$/.test(s)&&Number.isSafeInteger(Number(s))?Number(s):null};
  out.sort((a,b)=>{for(const {i,direction} of indexes){const x=a.values[i],y=b.values[i],nx=number(x),ny=number(y);let c;if(nx!==null&&ny!==null)c=Math.sign(nx-ny);else c=String(x??'').localeCompare(String(y??''),'es',{numeric:false,sensitivity:'base'});if(c)return c*direction}return 0});
 }
 return{columns,rows:out,removedDuplicates};
}
function crc32(bytes){let crc=-1;for(const x of bytes){crc^=x;for(let i=0;i<8;i++)crc=crc>>>1^((crc&1)?0xedb88320:0)}return(crc^-1)>>>0}
function le16(v){return[v&255,v>>>8&255]};function le32(v){return[v&255,v>>>8&255,v>>>16&255,v>>>24&255]}
function makeZip(files){const blocks=[],central=[];let offset=0;for(const [name,raw] of files){const nb=encoder.encode(name),data=encoder.encode(raw),crc=crc32(data);const h=new Uint8Array([...le32(0x04034b50),...le16(20),...le16(0),...le16(0),...le16(0),...le16(0),...le32(crc),...le32(data.length),...le32(data.length),...le16(nb.length),...le16(0),...nb]);blocks.push(h,data);central.push(new Uint8Array([...le32(0x02014b50),...le16(20),...le16(20),...le16(0),...le16(0),...le16(0),...le16(0),...le32(crc),...le32(data.length),...le32(data.length),...le16(nb.length),...le16(0),...le16(0),...le16(0),...le16(0),...le32(0),...le32(offset),...nb]));offset+=h.length+data.length}const cs=central.reduce((x,y)=>x+y.length,0);const end=new Uint8Array([...le32(0x06054b50),...le16(0),...le16(0),...le16(central.length),...le16(central.length),...le32(cs),...le32(offset),...le16(0)]);return new Blob([...blocks,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})}
function escapeXML(v){return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
function writeResult(result){const headers=['Archivo','Hoja','Fila',...result.columns],rows=[headers,...result.rows.map(r=>[r.file,r.hoja,r.fila,...r.values])];let fragments=['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'];rows.forEach((row,r)=>{fragments.push('<row r="'+(r+1)+'">');row.forEach((v,c)=>{if(v===''||v===null||v===undefined)return;const ref=colName(c)+(r+1);if(typeof v==='number'&&Number.isSafeInteger(v))fragments.push(`<c r="${ref}"><v>${v}</v></c>`);else fragments.push(`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXML(v)}</t></is></c>`)});fragments.push('</row>')});fragments.push('</sheetData></worksheet>');return makeZip([
 ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
 ['_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
 ['xl/workbook.xml','<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Resultado" sheetId="1" r:id="rId1"/></sheets></workbook>'],
 ['xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
 ['xl/worksheets/sheet1.xml',fragments.join('')]
 ])}
global.NLExcel={read,analyze:connectedAnalysis,writeResult,colNumber,colName};
})(globalThis);
