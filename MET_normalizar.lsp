;;; ============================================================
;;;  NORMALIZAR.LSP  -  AutoCAD 2024 y versiones superiores
;;; ============================================================
;;;  Que hace (comando NORMALIZAR), en este orden:
;;;
;;;   Paso 1  - Activa TODAS las capas (ON + THAW + UNLOCK).
;;;   Paso 2  - Desenlaza (DETACH) cualquier referencia externa
;;;             (Xref) que siga adjunta al dibujo.
;;;   Paso 3  - Crea un layout nuevo "XREF" completamente vacio
;;;             (sin viewport) y elimina TODOS los demas layouts,
;;;             dejando unicamente "XREF" (Model no se toca).
;;;   Paso 4  - Renombra las capas resultantes de un BIND de Xref
;;;             (quita el prefijo tipo "RUTA$0$", ver logica
;;;             original nz:nombre-base / nz:renombrar-capas).
;;;   Paso 5  - Busca en TODO el dibujo, dentro y fuera de
;;;             bloques (incluye Model, todos los Layouts y cada
;;;             definicion de bloque): cotas (todas las
;;;             variantes de DIMENSION), LEADER, MULTILEADER,
;;;             MTEXT, TEXT, definiciones de atributo (ATTDEF) y
;;;             atributos insertados (ATTRIB), achurados/solidos
;;;             (HATCH) y WIPEOUT. Todo se elimina.
;;;   Paso 6  - Sincroniza atributos (ATTSYNC) sobre los bloques
;;;             que tenian ATTDEF, como respaldo adicional para
;;;             asegurar que no quede ningun atributo "en
;;;             memoria" sobre inserciones de esos bloques.
;;;             (BATTMAN es un comando SOLO de cuadro de dialogo;
;;;             ATTSYNC es su motor de sincronizacion accesible
;;;             por linea de comandos, por eso se usa aqui).
;;;   Paso 7  - Dentro de cada definicion de bloque (via Editor de
;;;             Bloques): OVERKILL + conversion a POLILINEAS
;;;             (PEDIT Multiple + Join de lineas/arcos, y
;;;             CONVERTPOLY a ligeras). Se excluyen bloques de
;;;             sistema/anonimos ("*..."), reservados ("_...",
;;;             flechas de cota, etc.) y Xrefs.
;;;   Paso 7b - En el MODELO: convierte a POLILINEAS y une por CAPA
;;;             (explota polilineas 3D, PEDIT Multiple + Join con
;;;             fuzz 0 respetando cada capa, y CONVERTPOLY a
;;;             ligeras). Reduce el peso al reemplazar muchas
;;;             lineas sueltas por polilineas unidas.
;;;   Paso 8  - Limpieza general en el espacio activo:
;;;               a) OVERKILL      (elimina duplicados)
;;;               b) CHPROP        Ltscale=1, Thickness=0 (todo)
;;;               c) SETBYLAYER    (todo)
;;;               d) PURGE (x2)    purga total, dos pasadas
;;;   Paso 9  - Fuerza en TODAS las capas: Lineweight = 0.00 mm
;;;             y Linetype = Continuous.
;;;   Paso 10 - NORMALIZACION DE NOMBRES (capas, bloques y
;;;             estilos de texto):
;;;        - Quita tildes (a e i o u) y la "n~" -> N
;;;        - Reemplaza espacios por "_"
;;;        - Reemplaza "-" por "_" (raya al piso / guion bajo)
;;;        - Elimina simbolos no permitidos (deja A-Z 0-9 - _)
;;;        - Si el PRIMER segmento (antes del primer "_") tiene
;;;          MAS de 5 letras -- es decir no hay una "sigla" de
;;;          hasta 5 letras al inicio -- se antepone "GEN_".
;;;        - Aplica formato de lectura tipo "Title":
;;;            * segmento de 5 letras o menos -> MAYUSCULA (sigla)
;;;            * segmento de 6 letras o mas   -> Capitalizada
;;;          Ej: "CIV-Cimentacion Cerramiento"
;;;              -> "CIV_Cimentacion_Cerramiento"
;;;          Ej: "Cimentacion" (sin sigla al inicio)
;;;              -> "GEN_Cimentacion"
;;;        - Si al normalizar dos nombres colisionan, aplica
;;;          consecutivo _2, _3, ... (respetando la tabla real:
;;;          LAYER, BLOCK o STYLE).
;;;        - No se tocan objetos de sistema ("*...") ni bloques/
;;;          estilos reservados ("_..." y "STANDARD").
;;;   Paso 11 - AUDIT + PURGE final de seguridad (para detectar y
;;;             corregir errores en el dibujo y no dejar nada mas
;;;             purgable en memoria).
;;;
;;;  Comando: NORMALIZAR
;;;
;;;  Recomendacion: ejecutar sobre una copia / con el dibujo
;;;  guardado, ya que este comando ELIMINA cotas, textos,
;;;  atributos, achurados, wipeouts y layouts completos, y
;;;  modifica capas, bloques y estilos de texto.
;;;  Todo el proceso queda dentro de un unico grupo UNDO, por
;;;  lo que un solo "U" revierte todos los cambios (los pasos que
;;;  usan el Editor de Bloques -BEDIT/BCLOSE- generan su propio
;;;  historial de deshacer independiente dentro de cada bloque).
;; Diseno: Arley Zarate
;; Revision: 4
;; Fecha: 26/julio/2026
;;; ============================================================

(vl-load-com)

;; ------------------------------------------------------------
;; Extrae el nombre "real" de la capa: todo lo que sigue
;; despues del ULTIMO caracter "$" encontrado en el nombre.
;; Cubre el patron RUTA$0$NOMBRE, e incluso binds anidados
;; tipo RUTA2$1$RUTA1$0$NOMBRE (siempre queda el nombre final).
;; ------------------------------------------------------------
(defun nz:nombre-base (nm / i ultimo len)
  (setq len (strlen nm))
  (setq ultimo nil)
  (setq i 1)
  (while (<= i len)
    (if (= (substr nm i 1) "$")
      (setq ultimo i)
    )
    (setq i (1+ i))
  )
  (if ultimo
    (substr nm (1+ ultimo))
    nm
  )
)

;; ------------------------------------------------------------
;; Genera un nombre unico agregando consecutivo _2, _3, ...
;; si el nombre base ya existe en la TABLA indicada
;; ("LAYER", "BLOCK" o "STYLE").
;; ------------------------------------------------------------
(defun nz:nombre-unico (base tabla / cand cont)
  (setq cont 1)
  (setq cand base)
  (while (tblsearch tabla cand)
    (setq cont (1+ cont))
    (setq cand (strcat base "_" (itoa cont)))
  )
  cand
)

