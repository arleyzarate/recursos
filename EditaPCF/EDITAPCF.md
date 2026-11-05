# Edita PCF | Continuidad técnica

**Versión vigente:** 0.4.2 experimental  
**Fecha:** 5 nov. 2026  
**Autor:** Arley Zarate  
**Normas comunes:** consultar `ESTANDAR_DISENO.md`  
**Base real:** Edita PCF 0.4.1 autónoma y sus archivos separados

## Pruebas específicas de la versión 0.4.2 | 5 nov. 2026

- `node --check aplicacion.js`: correcto.
- Chromium automatizado, HTML autónomo montado mediante `set_content`: escritorio **1366 × 768**, móviles simulados **390 × 844** y **320 × 740**. Se observó la reconstrucción de 22 componentes PCF, **3 ensambles y 3 etiquetas de coordenadas**, sin excepciones JavaScript. La ruta utilizada fue Canvas de respaldo; WebGL de hardware permanece pendiente.
- `Test_3D.pcf`: el cálculo eligió entradas basadas en flujo donde hubo registros reconocibles; para el pequeño ensamble de instrumentación sin dirección reconocida registró un inicio geométrico. La cantidad de rótulos coincide con la cantidad de ensambles.
- Prueba sintética de 3 tuberías conectadas: **1 ensamble**; retirando la tubería central: **2 ensambles**, y **Deshacer** restauró el primero. La exportación PCF se bloqueó si había eliminaciones sin reconciliar.
- Inserción de un segundo archivo PCF con extremo coincidente: **dos fuentes originales y un solo ensamble**. Se movió el ensamble completo modificando las coordenadas; el proyecto `.editapcf` guardó ambas fuentes, se reabrió y conservó el desplazamiento.
- Prueba de dirección `FLOW 2`: entrada elegida en **X=900 mm** en un modelo sintético. Se editó a **X=1900 mm** por clic real en la etiqueta. El PCF exportado después de confirmar mostró ambos tubos trasladados +1000 mm y la marca `FLOW-ARROW` trasladada de X=300 a X=1300 mm. Sin modificación, el PCF original se exportó **idéntico byte a byte**.
- Prueba de toque real emulado en Chromium móvil: el rótulo XYZ abrió el editor de tres valores. Reapertura de proyecto `.editapcf` 0.4.1 y recuperación de una eliminación guardada en 0.4.2: correctas.
- `file://` no fue ejecutable en el Chromium automatizado por la política del entorno. No se realizó prueba en dispositivo físico, GPU WebGL real o GitHub Pages. **Estado: validación parcial**.

**Nota:** la edición de X/Y/Z modifica desplazamientos de los componentes del ensamble activo y recalcula su topología visual. Los PCF originales se preservan hasta realizar una exportación explícita. La exportación industrial debe ser verificada posteriormente en CAD. La eliminación es reversible en el proyecto nativo, pero no permite todavía generar un PCF con componentes retirados.

---

## Actualización 0.4.1 | 5 nov. 2026

### Cambios realizados

- **Corrección del modelo invisible:** se identificó el error de ejecución de WebGL `v.packedgl.useProgram(program)`. La instrucción correcta establece `packed=v.packed` y después llama a `gl.useProgram(program)`. El error de 0.4.0 podía producir pantalla sin sólidos, incluso con una sintaxis válida. Se incorporó una recuperación por Canvas independiente si fallan el inicio de shaders, el dibujo o el contexto WebGL después de inicializarse. El PNG utiliza el lienzo de respaldo cuando corresponde.
- **Arrastrar archivos:** sin un documento con componentes abierto, el PCF se abre inmediatamente. Con un documento activo no vacío, aparece un cuadro pequeño (hasta 315 px de ancho) con «Insertar», «Abrir» y cierre `X`; permite cancelar con Escape o clic fuera. Las acciones «Nuevo», «Abrir», «Insertar» y las pestañas anteriores permanecen.
- **Coordenadas por ensamble:** en lugar de marcar los 15 puntos compartidos del archivo de prueba, se identifican ensambles por coincidencia de extremos hasta 2 mm, respetando las fuentes independientes. Los elementos auxiliares se asocian visualmente al tramo cercano cuando existe una relación geométrica plausible. Se presenta **una etiqueta XYZ por ensamble identificado**, con punto y guía punteada, sin alterar el PCF original. No equivale a validación de topología CAD.
- **Superficie y escala humana:** los ensambles a 10 000 mm o menos entre sus cajas geométricas se agrupan en una zona de referencia. Cada zona genera una sola superficie cuadriculada y una figura humana; si los ensambles se separan más, aparecen zonas independientes. Se conserva el criterio anterior del piso: cota cero cuando el origen global está próximo a la zona, o un metro por debajo de su geometría mínima si está alejada. Las cámaras aisladas muestran únicamente las zonas de las fuentes visibles.
- **Corrección adicional de inserción:** el cálculo de límites de la fuente entrante no vuelve a numerar los componentes combinados. Esto impedía unir accidentalmente ensambles de archivos distintos y generar un piso único gigantesco entre conjuntos lejanos.
- Se conservan animación de flujo, codos, válvulas, soportes, etiquetas técnicas, cubo, paneo con botón central, capas, dos/cuatro vistas, archivo nativo `.editapcf`, exportación PCF, PNG y opción PDF por impresión.

### Pruebas realmente realizadas

