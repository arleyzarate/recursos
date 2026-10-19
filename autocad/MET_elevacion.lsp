;---------------------------------------------------------------
; COMANDO: ELEVACION
; DESCRIPCIÓN:
; Etiqueta curvas controlando distancia mínima entre textos
; para evitar superposición.
;
; FECHA: 10-06-2026
; REVISIÓN: 3 (Corrección escala + capa + estilo)
; ELABORADO POR: Arley Zarate
;---------------------------------------------------------------
(defun c:ELEVACION ( / escala insunits txtHeight ss i ent data z elevM txt
                        layerName acadObj doc mtextObj
                        length spacing dist pt ptsList minDist
                        nombreEstilo)

  (vl-load-com)

  ;; Lista de puntos usados
  (setq ptsList '())

  ;; Solicitar escala
  (setq escala (getreal "\nIngrese valor de escala de reducción: "))
  (if (not escala)
    (progn
      (prompt "\nValor inválido. Intente nuevamente.")
      (exit)
    )
  )

  ;; ✅ NOMBRE DE CAPA CORREGIDO (error fixnump solucionado)
  (setq layerName (strcat "MET-curvas_txt_" (itoa (fix escala))))

  ;; Crear capa si no existe
  (if (not (tblsearch "LAYER" layerName))
    (command "\_.-layer" "\_make" layerName "")
  )

  ;; Propiedades capa
  (command "\_.-layer" "\_color" "253" layerName "")
  (command "\_.-layer" "\_lweight" "0.13" layerName "")

  ;; ✅ CREACIÓN DE ESTILO (antes de los textos)
  (setq nombreEstilo "SER-curvas")

  (if (not (tblsearch "STYLE" nombreEstilo))
    (command "-style" nombreEstilo "romans" 0 0.8 0 "N" "N")
  )

  ;; Detectar unidades
  (setq insunits (getvar "INSUNITS"))

  ;; Validar unidades
  (cond
    ((= insunits 4) (setq txtHeight (* 2 escala)))        ;; mm
    ((= insunits 6) (setq txtHeight (* 0.002 escala)))    ;; m
    (T
     (prompt
       (strcat
         "\n¡Epa! Esa unidad sí está como rara 😄"
         "\nSolo trabaja en metros o milímetros."
         "\nRevísala y le damos otra 👍"
       )
     )
     (exit)
    )
  )

  ;; Parámetros clave
  (setq spacing (* 15 txtHeight))
  (setq minDist (* 30 txtHeight))

  ;; Función distancia mínima
  (defun tooClose (p lst)
    (if lst
      (or
        (< (distance p (car lst)) minDist)
        (tooClose p (cdr lst))
      )
      nil
    )
  )

  ;; Selección
  (prompt "\nSeleccione las polilíneas: ")
  (setq ss (ssget '((0 . "LWPOLYLINE,POLYLINE"))))

  (if ss
    (progn
      (setq acadObj (vlax-get-acad-object))
      (setq doc (vla-get-ActiveDocument acadObj))
      (setq i 0)

      (while (< i (sslength ss))
        (setq ent (ssname ss i))
        (setq data (entget ent))

        ;; Elevación
        (setq z (if (assoc 38 data) (cdr (assoc 38 data)) 0.0))
        (setq elevM (if (= insunits 4) (* z 0.001) z))

        ;; Formato texto con prefijo TN:
	(setq txt (rtos elevM 2 3))
	(setq txt (vl-string-subst "," "." txt))
	(setq txt (strcat "TN: " txt))

        ;; Longitud curva
        (setq length (vlax-curve-getDistAtParam ent (vlax-curve-getEndParam ent)))

        ;; Recorrido
        (setq dist (/ spacing 2.0))

        (while (< dist length)
          (setq pt (vlax-curve-getPointAtDist ent dist))

          ;; Validación de proximidad
          (if (not (tooClose pt ptsList))
            (progn
              ;; Crear texto
              (setq mtextObj
                (vla-AddMText
                  (vla-get-ModelSpace doc)
                  (vlax-3d-point pt)
                  0
                  txt
                )
              )

              ;; Propiedades
              (vla-put-Layer mtextObj layerName)
              (vla-put-Height mtextObj txtHeight)
              (vla-put-AttachmentPoint mtextObj acAttachmentPointMiddleCenter)
              (vla-put-BackgroundFill mtextObj :vlax-true)

              ;; ✅ APLICAR ESTILO
              (vla-put-StyleName mtextObj nombreEstilo)

              ;; Guardar punto
              (setq ptsList (cons pt ptsList))
            )
          )

          (setq dist (+ dist spacing))
        )

        (setq i (1+ i))
      )
    )
    (prompt "\nNo se seleccionaron polilíneas.")
  )

  (princ)
)