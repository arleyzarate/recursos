; ============================================================
; COMANDO: CAPAPREFIJO
;
; DESCRIPCIÓN:
; Herramienta desarrollada para AutoCAD 2024 y versiones
; superiores que permite administrar prefijos en los nombres
; de las capas del dibujo.
;
; El comando incluye las siguientes opciones:
;
; SELECCIÓN:
; Permite seleccionar objetos del dibujo y agregar un prefijo
; a las capas correspondientes.
;
; BÚSQUEDA:
; Permite localizar capas mediante un texto contenido en su
; nombre y agregar un prefijo a todas las capas encontradas.
;
; TODO:
; Agrega el prefijo indicado a todas las capas válidas del
; dibujo.
;
; ELIMINAR:
; Permite seleccionar objetos y retirar de sus capas un
; prefijo previamente asignado.
;
; El prefijo se agrega al inicio del nombre de la capa y se
; separa mediante el carácter "_".
;
; Ejemplo:
; TUBERIA -> CIV_TUBERIA
;
; Las capas modificadas reciben automáticamente un color ACI
; para facilitar su identificación visual.
;
; El programa evita duplicar prefijos, omite capas especiales
; y dependientes de referencias externas, y controla posibles
; conflictos por nombres de capa existentes.
;
; FECHA: 30/septiembre/2026
; DISEÑADOR: Arley Zarate
; ============================================================

(vl-load-com)

(defun cp:trim-prefix (txt)
  (vl-string-trim " _" txt)
)