- `node --check`: correcto en el JS autónomo extraído y en el archivo separado `aplicacion.js`.
- Chromium automatizado en Linux, HTML insertado mediante `set_content`, con WebGL no disponible y **respaldo Canvas**: escritorio **1366 × 768** y móviles táctiles simulados **390 × 844** y **320 × 740**. El modelo 3D representado por mallas sombreadas volvió a aparecer. No se observaron excepciones `pageerror` en los recorridos finales.
- `Test_3D.pcf` original: **22 componentes, 2 marcas FLOW, 3 ensambles reconocidos, 3 etiquetas XYZ, 1 zona de piso y 1 figura humana**.
- Prueba de arrastrar un primer archivo en escena vacía: apertura directa, sin diálogo. Segundo archivo: cuadro compacto con dos acciones, cierre sin cambios. Se probó en las tres dimensiones citadas.
- Inserción sintética cercana (X aproximada de 3100 mm): **dos fuentes y una única zona**. Inserción sintética distante (X aproximada de 35 000 mm): **dos zonas**, dos vistas automáticas y un piso a **Z=-1000 mm** para el archivo distante. El proyecto `.editapcf` de esquema 2 guardó dos fuentes y volvió a abrirse conservando dos vistas y dos zonas.
- Exportación PCF sin ediciones: comprobación **byte por byte** idéntica a `Test_3D.pcf`. Exportación PNG: imagen de **1366 × 698 píxeles**, archivo válido.
- La apertura `file://` dentro de Chromium automatizado se intentó, pero fue bloqueada por la política del entorno. Las pruebas visuales corresponden a una simulación del documento, no a una publicación real.

**Estado:** validación parcial. El motor WebGL corregido y su recuperación están revisados estáticamente, pero **no se ha ejecutado la ruta WebGL con GPU real**, ni se ha probado en teléfonos físicos, Windows local o GitHub Pages publicado. La identificación de ensambles es una aproximación por conectividad geométrica; la precisión industrial de componentes y conexiones exige catálogos y validación en un CAD competente. La agrupación de zonas en archivos con más de 1500 ensambles utiliza una estrategia espacial simplificada que requiere pruebas con datos grandes. No se modificaron bibliotecas o archivos del portal Recursos.

### Publicación

Para GitHub Pages, copie **únicamente** la carpeta `EditaPCF/` del ZIP en el repositorio `arleyzarate/recursos` y sustituya sus archivos `index.html`, `estilos.css` y `aplicacion.js`; conserve respaldos. Para una prueba sin archivos auxiliares, utilice `EditaPCF_v0_4_1.html` descargado de forma independiente. Ni el buscador principal de Recursos ni sus archivos necesitan modificaciones.

---

## Historial previo: Edita PCF 0.4.0 y anteriores

**Versión vigente:** 0.4.0, experimental (historial de versiones anteriores conservado)  
**Fecha:** 5 nov. 2026  
**Autor:** Arley Zarate  
**Normas visuales y tecnológicas comunes:** consultar `ESTANDAR_DISENO.md`.  
**Antecedentes:** reconstrucción 0.1.0, prototipo 0.2.0 y archivo `Test_3D.pcf` facilitado por el autor.

## Actualización 0.4.0 | 5 nov. 2026

**Alcance:** actualización del visor técnico sobre 0.3.3, autónoma y sin dependencias externas obligatorias. Se conserva `Test_3D.pcf` como archivo privado de evaluación, fuera del paquete de publicación.

### Cambios incorporados

- **Documentos:** Nuevo, Abrir e Insertar son acciones independientes. Un segundo archivo abierto crea una segunda pestaña; cada pestaña conserva selección, capas, visibilidad, cámara, geometría, historial de movimientos y datos. Al arrastrar archivos se pregunta «Abrir como nuevo», «Insertar» o «Cancelar» antes de actuar. Un documento con cambios pendientes requiere confirmación para cerrarse.
- **Inserción PCF:** registra cada archivo original como una fuente separada, sin sobrescribir códigos de material ni reordenar las líneas fuente. Si los centros geométricos del modelo activo y del PCF entrante están separados más de 10 000 mm, se habilitan dos vistas: una encuadrada en las fuentes anteriores y otra en las insertadas. Es un umbral de centros, no análisis de interferencias entre sólidos.
- **Vistas de dibujo:** botón de distribución 1/2/4, con cámaras independientes, zoom, rotación y panorámica aplicables a la vista activa. Cada panel puede mostrar todos los componentes o una fuente concreta. El encuadre se adapta a la proporción de cada panel. La cámara seleccionada mantiene el cubo de orientación y el indicador XYZ.
- **Ensamblajes:** se marcan puntos XYZ donde coinciden, dentro de 1 mm, extremos reconocidos de al menos dos componentes de una misma fuente. Las etiquetas incluyen coordenadas reales en milímetros y una línea guía punteada que sale del ensamble hacia un lado. Se reduce su cantidad visible cuando las etiquetas se solapan.
- **Transparencia:** deslizador de opacidad (15 % a 100 %) de las etiquetas y marcadores técnicos, para despejar la escena. El usuario puede desactivar por separado las etiquetas de accesorios y las coordenadas de ensambles.
- **Válvulas:** se diferenciaron las proporciones paramétricas de conexiones `FL` (bridada), `SC`/`TH` (roscada) y `SW` (socket-weld). Una válvula `FL` no crea placas adicionales si el PCF incluye bridas independientes. La geometría de fabricante, el paso interior y las roscas reales NO se certifican con el PCF solo.
- **Flujo:** mantiene `FLOW 1`, `FLOW 2` y `FLOW 3` según el orden de `END-POINT` del componente asociado, por guía oficial Hexagon; impide propagar entre fuentes distintas y detiene relaciones ambiguas.
- **Exportaciones:** `.editapcf` adopta `schemaVersion: 2`: guarda textos PCF de todas las fuentes, desplazamientos, cámaras por vista, filtros, capas, colores y ajustes. Se conserva lectura del esquema 1. La exportación `.pcf` de un proyecto con múltiples fuentes NO intenta unir a ciegas sus encabezados ni materiales: permite descargar un ZIP con los PCF originales, o guardar el proyecto `.editapcf`. En un proyecto de una sola fuente, se conserva el flujo de PCF anterior y sus restricciones. Imagen PNG y PDF por impresión permanecen disponibles.

**Limitación técnica:** el visor usa geometría paramétrica experimental. El PCF no incorpora obligatoriamente los sólidos CAD ni el catálogo de soportes o válvulas. Para igualar modelos de CADWorx deben importarse catálogos y especificaciones adecuados, con derechos de uso y validación dimensional. No se afirma equivalencia geométrica industrial.

