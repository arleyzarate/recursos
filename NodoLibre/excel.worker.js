/* NodoLibre · análisis separado del hilo de dibujo.
   El trabajador solo recibe datos del libro ya normalizados; no ejecuta fórmulas. */
'use strict';
try{importScripts('./excel.js')}catch(error){self.postMessage({type:'init-error',error:String(error?.message||error)})}
self.onmessage=event=>{
 const {id,sources,expression}=event.data||{};
 try{
  if(!self.NLExcel)throw Error('El motor Excel no está disponible en el trabajador');
  const result=self.NLExcel.analyze(sources,expression);
  self.postMessage({id,ok:true,result});
 }catch(error){self.postMessage({id,ok:false,error:String(error?.message||error)})}
};
