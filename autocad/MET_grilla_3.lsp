;;-----------------------------------------------------------------------------------------------
;; Programa que crea una malla de coordenadas (norte, este) alrededor de la
;; polilínea ingresada.
;;
;; Ajuste (revision 3):
;; - Solicita escala 1:n (solo el denominador n)
;; - Calcula automáticamente:
;;     Distancia malla real  = 0.1   * n   (en metros)
;;     Altura texto real     = 0.002 * n   (en metros)
;; - Convierte esos valores a las UNIDADES del dibujo usando INSUNITS:
;;     mallagap   = (0.1   * n) * (unidades_por_metro)
;;     textheigth = (0.002 * n) * (unidades_por_metro)
;;
;; Compatibilidad:
;; - Dibujo en METROS (INSUNITS=6): unidades_por_metro = 1
;; - Dibujo en MILÍMETROS (INSUNITS=4): unidades_por_metro = 1000
;; - Dibujo en CENTÍMETROS (INSUNITS=5): unidades_por_metro = 100
;; - Dibujo en KILÓMETROS (INSUNITS=7): unidades_por_metro = 0.001
;;
;; Elabora: Arley Zarate
;; Revision: 3.1
;; Fecha: 19/05/2026
;;-----------------------------------------------------------------------------------------------

(defun grilla ( /
		  mallalayer mallacolor mallagap
		  textvalue textheigth textcolor textangle textoblique textstyle
		  ptos pto pto1 pto2 ss n i iptos ptoA ptoB
		  xmin xmax ymin ymax x1 y1
                  k oldosmode
                  escalaN insunits uPerM)

  ;; Capa MET-OFF (si no existe)
  (if (not (tblsearch "layer" "MET-OFF"))
    (entmake (list
      '(0 . "LAYER")
      '(100 . "AcDbSymbolTableRecord")
      '(100 . "AcDbLayerTableRecord")
      (cons 2 "MET-OFF")
      '(70 . 0)
      (cons 62 5)
    ))
  )

  ;------------------------------------------
  ; Funciones auxiliares
  ;------------------------------------------

  (defun creaLine (linePto1 linePto2 lineLayer lineColor / )
    (if (not (tblsearch "layer" lineLayer))
      (entmake (list
	         '(0 . "LAYER")
	         '(100 . "AcDbSymbolTableRecord")
	         '(100 . "AcDbLayerTableRecord")
	         (cons 2 lineLayer)
	         '(70 . 0)
	         (cons 62 lineColor)
	         '(6 . "CONTINUOUS")
      ))
    )
    (entmake (list
	       '(0 . "LINE")
	       '(100 . "AcDbEntity")
	       '(67 . 0)
	       (cons 8 lineLayer)
	       (cons 62 lineColor)
	       '(100 . "AcDbLine")
	       (list 10 (car linePto1) (cadr linePto1) 0.0)
	       (list 11 (car linePto2) (cadr linePto2) 0.0)
    ))
    (entlast)
  )

  (defun creaPoly (polyPtos polyLayer polyColor / p ed)
    (if (not (tblsearch "layer" polyLayer))
      (entmake (list
	         '(0 . "LAYER")
	         '(100 . "AcDbSymbolTableRecord")
	         '(100 . "AcDbLayerTableRecord")
	         (cons 2 polyLayer)
	         '(70 . 0)
	         (cons 62 polyColor)
	         '(6 . "CONTINUOUS")
      ))
    )
    (setq ed nil)
    (foreach p polyPtos
      (setq ed (cons (list 10 (car p) (cadr p)) ed))
    )
    (setq ed (reverse ed))
    (setq ed (cons (cons 90 (length polyPtos)) ed))
    (setq ed (cons '(100 . "AcDbPolyline") ed))
    (setq ed (cons (cons 62 polyColor) ed))
    (setq ed (cons (cons 8 polyLayer) ed))
    (setq ed (cons '(100 . "AcDbEntity") ed))
    (setq ed (cons '(0 . "LWPOLYLINE") ed))
    (entmake ed)
    (entlast)
  )

  (defun creaText (txtValue txtPto txtLayer txtColor txtHeight txtStyle txtAngle txtOblique
		           txtHPos txtVPos / )
    (if (not (tblsearch "layer" txtLayer))
      (entmake (list
	         '(0 . "LAYER")
	         '(100 . "AcDbSymbolTableRecord")
	         '(100 . "AcDbLayerTableRecord")
	         (cons 2 txtLayer)
	         '(70 . 0)
	         (cons 62 txtColor)
	         '(6 . "CONTINUOUS")
      ))
    )
    (if (not (tblsearch "style" txtStyle))
      (entmake (list
	         '(0 . "STYLE")
	         '(100 . "AcDbSymbolTableRecord")
	         '(100 . "AcDbTextStyleTableRecord")
	         (cons 2 txtStyle)
	         '(70 . 0)
	         (cons 40 txtHeight)
	         '(41 . 0.9)
	         '(50 . 0.0)
	         '(71 . 0)
	         '(42 . 0.0)
	         '(3 . "romans")
	         '(4 . "")
      ))
    )
    (entmake (list
	       '(0 . "TEXT")
	       '(100 . "AcDbEntity")
	       '(67 . 0)
	       (cons 8 txtLayer)
	       (cons 62 txtColor)
	       '(100 . "AcDbText")
	       (list 10 (car txtPto) (cadr txtPto) 0.0)
	       (list 11 (car txtPto) (cadr txtPto) 0.0)
	       (cons 40 txtHeight)
	       '(41 . 0.9)
	       (cons 50 txtAngle)
	       (cons 51 txtOblique)
	       (cons 1 txtValue)
	       (cons 7 txtStyle)
	       '(71 . 0)
	       (cons 72 txtHPos)
	       (cons 73 txtVPos)
    ))
    (entlast)
  )

  (defun iplpl (ptosA ptosB / iptos iA iB nA nB ptoA1 ptoA2 ptoB1 ptoB2 pto kA kB)
    (setq iptos nil)
    (setq iA 1)
    (setq nA (length ptosA))
    (setq nB (length ptosB))
    (setq ptoA1 (nth 0 ptosA))
    (while (< iA nA)
      (setq ptoA2 (nth iA ptosA))
      (setq ptoB1 (nth 0 ptosB))
      (setq iB 1)
      (while (< iB nB)
        (setq ptoB2 (nth iB ptosB))
        (setq pto (inters ptoA1 ptoA2 ptoB1 ptoB2 t))
        (if pto
	  (progn
	    (cond
	      ((= pto ptoA1) (setq kA (list (1- iA) (1- iA))))
	      ((= pto ptoA2) (setq kA (list iA iA)))
	      (t            (setq kA (list (1- iA) iA)))
	    )
	    (cond
	      ((= pto ptoB1) (setq kB (list (1- iB) (1- iB))))
	      ((= pto ptoB2) (setq kB (list iB iB)))
	      (t            (setq kB (list (1- iB) iB)))
	    )
	    (setq iptos (cons (list pto (car kA) (cadr kA) (car kB) (cadr kB)) iptos))
	  )
        )
        (setq iB (1+ iB))
        (setq ptoB1 ptoB2)
      )
      (setq iA (1+ iA))
      (setq ptoA1 ptoA2)
    )
    (reverse iptos)
  )

  (defun num2coords (numero ncifras / millones millares unidades decimales n)
    (setq numero (abs numero))

    ;; Si excede 9,999,999 se divide entre 1000
    (if (> numero 9999999)
      (setq numero (/ numero 1000.0))
    )

    (setq decimales (fix (* 1000.0 (- numero (fix numero)))))
    (setq numero (fix numero))
    (setq millones (fix (/ numero 1000000)))
    (setq millares (fix (/ (- numero (* 1000000 millones)) 1000)))
    (setq unidades (fix (- numero (* 1000000 millones) (* 1000 millares))))
    (setq numero nil)

    (if (/= millones 0)
      (setq numero (strcat (rtos millones 2 0) ""))
    )

    (if (/= millares 0)
      (progn
        (setq millares (rtos millares 2 0))
        (if numero
	  (progn
	    (setq millares (strcat "00" millares))
	    (setq millares (substr millares (- (strlen millares) 2) 3))
            (setq numero (strcat numero millares ""))
	  )
          (setq numero (strcat millares ""))
        )
      )
      (if numero
        (setq numero (strcat numero "000 "))
        (setq numero "0")
      )
    )

    (if (/= unidades 0)
      (progn
        (setq unidades (rtos unidades 2 0))
        (if numero
	  (progn
	    (setq unidades (strcat "00" unidades))
	    (setq unidades (substr unidades (- (strlen unidades) 2) 3))
            (setq numero (strcat numero unidades))
	  )
	  (setq numero unidades)
        )
      )
      (if numero
        (setq numero (strcat numero "000"))
        (setq numero "0")
      )
    )

    (if (not (equal decimales 0.0 0.0001))
      (strcat numero "." (rtos decimales 2 0))
    )

    (setq n (strlen numero))
    (while (> ncifras n)
      (setq numero (strcat " " numero))
      (setq n (1+ n))
    )
    numero
  )

  ;------------------------------------------
  ; Parámetros generales
  ;------------------------------------------
  (setq mallalayer "MET-COORDENADAS")
  (setq mallacolor 252)
  (setq textcolor 252)
  (setq textoblique 0.0)
  (setq textstyle "MET-COORDENADAS")

  ;------------------------------------------
  ; Captura del polígono (área a enmallar)
  ;------------------------------------------
  (setq ptos nil)
  (setq pto1 nil)
  (setq ss (ssadd))
  (setq k (getvar "osmode"))
  (setvar "osmode" 252)

  (setq pto2 (getpoint "\nEncierre el área donde desea poner la malla..."))
  (command "CHPROP" "L" "" "LA" "MET-OFF" "")

  (while pto2
    (if pto1
      (setq ss (ssadd (crealine pto1 pto2 mallalayer 252) ss))
    )
    (setvar "osmode" 252)
    (setq ptos (cons pto2 ptos))
    (setq pto1 pto2)
    (setq pto2 (getpoint pto1 "\nEncierre el área donde desea poner la malla..."))
    (setvar "osmode" k)
  )

  ; Borra líneas temporales del límite
  (setq n (1- (sslength ss)))
  (while (>= n 0)
    (entdel (ssname ss n))
    (setq n (1- n))
  )

  ; Cierra la polilínea
  (setq ptos (cons (last ptos) ptos))
  (setq ptos (reverse ptos))

  ; Crea polilínea límite
  (if (> (length ptos) 3)
    (creapoly ptos mallalayer 252)
  )

  ;------------------------------------------
  ; Si hay área por enmallar, procede
  ;------------------------------------------
  (if (and ptos (> (length ptos) 3))
    (progn
      ; Calcula coordenadas mínimas y máximas
      (setq xmin 99999999999.0)
      (setq xmax -99999999999.0)
      (setq ymin 99999999999.0)
      (setq ymax -99999999999.0)

      (foreach pto ptos
        (cond
          ((< (car pto) xmin) (setq xmin (car pto)))
          ((> (car pto) xmax) (setq xmax (car pto)))
        )
        (cond
          ((< (cadr pto) ymin) (setq ymin (cadr pto)))
          ((> (cadr pto) ymax) (setq ymax (cadr pto)))
        )
      )

      ;-----------------------------------------------------------------------
      ; PUNTO 4 (AJUSTADO + INSUNITS):
      ; Pide escala 1:n y calcula mallagap y textheigth según Excel.
      ; Luego convierte a unidades del dibujo con INSUNITS.
      ;-----------------------------------------------------------------------

      ;; Lee INSUNITS y define cuántas unidades del dibujo hay en 1 metro
      (setq insunits (getvar "INSUNITS"))
      (setq uPerM
        (cond
          ((= insunits 4) 1000.0)  ; milímetros
          ((= insunits 5) 100.0)   ; centímetros
          ((= insunits 6) 1.0)     ; metros
          ((= insunits 7) 0.001)   ; kilómetros
          (t 1.0)                  ; desconocido: asume 1 (metros)
        )
      )

      (setq escalaN (getint "\nIngrese la escala de trabajo (denominador n para 1:n) <100>: "))
      (if (or (not escalaN) (<= escalaN 0))
        (setq escalaN 100)
      )

      ;; Fórmulas base en METROS (real)
      ;; Distancia malla real (m) = 0.1 * n
      ;; Altura texto real (m)    = 0.002 * n
      ;; Convertidas a unidades del dibujo:
      (setq mallagap (* (* 0.1 escalaN) uPerM))
      (setq textheigth (* (* 0.002 escalaN) uPerM))

      (prompt
        (strcat
          "\nINSUNITS="
          (itoa insunits)
          " | Escala 1:"
          (itoa escalaN)
          " | Distancia malla="
          (rtos mallagap 2 3)
          " (unid dibujo)"
          " | Altura texto="
          (rtos textheigth 2 3)
          " (unid dibujo)"
        )
      )

      ; Calcula límites reales de la malla (ajustados a múltiplos de mallagap)
      (setq xmin (* mallagap (1- (fix (/ xmin mallagap)))))
      (setq xmax (* mallagap (1+ (fix (/ xmax mallagap)))))
      (setq ymin (* mallagap (1- (fix (/ ymin mallagap)))))
      (setq ymax (* mallagap (1+ (fix (/ ymax mallagap)))))

      ;------------------------------------------
      ; Líneas verticales (Este)
      ;------------------------------------------
      (setq x1 xmin)
      (setq textangle (/ pi 2.0))

      (while (<= x1 xmax)
        (setq pto1 (list x1 ymin))
        (setq pto2 (list x1 ymax))

        (setq iptos (iplpl ptos (list pto1 pto2)))

        (if iptos
          (progn
            (setq iptos (vl-sort iptos (function (lambda (e1 e2) (< (cadr (car e1)) (cadr (car e2)))))))
            (setq n (length iptos))
            (setq ptoA (car (nth 0 iptos)))
            (setq i 1)

            (while (< i n)
              (setq ptoB (car (nth i iptos)))
              (crealine ptoA ptoB mallalayer mallacolor)
              (setq i (1+ i))
              (setq ptoA (car (nth i iptos)))
              (setq i (1+ i))
            )

            ; Texto coordenada ESTE
            (if (> n 1)
              (progn
                (setq pto (car (last iptos)))
                (setq textvalue (strcat (num2coords (car pto) 10) " m.E.  "))
                (setq pto (list (- (car pto) textheigth) (cadr pto)))
                (creatext textvalue pto mallalayer textcolor textheigth textstyle textangle textoblique 2 2)

                (setq pto (car (car iptos)))
                (setq textvalue (strcat (num2coords (car pto) 10) " m.E.  "))
                (setq pto (list (- (car pto) textheigth) (cadr pto)))
                (creatext textvalue pto mallalayer textcolor textheigth textstyle (/ (* pi 270.0) 180.0) textoblique 2 2)
              )
            )
          )
        )
        (setq x1 (+ x1 mallagap))
      )

      ;------------------------------------------
      ; Líneas horizontales (Norte)
      ;------------------------------------------
      (setq y1 ymin)

      (while (<= y1 ymax)
        (setq pto1 (list xmin y1))
        (setq pto2 (list xmax y1))

        (setq iptos (iplpl ptos (list pto1 pto2)))

        (if iptos
          (progn
            (setq iptos (vl-sort iptos (function (lambda (e1 e2) (< (car (car e1)) (car (car e2)))))))
            (setq n (length iptos))
            (setq ptoA (car (nth 0 iptos)))
            (setq i 1)

            (while (< i n)
              (setq ptoB (car (nth i iptos)))
              (crealine ptoA ptoB mallalayer mallacolor)
              (setq i (1+ i))
              (setq ptoA (car (nth i iptos)))
              (setq i (1+ i))
            )

            ; Texto coordenada NORTE
            (if (> n 1)
              (progn
                (setq pto (car (last iptos)))
                (setq textvalue (strcat (num2coords (cadr pto) 10) " m.N.  "))
                (setq pto (list (car pto) (+ (cadr pto) textheigth)))
                (creatext textvalue pto mallalayer textcolor textheigth textstyle 0.0 textoblique 2 2)

                (setq pto (car (car iptos)))
                (setq textvalue (strcat (num2coords (cadr pto) 10) " m.N.  "))
                (setq pto (list (car pto) (+ (cadr pto) textheigth)))
                (creatext textvalue pto mallalayer textcolor textheigth textstyle 0.0 textoblique 0 2)
              )
            )
          )
        )
        (setq y1 (+ y1 mallagap))
      )
    )
  )
)

(defun c:grilla ( / oldosmode olderror)
  (setvar "cmdecho" 0)
  (setq olderror *error*)
  (setq oldosmode (getvar "osmode"))
  (setvar "osmode" 0)
  (vl-load-com)
  (grilla)
  (setq *error* olderror)
  (setvar "osmode" oldosmode)
  (setvar "cmdecho" 1)
  (princ)
)

(princ "\nTipee GRILLA para ejecutar el programa")
(princ)
;;-----------------------------------------------------------------------------------------------
