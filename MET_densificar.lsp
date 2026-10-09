;---------------------------------------------------------------
; COMANDO     : DENSIFICAR
; AUTOR       : Arley Zarate
; REVISION    : 1.0
; FECHA       : 20-05-2026
;
; DESCRIPCIÓN :
; Este comando permite densificar una polilínea (LWPOLYLINE),
; generando nuevos vértices a una distancia constante definida
; por el usuario a lo largo de toda su longitud.
;
; FUNCIONAMIENTO :
; 1. El usuario selecciona una polilínea.
; 2. Define un punto de inicio sobre la misma.
; 3. Ingresa la distancia entre vértices.
; 4. El programa reconstruye la polilínea con nodos equidistantes.
;
; APLICACIÓN :
; - Modelado de tuberías
; - Topografía
; - Civil 3D (preprocesamiento)
; - Control de discretización geométrica
;
; NOTAS :
; - Solo aplica a LWPOLYLINE.
; - La polilínea original es eliminada y reemplazada.
; - No modifica elevaciones Z ni propiedades avanzadas.
;---------------------------------------------------------------

(defun c:DENSIFICAR ( / ent obj dist ptStart paramStart len d pt newPts)

  (vl-load-com)

  (prompt "\n[DENSIFICAR] Seleccione una polilínea: ")
  (setq ent (car (entsel)))

  (if (and ent (= (cdr (assoc 0 (entget ent))) "LWPOLYLINE"))
    (progn
      (setq obj (vlax-ename->vla-object ent))

      ;; Longitud total
      (setq len (vlax-curve-getDistAtParam obj (vlax-curve-getEndParam obj)))

      ;; Punto inicial
      (setq ptStart (getpoint "\nSeleccione punto inicial sobre la polilínea: "))

      ;; Parámetro en curva
      (setq paramStart 
        (vlax-curve-getParamAtPoint 
          obj 
          (vlax-curve-getClosestPointTo obj ptStart)
        )
      )

      ;; Distancia entre vértices
      (setq dist (getreal "\nIngrese distancia entre vértices: "))

      (if (> dist 0)
        (progn
          (setq d (vlax-curve-getDistAtParam obj paramStart))
          (setq newPts '())

          ;; Generación de vértices equidistantes
          (while (<= d len)
            (setq pt (vlax-curve-getPointAtDist obj d))
            (setq newPts (cons pt newPts))
            (setq d (+ d dist))
          )

          (setq newPts (reverse newPts))

          ;; Eliminar polilínea original
          (entdel ent)

          ;; Crear nueva polilínea
          (entmakex
            (append
              (list
                '(0 . "LWPOLYLINE")
                '(100 . "AcDbEntity")
                '(100 . "AcDbPolyline")
                (cons 90 (length newPts))
                '(70 . 0)
              )
              (mapcar '(lambda (p) (cons 10 p)) newPts)
            )
          )

          (prompt "\n✅ Polilínea densificada correctamente.")
        )
        (prompt "\n❌ Distancia inválida.")
      )
    )
    (prompt "\n❌ Debe seleccionar una LWPOLYLINE.")
  )

  (princ)
)