### Pruebas de la versión 0.4.0

- `node --check` sobre el JavaScript del HTML autónomo: correcto; sin errores de sintaxis.
- Chromium automatizado, Linux, mediante `set_content`: escritorio **1366 × 768**, móvil simulado **390 × 844** y **320 × 740**, con carga de `Test_3D.pcf`. La prueba verificó 22 componentes, 2 marcas `FLOW-ARROW`, **15 puntos de unión detectados**, paneles, transparencia de etiquetas y distribución en dos vistas; no se observaron `pageerror` ni desbordamiento horizontal en los tres tamaños.
- Se insertó un PCF sintético de un tubo ubicado alrededor de X=25 000 mm, con un primer conjunto cercano a X=1 372 mm: se activaron automáticamente dos vistas y sus cámaras quedaron centradas en cada fuente. La importación no cambió el texto original de ninguna fuente.
- Proyecto `.editapcf` de esquema 2 descargado y reabierto: **dos fuentes, dos cámaras y filtros restaurados**. El ZIP exportado de originales contuvo los dos PCF separados, sin modificación geométrica.
- Exportación PCF sin editar de `Test_3D.pcf`: comparación byte a byte satisfactoria en el navegador automatizado.
- Pruebas de regresión con pestañas: abrir un documento adicional, volver al anterior, conservando el recuento, la selección y la vista. Controles para aislar, guardar, abrir y exportar siguen disponibles.
- En el navegador de prueba **WebGL estuvo inhabilitado** y se empleó el respaldo Canvas. No se ha verificado GPU real, celulares físicos, apertura `file://`, GitHub Pages, carga masiva ni coincidencia dimensional con CADWorx. La impresión a PDF se mantiene disponible, pero no se validó aquí un PDF físico o vectorial.

**Estado:** validación parcial. Las capturas y medidas mencionadas corresponden al entorno de pruebas, no a la instalación del usuario. No utilizar exportaciones modificadas sin validación en un sistema CAD competente.

### Publicación de 0.4.0

Copie exclusivamente la carpeta `EditaPCF/` incluida en el ZIP al repositorio `arleyzarate/recursos`, sustituyendo los archivos existentes. El directorio contiene `index.html`, `estilos.css`, `aplicacion.js`, ejemplos sintéticos y esta guía. Alternativamente, abra el archivo autónomo `EditaPCF_v0_4_0.html`. No es necesario modificar el buscador principal. Esta revisión no se ha probado en GitHub Pages publicado.

### Referencias

- Hexagon Isogen, registro FLOW-ARROW: https://docs.hexagonppm.com/r/en-US/PCF-Reference-Guide/Version-15/242730
- Hexagon CADWorx Plant 24, PCF In y necesidad de especificaciones: https://docs.hexagonali.com/r/en-US/CADWorx-Plant/24/359095
- Guía de formato PCF Isogen: https://docs.hexagonali.com/r/en-US/PCF-Reference-Guide/Version-13-2016/1359346

---

## Objetivo y archivos

Esta versión reconstruye una escena de tuberías tridimensional mediante triangulación de mallas de cilindros, codos de radio, accesorios y equipos representados de forma simplificada, a partir de un archivo PCF. Es una herramienta de **visualización y edición geométrica experimental**, no un sustituto validado de CadWorx, Isogen ni catálogos de fabricante.

- `EditaPCF_v0_3_3.html`: aplicación **autónoma**, con CSS y JavaScript embebidos; no usa CDN.
- `EditaPCF/index.html`, `estilos.css`, `aplicacion.js`: misma herramienta, separada para mantenimiento y GitHub Pages.
- `ejemplo.pcf`: muestra sintética; el PCF real `Test_3D.pcf` permanece como archivo de prueba del usuario y no se incluye por defecto.
- `EDITAPCF.md`: guía canónica de continuidad y registro de pruebas.

No se incorporaron librerías JavaScript externas. Se construyó un renderizador WebGL propio con shaders y mallas, con **respaldo Canvas 2D sombreado** cuando WebGL no esté disponible. El motor WebGL no se probó con GPU activa en este entorno.

## Lectura e interpretación PCF

- Admite registros de `PIPE`, `ELBOW`, `BEND`, `VALVE`, `FLANGE`, `REDUCER-CONCENTRIC`, `REDUCER-ECCENTRIC`, `BOLT`, `GASKET`, `SUPPORT`, `OLET`, `COUPLING`, `WELD`, `FLOW-ARROW`, entre otros. La lista no garantiza cobertura universal de componentes.
- Utiliza `END-POINT`, `CENTRE-POINT`, `CO-ORDS`, `BRANCH1-POINT`, `SUPPORT-END-POINT` y campos reconocidos. Calcula arcos circulares para codos cuando existen dos extremos y un centro geométricamente compatibles.
- Interpreta `UNITS-CO-ORDS`, `UNITS-BORE`, `UNITS-BOLT-DIA`, `UNITS-BOLT-LENGTH`, `MATERIAL-IDENTIFIER` y `OUTSIDE-DIAMETER` para aproximar dimensiones. Cuando faltan diámetros, usa estimaciones de NPS o un valor provisional. No representa geometría exacta de catálogos propietarios.
- Separa líneas por `PIPELINE-REFERENCE` y por `PIPING-SPEC`; permite aislar completamente o atenuar el resto (**Parcial**).
- Dibuja flechas únicamente a partir de `FLOW-ARROW` y el código `FLOW` encontrado; su dirección relativa depende del orden de puntos PCF y debe verificarse en el CAD de origen. No calcula flujos hidráulicos.
- El cubo incluye vistas por sus caras, giro por arrastre, doble clic para volver a isométrica y referencia `N` orientativa. No deduce coordenadas geográficas ni norte real de un proyecto si el PCF carece de esos metadatos.
- Piso/retícula y figura de 1,75 m (valor modificable) son **referencias ilustrativas** calculadas a partir de los límites geométricos, no parte del modelo PCF.

## Guardado y exportaciones

