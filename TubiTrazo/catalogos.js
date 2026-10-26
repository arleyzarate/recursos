/* TubiTrazo v1.0.0 · Datos de configuración técnica y catálogos
   Catálogos descriptivos y numéricos separados para facilitar actualización.
   Ningún dato de dimensión de fabricante se presume ni autocompleta. */
/* CAT */
const CAT = Object.freeze({
  grid:36, minZoom:.46,maxZoom:4.8, nominalDN:[.5,.75,1,1.25,1.5,2,2.5,3,3.5,4,5,6,8,10,12,14,16,18,20,22,24],
  tubeColor:'#18272c',fitColor:'#88959a',tubeWidth:7,fitWidth:3.25,aidFill:'rgba(87,126,179,0.23)',storageKey:'tubitrazo_v34',offsets:[19,27,37,49,64,82],
});

/* ISO */
const ISO=Object.freeze({X:[Math.cos(Math.PI/6),.5],Y:[-Math.cos(Math.PI/6),.5],Z:[0,-1]});

/* DIRS */
const DIRS=Object.freeze([[1,0],[1,1],[0,1],[-1,1],[0,-1],[-1,-1],[0,1],[-1,0],[1,-1]].filter((x,i,a)=>a.findIndex(y=>y[0]===x[0]&&y[1]===x[1])===i));

/* SERVICE_COLORS */
const SERVICE_COLORS=Object.freeze({
 water:{name:'Agua',color:'#13834d',hazard:'Agua fría o templada'},
 gas:{name:'Gas',color:'#b28600',hazard:'Inflamable'},
 crude:{name:'Crudo',color:'#b49318',hazard:'Inflamable / combustible'}
});

/* SERVICE_KEYS */
const SERVICE_KEYS=Object.keys(SERVICE_COLORS);

/* MATERIALS */
const MATERIALS=['ACERO AL CARBÓN','ACERO INOXIDABLE','PVC','CPVC','HDPE','COBRE'];

/* LENGTH_TO_MM */
const LENGTH_TO_MM={mm:1,m:1000,ft:304.8,in:25.4};