;; ------------------------------------------------------------
;; Recorre todas las capas del dibujo y renombra las que
;; contengan "$" en su nombre.
;; ------------------------------------------------------------
(defun nz:renombrar-capas ( / doc layers nombres nm base nuevo lyr n-ok n-skip res)
  (setq doc    (vla-get-ActiveDocument (vlax-get-acad-object)))
  (setq layers (vla-get-Layers doc))
  (setq nombres nil)
  (setq n-ok 0)
  (setq n-skip 0)

  ;; Se toma una "foto" de los nombres actuales antes de renombrar,
  ;; para no modificar la coleccion mientras se recorre.
  (vlax-for lyr layers
    (setq nombres (cons (vla-get-Name lyr) nombres))
  )

  (princ "\n--- Paso 4: renombrando capas (limpieza de prefijo XREF/BIND) ---")

  (foreach nm nombres
    (if (vl-string-search "$" nm)
      (progn
        (setq base (nz:nombre-base nm))
        (cond
          ((= base "")
           (princ (strcat "\n  [OMITIDA] \"" nm "\" -> nombre resultante vacio"))
           (setq n-skip (1+ n-skip))
          )
          (t
           (setq nuevo (nz:nombre-unico base "LAYER"))
           (setq lyr (vla-item layers nm))
           (setq res (vl-catch-all-apply 'vla-put-Name (list lyr nuevo)))
           (if (vl-catch-all-error-p res)
             (progn
               (princ (strcat "\n  [ERROR]   \"" nm "\" -> \"" nuevo "\" ("
                               (vl-catch-all-error-message res) ")"))
               (setq n-skip (1+ n-skip))
             )
             (progn
               (princ (strcat "\n  [OK]      \"" nm "\" -> \"" nuevo "\""))
               (setq n-ok (1+ n-ok))
             )
           )
          )
        )
      )
    )
  )
  (princ (strcat "\n--- Renombrado finalizado: " (itoa n-ok)
                  " capas renombradas, " (itoa n-skip) " con problemas ---"))
  (princ)
)

;; ============================================================
;;  NORMALIZACION DE NOMBRES (capas, bloques, estilos de texto)
;; ============================================================

;; ------------------------------------------------------------
;; Reemplaza acentos y "n~" por su equivalente ASCII.
;; Trabaja caracter por caracter comparando el codigo ASCII,
;; para no depender de como este codificado el .lsp.
;; Nota: los codigos usados son los de la pagina CP1252/ANSI,
;; que es la que usa AutoCAD en instalaciones en espanol.
;; ------------------------------------------------------------
(defun nz:quita-acentos (txt / i c cod res)
  (setq res "")
  (setq i 1)
  (while (<= i (strlen txt))
    (setq c   (substr txt i 1))
    (setq cod (ascii c))
    (setq res
      (strcat res
        (cond
          ;; minusculas acentuadas
          ((= cod 225) "a") ; a'
          ((= cod 233) "e") ; e'
          ((= cod 237) "i") ; i'
          ((= cod 243) "o") ; o'
          ((= cod 250) "u") ; u'
          ((= cod 252) "u") ; u dieresis
          ((= cod 241) "n") ; n~
          ;; mayusculas acentuadas
          ((= cod 193) "A")
          ((= cod 201) "E")
          ((= cod 205) "I")
          ((= cod 211) "O")
          ((= cod 218) "U")
          ((= cod 220) "U")
          ((= cod 209) "N") ; N~
          ;; simbolos comunes que conviene mapear
          ((= cod 186) "")  ; simbolo grado masculino
          ((= cod 170) "")  ; simbolo grado femenino
          ;; cualquier otro caracter se deja igual por ahora
          (t c)
        )
      )
    )
    (setq i (1+ i))
  )
  res
)

;; ------------------------------------------------------------
;; Deja solo caracteres permitidos: A-Z a-z 0-9 y "_".
;; Los espacios se convierten en "_". El guion "-" tambien se
;; convierte en "_" (raya al piso). Cualquier otro simbolo se
;; elimina. (Se ejecuta DESPUES de quitar acentos.)
;; ------------------------------------------------------------
(defun nz:solo-permitidos (txt / i c cod res)
  (setq res "")
  (setq i 1)
  (while (<= i (strlen txt))
    (setq c   (substr txt i 1))
    (setq cod (ascii c))
    (cond
      ((= c " ") (setq res (strcat res "_")))                 ; espacio -> _
      ((= c "-") (setq res (strcat res "_")))                 ; guion -> _
      ((and (>= cod 48) (<= cod 57))  (setq res (strcat res c))) ; 0-9
      ((and (>= cod 65) (<= cod 90))  (setq res (strcat res c))) ; A-Z
      ((and (>= cod 97) (<= cod 122)) (setq res (strcat res c))) ; a-z
      ((= c "_") (setq res (strcat res c)))                   ; guion bajo
      (t nil) ; cualquier otro simbolo se descarta
    )
    (setq i (1+ i))
  )
  res
)

;; ------------------------------------------------------------
;; Si el PRIMER segmento (antes del primer "_") tiene MAS de 5
;; letras, se asume que no hay "sigla" (codigo corto) al inicio
;; del nombre, y se antepone "GEN_" como prefijo generico.
;; Se ejecuta sobre el texto YA limpio (sin acentos ni simbolos).
;; ------------------------------------------------------------
(defun nz:prefijo-gen (txt / pos primero)
  (setq pos (vl-string-search "_" txt))
  (setq primero (if pos (substr txt 1 pos) txt))
  (if (> (strlen primero) 5)
    (strcat "GEN_" txt)
    txt
  )
)

;; ------------------------------------------------------------
;; Aplica formato a UN segmento (palabra):
;;   - 5 letras o menos  -> todo MAYUSCULA (se asume sigla)
;;   - 6 letras o mas    -> Primera mayuscula, resto minuscula
;; ------------------------------------------------------------
(defun nz:formato-segmento (seg)
  (cond
    ((= (strlen seg) 0) seg)
    ((<= (strlen seg) 5) (strcase seg))            ; sigla
    (t (strcat (strcase (substr seg 1 1))          ; Capitalizada
               (strcase (substr seg 2) T)))
  )
)

;; ------------------------------------------------------------
;; Aplica el formato de lectura a un nombre completo, tratando
;; "_" como separador (se conserva). Cada segmento entre
;; separadores se formatea con nz:formato-segmento.
;; ------------------------------------------------------------
(defun nz:formato-nombre (txt / i c res seg)
  (setq res "")
  (setq seg "")
  (setq i 1)
  (while (<= i (strlen txt))
    (setq c (substr txt i 1))
    (if (= c "_")
      (progn
        (setq res (strcat res (nz:formato-segmento seg) c))
        (setq seg "")
      )
      (setq seg (strcat seg c))
    )
    (setq i (1+ i))
  )
  (setq res (strcat res (nz:formato-segmento seg)))
  res
)

;; ------------------------------------------------------------
;; Normaliza el nombre de TODOS los elementos de una coleccion
;; (Layers, Blocks o TextStyles):
;;   quita acentos -> deja solo permitidos -> prefijo GEN_ si
;;   falta la sigla inicial -> formato de lectura.
;; Aplica consecutivo si dos nombres colisionan tras normalizar
;; (usando la tabla real: "LAYER", "BLOCK" o "STYLE").
;; No toca elementos de sistema ("*...") ni reservados ("_...")
;; ni los que esten en la lista "excluidos" (en mayusculas).
;; ------------------------------------------------------------
(defun nz:normalizar-coleccion (coleccion etiqueta tabla excluidos
                                 / nombres nm limpio nuevo obj n-ok n-skip res)
  (setq nombres nil)
  (setq n-ok 0)
  (setq n-skip 0)

  (vlax-for obj coleccion
    (setq nombres (cons (vla-get-Name obj) nombres))
  )

  (princ (strcat "\n--- Paso 10: normalizando nombres de " etiqueta " ---"))

  (foreach nm nombres
    (if (and (/= (substr nm 1 1) "*")
             (/= (substr nm 1 1) "_")
             (not (member (strcase nm) excluidos))
        )
      (progn
        (setq limpio (nz:solo-permitidos (nz:quita-acentos nm)))
        (setq limpio (nz:prefijo-gen limpio))
        (setq limpio (nz:formato-nombre limpio))
        (cond
          ((= limpio "")
           (princ (strcat "\n  [OMITIDA] \"" nm "\" -> resultado vacio"))
           (setq n-skip (1+ n-skip))
          )
          ;; Si ya quedo igual, no se hace nada
          ((= limpio nm) nil)
          (t
           ;; nombre unico solo si el destino ya existe y no es el mismo objeto
           (if (and (tblsearch tabla limpio)
                    (/= (strcase limpio) (strcase nm)))
             (setq nuevo (nz:nombre-unico limpio tabla))
             (setq nuevo limpio)
           )
           ;; IMPORTANTE: se vuelve a buscar el objeto por su nombre ORIGINAL
           ;; en cada vuelta del ciclo (igual que en nz:renombrar-capas). No
           ;; se debe reutilizar la variable "obj" del vlax-for anterior, ya
           ;; que esa queda apuntando unicamente al ULTIMO elemento recorrido.
           (setq obj (vl-catch-all-apply 'vla-Item (list coleccion nm)))
           (if (vl-catch-all-error-p obj)
             (progn
               (princ (strcat "\n  [ERROR]   \"" nm "\" -> no se encontro el objeto original"))
               (setq n-skip (1+ n-skip))
             )
             (progn
               (setq res (vl-catch-all-apply 'vla-put-Name (list obj nuevo)))
               (if (vl-catch-all-error-p res)
                 (progn
                   (princ (strcat "\n  [ERROR]   \"" nm "\" -> \"" nuevo "\" ("
                                   (vl-catch-all-error-message res) ")"))
                   (setq n-skip (1+ n-skip))
                 )
                 (progn
                   (princ (strcat "\n  [OK]      \"" nm "\" -> \"" nuevo "\""))
                   (setq n-ok (1+ n-ok))
                 )
               )
             )
           )
          )
        )
      )
    )
  )
  (princ (strcat "\n--- Normalizacion de " etiqueta " finalizada: " (itoa n-ok)
                  " renombrados, " (itoa n-skip) " con problemas ---"))
  (princ)
)

;; Envoltorio: aplica la normalizacion a capas, bloques y estilos de texto.
(defun nz:normalizar-todo ( / doc)
  (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)))
  (nz:normalizar-coleccion (vla-get-Layers doc)     "capas"              "LAYER" nil)
  (nz:normalizar-coleccion (vla-get-Blocks doc)      "bloques"            "BLOCK" nil)
  (nz:normalizar-coleccion (vla-get-TextStyles doc)  "estilos de texto"   "STYLE" '("STANDARD"))
  (princ)
)

;; ============================================================
;;  DESENLACE DE REFERENCIAS EXTERNAS (XREF)
;; ============================================================
(defun nz:desenlazar-xrefs ( / doc blocks blk nombre esxref lista n-ok n-err res)
  (setq doc    (vla-get-ActiveDocument (vlax-get-acad-object)))
  (setq blocks (vla-get-Blocks doc))
  (setq lista nil)

  (vlax-for blk blocks
    (setq esxref (vl-catch-all-apply 'vla-get-IsXRef (list blk)))
    (if (and (not (vl-catch-all-error-p esxref)) (equal esxref :vlax-true))
      (setq lista (cons (vla-get-Name blk) lista))
    )
  )

  (if lista
    (progn
      (princ (strcat "\n--- Paso 2: desenlazando (DETACH) " (itoa (length lista))
                      " referencia(s) externa(s) ---"))
      (setq n-ok 0)
      (setq n-err 0)
      (foreach nombre lista
        (setq res (vl-catch-all-apply '(lambda () (command "_.-XREF" "_Detach" nombre)) nil))
        (if (vl-catch-all-error-p res)
          (progn
            (setq n-err (1+ n-err))
            (princ (strcat "\n  [ERROR] no se pudo desenlazar \"" nombre "\""))
          )
          (setq n-ok (1+ n-ok))
        )
      )
      (princ (strcat "\n  Xrefs desenlazadas: " (itoa n-ok) ", con error: " (itoa n-err)))
    )
    (princ "\n--- Paso 2: no se encontraron referencias externas (Xref) para desenlazar ---")
  )
  (princ)
)

;; ============================================================
;;  GESTION DEL LAYOUT "XREF" (crea uno vacio, borra los demas)
;; ============================================================
(defun nz:gestionar-layout-xref ( / doc layouts layout-existente nuevo-layout
                                    layouts-todos lay block objs obj n-borrados)
  (setq doc     (vla-get-ActiveDocument (vlax-get-acad-object)))
  (setq layouts (vla-get-Layouts doc))
  (princ "\n--- Paso 3: creando layout \"XREF\" vacio y eliminando los demas layouts ---")

  ;; Ubica si ya existe un layout llamado XREF (sin distinguir mayus/minus)
  (setq layout-existente nil)
  (vlax-for lay layouts
    (if (= (strcase (vla-get-Name lay)) "XREF")
      (setq layout-existente lay)
    )
  )

  (if layout-existente
    (setq nuevo-layout layout-existente)
    (setq nuevo-layout (vl-catch-all-apply 'vla-Add (list layouts "XREF")))
  )

  (if (vl-catch-all-error-p nuevo-layout)
    (princ (strcat "\n  [ERROR] No se pudo crear el layout XREF: "
                    (vl-catch-all-error-message nuevo-layout)))
    (progn
      ;; Se evita que algun layout a borrar este activo en este momento
      (setvar "CTAB" "Model")

      ;; Se asegura que el layout XREF quede sin ningun viewport
      (setq block (vl-catch-all-apply 'vla-get-Block (list nuevo-layout)))
      (setq n-borrados 0)
      (if (not (vl-catch-all-error-p block))
        (progn
          (setq objs nil)
          (vlax-for obj block (setq objs (cons obj objs)))
          (foreach obj objs
            (if (= (vla-get-ObjectName obj) "AcDbViewport")
              (if (not (vl-catch-all-error-p (vl-catch-all-apply 'vla-Delete (list obj))))
                (setq n-borrados (1+ n-borrados))
              )
            )
          )
        )
      )

      ;; Elimina el resto de layouts, dejando unicamente XREF
      (setq layouts-todos nil)
      (vlax-for lay layouts (setq layouts-todos (cons lay layouts-todos)))
      (foreach lay layouts-todos
        (if (/= (strcase (vla-get-Name lay)) "XREF")
          (vl-catch-all-apply 'vla-Delete (list lay))
        )
      )
      (princ (strcat "\n  Layout XREF listo (viewports removidos: " (itoa n-borrados)
                      "); demas layouts eliminados."))
    )
  )
  (princ)
)

;; ============================================================
;;  ELIMINACION DE ANOTACIONES / ATRIBUTOS / ACHURADOS / WIPEOUT
;;  (dentro y fuera de bloques: Model, Layouts y cada definicion
;;  de bloque, ya que la coleccion Blocks los incluye a todos)
;; ============================================================
(defun nz:tipo-a-eliminar (objname)
  (cond
    ((= objname "AcDbText") "TEXT")
    ((= objname "AcDbMText") "MTEXT")
    ((= objname "AcDbLeader") "LEADER")
    ((= objname "AcDbMLeader") "MLEADER")
    ((= objname "AcDbAttributeDefinition") "ATTDEF")
    ((= objname "AcDbAttribute") "ATTRIB")
    ((= objname "AcDbHatch") "HATCH")           ; incluye achurados y solidos/sombras
    ((= objname "AcDbWipeout") "WIPEOUT")
    ((vl-string-search "Dimension" objname) "DIM") ; cubre todas las variantes de cota
    (t nil)
  )
)

(defun nz:eliminar-elementos-anotacion ( / doc blocks blk objs obj objname tipo
                                          bloques-attdef nombre-bloque
                                          n-text n-mtext n-dim n-leader n-mleader
                                          n-attdef n-attrib n-hatch n-wipe n-total)
  (setq doc    (vla-get-ActiveDocument (vlax-get-acad-object)))
  (setq blocks (vla-get-Blocks doc))
  (setq bloques-attdef nil)
  (setq n-text 0 n-mtext 0 n-dim 0 n-leader 0 n-mleader 0
        n-attdef 0 n-attrib 0 n-hatch 0 n-wipe 0)

  (princ "\n--- Paso 5: eliminando cotas, leader/multileader, mtext, texto, atributos, achurados y wipeout (dentro y fuera de bloques) ---")

  (vlax-for blk blocks
    (setq nombre-bloque (vla-get-Name blk))
    (setq objs nil)
    (vlax-for obj blk (setq objs (cons obj objs)))
    (foreach obj objs
      (setq objname (vla-get-ObjectName obj))
      (setq tipo (nz:tipo-a-eliminar objname))
      (if tipo
        (progn
          (if (and (= tipo "ATTDEF") (not (member nombre-bloque bloques-attdef)))
            (setq bloques-attdef (cons nombre-bloque bloques-attdef))
          )
          (if (not (vl-catch-all-error-p (vl-catch-all-apply 'vla-Delete (list obj))))
            (cond
              ((= tipo "TEXT")    (setq n-text    (1+ n-text)))
              ((= tipo "MTEXT")   (setq n-mtext   (1+ n-mtext)))
              ((= tipo "DIM")     (setq n-dim     (1+ n-dim)))
              ((= tipo "LEADER")  (setq n-leader  (1+ n-leader)))
              ((= tipo "MLEADER") (setq n-mleader (1+ n-mleader)))
              ((= tipo "ATTDEF")  (setq n-attdef  (1+ n-attdef)))
              ((= tipo "ATTRIB")  (setq n-attrib  (1+ n-attrib)))
              ((= tipo "HATCH")   (setq n-hatch   (1+ n-hatch)))
              ((= tipo "WIPEOUT") (setq n-wipe    (1+ n-wipe)))
            )
          )
        )
      )
    )
  )

  (setq n-total (+ n-text n-mtext n-dim n-leader n-mleader n-attdef n-attrib n-hatch n-wipe))
  (princ (strcat "\n  TEXT: " (itoa n-text) "  MTEXT: " (itoa n-mtext)
                  "  DIM: " (itoa n-dim) "  LEADER: " (itoa n-leader)
                  "  MLEADER: " (itoa n-mleader)))
  (princ (strcat "\n  ATTDEF: " (itoa n-attdef) "  ATTRIB: " (itoa n-attrib)
                  "  HATCH: " (itoa n-hatch) "  WIPEOUT: " (itoa n-wipe)))
  (princ (strcat "\n  Total de objetos eliminados: " (itoa n-total)))
  bloques-attdef
)

;; ------------------------------------------------------------
;; Sincroniza atributos (ATTSYNC) sobre los bloques que tenian
;; ATTDEF, como respaldo adicional a la eliminacion directa.
;; NOTA: BATTMAN es un comando SOLO de cuadro de dialogo, no
;; tiene version "-BATTMAN" para linea de comandos/script. Su
;; motor de sincronizacion (el mismo que usa el boton "Sync" de
;; BATTMAN) SI es accesible por linea de comandos como ATTSYNC,
;; por eso se usa aqui en lugar de BATTMAN.
;; ------------------------------------------------------------
(defun nz:sync-atributos (bloques / nombre)
  (if bloques
    (progn
      (princ (strcat "\n--- Paso 6: sincronizando atributos (ATTSYNC) en "
                      (itoa (length bloques)) " bloque(s) ---"))
      (foreach nombre bloques
        (vl-catch-all-apply '(lambda () (command "_.ATTSYNC" "_Name" nombre "")) nil)
      )
    )
    (princ "\n--- Paso 6: no habia bloques con atributos, se omite ATTSYNC ---")
  )
  (princ)
)

;; ============================================================
;;  OVERKILL DENTRO DE CADA DEFINICION DE BLOQUE
;;  (via Editor de Bloques: BEDIT -> -OVERKILL -> BCLOSE)
;; ============================================================
(defun nz:overkill-en-bloques ( / doc blocks blk nombre lista esxref res n-ok n-skip
                                  blkobj hayproxy haygeom esdyn obj on)
  (setq doc    (vla-get-ActiveDocument (vlax-get-acad-object)))
  (setq blocks (vla-get-Blocks doc))
  (setq lista nil)
  (setq n-ok 0)
  (setq n-skip 0)

  ;; Se excluyen bloques de sistema/anonimos ("*..."), reservados
  ;; de AutoCAD ("_...", como flechas de cota) y referencias Xref.
  (vlax-for blk blocks
    (setq nombre (vla-get-Name blk))
    (setq esxref (vl-catch-all-apply 'vla-get-IsXRef (list blk)))
    (if (vl-catch-all-error-p esxref) (setq esxref nil))
    (if (and (/= (substr nombre 1 1) "*")
             (/= (substr nombre 1 1) "_")
             (not (equal esxref :vlax-true)))
      (setq lista (cons nombre lista))
    )
  )

  (princ (strcat "\n--- Paso 7: OVERKILL + conversion a polilineas dentro de " (itoa (length lista))
                  " definicion(es) de bloque ---"))

  ;; NOTA: BCLOSE es un comando de SOLO dialogo (Guardar/Descartar/Cancelar) si
  ;; quedan cambios sin guardar, y no acepta esas opciones por linea de comandos.
  ;; Por eso se ejecuta BSAVE (guarda el bloque sin preguntar) ANTES de BCLOSE:
  ;; al no quedar cambios pendientes, BCLOSE cierra sin mostrar ningun dialogo.
  (foreach nombre lista
    (setq blkobj (vl-catch-all-apply 'vla-Item (list blocks nombre)))
    (cond
      ;; no se pudo acceder a la definicion
      ((vl-catch-all-error-p blkobj)
       (nz:omitir (strcat "Bloque \"" nombre "\": no se pudo acceder a la definicion."))
       (setq n-skip (1+ n-skip)))
      (T
       ;; --- clasificar el contenido del bloque ANTES de abrirlo ---
       (setq hayproxy nil haygeom nil)
       (setq esdyn (vl-catch-all-apply 'vla-get-IsDynamicBlock (list blkobj)))
       (if (vl-catch-all-error-p esdyn) (setq esdyn nil))
       (vlax-for obj blkobj
         (setq on (vl-catch-all-apply 'vla-get-ObjectName (list obj)))
         (if (not (vl-catch-all-error-p on))
           (progn
             (if (not (nz:estandar-p on)) (setq hayproxy T))
             (if (nz:geom-pedit-p on)     (setq haygeom  T))
           )
         )
       )
       (cond
         ;; bloque dinamico: omitir (BEDIT puede alterar sus estados)
         ((equal esdyn :vlax-true)
          (nz:omitir (strcat "Bloque \"" nombre "\": dinamico, omitido."))
          (setq n-skip (1+ n-skip)))
         ;; contiene objetos proxy/AEC: omitir (EXPLODE/PEDIT se colgarian)
         (hayproxy
          (nz:omitir (strcat "Bloque \"" nombre "\": contiene objetos proxy/AEC, omitido."))
          (setq n-skip (1+ n-skip)))
         ;; bloque limpio: procesar dentro del editor
         (T
          (setq res
            (vl-catch-all-apply
              '(lambda ()
                 (command "_.BEDIT" nombre)
                 (if (= (getvar "BLOCKEDITOR") 1)     ; solo si el editor abrio de verdad
                   (progn
                     (command "_.-OVERKILL" "_ALL" "" "")
                     (if haygeom (nz:convertir-bloque-actual))   ; PEDIT solo si hay geometria
                     (command "_.BSAVE")
                     (command "_.BCLOSE")
                   )
                   (nz:omitir (strcat "Bloque \"" nombre "\": no se pudo abrir en el editor."))
                 )
               )
              nil
            )
          )
          (if (vl-catch-all-error-p res)
            (progn
              (princ (strcat "\n  [ERROR] bloque \"" nombre "\": " (vl-catch-all-error-message res)))
              (nz:omitir (strcat "Bloque \"" nombre "\": error (" (vl-catch-all-error-message res) ")."))
              (setq n-skip (1+ n-skip))
              ;; si quedo abierto el editor, intentar cerrarlo para no trabar el ciclo
              (if (= (getvar "BLOCKEDITOR") 1)
                (vl-catch-all-apply '(lambda () (command "_.BCLOSE")))
              )
            )
            (setq n-ok (1+ n-ok))
          )
         )
       )
      )
    )
  )
  (princ (strcat "\n  Bloques procesados con OVERKILL: " (itoa n-ok)
                  ", con problemas: " (itoa n-skip)))
  (princ)
)

;; ============================================================
;;  UTILIDADES DE CLASIFICACION DE OBJETOS
;; ============================================================
;; *NZ-OMITIDOS* : lista de elementos/bloques que NO se pudieron
;; tratar (proxy/AEC, dinamicos, etc.). Se reporta al final.
(defun nz:omitir (txt)
  (setq *NZ-OMITIDOS* (cons txt *NZ-OMITIDOS*))
  (princ)
)

;; T si el ObjectName corresponde a un objeto ESTANDAR de AutoCAD.
(defun nz:estandar-p (on)
  (and on
       (member (strcase on)
         '("ACDBLINE" "ACDBARC" "ACDBCIRCLE" "ACDBELLIPSE" "ACDBSPLINE"
           "ACDBPOLYLINE" "ACDB2DPOLYLINE" "ACDB3DPOLYLINE" "ACDBPOINT"
           "ACDBTEXT" "ACDBMTEXT" "ACDBATTRIBUTE" "ACDBATTRIBUTEDEFINITION"
           "ACDBBLOCKREFERENCE" "ACDBHATCH" "ACDBSOLID" "ACDBTRACE" "ACDBFACE"
           "ACDBREGION" "ACDB3DSOLID" "ACDBSURFACE" "ACDBBODY"
           "ACDBMLINE" "ACDBLEADER" "ACDBMLEADER" "ACDBTABLE" "ACDBWIPEOUT"
           "ACDBXLINE" "ACDBRAY" "ACDBSHAPE"
           "ACDBROTATEDDIMENSION" "ACDBALIGNEDDIMENSION" "ACDBRADIALDIMENSION"
           "ACDBDIAMETRICDIMENSION" "ACDB2LINEANGULARDIMENSION"
           "ACDB3POINTANGULARDIMENSION" "ACDBORDINATEDIMENSION"
           "ACDBARCDIMENSION" "ACDBRADIALDIMENSIONLARGE")))
)

;; T si el ObjectName es geometria que PEDIT puede unir.
(defun nz:geom-pedit-p (on)
  (and on
       (member (strcase on)
         '("ACDBLINE" "ACDBARC" "ACDBPOLYLINE" "ACDB2DPOLYLINE" "ACDB3DPOLYLINE")))
)

;; ============================================================
;;  DESAGRUPAR y EXPLOTAR PROXIES / OBJETOS AEC
;; ============================================================

;; Disuelve TODOS los grupos. Borrar la definicion de grupo solo
;; deshace la agrupacion: los objetos miembro NO se eliminan.
(defun nz:desagrupar-todo ( / doc grupos grp lista n)
  (setq doc    (vla-get-ActiveDocument (vlax-get-acad-object))
        grupos (vla-get-Groups doc)
        n 0 lista nil)
  (princ "\n--- Paso 6b: desagrupando todos los grupos ---")
  (vlax-for grp grupos (setq lista (cons grp lista)))
  (foreach grp lista
    (if (not (vl-catch-all-error-p (vl-catch-all-apply 'vla-Delete (list grp))))
      (setq n (1+ n))))
  (princ (strcat "\n  Grupos disueltos: " (itoa n)
                  " (los objetos no se borran, solo se quita la agrupacion)."))
  (princ)
)

;; Explota en el MODELO todo objeto que NO sea un tipo estandar de
;; AutoCAD (proxy, Civil 3D, AEC, etc.), dejando geometria pura sin
;; metadatos. Trabaja en pasadas porque un objeto AEC puede explotar
;; en otros objetos que a su vez deban explotarse. Si quedan objetos
;; que no se pueden explotar (p.ej. proxy sin su habilitador/enabler),
;; se detiene y lo informa.
(defun nz:explotar-proxies-modelo ( / doc msp pasada maxpas objs obj on r total pasoexp restantes tipos)
  (setq doc    (vla-get-ActiveDocument (vlax-get-acad-object))
        msp    (vla-get-ModelSpace doc)
        maxpas 6
        pasada 0
        total  0)
  (princ "\n--- Paso 6c: convirtiendo objetos proxy/AEC (Civil 3D, etc.) a geometria pura por COM (Modelo) ---")
  ;; Se usa COM (vla-Explode) en vez del comando EXPLODE: COM NO se queda
  ;; esperando entrada, asi que un objeto problematico no cuelga el proceso.
  ;; Si un objeto no se puede explotar, vla-Explode lanza un error que se
  ;; atrapa y ese objeto simplemente se deja (se reporta al final).
  (while (< pasada maxpas)
    (setq pasada (1+ pasada))
    (setq objs nil)
    (vlax-for obj msp
      (setq on (vl-catch-all-apply 'vla-get-ObjectName (list obj)))
      (if (and (not (vl-catch-all-error-p on)) (not (nz:estandar-p on)))
        (setq objs (cons obj objs))
      )
    )
    (if (null objs)
      (setq pasada maxpas)                         ; no queda nada no estandar
      (progn
        (setq pasoexp 0)
        (foreach obj objs
          (setq r (vl-catch-all-apply 'vla-Explode (list obj)))
          (if (not (vl-catch-all-error-p r))
            (progn
              (vl-catch-all-apply 'vla-Delete (list obj))   ; borrar original ya explotado
              (setq total   (1+ total)
                    pasoexp (1+ pasoexp))
            )
          )
        )
        (princ (strcat "\n  Pasada " (itoa pasada) ": " (itoa (length objs))
                       " no estandar, explotados " (itoa pasoexp) "."))
        (if (= pasoexp 0) (setq pasada maxpas))     ; ninguno se pudo explotar: cortar
      )
    )
  )
  ;; Reportar los que quedaron sin convertir (proxy sin enabler, etc.)
  (setq restantes nil tipos nil)
  (vlax-for obj msp
    (setq on (vl-catch-all-apply 'vla-get-ObjectName (list obj)))
    (if (and (not (vl-catch-all-error-p on)) (not (nz:estandar-p on)))
      (progn
        (setq restantes (cons obj restantes))
        (if (not (member on tipos)) (setq tipos (cons on tipos)))
      )
    )
  )
  (if restantes
    (nz:omitir (strcat "Modelo: " (itoa (length restantes))
                       " objeto(s) proxy/AEC no convertibles [tipos: "
                       (apply 'strcat (mapcar '(lambda (x) (strcat x " ")) tipos)) "]"))
  )
  (princ (strcat "\n  Objetos proxy/AEC convertidos por COM: " (itoa total)))
  (princ)
)

;; ============================================================
;;  ELIMINAR PUNTOS (POINT) dentro y fuera de los bloques
;; ============================================================
;; Recorre TODOS los espacios/definiciones (Modelo, Papel y cada
;; bloque local; se saltan los Xref) y borra por COM todo objeto
;; AcDbPoint. Se recolectan primero y luego se borran, para no
;; alterar la coleccion durante el recorrido.
(defun nz:eliminar-puntos ( / doc blocks blk esxref objs obj on n)
  (setq doc    (vla-get-ActiveDocument (vlax-get-acad-object))
        blocks (vla-get-Blocks doc)
        n 0)
  (princ "\n--- Paso 6d: eliminando todos los puntos (POINT) dentro y fuera de los bloques ---")
  (vlax-for blk blocks
    (setq esxref (vl-catch-all-apply 'vla-get-IsXRef (list blk)))
    (if (vl-catch-all-error-p esxref) (setq esxref nil))
    (if (not (equal esxref :vlax-true))     ; no tocar Xrefs
      (progn
        (setq objs nil)
        (vlax-for obj blk
          (setq on (vl-catch-all-apply 'vla-get-ObjectName (list obj)))
          (if (and (not (vl-catch-all-error-p on)) (= on "AcDbPoint"))
            (setq objs (cons obj objs))
          )
        )
        (foreach obj objs
          (if (not (vl-catch-all-error-p (vl-catch-all-apply 'vla-Delete (list obj))))
            (setq n (1+ n))
          )
        )
      )
    )
  )
  (princ (strcat "\n  Puntos (POINT) eliminados: " (itoa n)))
  (princ)
)

;; ============================================================
;;  CONVERSION A POLILINEAS (optimizacion de peso)
;; ============================================================
;; Idea: reemplazar lineas/arcos sueltos por polilineas unidas
;; (una polilinea con N vertices pesa mucho menos que N lineas),
;; y dejar las polilineas como LWPOLYLINE (variante ligera).
;;
;; PLINETYPE=2  -> las polilineas que resulten seran LIGERAS.
;;                 (con PLINETYPE=0 el Join crearia polilineas
;;                  2D pesadas, justo lo contrario al objetivo.)
;; PEDITACCEPT=1 -> no muestra el prompt "convertir a polilinea?".
;; Ambas variables se restauran al terminar.
;; ------------------------------------------------------------

;; Convierte TODAS las lineas a polilinea y une POR CAPA (Modelo).
;;   1) Explota polilineas 3D -> quedan lineas.
;;   2) Convierte CADA linea (LINE) a polilinea ligera de 1 tramo por COM
;;      (entmake). Garantiza que NINGUNA linea quede como linea, este sola
;;      o no. Esto evita el problema de JOIN con lineas colineales (que las
;;      dejaria como una sola LINEA en vez de polilinea).
;;   3) Une por capa las polilineas/arcos que compartan extremos (unir
;;      polilineas SI deja polilinea). Preserva la separacion entre capas.
;;   4) CONVERTPOLY a ligera lo que sea convertible.
(defun nz:convertir-modelo ( / doc esp ss3d capas cap ss l plAnt
                             sslin i elin dat p1 p2 caplin nconv r)
  (setq doc (vla-get-ActiveDocument (vlax-get-acad-object))
        esp "Model")
  (princ "\n--- Paso 7b: convirtiendo TODAS las lineas a polilinea y uniendo por capa (Modelo) ---")

  (setq plAnt (getvar "PLINETYPE"))
  ;; setvar protegido: si PLINETYPE es rechazado, el resto igual continua.
  (vl-catch-all-apply '(lambda () (setvar "PLINETYPE" 2)))

  ;; 1) Explotar polilineas 3D del Modelo -> quedan lineas
  (setq ss3d (ssget "_X" (list '(0 . "POLYLINE") '(-4 . "&") '(70 . 8) (cons 410 esp))))
  (if ss3d
    (progn
      (princ (strcat "\n  Explotando " (itoa (sslength ss3d)) " polilinea(s) 3D..."))
      (vl-catch-all-apply '(lambda () (command "_.EXPLODE" ss3d "")))
    )
  )

  ;; 2) Convertir CADA linea a polilinea ligera de 1 tramo (entmake, por COM).
  ;;    Conserva la capa de la linea y borra la linea original.
  (setq nconv 0)
  (setq sslin (ssget "_X" (list '(0 . "LINE") (cons 410 esp))))
  (if sslin
    (progn
      (setq i 0)
      (while (< i (sslength sslin))
        (setq elin   (ssname sslin i)
              dat    (entget elin)
              p1     (cdr (assoc 10 dat))
              p2     (cdr (assoc 11 dat))
              caplin (cdr (assoc 8 dat)))
        (if (and p1 p2)
          (progn
            (setq r (vl-catch-all-apply 'entmake
                      (list (list (cons 0 "LWPOLYLINE")
                                  (cons 100 "AcDbEntity")
                                  (cons 8 caplin)
                                  (cons 100 "AcDbPolyline")
                                  (cons 90 2)
                                  (cons 70 0)
                                  (list 10 (car p1) (cadr p1))
                                  (list 10 (car p2) (cadr p2))))))
            (if (and (not (vl-catch-all-error-p r)) r)   ; solo borrar si entmake tuvo exito
              (progn
                (entdel elin)
                (setq nconv (1+ nconv))
              )
            )
          )
        )
        (setq i (1+ i))
      )
      (princ (strcat "\n  Lineas convertidas a polilinea: " (itoa nconv)))
    )
  )

  ;; 3) Unir por capa las polilineas/arcos que compartan extremos
  (setq capas nil)
  (vlax-for l (vla-get-Layers doc) (setq capas (cons (vla-get-Name l) capas)))
  (foreach cap capas
    (setq ss (ssget "_X" (list '(0 . "LWPOLYLINE,POLYLINE,ARC")
                               (cons 8 cap) (cons 410 esp))))
    (if ss
      (vl-catch-all-apply
        '(lambda () (command "_.JOIN" ss "")))
    )
  )

  ;; 4) Convertir a polilinea ligera lo que sea convertible
  (vl-catch-all-apply '(lambda () (command "_.CONVERTPOLY" "_L" "_ALL" "")))

  (vl-catch-all-apply '(lambda () (setvar "PLINETYPE" plAnt)))
  (princ "\n  Conversion en Modelo finalizada.")
  (princ)
)

;; Convierte lineas (LINE) a polilinea DENTRO de cada definicion de bloque,
;; por COM (vla-AddLightWeightPolyline). NO usa BEDIT y NO se cuelga. No une
;; extremos dentro del bloque (eso requeriria comando); solo garantiza que las
;; lineas pasen a polilinea. Se saltan las Xref.
(defun nz:convertir-lineas-bloques ( / doc blocks blk esxref lista obj on eln dat p1 p2 vpts newpl nconv nbloq)
  (setq doc    (vla-get-ActiveDocument (vlax-get-acad-object))
        blocks (vla-get-Blocks doc)
        nconv 0 nbloq 0)
  (princ "\n--- Paso 7c: convirtiendo lineas a polilinea DENTRO de los bloques (COM) ---")
  (vlax-for blk blocks
    (setq esxref (vl-catch-all-apply 'vla-get-IsXRef (list blk)))
    (if (vl-catch-all-error-p esxref) (setq esxref nil))
    (if (not (equal esxref :vlax-true))
      (progn
        (setq lista nil)
        (vlax-for obj blk
          (setq on (vl-catch-all-apply 'vla-get-ObjectName (list obj)))
          (if (and (not (vl-catch-all-error-p on)) (= on "AcDbLine"))
            (setq lista (cons obj lista))
          )
        )
        (if lista (setq nbloq (1+ nbloq)))
        (foreach obj lista
          (setq eln (vlax-vla-object->ename obj)
                dat (entget eln)
                p1  (cdr (assoc 10 dat))
                p2  (cdr (assoc 11 dat)))
          (if (and p1 p2)
            (progn
              (setq vpts (vlax-make-safearray vlax-vbDouble '(0 . 3)))
              (vlax-safearray-fill vpts (list (car p1) (cadr p1) (car p2) (cadr p2)))
              (setq newpl (vl-catch-all-apply 'vla-AddLightWeightPolyline (list blk vpts)))
              (if (and (not (vl-catch-all-error-p newpl)) newpl)
                (progn
                  (vl-catch-all-apply '(lambda () (vla-put-Layer newpl (cdr (assoc 8 dat)))))
                  (vl-catch-all-apply 'vla-Delete (list obj))
                  (setq nconv (1+ nconv))
                )
              )
            )
          )
        )
      )
    )
  )
  (princ (strcat "\n  Lineas en bloques convertidas: " (itoa nconv)
                  " (en " (itoa nbloq) " bloque(s) con lineas)"))
  (princ)
)

;; Convierte a polilineas dentro del BLOQUE abierto en el Editor
;; de Bloques (BEDIT). Usa seleccion "_ALL" (todo el bloque) para
;; no depender de filtros dentro del editor; por eso aqui la union
;; puede juntar segmentos de distinta capa DENTRO del mismo bloque
;; (normalmente aceptable en el contenido de un bloque).
(defun nz:convertir-bloque-actual ( / plAnt pedAnt)
  (setq plAnt  (getvar "PLINETYPE")
        pedAnt (getvar "PEDITACCEPT"))
  (setvar "PLINETYPE" 2)
  (setvar "PEDITACCEPT" 1)
  (vl-catch-all-apply '(lambda () (command "_.JOIN" "_ALL" "")))
  (vl-catch-all-apply '(lambda () (command "_.CONVERTPOLY" "_L" "_ALL" "")))
  (setvar "PEDITACCEPT" pedAnt)
  (setvar "PLINETYPE" plAnt)
  (princ)
)

;; ------------------------------------------------------------
;; Limpieza general: OVERKILL, CHPROP, SETBYLAYER y PURGE.
;; Actua sobre el ESPACIO ACTIVO (Model, normalmente, ya que
;; los demas layouts fueron eliminados en el Paso 3).
;; ------------------------------------------------------------
(defun nz:limpiar-dibujo ( / doc msp ssstd obj on)
  ;; Seleccion SOLO de objetos estandar del Modelo (excluye proxy/AEC para que
  ;; ningun comando cuelgue ni aborte el resto de la limpieza).
  (setq doc   (vla-get-ActiveDocument (vlax-get-acad-object))
        msp   (vla-get-ModelSpace doc)
        ssstd (ssadd))
  (vlax-for obj msp
    (setq on (vl-catch-all-apply 'vla-get-ObjectName (list obj)))
    (if (and (not (vl-catch-all-error-p on)) (nz:estandar-p on))
      (setq ssstd (ssadd (vlax-vla-object->ename obj) ssstd))
    )
  )
  (if (= (sslength ssstd) 0) (setq ssstd nil))

  (princ "\n--- Paso 8a: OVERKILL (eliminar duplicados) ---")
  (if ssstd (vl-catch-all-apply '(lambda () (command "_.-OVERKILL" ssstd "" ""))))

  (princ "\n--- Paso 8b: CHPROP -> Ltscale=1, Thickness=0 ---")
  (if ssstd (vl-catch-all-apply '(lambda () (command "_.CHPROP" ssstd "" "_LTSCALE" 1 "_THICKNESS" 0 ""))))

  (princ "\n--- Paso 8c: SETBYLAYER (color/tipo/grosor a ByLayer, incluye bloques) ---")
  (if ssstd (vl-catch-all-apply '(lambda () (command "_.SETBYLAYER" ssstd "" "_Yes" "_Yes"))))

  (princ "\n--- Paso 8d: PURGE (2 pasadas) ---")
  (vl-catch-all-apply '(lambda () (command "_.-PURGE" "_All" "*" "_No")))
  (vl-catch-all-apply '(lambda () (command "_.-PURGE" "_All" "*" "_No")))

  (princ "\n--- Limpieza general finalizada ---")
  (princ)
)

;; ------------------------------------------------------------
;; Aplica DENTRO de cada definicion de bloque, por COM (sin BEDIT):
;;   LinetypeScale = 1, Thickness = 0, y "ByLayer" en color,
;;   tipo de linea y grosor de linea. Cubre lo que CHPROP y
;;   SETBYLAYER solo hacian en el espacio activo (Modelo).
;; Se excluyen espacios modelo/papel ("*..."), reservados ("_...")
;; y Xrefs. Cada propiedad va protegida porque no todos los
;; objetos admiten todas (p.ej. Thickness).
;; ------------------------------------------------------------
(defun nz:props-bloques ( / doc blocks blk nombre esxref objs obj n-obj n-blk)
  (setq doc    (vla-get-ActiveDocument (vlax-get-acad-object)))
  (setq blocks (vla-get-Blocks doc))
  (setq n-obj 0 n-blk 0)
  (princ "\n--- Paso 8e: Ltscale=1, Thickness=0 y ByLayer DENTRO de los bloques (COM) ---")
  (vlax-for blk blocks
    (setq nombre (vla-get-Name blk))
    (setq esxref (vl-catch-all-apply 'vla-get-IsXRef (list blk)))
    (if (vl-catch-all-error-p esxref) (setq esxref nil))
    (if (and (/= (substr nombre 1 1) "*")
             (/= (substr nombre 1 1) "_")
             (not (equal esxref :vlax-true)))
      (progn
        (setq n-blk (1+ n-blk))
        (setq objs nil)
        (vlax-for obj blk (setq objs (cons obj objs)))
        (foreach obj objs
          (vl-catch-all-apply '(lambda () (vla-put-LinetypeScale obj 1.0)))
          (vl-catch-all-apply '(lambda () (vla-put-Thickness     obj 0.0)))
          (vl-catch-all-apply '(lambda () (vla-put-Color         obj 256)))  ; 256 = ByLayer
          (vl-catch-all-apply '(lambda () (vla-put-Linetype      obj "ByLayer")))
          (vl-catch-all-apply '(lambda () (vla-put-Lineweight    obj -1)))   ; -1 = ByLayer
          (setq n-obj (1+ n-obj))
        )
      )
    )
  )
  (princ (strcat "\n  Bloques recorridos: " (itoa n-blk)
                  ", objetos ajustados: " (itoa n-obj)))
  (princ)
)

;; ------------------------------------------------------------
;; Fuerza en TODAS las capas: Lineweight = 0.00 mm y
;; Linetype = Continuous.
;; NOTA IMPORTANTE: esto se hace por ActiveX (vla-put-Lineweight /
;; vla-put-Linetype) y NO por el comando "-LAYER LWeight 0.00 *",
;; porque ese comando espera el valor con el separador decimal de
;; la configuracion regional de Windows/AutoCAD (en equipos en
;; espanol muchas veces es "0,00" con COMA, no con punto). Si se
;; envia "0.00" con punto en un equipo configurado con coma, el
;; comando queda esperando una respuesta valida, el resto de la
;; cadena de argumentos se desincroniza, y eso puede abortar el
;; comando completo -- por lo que TODOS los pasos posteriores
;; (incluida la normalizacion de nombres) nunca llegan a ejecutarse.
;; El valor entero 0 en Lineweight equivale exactamente a 0.00 mm
;; (constante acLnWt000), y no depende de ningun separador decimal.
;; ------------------------------------------------------------
(defun nz:layers-lineweight-continuo ( / doc layers lyr n-ok n-err)
  (setq doc    (vla-get-ActiveDocument (vlax-get-acad-object)))
  (setq layers (vla-get-Layers doc))
  (setq n-ok 0)
  (setq n-err 0)
  (princ "\n--- Paso 9: forzando Lineweight=0.00mm y Linetype=Continuous en todas las capas ---")
  (vlax-for lyr layers
    (if (vl-catch-all-error-p (vl-catch-all-apply 'vla-put-Lineweight (list lyr 0)))
      (setq n-err (1+ n-err))
      (setq n-ok (1+ n-ok))
    )
    (vl-catch-all-apply 'vla-put-Linetype (list lyr "Continuous"))
  )
  (princ (strcat "\n  Capas actualizadas: " (itoa n-ok) ", con error: " (itoa n-err)))
  (princ)
)

;; ------------------------------------------------------------
;; AUDIT + PURGE final de seguridad.
;; ------------------------------------------------------------
(defun nz:auditar-y-purgar ( / )
  (princ "\n--- Paso 11: AUDIT y PURGE final de seguridad ---")
  (command "_.AUDIT" "_Yes")
  (command "_.-PURGE" "_All" "*" "_No")
  (command "_.-PURGE" "_All" "*" "_No")
  ;; Regapps: elimina IDs de aplicaciones registradas sin uso (xdata/metadatos)
  (vl-catch-all-apply '(lambda () (command "_.-PURGE" "_Regapps" "*" "_No")))
  (princ "\n--- AUDIT/PURGE final finalizado ---")
  (princ)
)

;; ------------------------------------------------------------
;; Ejecuta un paso de forma "protegida": si ese paso en particular
;; falla con un error de LISP, se reporta el aviso y se CONTINUA
;; con el resto del proceso, en lugar de abortar todo el comando.
;; Esto es clave para que, por ejemplo, un problema en OVERKILL
;; dentro de bloques NUNCA impida que se llegue a normalizar los
;; nombres de capas/bloques/estilos al final.
;; ------------------------------------------------------------
(defun nz:ejecutar-paso (nombre-paso fn / res)
  (setq res (vl-catch-all-apply fn nil))
  (if (vl-catch-all-error-p res)
    (princ (strcat "\n[AVISO] El paso \"" nombre-paso
                    "\" tuvo un error y se omitio (" (vl-catch-all-error-message res)
                    "). Se continua con el resto del proceso."))
  )
  (princ)
)

;; ------------------------------------------------------------
;; Comando principal
;; ------------------------------------------------------------
(defun c:NORMALIZAR ( / old-cmdecho old-error bloques-attdef)
  (setq old-cmdecho (getvar "CMDECHO"))
  (setq old-error *error*)
  (setvar "CMDECHO" 0)

  (defun *error* (msg)
    (setvar "CMDECHO" old-cmdecho)
    (setq *error* old-error)
    (if (and msg
             (/= msg "Function cancelled")
             (/= msg "quit / exit abort"))
      (princ (strcat "\nNORMALIZAR - Error: " msg))
    )
    (command "_.UNDO" "_End")
    (princ)
  )

  (command "_.UNDO" "_Begin")
  (setq *NZ-OMITIDOS* nil)

  (princ "\n--- Paso 1: activando todas las capas (ON + THAW + UNLOCK) ---")
  (nz:ejecutar-paso "Activar capas"
    '(lambda () (command "_.-LAYER" "_ON" "*" "_THAW" "*" "_UNLOCK" "*" "")))

  (nz:ejecutar-paso "Desenlazar Xrefs"                 '(lambda () (nz:desenlazar-xrefs)))
  (nz:ejecutar-paso "Gestionar layout XREF"            '(lambda () (nz:gestionar-layout-xref)))
  (nz:ejecutar-paso "Renombrar capas $ (Bind Xref)"     '(lambda () (nz:renombrar-capas)))

  (setq bloques-attdef (vl-catch-all-apply 'nz:eliminar-elementos-anotacion nil))
  (if (vl-catch-all-error-p bloques-attdef)
    (progn
      (princ (strcat "\n[AVISO] El paso \"Eliminar anotaciones/atributos\" tuvo un error y se omitio ("
                      (vl-catch-all-error-message bloques-attdef) ")."))
      (setq bloques-attdef nil)
    )
  )

  (nz:ejecutar-paso "Sincronizar atributos (ATTSYNC)"   '(lambda () (nz:sync-atributos bloques-attdef)))
  (nz:ejecutar-paso "Desagrupar todos los grupos"       '(lambda () (nz:desagrupar-todo)))
  (nz:ejecutar-paso "Explotar proxies/objetos AEC (Modelo)" '(lambda () (nz:explotar-proxies-modelo)))
  (nz:ejecutar-paso "Eliminar todos los puntos (dentro y fuera de bloques)" '(lambda () (nz:eliminar-puntos)))
  ;; Paso 7 (BEDIT) DESACTIVADO a proposito: en este AutoCAD el Editor de
  ;; Bloques no cierra de forma fiable, y al quedar abierto "atrapaba" todos
  ;; los pasos siguientes (por eso fallaban PLINETYPE/JOIN, OVERKILL, CHPROP y
  ;; SETBYLAYER con "Invalid selection"). Las propiedades dentro de bloques se
  ;; siguen aplicando por COM en el Paso 8e (que si funciona).
  ;; (nz:ejecutar-paso "Overkill dentro de bloques" '(lambda () (nz:overkill-en-bloques)))
  (nz:ejecutar-paso "Convertir a polilineas y unir (Modelo)" '(lambda () (nz:convertir-modelo)))
  (nz:ejecutar-paso "Convertir lineas a polilinea dentro de bloques" '(lambda () (nz:convertir-lineas-bloques)))
  (nz:ejecutar-paso "Limpieza general (Overkill/Chprop/Setbylayer/Purge)"
                    '(lambda () (nz:limpiar-dibujo)))
  (nz:ejecutar-paso "Ltscale/Thickness/ByLayer dentro de bloques (COM)"
                    '(lambda () (nz:props-bloques)))
  (nz:ejecutar-paso "Lineweight/Linetype de capas"      '(lambda () (nz:layers-lineweight-continuo)))
  (nz:ejecutar-paso "Normalizacion de nombres (capas/bloques/estilos)"
                    '(lambda () (nz:normalizar-todo)))
  (nz:ejecutar-paso "Audit + Purge final"               '(lambda () (nz:auditar-y-purgar)))

  (command "_.UNDO" "_End")

  (setvar "CMDECHO" old-cmdecho)
  (setq *error* old-error)

  ;; ---- Reporte final: lo que NO se pudo tratar ----
  (princ "\n------------------------------------------------------------------")
  (if *NZ-OMITIDOS*
    (progn
      (princ (strcat "\n ELEMENTOS / BLOQUES NO TRATADOS (" (itoa (length *NZ-OMITIDOS*)) "):"))
      (foreach om (reverse *NZ-OMITIDOS*) (princ (strcat "\n   - " om)))
    )
    (princ "\n No quedaron elementos sin tratar.")
  )
  (princ "\n------------------------------------------------------------------")

  (princ "\n=== NORMALIZAR completado ===")
  (princ)
)

(princ "\nNORMALIZAR.LSP cargado. Escriba NORMALIZAR para ejecutar.")
(princ)
