;;==========================================================================
;; COMANDO: PERFIL
;;==========================================================================
;; DESCRIPCION:
;;   Genera un perfil longitudinal (polilinea 2D) a partir de una 3DPOLY
;;   existente, conservando la longitud REAL de la 3DPOLY.
;;
;;   El eje X del perfil representa la distancia recorrida (acumulada en 3D)
;;   y el eje Y representa la elevacion (Z) de cada punto de la 3DPOLY.
;;
;;   El comando calcula un factor de escala (k) mediante biseccion, de modo
;;   que la longitud 2D de la polilinea resultante coincida exactamente
;;   con la longitud 3D real de la 3DPOLY seleccionada (segun reporta
;;   AutoCAD en el panel de Propiedades).
;;
;; USO:
;;   1. Ejecutar el comando PERFIL.
;;   2. Seleccionar la 3DPOLY de la cual se desea generar el perfil.
;;   3. Indicar el punto de inserccion donde se dibujara la polilinea
;;      del perfil (esquina inferior izquierda del perfil).
;;   4. El comando crea automaticamente una polilinea 2D (LWPOLYLINE)
;;      y reporta en linea de comandos:
;;         - Longitud 3D real de la 3DPOLY
;;         - Factor de escala en X aplicado
;;         - Longitud 2D real de la polilinea creada (debe coincidir
;;           con la longitud 3D de la 3DPOLY)
;;
;; REQUISITOS:
;;   - AutoCAD 2024 (compatible con versiones que soporten ActiveX/VLA).
;;   - La entidad seleccionada debe ser una 3DPOLY (POLYLINE 3D).
;;
;; FECHA DE CREACION : 12/junio/2026
;; ELABORADO POR     : Arley Zarate 
;; REVISION          : Rev. 1
;;==========================================================================

(defun c:PERFIL ( / ent obj insPt nDiv param1 param2 paramStep i
                    pt param dist3D pts plLen dx dy iter
                    k kLo kHi longitudTotal
                    doc space ptArray vlaPline)
  (vl-load-com)

  ;; ---- Seleccionar 3DPOLY ----
  (setq ent nil)
  (while (not ent)
    (setq ent (car (entsel "\nSeleccione 3DPOLY: ")))
    (if (not ent) (prompt "\nNo se seleccionó ninguna entidad. Intente de nuevo."))
  )
  (setq obj (vlax-ename->vla-object ent))

  ;; ---- Solicitar punto de inserción (obligatorio) ----
  (setq insPt nil)
  (while (not insPt)
    (initget 1)
    (setq insPt (getpoint "\nIndique el punto de inserción de la polilínea (perfil): "))
  )

  (setq param1 (vlax-curve-getStartParam obj))
  (setq param2 (vlax-curve-getEndParam obj))
  (setq longitudTotal (vlax-curve-getDistAtParam obj param2))

  (setq nDiv 500)
  (setq paramStep (/ (- param2 param1) (float nDiv)))

  ;; Muestreo: lista de (dist3D . Z)
  (setq pts '())
  (setq i 0)
  (repeat (1+ nDiv)
    (setq param (+ param1 (* paramStep i)))
    (if (> param param2) (setq param param2))
    (setq pt     (vlax-curve-getPointAtParam obj param))
    (setq dist3D (vlax-curve-getDistAtParam obj param))
    (setq pts (append pts (list (cons dist3D (caddr pt)))))
    (setq i (1+ i))
  )

  ;; Función auxiliar: longitud 2D con factor k aplicado a X
  (defun plLenWithK (k / dx dy total i)
    (setq total 0.0)
    (setq i 1)
    (repeat (1- (length pts))
      (setq dx (* k (- (car (nth i pts)) (car (nth (1- i) pts)))))
      (setq dy (- (cdr (nth i pts)) (cdr (nth (1- i) pts))))
      (setq total (+ total (sqrt (+ (* dx dx) (* dy dy)))))
      (setq i (1+ i))
    )
    total
  )

  ;; Biseccion para encontrar k tal que plLenWithK(k) = longitudTotal
  (setq kLo 0.0)
  (setq kHi 1.0)
  (while (< (plLenWithK kHi) longitudTotal)
    (setq kHi (* kHi 2.0))
  )
  (setq iter 0)
  (repeat 60
    (setq k (/ (+ kLo kHi) 2.0))
    (setq plLen (plLenWithK k))
    (if (< plLen longitudTotal)
      (setq kLo k)
      (setq kHi k)
    )
    (setq iter (1+ iter))
  )
  (setq k (/ (+ kLo kHi) 2.0))

  ;; Crear safearray de coordenadas X,Y planas
  (setq ptArray
    (vlax-make-safearray vlax-vbDouble
      (cons 0 (1- (* 2 (length pts))))
    )
  )
  (setq i 0)
  (foreach par pts
    (vlax-safearray-put-element ptArray i      (+ (car insPt) (* k (car par))))
    (vlax-safearray-put-element ptArray (1+ i) (+ (cadr insPt) (cdr par)))
    (setq i (+ i 2))
  )

  ;; Crear polilínea ligera vía ActiveX
  (setq doc   (vla-get-ActiveDocument (vlax-get-acad-object)))
  (setq space (vla-get-ModelSpace doc))
  (setq vlaPline (vla-AddLightWeightPolyline space ptArray))

  (prompt
    (strcat
      "\n✅ Longitud 3D real de la 3DPOLY: " (rtos longitudTotal 2 3)
      "\n✅ Factor de escala X aplicado: " (rtos k 2 8)
      "\n✅ Longitud 2D real de la PLINE creada: "
      (rtos (vla-get-Length vlaPline) 2 3)
    )
  )
  (princ)
)

(princ "\nComando PERFIL cargado. Escriba PERFIL para ejecutar.")
(princ)