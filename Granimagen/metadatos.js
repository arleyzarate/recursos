/* Gran Imagen 1.2.0. Lector EXIF / GPS local, sin conexiones externas.
   Lee IFD TIFF 32 bits estándar, EXIF de JPEG/PNG/WebP y descripciones PNG/XMP.
   No interpreta MakerNotes propietarios ni garantiza todas las extensiones. */
(()=>{'use strict';
const NAMES={
  ifd:{256:'Ancho registrado',257:'Alto registrado',258:'Bits por muestra',259:'Compresión',262:'Interpretación fotométrica',270:'Descripción de imagen',271:'Fabricante',272:'Modelo',274:'Orientación',282:'Resolución X',283:'Resolución Y',296:'Unidad de resolución',305:'Software',306:'Fecha de modificación',315:'Artista',316:'Equipo anfitrión',33432:'Derechos de autor',34665:'Puntero EXIF',34853:'Puntero GPS',700:'XMP',33723:'IPTC',34675:'Perfil de color ICC'},
  exif:{33434:'Tiempo de exposición',33437:'Apertura (FNumber)',34850:'Programa de exposición',34855:'ISO',36864:'Versión EXIF',36867:'Fecha de captura',36868:'Fecha de digitalización',37121:'Configuración de componentes',37122:'Bits comprimidos por píxel',37377:'Velocidad de obturación',37378:'Valor de apertura',37379:'Brillo',37380:'Compensación de exposición',37381:'Apertura máxima',37382:'Distancia al sujeto',37383:'Medición',37384:'Fuente de iluminación',37385:'Flash',37386:'Distancia focal',37500:'Datos del fabricante',37510:'Comentario del usuario',40961:'Espacio de color',40962:'Ancho de imagen EXIF',40963:'Alto de imagen EXIF',41483:'Patrón CFA',41486:'Resolución focal X',41487:'Resolución focal Y',41728:'Origen del archivo',41986:'Modo de exposición',41987:'Balance de blancos',41988:'Zoom digital',41989:'Longitud focal equivalente',41990:'Tipo de captura',41991:'Ganancia de escena',41992:'Contraste',41993:'Saturación',41994:'Nitidez',42016:'ID de imagen',42033:'Número de serie del cuerpo',42034:'Especificación de lente',42035:'Fabricante de lente',42036:'Modelo de lente',42037:'Número de serie de lente'},
  gps:{0:'Versión GPS',1:'Referencia de latitud',2:'Latitud',3:'Referencia de longitud',4:'Longitud',5:'Referencia de altitud',6:'Altitud',7:'Hora GPS',8:'Satélites',9:'Estado GPS',10:'Modo de medición GPS',11:'Precisión relativa (DOP)',12:'Unidad de velocidad',13:'Velocidad',14:'Referencia de rumbo',15:'Rumbo',16:'Referencia de dirección de imagen',17:'Dirección de imagen',18:'Dátum GPS',19:'Referencia de latitud destino',20:'Latitud destino',21:'Referencia de longitud destino',22:'Longitud destino',27:'Método de posicionamiento',29:'Fecha GPS',31:'Diferencia respecto a UTC'}};
const SIZE={1:1,2:1,3:2,4:4,5:8,6:1,7:1,8:2,9:4,10:8,11:4,12:8,13:4};
const LIMIT=24*1024*1024;
const trunc=(s,n=500)=>String(s).slice(0,n);
const textDecode=(a)=>{try{return new TextDecoder('utf-8',{fatal:false}).decode(a).replace(/\0/g,'').trim()}catch{return ''}};
const decNum=(v)=>typeof v==='number'&&Number.isFinite(v)?v:null;
function parseTiff(bytes,start=0){
 const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),len=bytes.byteLength,items=[],groups={ifd:{},exif:{},gps:{}};
 if(start+8>len)return null;let le;if(dv.getUint16(start,false)===0x4949)le=true;else if(dv.getUint16(start,false)===0x4d4d)le=false;else return null;
 if(dv.getUint16(start+2,le)!==42)return null;
 const u16=o=>dv.getUint16(o,le),u32=o=>dv.getUint32(o,le);
 function readValue(type,num,loc){const unit=SIZE[type];if(!unit||num<0||num>100000||num*unit>LIMIT||loc<0||loc+num*unit>len)return null;
  const bytesSize=num*unit;if(type===2)return trunc(textDecode(bytes.subarray(loc,loc+Math.min(bytesSize,10000))),2000);
  if(type===7){if(bytesSize>256)return `[${bytesSize} bytes binarios]`;return [...bytes.subarray(loc,loc+bytesSize)].map(b=>b.toString(16).padStart(2,'0')).join(' ')}
  const result=[];for(let i=0;i<Math.min(num,96);i++){let q=loc+i*unit,v;
   switch(type){case 1:case 6:v=dv.getUint8(q);break;case 3:v=u16(q);break;case 8:v=dv.getInt16(q,le);break;case 4:case 13:v=u32(q);break;case 9:v=dv.getInt32(q,le);break;case 5:case 10:{const n=type===5?u32(q):dv.getInt32(q,le),d=type===5?u32(q+4):dv.getInt32(q+4,le);v=d?Math.round(n/d*1e8)/1e8:null;break}case 11:v=dv.getFloat32(q,le);break;case 12:v=dv.getFloat64(q,le);break;default:v=null}result.push(v)}
  return num===1?result[0]:result;
 }
 const seen=new Set();function ifd(offset,group,depth=0){const p=start+offset;if(depth>4||offset<8||p+2>len||seen.has(group+':'+offset))return;seen.add(group+':'+offset);let total=u16(p);if(total>2048)return;
  for(let i=0;i<total;i++){const at=p+2+i*12;if(at+12>len)break;const tag=u16(at),type=u16(at+2),count=u32(at+4),unit=SIZE[type];if(!unit||count*unit>LIMIT)continue;const size=count*unit;let loc=size<=4?at+8:start+u32(at+8);if(size>4&&(loc<start||loc+size>len))continue;const val=readValue(type,count,loc);if(val===null)continue;
   if(group==='ifd'&&tag===34665&&typeof val==='number'){ifd(val,'exif',depth+1);continue}
   if(group==='ifd'&&tag===34853&&typeof val==='number'){ifd(val,'gps',depth+1);continue}
   if(group==='exif'&&tag===40965)continue;
   const name=NAMES[group]?.[tag]||`Etiqueta ${tag} (0x${tag.toString(16).toUpperCase()})`;
   groups[group][tag]=val;if(tag===37500||tag===34675||tag===33723)items.push({grupo:group,etiqueta:name,valor:`[${size} bytes; contenido propietario/binario no interpretado]`});
   else items.push({grupo:group,etiqueta:name,valor:Array.isArray(val)?val.join(', '):String(val)});
  }
  const next=p+2+total*12;if(group==='ifd'&&next+4<=len){const pos=u32(next);if(pos&&depth<2)ifd(pos,'ifd',depth+1)}
 }
 ifd(u32(start+4),'ifd');
 const g=groups.gps;function dms(a,ref){if(!Array.isArray(a)||a.length<3||a.some(v=>!Number.isFinite(v)))return null;const val=a[0]+a[1]/60+a[2]/3600;return /^[SW]$/i.test(ref)?-val:val}
 const lat=dms(g[2],g[1]),lon=dms(g[4],g[3]);let gps=null;if(Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180){gps={lat,lon,datum:typeof g[18]==='string'?g[18]:null};if(Number.isFinite(g[6])){gps.alt=([1,3].includes(g[5])?-1:1)*g[6];gps.altRef=([2,3].includes(g[5])?'nivel del mar':'referencia indicada por EXIF')}}
 const e=groups.exif,i=groups.ifd;
 return{gps,items,resumen:{fabricante:i[271]||null,modelo:i[272]||null,fecha:e[36867]||e[36868]||i[306]||null,iso:e[34855]??null,focal:e[37386]??null,apertura:e[33437]??null,exposicion:e[33434]??null,orientacion:i[274]??null,software:i[305]||null},groups};
}
async function readMetadata(file){const result={gps:null,resumen:{},items:[],format:file.name.split('.').pop()?.toUpperCase()||'',incomplete:false};const amount=Math.min(file.size,LIMIT);const bytes=new Uint8Array(await file.slice(0,amount).arrayBuffer());const len=bytes.length;
 const merge=(parsed)=>{if(!parsed)return;result.gps=parsed.gps||result.gps;Object.assign(result.resumen,parsed.resumen);result.items.push(...parsed.items)};
 const matches=(p,str)=>p>=0&&p+str.length<=len&&[...str].every((c,i)=>bytes[p+i]===c.charCodeAt(0));
 function collectXMP(u){const txt=textDecode(u);if(!txt||txt.length>1000000)return;const hit=txt.match(/<\?xpacket|<x:xmpmeta|<rdf:RDF/i);if(hit){result.items.push({grupo:'xmp',etiqueta:'Paquete XMP',valor:trunc(txt,10000)});}}
 if(len>8&&bytes[0]===0xff&&bytes[1]===0xd8){let p=2;while(p+4<=len){if(bytes[p]!==0xff){p++;continue}let marker=bytes[p+1];if(marker===0xda||marker===0xd9)break;if(marker===0x00||marker===0xff){p++;continue}if(marker>=0xd0&&marker<=0xd7){p+=2;continue}const seglen=(bytes[p+2]<<8)|bytes[p+3];if(seglen<2||p+2+seglen>len){result.incomplete=true;break}const beg=p+4,end=p+2+seglen;
   if(marker===0xe1&&matches(beg,'Exif\0\0'))merge(parseTiff(bytes,beg+6));
   else if(marker===0xe1&&matches(beg,'http://ns.adobe.com/xap/1.0/\0'))collectXMP(bytes.subarray(beg+29,end));
   else if(marker===0xfe)result.items.push({grupo:'archivo',etiqueta:'Comentario JPEG',valor:trunc(textDecode(bytes.subarray(beg,end)),2000)});
   p=end;
 }}
 else if(len>=8&&matches(1,'PNG')){let p=8;while(p+12<=len){const n=new DataView(bytes.buffer,bytes.byteOffset+p,4).getUint32(0,false),type=String.fromCharCode(...bytes.subarray(p+4,p+8));if(n>LIMIT||p+12+n>len){result.incomplete=true;break}const block=bytes.subarray(p+8,p+8+n);if(type==='eXIf')merge(parseTiff(block));if(type==='tEXt'||type==='iTXt'){const t=textDecode(block);result.items.push({grupo:'png',etiqueta:type==='iTXt'?'Texto PNG internacional':'Texto PNG',valor:trunc(t,4000)})}if(type==='iTXt'&&textDecode(block.subarray(0,30)).includes('XML:com.adobe.xmp'))collectXMP(block);if(type==='IEND')break;p+=n+12;}}
 else if(len>=12&&matches(0,'RIFF')&&matches(8,'WEBP')){let p=12;while(p+8<=len){const type=String.fromCharCode(...bytes.subarray(p,p+4)),n=new DataView(bytes.buffer,bytes.byteOffset+p+4,4).getUint32(0,true);if(n>LIMIT||p+8+n>len){result.incomplete=true;break}const block=bytes.subarray(p+8,p+8+n);if(type==='EXIF')merge(parseTiff(block, matches(p+8,'Exif\0\0')?6:0));if(type==='XMP ')collectXMP(block);p+=8+n+(n%2);}}
 else if(len>=8)merge(parseTiff(bytes));
 if(file.size>LIMIT&&(!result.items.length||result.incomplete))result.incomplete=true;
 return result;
}
window.GranImagenMetadatos={leer:readMetadata};
})();