- `.editapcf`: JSON versionado (`format: EditaPCF`, `schemaVersion: 1`) que conserva texto PCF, desplazamientos XYZ, capas, colores, cámara y ajustes. Abre proyectos guardados por 0.3.0 y admite el esquema básico previo 0.1.0 con `app: EditaPCF` y `pcf`/`raw`, con límites de fidelidad propios de aquella versión.
- `.pcf`: sin cambios, reproduce el **texto original**. Con desplazamientos, modifica solo los tres números XYZ de registros reconocidos, bloquea la salida cuando separa extremos originalmente coincidentes y presenta una confirmación adicional sobre las limitaciones de validación. Los PCF editados deben verificarse en CAD antes de un uso industrial.
- `.png`: exporta la vista actual como imagen.
- PDF: abre **Imprimir / Guardar como PDF** del navegador con una hoja que contiene la imagen y datos básicos. No es un generador PDF programático ni un plano vectorial CAD.

La exportación PCF puede desconocer otras dependencias estructurales, accesorios paramétricos, soldaduras externas, unidades específicas y semántica de línea de sistemas propietarios. **No se declara compatibilidad industrial completa.**

## Publicación

1. Opción recomendada: subir `EditaPCF/index.html`, `EditaPCF/estilos.css`, `EditaPCF/aplicacion.js` y `EditaPCF/ejemplo.pcf` al repositorio de Recursos, manteniendo sus rutas relativas. Se accede a la carpeta `/recursos/EditaPCF/` cuando GitHub Pages publique la ruta.
2. Alternativa: subir solo el HTML autónomo `EditaPCF_v0_3_0.html`, sin alterar el buscador de Recursos.
3. No modificar el `index.html` de la página principal, `archivos.js`, `extensiones.js` ni otras aplicaciones para instalar esta entrega.
4. En el navegador, abrir el PCF de prueba, girar, usar el cubo, aislar las filas, cambiar colores, guardar proyecto y comprobar exportación. Validar luego con varios PCF reales y en dispositivos físicos.

## Pruebas de esta versión (5 nov. 2026)

**Entorno:** Chromium automatizado en Linux, HTML cargado como contenido local aislado (`set_content`), **no** GitHub Pages ni navegador de Android/iOS. WebGL no estuvo disponible, así que las verificaciones visuales utilizaron Canvas alternativo.

- Resoluciones: 1366×768, 390×844 (emulación táctil) y 320×740 (emulación táctil): **sin excepciones JavaScript**, sin desbordamiento horizontal, panel de líneas funcional y tres agrupaciones por línea/spec reconocidas para `Test_3D.pcf`.
- Archivo de prueba `Test_3D.pcf`: **22 componentes** reconocidos, **2 flechas FLOW-ARROW**, **15 entradas de materiales**, **3 codos**, **2 registros BOLT**, `UNITS-CO-ORDS MM`, `UNITS-BORE INCH`; primer tubo con diámetro exterior de **219,1 mm**.
- Prueba de aislamiento total/parcial, «Mostrar todo», capas, ocultación de figura, cubo mediante clic, configuración y paneles en las tres resoluciones: sin errores de JavaScript en esos recorridos.
- PCF sin cambios: exportado y comparado **byte por byte** con `Test_3D.pcf`, idéntico.
- Guardar proyecto `.editapcf`, reabrirlo, verificar 22 componentes, e intento de proyecto inválido sin reemplazar el actual: correctos.
- Mover un componente que comparte un extremo: la exportación se **bloqueó** por separación detectada. Deshacer, desplazar los 22 componentes juntos y confirmar exportación modificada: generó PCF.
- PNG exportado: **1366×698 px**, comprobado como archivo de imagen. PDF: se verificó la preparación de la vista y la llamada a impresión simulada; **no se verificó un PDF generado por una impresora física**.
- Rendimiento orientativo del respaldo Canvas en la máquina de prueba: cargar conjuntos sintéticos de 100, 600 y 1200 segmentos requirió alrededor de 131 ms, 358 ms y 530 ms de lectura/modelado, respectivamente, en corridas no exhaustivas. **No son métricas de dispositivos reales ni del motor WebGL.**
- Sintaxis JavaScript: `node --check` correcta.

**Estado: validación parcial.** Faltan pruebas WebGL con GPU/driver real, apertura `file://` (bloqueada por la política de Chromium en este entorno), funcionamiento en Windows, celulares reales, GitHub Pages, PCF industriales grandes y comparación geométrica automatizada contra CadWorx. Esta versión no está certificada para fabricación ni edición de ingeniería.

## Próxima fase

Ampliar la biblioteca de conexiones y familias de accesorios mediante geometría y datos verificables, contrastar orientación y atributos de válvulas, optimizar memoria para escenas industriales y evaluar la exportación de dimensiones, conectividad y materiales para cada dialecto PCF.


---

## Actualización 0.3.1 · 5 nov. 2026

**Base real:** `EditaPCF_v0_3_0.html` de la entrega anterior. **Archivo final:** `EditaPCF_v0_3_1.html` y carpeta publicable `EditaPCF/`. Se conservaron importación, selección, giro, zoom, aislamiento de líneas, capas, guardado `.editapcf`, exportación PCF/PNG, impresión a PDF, controles de integridad, historial Deshacer/Rehacer y respaldo Canvas. **Estado de esta revisión: validación parcial.**

### Cambios

