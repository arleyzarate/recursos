;;;; ==============================================================
;;;;  DISTANCIAMIN  -  Eliminar aristas por distancia minima entre caras
;;;; --------------------------------------------------------------
;;;;  El usuario ingresa una distancia minima L.
;;;;
;;;;    1. Elimina de plano: POINT, INSERT (bloques), SPLINE, CIRCLE.
;;;;    2. Descompone el resto en ARISTAS (cada LINE = 1 arista; cada
;;;;       tramo de polilinea = 1 arista) y compara la distancia
;;;;       ENTRE aristas: si una arista queda integramente a menos
;;;;       de L de otra, sobra -> se elimina. La otra se conserva
;;;;       EXACTAMENTE donde estaba (no se crea geometria nueva, no
;;;;       se unen puntos).
;;;;    3. Las polilineas se parten: se borran las aristas que no
;;;;       cumplen y se conservan los tramos restantes tal cual.
;;;;
;;;;  Criterio: se procesan las aristas de mayor a menor longitud;
;;;;  la mas larga manda y las que caen dentro de L de ella se van.
;;;;
;;;;  Uso:  comando  DISTANCIAMIN  ->  Ingrese distancia minima <1>: 1
;;;;  diseno: Arley Zarate  |  v0  | 31 / julio /2026
;;;; ==============================================================

(vl-load-com)