(defun cp:auto-color (/ colors idx)
  ; Paleta ACI visible. Se evita 7 por su comportamiento blanco/negro.
  (setq colors '(1 2 3 4 5 6 10 30 40 90 130 140 170 200 210 220))
  (setq idx (rem (abs (getvar "MILLISECS")) (length colors)))
  (nth idx colors)
)

(defun cp:unique-add (name lst / upper)
  (setq upper (strcase name))
  (if
    (vl-some
      '(lambda (x) (= (strcase x) upper))
      lst
    )
    lst
    (cons name lst)
  )
)

(defun cp:selection-layer-names (ss / i ent lay result)
  (setq result '())
  (if ss
    (progn
      (setq i 0)
      (repeat (sslength ss)
        (setq ent (ssname ss i))
        (setq lay (cdr (assoc 8 (entget ent))))
        (if lay
          (setq result (cp:unique-add lay result))
        )
        (setq i (1+ i))
      )
    )
  )
  (reverse result)
)

(defun cp:search-layer-names (doc text / result needle lay name)
  (setq result '())
  (setq needle (strcase text))
  (vlax-for lay (vla-get-Layers doc)
    (setq name (vla-get-Name lay))
    (if (vl-string-search needle (strcase name))
      (setq result (cons name result))
    )
  )
  (reverse result)
)


(defun cp:all-layer-names (doc / result lay name)
  (setq result '())
  (vlax-for lay (vla-get-Layers doc)
    (setq name (vla-get-Name lay))
    (setq result (cons name result))
  )
  (reverse result)
)

(defun cp:special-layer-p (name / u)
  (setq u (strcase name))
  (or
    (= u "0")
    (= u "DEFPOINTS")
    (vl-string-search "|" name)
  )
)

(defun cp:already-prefixed-p (name prefix / marker upper-name upper-marker)
  (setq marker (strcat prefix "_"))
  (setq upper-name (strcase name))
  (setq upper-marker (strcase marker))
  (and
    (>= (strlen upper-name) (strlen upper-marker))
    (= (substr upper-name 1 (strlen upper-marker)) upper-marker)
  )
)

(defun cp:layer-exists-p (name)
  (if (tblsearch "LAYER" name) T nil)
)

(defun cp:modify-layer (doc old-name prefix color / new-name layer result)
  (cond
    ((cp:special-layer-p old-name)
      'special
    )

    ((cp:already-prefixed-p old-name prefix)
      'prefixed
    )

    (T
      (setq new-name (strcat prefix "_" old-name))

      (cond
        ((> (strlen new-name) 255)
          'toolong
        )

        ((cp:layer-exists-p new-name)
          'exists
        )

        (T
          (setq layer
            (vl-catch-all-apply
              'vla-Item
              (list (vla-get-Layers doc) old-name)
            )
          )

          (if (vl-catch-all-error-p layer)
            'error
            (progn
              (setq result
                (vl-catch-all-apply
                  'vla-put-Name
                  (list layer new-name)
                )
              )

              (if (vl-catch-all-error-p result)
                'error
                (progn
                  ; Cambio de color de la capa ya renombrada.
                  (vl-catch-all-apply
                    'vla-put-Color
                    (list layer color)
                  )
                  'ok
                )
              )
            )
          )
        )
      )
    )
  )
)


(defun cp:remove-prefix-layer (doc old-name prefix / marker new-name layer result)
  (setq marker (strcat prefix "_"))

  (cond
    ((cp:special-layer-p old-name)
      'special
    )

    ((not (cp:already-prefixed-p old-name prefix))
      'noprefix
    )

    (T
      (setq new-name
        (substr old-name (1+ (strlen marker)))
      )

      (cond
        ((= new-name "")
          'empty
        )

        ((cp:layer-exists-p new-name)
          'exists
        )

        (T
          (setq layer
            (vl-catch-all-apply
              'vla-Item
              (list (vla-get-Layers doc) old-name)
            )
          )

          (if (vl-catch-all-error-p layer)
            'error
            (progn
              (setq result
                (vl-catch-all-apply
                  'vla-put-Name
                  (list layer new-name)
                )
              )

              (if (vl-catch-all-error-p result)
                'error
                'ok
              )
            )
          )
        )
      )
    )
  )
)

(defun cp:remove-prefix-from-layers (doc names prefix / ok skipped status name)
  (setq ok 0)
  (setq skipped 0)

  (foreach name names
    (setq status (cp:remove-prefix-layer doc name prefix))

    (cond
      ((= status 'ok)
        (setq ok (1+ ok))
      )

      ((= status 'special)
        (setq skipped (1+ skipped))
        (prompt
          (strcat
            "\nOmitida capa especial o dependiente de XREF: "
            name
          )
        )
      )

      ((= status 'noprefix)
        (setq skipped (1+ skipped))
        (prompt
          (strcat
            "\nOmitida porque no inicia con "
            prefix
            "_: "
            name
          )
        )
      )

      ((= status 'exists)
        (setq skipped (1+ skipped))
        (prompt
          (strcat
            "\nOmitida porque ya existe la capa destino sin prefijo: "
            (substr name (+ 2 (strlen prefix)))
          )
        )
      )

      ((= status 'empty)
        (setq skipped (1+ skipped))
        (prompt
          (strcat
            "\nOmitida porque el nombre quedaria vacio: "
            name
          )
        )
      )

      (T
        (setq skipped (1+ skipped))
        (prompt
          (strcat
            "\nNo fue posible eliminar el prefijo de la capa: "
            name
          )
        )
      )
    )
  )

  (list ok skipped)
)

(defun cp:process-layers (doc names prefix color / ok skipped status name)
  (setq ok 0)
  (setq skipped 0)

  (foreach name names
    (setq status (cp:modify-layer doc name prefix color))

    (cond
      ((= status 'ok)
        (setq ok (1+ ok))
      )

      ((= status 'special)
        (setq skipped (1+ skipped))
        (prompt
          (strcat
            "\nOmitida capa especial o dependiente de XREF: "
            name
          )
        )
      )

      ((= status 'prefixed)
        (setq skipped (1+ skipped))
        (prompt
          (strcat
            "\nOmitida porque ya tiene el prefijo: "
            name
          )
        )
      )

      ((= status 'exists)
        (setq skipped (1+ skipped))
        (prompt
          (strcat
            "\nOmitida porque ya existe la capa destino: "
            prefix "_" name
          )
        )
      )

      ((= status 'toolong)
        (setq skipped (1+ skipped))
        (prompt
          (strcat
            "\nOmitida porque el nuevo nombre supera 255 caracteres: "
            name
          )
        )
      )

      (T
        (setq skipped (1+ skipped))
        (prompt
          (strcat
            "\nNo fue posible modificar la capa: "
            name
          )
        )
      )
    )
  )

  (list ok skipped)
)

(defun c:CAPAPREFIJO
  (/ *error* acad doc option prefix search-text ss names color result undo-open)

  (vl-load-com)

  (setq acad (vlax-get-acad-object))
  (setq doc (vla-get-ActiveDocument acad))
  (setq undo-open nil)

  (defun *error* (msg)
    (if undo-open
      (progn
        (vl-catch-all-apply 'vla-EndUndoMark (list doc))
        (setq undo-open nil)
      )
    )

    (if
      (and
        msg
        (/= msg "Function cancelled")
        (/= msg "quit / exit abort")
      )
      (prompt (strcat "\nError: " msg))
    )
    (princ)
  )

  (prompt "\n----------------------------------------")
  (prompt "\nCAPAPREFIJO")
  (prompt "\nAgrega o elimina prefijos en capas.")
  (prompt "\n----------------------------------------")

  (initget "Seleccion Busqueda Todo Eliminar")
  (setq option
    (getkword
      "\nMetodo [Seleccion/Busqueda/Todo/Eliminar] <Seleccion>: "
    )
  )

  (if (null option)
    (setq option "Seleccion")
  )

  (cond
    ;; ------------------------------------------------------------
    ;; ELIMINAR PREFIJO
    ;; ------------------------------------------------------------
    ((= option "Eliminar")
      (setq prefix
        (cp:trim-prefix
          (getstring T "\nIngrese el prefijo que desea eliminar: ")
        )
      )

      (if (= prefix "")
        (prompt "\nOperacion cancelada: el prefijo esta vacio.")
        (progn
          (prompt
            "\nSeleccione objetos de las capas a las que desea quitar el prefijo: "
          )
          (setq ss (ssget))

          (if (null ss)
            (prompt "\nNo se seleccionaron objetos.")
            (progn
              (setq names (cp:selection-layer-names ss))

              (vla-StartUndoMark doc)
              (setq undo-open T)

              (setq result
                (cp:remove-prefix-from-layers
                  doc
                  names
                  prefix
                )
              )

              (vla-EndUndoMark doc)
              (setq undo-open nil)

              (prompt
                (strcat
                  "\nProceso terminado."
                  "\nCapas modificadas: "
                  (itoa (car result))
                  "."
                  "\nCapas omitidas: "
                  (itoa (cadr result))
                  "."
                )
              )
            )
          )
        )
      )
    )

    ;; ------------------------------------------------------------
    ;; AGREGAR PREFIJO
    ;; ------------------------------------------------------------
    (T
      (setq prefix
        (cp:trim-prefix
          (getstring T "\nIngrese el prefijo: ")
        )
      )

      (if (= prefix "")
        (prompt "\nOperacion cancelada: el prefijo esta vacio.")
        (progn
          (setq names '())

          (cond
            ((= option "Seleccion")
              (prompt
                "\nSeleccione los objetos cuyas capas desea modificar: "
              )
              (setq ss (ssget))

              (if ss
                (setq names (cp:selection-layer-names ss))
              )
            )

            ((= option "Busqueda")
              (setq search-text
                (vl-string-trim
                  " "
                  (getstring T "\nTexto a buscar en el nombre de capa: ")
                )
              )

              (if (/= search-text "")
                (setq names
                  (cp:search-layer-names doc search-text)
                )
              )
            )

            ((= option "Todo")
              (setq names
                (cp:all-layer-names doc)
              )
            )
          )

          (if (null names)
            (prompt "\nNo se encontraron capas para modificar.")
            (progn
              (setq color (cp:auto-color))

              (vla-StartUndoMark doc)
              (setq undo-open T)

              (setq result
                (cp:process-layers
                  doc
                  names
                  prefix
                  color
                )
              )

              (vla-EndUndoMark doc)
              (setq undo-open nil)

              (prompt
                (strcat
                  "\nProceso terminado."
                  "\nCapas modificadas: "
                  (itoa (car result))
                  "."
                  "\nCapas omitidas: "
                  (itoa (cadr result))
                  "."
                  "\nColor ACI asignado: "
                  (itoa color)
                  "."
                )
              )
            )
          )
        )
      )
    )
  )

  (princ)
)

(princ "\nCAPAPREFIJO cargado. Escriba CAPAPREFIJO para iniciar.")
(princ)