1. `Acerca de` conserva exactamente un título visual. El encabezado estático para el buscador permanece dentro del HTML, pero se retira del clon presentado en el modal. El campo de versión muestra `0.3.1`, sin repetir «experimental». Se retiró el marcador N externo superpuesto; el cubo conserva una referencia norte interna.
2. Indicador XYZ: si el origen geométrico `(0,0,0)` se encuentra a **10 000 mm o menos** de la caja envolvente de los componentes y su proyección cabe en la pantalla, el indicador se posiciona sobre ese origen **y se mueve con la cámara**. En caso contrario, aparece junto a los controles de zoom en la zona inferior derecha. La referencia de norte corresponde al eje `+Y` del PCF (E/O, N/S y elevación), **no a un norte geográfico externo que el archivo no suministre**.
3. Piso/retícula: si el origen queda a menos de 10 m de la geometría, el plano tiene `Z=0` y se extiende hasta abarcar el origen y el modelo; si el origen queda más lejos, el plano se coloca exactamente en `Zmín - 1000 mm`. Se toma la distancia mínima entre el origen y la caja de coordenadas del modelo, **no al centroide**. Piso y figura son elementos de representación, nunca se exportan al PCF.
4. Mallas tubulares: se suavizó el transporte de marcos de secciones circulares entre los puntos de codos y cilindros, y se incrementó discretización de secciones críticas. Mantiene el radio documentado por `CENTRE-POINT` cuando está disponible y es geométricamente compatible.
5. Bridas clase 150: se usa una tabla **de referencia, no un catálogo industrial certificado**, por NPS para diámetros exteriores, círculos de pernos y espesores. Las bridas se dibujan como anillos con perforación central y cuello simplificado. En otras clases o tamaños sin referencia se mantiene una aproximación geométrica.
6. Espárragos: se utiliza cantidad y dimensiones expresas del PCF, distribuidos sobre el círculo de pernos de la brida cercana cuando es clase 150 reconocida. Tuercas modeladas como prismas hexagonales aproximados.
7. Reductores: se toma `OUTSIDE-DIAMETER2` de la sección MATERIALS si existe, en lugar de inferir siempre la salida por la relación de diámetros nominales.
8. Válvulas: se refinó el cuerpo central, cuello, husillo y palanca de válvula de bola, conservando los campos `SKEY` y `SPINDLE-DIRECTION` cuando están presentes. Los perfiles exteriores todavía no reproducen necesariamente el fabricante específico.
9. Instrumentación: cuando el material/atributo de un `COUPLING` identifica `PRESSURE GAUGE`, se dibuja un manómetro con carcasa, bisel y puntero en lugar de un simple tramo de cilindro. Su orientación real de carátula depende del catálogo y no puede inferirse con certeza del PCF de ensayo.
10. Soporte `REF-CRISTO`: se refinó el apoyo geométrico genérico. El archivo **referencia** `SUPPORT-LIB-FILE ser-cw24_soportes.psl` y `SUPPORT-NAME REF-CRISTO`, pero no contiene los sólidos ni la biblioteca de CADWorx. Sin ese recurso debidamente autorizado no es posible reproducirlo idénticamente.
11. Se conservan el HTML sin librerías externas y el modo Canvas sombreado cuando WebGL no se habilita.

### Fuentes consultadas

- Hexagon Isogen, sintaxis PCF: https://docs.hexagonppm.com/r/en-US/PCF-Reference-Guide/Version-15/242663
- Hexagon Isogen, componentes y `SKEY`: https://docs.hexagonppm.com/r/en-US/PCF-Reference-Guide/Version-15/252862
- Hexagon Isogen, coordenadas E/O, N/S, elevación: https://docs.hexagonppm.com/r/en-US/PCF-Reference-Guide/Version-15/242695
- Hexagon Isogen, `FLOW-ARROW`: https://docs.hexagonppm.com/r/en-US/PCF-Reference-Guide/Version-15/242730
- Hydraulic Institute, tabla de referencia de bridas ASME B16.5: https://datatool.pumps.org/piping-materials-iv/flanges

Estas fuentes aportan **datos, sintaxis y conceptos**, no código de terceros reutilizado. No se ha copiado ningún modelo propietario de CadWorx ni se agregó biblioteca JavaScript.

### Pruebas reales de la 0.3.1

- **Entorno:** Linux, Chromium automatizado con `set_content`, sin GPU WebGL disponible; renderizado de respaldo Canvas. Emulación de móvil táctil a **390 × 844 y 320 × 740**, y escritorio **1366 × 768**. Se capturaron imágenes de los tres tamaños. En esos recorridos: cero excepciones JS y cero desbordamientos horizontales del documento.
- **Archivo real del usuario:** `Test_3D.pcf` leído: **22 componentes** y **2 registros FLOW-ARROW**. El indicador XYZ se posicionó sobre el origen, al encontrarse este dentro de la caja envolvente. Se inspeccionaron capas, lista de líneas, aislamiento y panel Acerca de en las resoluciones enumeradas. Acerca de mostró un único encabezado visible y la versión `0.3.1`.
- **Caso de coordenadas lejanas, sintético:** se desplazaron las coordenadas PCF +15 000 mm en X. Se comprobó `modelOriginNearby = false`, `axisPosition = fijo` y `floorZ = -1220 mm` para un componente inferior en `Z = -220 mm`. La diferencia verificada fue **1000 mm**.
- **Integridad PCF:** exportación sin edición idéntica byte a byte al PCF de entrada. Al desplazar uno de los tubos 100 mm se identificó una unión originalmente coincidente separada y **se bloqueó** la exportación.
- **Archivo nativo:** descarga `.editapcf` con esquema `1` y versión visible `0.3.1`; se volvió a abrir y recuperó los 22 componentes. Se comprobó que un proyecto inválido no sustituye al abierto, y que la versión 0.3.1 abre un proyecto creado con la 0.3.0.
- **Salidas:** PNG de **1366 × 698 px** leído como imagen válida; opción PDF verificada hasta la preparación de una imagen y la llamada a impresión mediante sustituto `window.print`. **No se verificó un archivo PDF realmente producido por el navegador**.
- `node --check` sobre JavaScript: sin errores. Paquete ZIP verificado tras generarlo y archivos completos presentes.

### Pendientes y límites