;;; *bd-todo-modelo*  T = procesa todo el espacio modelo;
;;;                   nil = pide seleccion.
(if (not (boundp '*bd-todo-modelo*)) (setq *bd-todo-modelo* T))

;;; ---- Utilidades ------------------------------------------------
(defun bd:2d (p) (list (car p) (cadr p)))

(defun bd:ss->list (ss / i l)
  (setq i 0 l '())
  (if ss (repeat (sslength ss) (setq l (cons (ssname ss i) l) i (1+ i))))
  l)

;; Distancia de un punto p al segmento a-b (2D)
(defun bd:pt-seg-dist (p a b / ab ap dd tt cp)
  (setq ab (list (- (car b) (car a)) (- (cadr b) (cadr a)))
        ap (list (- (car p) (car a)) (- (cadr p) (cadr a)))
        dd (+ (* (car ab) (car ab)) (* (cadr ab) (cadr ab))))
  (if (<= dd 1e-16)
    (distance p a)
    (progn
      (setq tt (/ (+ (* (car ap) (car ab)) (* (cadr ap) (cadr ab))) dd)
            tt (max 0.0 (min 1.0 tt))
            cp (list (+ (car a) (* tt (car ab))) (+ (cadr a) (* tt (cadr ab)))))
      (distance p cp))))

;; T si la arista e1-e2 esta integramente a <= L del segmento k1-k2
(defun bd:edge-cov (e1 e2 k1 k2 L / len n i tt pt ok)
  (setq len (distance e1 e2)
        n   (if (<= len 1e-9) 1 (min 20 (max 2 (fix (/ len (/ L 2.0))))))
        ok  T
        i   0)
  (while (and ok (<= i n))
    (setq tt (/ (float i) n)
          pt (list (+ (car e1) (* tt (- (car e2) (car e1))))
                   (+ (cadr e1) (* tt (- (cadr e2) (cadr e1))))))
    (if (> (bd:pt-seg-dist pt k1 k2) L) (setq ok nil))
    (setq i (1+ i)))
  ok)

;;; ---- Lectura de vertices ---------------------------------------
;;;  LWPOLYLINE -> (closed elev normal constw ((pt bulge sw ew) ...))
(defun bd:lw-datos (ed / closed elev nrm cw verts cur)
  (setq closed (= 1 (logand 1 (cdr (assoc 70 ed))))
        elev   (cond ((cdr (assoc 38 ed))) (0.0))
        nrm    (cond ((cdr (assoc 210 ed))) ('(0.0 0.0 1.0)))
        cw     (cdr (assoc 43 ed))
        verts '() cur nil)
  (foreach it ed
    (cond
      ((= 10 (car it))
       (if cur (setq verts (cons cur verts)))
       (setq cur (list (cdr it) 0.0 0.0 0.0)))
      ((and cur (= 40 (car it))) (setq cur (list (car cur) (cadr cur) (cdr it) (nth 3 cur))))
      ((and cur (= 41 (car it))) (setq cur (list (car cur) (cadr cur) (caddr cur) (cdr it))))
      ((and cur (= 42 (car it))) (setq cur (list (car cur) (cdr it) (caddr cur) (nth 3 cur))))))
  (if cur (setq verts (cons cur verts)))
  (list closed elev nrm cw (reverse verts)))

;;;  POLYLINE pesada -> (closed flag70 ((pt bulge 0 0) ...))
(defun bd:pl-datos (e / v vd verts flg)
  (setq flg (cdr (assoc 70 (entget e))) verts '() v (entnext e))
  (while (and v (setq vd (entget v)) (= "VERTEX" (cdr (assoc 0 vd))))
    (setq verts (cons (list (cdr (assoc 10 vd))
                            (cond ((cdr (assoc 42 vd))) (0.0)) 0.0 0.0)
                      verts))
    (setq v (entnext v)))
  (list (= 1 (logand 1 flg)) flg (reverse verts)))

;;; ---- Creacion de LWPOLYLINE ------------------------------------
(defun bd:lw-crea (closed elev nrm cw verts lay col lt / ent)
  (setq ent
    (append
      (list '(0 . "LWPOLYLINE") '(100 . "AcDbEntity"))
      (if lay (list (cons 8 lay)))
      (if col (list col))
      (if lt  (list lt))
      (list '(100 . "AcDbPolyline") (cons 90 (length verts))
            (cons 70 (if closed 1 0)) (cons 38 elev))
      (if cw (list (cons 43 cw)))))
  (foreach v verts
    (setq ent (append ent
      (list (cons 10 (list (car (car v)) (cadr (car v)))))
      (if (not cw) (list (cons 40 (caddr v)) (cons 41 (nth 3 v))))
      (list (cons 42 (cadr v))))))
  (entmakex (append ent (list (cons 210 nrm)))))

;;; ---- Construccion de la lista de aristas -----------------------
;;;  arista = (id longitud p1 p2 ename segindice)
(defun bd:build-edges (lst / edges id e ed tp dat verts closed n i p1 p2)
  (setq edges '() id 0)
  (foreach e lst
    (if (setq ed (entget e))
      (progn
        (setq tp (cdr (assoc 0 ed)))
        (cond
          ((= tp "LINE")
           (setq p1 (bd:2d (cdr (assoc 10 ed))) p2 (bd:2d (cdr (assoc 11 ed))))
           (setq edges (cons (list id (distance p1 p2) p1 p2 e -1) edges) id (1+ id)))
          ((= tp "LWPOLYLINE")
           (setq dat (bd:lw-datos ed) closed (car dat) verts (nth 4 dat) n (length verts) i 0)
           (while (< i (1- n))
             (setq p1 (bd:2d (car (nth i verts))) p2 (bd:2d (car (nth (1+ i) verts))))
             (setq edges (cons (list id (distance p1 p2) p1 p2 e i) edges) id (1+ id) i (1+ i)))
           (if (and closed (> n 2))
             (progn
               (setq p1 (bd:2d (car (nth (1- n) verts))) p2 (bd:2d (car (nth 0 verts))))
               (setq edges (cons (list id (distance p1 p2) p1 p2 e (1- n)) edges) id (1+ id)))))
          ((= tp "POLYLINE")
           (setq dat (bd:pl-datos e))
           (if (and (zerop (logand 8  (cadr dat))) (zerop (logand 16 (cadr dat)))
                    (zerop (logand 32 (cadr dat))) (zerop (logand 64 (cadr dat))))
             (progn
               (setq closed (car dat) verts (caddr dat) n (length verts) i 0)
               (while (< i (1- n))
                 (setq p1 (bd:2d (car (nth i verts))) p2 (bd:2d (car (nth (1+ i) verts))))
                 (setq edges (cons (list id (distance p1 p2) p1 p2 e i) edges) id (1+ id) i (1+ i)))
               (if (and closed (> n 2))
                 (progn
                   (setq p1 (bd:2d (car (nth (1- n) verts))) p2 (bd:2d (car (nth 0 verts))))
                   (setq edges (cons (list id (distance p1 p2) p1 p2 e (1- n)) edges) id (1+ id)))))))
          (T nil)))))
  edges)

;; comparador estricto (evita que vl-sort descarte longitudes iguales)
(defun bd:elt> (a b)
  (cond ((> (cadr a) (cadr b)) T)
        ((< (cadr a) (cadr b)) nil)
        (T (< (car a) (car b)))))

;;; ---- Reconstruccion de una polilinea partida -------------------
;;;  Recibe ename, sus datos y la lista de segmentos a eliminar.
(defun bd:parte-poli (e segs-rem lw / ed dat closed elev nrm cw verts n order
                        ordered runs cur s emap kept-any laste
                        vo lay col lt run pts)
  (setq ed (entget e))
  (if lw
    (setq dat (bd:lw-datos ed) closed (car dat) elev (cadr dat) nrm (caddr dat)
          cw (cadddr dat) verts (nth 4 dat))
    (setq dat (bd:pl-datos e) closed (car dat) elev 0.0 nrm '(0.0 0.0 1.0)
          cw nil verts (caddr dat)))
  (setq n   (length verts)
        lay (cdr (assoc 8 ed)) col (assoc 62 ed) lt (assoc 6 ed))
  ;; lista de indices de segmento en orden
  (setq order '() s (if (and closed (> n 2)) n (1- n)) s (1- s))
  (while (>= s 0) (setq order (cons s order) s (1- s)))
  ;; si es cerrada y hay borrados, rotar para arrancar justo despues
  ;; de un segmento borrado (asi las corridas no cruzan la costura)
  (if (and closed (> n 2))
    (progn
      (setq s (rem (1+ (car (vl-sort segs-rem '<))) n) ordered '())
      (repeat n (setq ordered (cons s ordered) s (rem (1+ s) n)))
      (setq ordered (reverse ordered)))
    (setq ordered order))
  ;; agrupar corridas de segmentos conservados
  (setq runs '() cur '())
  (foreach s ordered
    (if (member s segs-rem)
      (if cur (setq runs (cons (reverse cur) runs) cur '()))
      (setq cur (cons s cur))))
  (if cur (setq runs (cons (reverse cur) runs)))
  (setq runs (reverse runs))
  ;; borrar original y recrear cada corrida como polilinea abierta
  (entdel e)
  (foreach run runs
    (setq vo '())
    (foreach s run
      (setq vo (cons (list (car (nth s verts)) (cadr (nth s verts)) 0.0 0.0) vo)))
    ;; vertice final = fin del ultimo segmento de la corrida
    (setq laste (rem (1+ (last run)) n))
    (setq vo (cons (list (car (nth laste verts)) 0.0 0.0 0.0) vo))
    (setq vo (reverse vo))
    (if (>= (length vo) 2)
      (bd:lw-crea nil elev nrm cw vo lay col lt))))

;;; ==============================================================
;;;  COMANDO PRINCIPAL
;;; ==============================================================
(defun c:DISTANCIAMIN ( / *error* oce ss L lst e ed tp
                       ntipos edges keepers removed
                       line-del poly-rem cell
                       nlin npol E)

  (defun *error* (m)
    (if oce (setvar 'cmdecho oce))
    (command "_.undo" "_end")
    (if (and m (/= m "Function cancelled") (/= m "quit / exit abort"))
      (princ (strcat "\nError: " m)))
    (princ))

  (setq oce (getvar 'cmdecho))
  (setvar 'cmdecho 0)
  (command "_.undo" "_begin")

  (princ "\nDISTANCIAMIN - Eliminar aristas por distancia minima")
  (initget 6)
  (setq L (getreal "\nIngrese distancia minima <1>: "))
  (if (null L) (setq L 1.0))

  (setq ss (if *bd-todo-modelo* (ssget "_X" '((410 . "Model"))) (ssget)))

  (if ss
    (progn
      (setq lst (bd:ss->list ss) ntipos 0)

      ;; 1) eliminar de plano puntos, bloques, splines y circulos
      (setq lst
        (vl-remove-if
          (function
            (lambda (e / ed)
              (if (and (setq ed (entget e))
                       (member (cdr (assoc 0 ed)) '("POINT" "INSERT" "SPLINE" "CIRCLE")))
                (progn (entdel e) (setq ntipos (1+ ntipos)) T)
                nil)))
          lst))

      ;; 2) descomponer en aristas
      (setq edges (bd:build-edges lst))

      ;; 3) barrido voraz: conservar largas, eliminar las que caen dentro de L
      (setq edges (vl-sort edges 'bd:elt>) keepers '() removed '())
      (foreach E edges
        (if (vl-some
              (function (lambda (K)
                (bd:edge-cov (caddr E) (cadddr E) (caddr K) (cadddr K) L)))
              keepers)
          (setq removed (cons E removed))
          (setq keepers (cons E keepers))))

      ;; 4) clasificar eliminados: lineas sueltas vs segmentos de polilinea
      (setq line-del '() poly-rem '())
      (foreach E removed
        (if (= -1 (nth 5 E))
          (setq line-del (cons (nth 4 E) line-del))
          (progn
            (setq cell (assoc (nth 4 E) poly-rem))
            (if cell
              (setq poly-rem (subst (cons (car cell) (cons (nth 5 E) (cdr cell))) cell poly-rem))
              (setq poly-rem (cons (list (nth 4 E) (nth 5 E)) poly-rem))))))

      ;; 5) aplicar
      (setq nlin 0 npol 0)
      (foreach e line-del
        (if (entget e) (progn (entdel e) (setq nlin (1+ nlin)))))
      (foreach cell poly-rem
        (if (setq ed (entget (car cell)))
          (progn
            (bd:parte-poli (car cell) (cdr cell)
                           (= "LWPOLYLINE" (cdr (assoc 0 ed))))
            (setq npol (1+ npol)))))

      (princ (strcat "\n--- DISTANCIAMIN finalizado ---"
                     "\nDistancia minima L   : " (rtos L 2 4)
                     "\nTipos eliminados     : " (itoa ntipos)
                     "\nLineas eliminadas    : " (itoa nlin)
                     "\nPolilineas partidas  : " (itoa npol)
                     "\nAristas eliminadas   : " (itoa (length removed)))))
    (princ "\nNo hay entidades para procesar."))

  (setvar 'cmdecho oce)
  (command "_.undo" "_end")
  (princ))

(princ "\nDISTANCIAMIN cargado. Escriba DISTANCIAMIN para ejecutar.")
(princ)