- **WebGL con GPU/driver real no probado**, tampoco en celulares físicos ni GitHub Pages.
- El intento de visitar `file://` en Chromium automatizado devolvió `ERR_BLOCKED_BY_ADMINISTRATOR`. La aplicación no necesita red para su código, pero **no se declara probada la apertura directa local**.
- Familias propietarias de válvulas, soportes, instrumentos y espárragos requieren catálogos autorizados para reproducir CADWorx con fidelidad. Las tablas incluidas son limitadas a clases/tamaños conocidos. **No es una equivalencia CAD geométrica ni validación de fabricación**.
- No se ejecutaron pruebas sobre grandes PCF industriales, miles de componentes, dimensiones de fabricante ni simulación de flujo físico. El orden de FLOW-ARROW sigue siendo el dato fuente; la flecha no es una simulación hidráulica.
- La comparación geométrica con el DWG de referencia se realizó visualmente a partir de las capturas entregadas; no se inspeccionó la geometría DWG nativa mediante software CAD especializado.

### Publicación

Subir a GitHub Pages el contenido completo de la carpeta `EditaPCF/` del ZIP, reemplazando únicamente los archivos anteriores dentro de esa misma carpeta. Conservar `index.html`, `estilos.css`, `aplicacion.js` y `ejemplo.pcf` juntos. El HTML autónomo `EditaPCF_v0_3_1.html` se puede utilizar como copia individual, sin bibliotecas externas. **No modificar la página principal de Recursos.**


---

## Actualización 0.3.2 · 5 nov. 2026

**Base comprobada:** `EditaPCF_v0_3_1.html` y carpeta publicable de la versión 0.3.1. **Entrega nueva:** `EditaPCF_v0_3_2.html`, con equivalente `EditaPCF/index.html` + CSS/JS para GitHub Pages. **Estado:** validación parcial.

### Cambios solicitados

1. **Sentido de flujo animado.** Las dos marcas `FLOW-ARROW` de `Test_3D.pcf` se vinculan con el tramo de tubería más cercano. Un grafo de extremos coincidentes propaga de forma orientativa el movimiento de cheurones azules a los tramos conectados, incluidas curvas y reducciones. Se respetan los códigos `FLOW 1`, `FLOW 2` y `FLOW 3` según la interpretación visual heredada de 0.3.1. **No representa una simulación hidráulica ni resuelve automáticamente el sentido de ramales sin un dato confirmado.** Los componentes sin dirección reconocida no reciben flechas inventadas. Si se oculta la capa Flujo o se desmarca su ajuste, la animación se detiene. En `prefers-reduced-motion: reduce`, queda una indicación estática, sin movimiento.
2. **Cubo de orientación sin rectángulo.** Se suprimieron tanto el relleno dibujado en el Canvas del cubo como su fondo y borde CSS, conservando las caras, nombres cardinales, selección y giro.
3. **Paneo con botón central.** Mantener pulsada la rueda del mouse y arrastrar desplaza la cámara; no gira ni modifica geometría. La rueda girada sigue acercando/alejando. Se mantiene paneo con botón derecho, Shift+arrastre y gestos táctiles existentes.
4. **Etiquetas técnicas superpuestas y ligadas a la vista.** Válvulas: tamaño en `END-POINT`, más clase cuando se pueda extraer de descripción/rating, o número inicial de `PIPING-SPEC` como indicación no verificada. Codos: tamaño y ángulo; `ANGLE 9000` produce `90°` y `4500`, `45°`. Reducciones: tamaño mayor por menor, siempre desde los **dos** `END-POINT`; el archivo aportado produce `6"x4"`. Se conservan fracciones nominales, como `¾"`, en `UNITS-BORE INCH` y se evita confundir diámetro exterior en milímetros con nominal.
5. **Legibilidad móvil.** Los rótulos se reubican para no cubrirse ni tapar los ejes XYZ cuando se dibujan sobre el origen. Cuando es necesario separar el rótulo de su componente se dibuja una línea guía ligera. Las etiquetas se pueden ocultar en Configuración sin afectar los datos.
6. **Exportación gráfica y proyecto.** El PNG y la imagen preparada para imprimir como PDF incorporan las nuevas flechas y etiquetas; los ajustes de su visibilidad se guardan/reabren en `.editapcf`. Se mantiene esquema nativo `schemaVersion:1` y lectura de archivos 0.3.0/0.3.1. La etiqueta es una representación, **no se inserta como línea nueva en el PCF**, y no altera la salida PCF.
7. **Rendimiento.** El movimiento reutiliza una capa Canvas 2D independiente sin regenerar por cada fotograma todos los triángulos de sólidos; detiene el ciclo al ocultar la pestaña. Máximo de 350 marcas animadas visibles por fotograma. Se evita operación cuadrática de extracción de la cola al propagar el flujo por conexiones. No se atribuye ninguna mejora porcentual sin medición comparable.

### Formatos y ejemplos del archivo de prueba

| Tipo | Campos leídos de `Test_3D.pcf` | Rótulo observado |
| --- | --- | --- |
| Reducción concéntrica | `END-POINT` con NPS 6 y 4, `UNITS-BORE INCH` | `6"x4"` |
| Codo 90° | NPS 6, `ANGLE 9000` | `6"-90°` |
| Codo 45° | NPS 8, `ANGLE 4500` | `8"-45°` |
| Válvula bridada | NPS 4, descripción `150LB` | `4"-150` |
| Válvula roscada | NPS 0.75, spec `150_M` | `¾"-150` (150 inferido del **nombre de la spec**, no necesariamente certificación de clase) |

**Referencia técnica oficial:** Hexagon, [PCF Reference Guide](https://docs.hexagonppm.com/r/15PCFReference); [REDUCER-CONCENTRIC](https://docs.hexagonppm.com/r/en-US/PCF-Reference-Guide/Version-15/242807); [ELBOW](https://docs.hexagonppm.com/r/en-US/PCF-Reference-Guide/Version-15/242744); [atributos complementarios, ángulos en centésimas](https://docs.hexagonppm.com/r/en-US/PCF-Reference-Guide/Version-13-2016/242728). Se consultó documentación, sin reutilizar geometrías ni bibliotecas propietarias.

### Pruebas realizadas sobre 0.3.2

- **Entorno:** Chromium automatizado, Linux. Tres tamaños: escritorio `1366 × 768` (ratón/teclado) y móvil táctil simulado `390 × 844` y `320 × 740`. `set_content` con HTML autónomo; sin pruebas en móviles físicos ni URL publicada. **Render Canvas de respaldo**, porque el entorno no habilitó WebGL. Se revisaron capturas después de concluir la animación inicial; cero excepciones JS en los recorridos ejecutados.
- **PCF real aportado:** lectura de **22 componentes**, **2 marcas de flujo** y **15 tramos orientados** por conexiones conocidas. Las etiquetas generadas fueron: `8"-45°` (dos codos), `6"-90°`, `6"x4"`, `4"-150`, `¾"-150`. Fueron legibles en escritorio y móviles; se resolvió una superposición inicial entre ejes XYZ y la etiqueta de reducción.
- **Panorámica con rueda presionada:** arrastre de 90 px horizontal/50 px vertical cambió el objetivo de la cámara, sin modificar `yaw` ni `pitch`. La rueda de giro conservó el zoom. El cubo permaneció transparente, sin placa de fondo.
- **Flujo animado:** dos instantáneas sucesivas del lienzo de marcas resultaron distintas con la animación activa. Al desactivar el ajuste, ambas instantáneas se mantuvieron idénticas y el bucle se detuvo. Se revisó que el movimiento reducido pause la animación.
- **PNG:** exportación válida de `1366 × 698 px` con rótulos y marcas incluidos en los píxeles. La opción de impresión a PDF preparó una captura compuesta y ejecutó la llamada al cuadro de impresión en el navegador de prueba; **no se obtuvo ni inspeccionó un PDF generado de verdad**.
- **Regresión:** PCF exportado sin ediciones idéntico byte a byte a `Test_3D.pcf`; nativo `.editapcf` guardado y reabierto preservó el ajuste `Etiquetas técnicas`; se abrió una muestra nativa previa. El aislamiento y la capa Flujo respondieron; una operación que separó una unión reconocida bloqueó la exportación PCF editada. Se comprobó la integridad de JavaScript mediante `node --check`.

**Pendientes:** WebGL con GPU real, apertura directa `file://` en Windows, publicación y pruebas en GitHub Pages, celular Android/iOS físico, PDF real, medición industrial de rendimiento, dialectos PCF adicionales, orientación real del flujo en bifurcaciones y geometría exacta de catálogos CadWorx. La comprobación `file://` en Chromium no concluyó por limitaciones del entorno. La versión no se certifica para fabricación ni como sustituto de CadWorx.

### Publicación

- Para prueba de un solo archivo, abra `EditaPCF_v0_3_2.html` en su navegador. La aplicación no requiere CDN ni bibliotecas externas.
- Para GitHub Pages, sustituya solamente `EditaPCF/index.html`, `EditaPCF/estilos.css`, `EditaPCF/aplicacion.js` y conserve `ejemplo.pcf`; no cambie la página principal de Recursos. El documento `EDITAPCF.md` conserva el historial de esta herramienta.
- Conserve un respaldo de la versión anterior y compruebe el resultado en su equipo antes de actualizar la página pública.


---

## Actualización 0.3.3 · 5 nov. 2026

**Código de base:** versión 0.3.2 entregada en este proyecto. **Archivos:** `EditaPCF_v0_3_3.html` y carpeta publicable `EditaPCF/`. **Estado:** validación parcial.

### Cambios solicitados y correcciones

1. **Codos (cambio geométrico relevante).** Se corrigió el uso incorrecto de `CENTRE-POINT`: en el PCF de CadWorx aportado representa la intersección de las tangentes del codo, no el centro del arco. A partir de `END-POINT` inicial y final, la intersección y `ANGLE`, se calcula el radio del círculo tangente a ambas conexiones y se recorre el arco sin desplazar los extremos. Se comprueba longitud de tangentes, radio y ángulo antes de aceptar el arco. Si faltan datos coherentes, se utiliza una aproximación cuadrática tangente, marcada internamente como aproximación, sin atribuirle fidelidad de catálogo.
2. **Dirección del flujo.** Se asocia cada registro `FLOW-ARROW` a la tubería por posición, línea y especificación **cuando la marca incluye esa especificación**; el atributo es opcional en el símbolo. `FLOW 1` va del primer al segundo `END-POINT`, `FLOW 2` del segundo al primero y `FLOW 3` en ambos sentidos. Se corrigió un filtro anterior que descartaba dos símbolos del PCF real porque requería equivocadamente igualdad de especificación aun cuando el `FLOW-ARROW` no la incluía. Las flechas de origen y la animación usan la misma asociación. La propagación se limita a uniones geométricas no ambiguas y no se asigna aleatoriamente una dirección en bifurcaciones. Se advierten conflictos internos. No es una simulación hidráulica.
3. **Válvulas por terminación.** Se leen los sufijos de `END-POINT` y `SKEY`. Para `FL`, la válvula se dibuja con sus conexiones sin agregar placas que duplicarían las bridas `FLANGE` independientes del PCF; para `SC`/roscada, con collares simplificados; y para `SW`/socket weld, con alojamientos y labios de conexión propios, sin confundirlos con bridas. Se distingue cuerpo de bola oscuro de cuellos de color claro, conservando la capa personalizable de Válvulas y el resaltado de selección. Son geometrías **aproximadas**: roscas reales, espesores y fabricantes requieren catálogo.
4. **Etiqueta en soportes.** Desde `SUPPORT-NAME` se presenta `SOP · REF-CRISTO` para la muestra; si no hay nombre, `SOPORTE`. El rótulo se ancla a `CO-ORDS` del soporte y se integra a los controles de etiquetas, capas y exportación PNG. `SUPPORT-LIB-FILE ser-cw24_soportes.psl` es una referencia a biblioteca externa, **no un sólido contenido en el PCF**.
5. Se conservan la panorámica con el botón central, cubo sin panel de fondo, controles móviles, aislamiento, nombres nominales, zoom, piso XYZ, exportaciones y archivo nativo. El proyecto propio usa `appVersion 0.3.3` y mantiene `schemaVersion: 1` para la lectura de proyectos anteriores.

### Datos técnicos comprobados con `Test_3D.pcf`

- Se leyeron **22 componentes** y **2 FLOW-ARROW**. Las dos marcas se asociaron a piezas `PIPE`: `FLOW 1` en el índice interno 1 (primero → segundo extremo); `FLOW 2` en el índice interno 21 (segundo → primero). El programa estableció **15 trayectos orientados** sobre extremos conectados; no se encontraron conflictos en este ensayo.
- Se reconstruyeron **dos codos 45° con radio geométrico de unos 306,6 mm** y **un codo 90° con radio de 229,0 mm**. Estos valores proceden de las coordenadas y del ángulo de este archivo y concuerdan aproximadamente con radios de codo largo; no son mediciones independientes de la geometría DWG.
- Se reconocieron válvulas con conexiones `SC` y `FL`. La ruta `SW` se ejercitó con un PCF **sintético** creado para esta prueba; no se suministró un caso real SW de CadWorx.
- El soporte con `SUPPORT-NAME REF-CRISTO` generó el rótulo `SOP · REF-CRISTO`.

### Pruebas realmente realizadas

- **Código:** `node --check` de `aplicacion.js` satisfactorio. HTML y scripts locales sin dependencias externas obligatorias.
- **Navegador:** Chromium automatizado en Linux por `set_content` con el HTML autónomo, escena Canvas sombreada por no disponer de WebGL. Resoluciones **1366 × 768** con ratón/teclado y móvil táctil **390 × 844** y **320 × 740**. No hubo errores `pageerror` en los recorridos ejecutados; sin desbordamiento horizontal general en móvil. Se guardaron capturas.
- **Funciones:** lectura del PCF real, verificación programática de radios, ángulos, conexiones y orientación inicial, comparación de cuadros consecutivos de la animación de flujo, panorámica por arrastre con botón central, guardado y reapertura `.editapcf` `0.3.3`, aislamiento de líneas y exportación PCF sin cambios con igualdad **byte por byte** frente a `Test_3D.pcf`.
- **Sintético:** `FLOW 3` generó dos direcciones sobre un tramo; las conexiones `SW`, `SC` y `FL` fueron distinguidas por el parser y el motor 3D. No se trata de un modelo industrial certificado.
- **Regresión:** un proyecto `.editapcf` guardado en 0.3.2 volvió a abrirse; desplazar un tubo 100 mm, separando una conexión reconocida, mantuvo el bloqueo de exportación PCF editada. Se probó Deshacer.

### Pendientes de validación

**No se ha probado** WebGL con GPU real, apertura directa `file://` (bloqueada por la política del entorno de pruebas), Android/iOS físico, publicación en GitHub Pages, un PDF generado de verdad ni modelos PCF industriales grandes. El archivo `Test_3D.dwg` no se abrió en un motor CAD; la comparación visual sigue basada en las capturas del usuario. La dirección en bifurcaciones complejas y la geometría exacta de válvulas, roscas, soportes y catálogos propietarios siguen sin certificación.

### Fuentes técnicas

- Isogen, `FLOW-ARROW` y códigos `FLOW`: https://docs.hexagonppm.com/r/en-US/PCF-Reference-Guide/Version-15/242730
- CADWorx 24, selección y orden de conexiones PCF: https://docs.hexagonali.com/r/en-US/CADWorx-Plant/24/465801
- CADWorx 24, propiedades de codos: https://docs.hexagonali.com/r/en-US/CADWorx-Spec-Editor/24/396934

Estas referencias se utilizaron para investigar la representación. No se incorporó código, modelo tridimensional ni biblioteca propietaria de CadWorx.

### Instalación

Para publicar, sustituya **solo** `EditaPCF/index.html`, `EditaPCF/estilos.css` y `EditaPCF/aplicacion.js` por sus equivalentes del ZIP. Conserve los ejemplos y haga una copia de seguridad de la versión anterior. La página principal de Recursos no requiere modificaciones. Para evaluar la versión autónoma, abra `EditaPCF_v0_3_3.html` en un navegador compatible; la apertura directa local todavía debe probarse en Windows real.


## Actualización 0.4.2 · 5 nov. 2026

- Cada ensamble conectado tiene una etiqueta XYZ única con números en la primera fila y nombres X, Y, Z debajo. La caja indica mm y se puede tocar para editar tres coordenadas absolutas.
- La posición de la etiqueta se calcula sobre el extremo de entrada a partir de los tramos con marcas de flujo reconocidas; cuando existen varias entradas o no hay marcadores fiables se muestra en el editor la incertidumbre y se usa un extremo geométrico.
- Las uniones visuales entre fuentes PCF insertadas se detectan por coincidencia de coordenadas dentro de 2 mm. **No fusiona catálogos, especificaciones ni archivos PCF originales.**
- Editar la etiqueta mueve todos los componentes que pertenecen al ensamble actual, con Deshacer/Rehacer y almacenamiento de sus desplazamientos en el formato `.editapcf`. Las conexiones que se separan recalculan los ensambles y etiquetas.
- Se añadió Retirar componente con Deshacer: el formato nativo conserva el componente retirado y sus registros originales. La exportación PCF se bloquea si existen componentes retirados porque la reescritura topológica de PCF aún no está implementada.
- Los puntos de coordenadas se dibujan en Canvas junto con el modelo para que la exportación PNG conserve exactamente su información visual; el editor HTML solo aparece al tocarlos o hacer clic.
- El proyecto nativo conserva `schemaVersion:2`, añade opcionalmente `deletedIds` por fuente y mantiene la lectura de versiones previas.
- Se mantienen piso y escala humana por zona, así como las vistas, capas, flujo y exportaciones de la versión 0.4.1.

**Limitaciones:** el flujo no está determinado en todas las ramas; la selección de una de varias entradas puede requerir revisión humana. El corte/eliminación PCF todavía no se exporta a `.pcf`; para un documento con varias fuentes insertadas la exportación técnica sigue separada. Las pruebas realizadas en esta versión se registran tras ejecutarlas; no se presume validación por la revisión de sintaxis.
