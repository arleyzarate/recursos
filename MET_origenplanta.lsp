;;; ============================================================================
;;;  ORIGENPLANTA.LSP 
;;; ----------------------------------------------------------------------------
;;;  COMANDO: ORIGENPLANTA
;;;
;;;  Desplaza TODOS los elementos del espacio del MODELO desde un punto de
;;;  referencia X,Y indicado por el usuario, hasta que ese punto quede en 0,0
;;;  y deja configurados DOS sistemas de coordenadas nombrados:
;;;
;;;    - "Planta"     : origen en 0,0. Sistema LOCAL de trabajo, cerca del
;;;                     origen -maxima precision y estabilidad al dibujar-.
;;;                     Queda ACTIVO al terminar.
;;;    - "Geografico" : origen en (-X,-Y). Al activarlo, la lectura de
;;;                     coordenadas -ID, cuadro de coordenadas, etiquetas-
;;;                     vuelve a mostrar las coordenadas GEOGRAFICAS REALES,
;;;                     aunque la geometria siga fisicamente junto a 0,0.
;;;
;;;  Ambos ejes quedan alineados a World -X=Este, Y=Norte-, sin rotacion; la
;;;  relacion entre ambos es una simple traslacion de valor (-X,-Y).
;;;
;;;  QUE HACE, EN ORDEN:
;;;   1. Se asegura de estar en el espacio del Modelo -no Layout-.
;;;   2. Activa el SCP Universal / World.
;;;   3. Pide el punto de referencia. El usuario elige el metodo:
;;;        Teclear -escribe X e Y- o Seleccionar -clic en el modelo,
;;;        que tambien acepta X,Y en linea-.
;;;   4. Pide confirmacion antes de modificar el dibujo.
;;;   5. Si hay XREF enlazadas, las DESENLAZA -Detach- y las elimina del
;;;      dibujo, ANTES de limpiar o mover -no se insertan ni se mueven-.
;;;   6. Descongela, enciende y desbloquea TODAS las capas.
;;;   7. Mueve todos los elementos del modelo del punto X,Y hacia 0,0.
;;;   8. Alinea la vista en planta y hace ZOOM Extents para que sea visible.
;;;   9. Crea/actualiza los UCS "Planta" -0,0- y "Geografico" -(-X,-Y)-.
;;;  10. Deja "Planta" como UCS activo e informa un reporte final.
;;;  Revision: 1
;;;  Diseno : Arley Zarate
;;;  Fecha: 26/julio/2026
;;; ============================================================
;;; ============================================================================

(vl-load-com)

;;; ----------------------------------------------------------------------------
;;;  Utilidad: crear -o recrear si ya existe- un UCS nombrado alineado a World,
;;;  con origen en (ux, uy, 0). Devuelve el objeto UCS creado, o un objeto de
;;;  error atrapado si algo fallo.
;;; ----------------------------------------------------------------------------
(defun origenplanta:mkucs (coll oname ux uy / ex u)
  (setq ex nil)
  (vlax-for u coll
    (if (= (strcase (vla-get-Name u)) (strcase oname))
      (setq ex u)
    )
  )
  (if ex (vl-catch-all-apply 'vla-Delete (list ex)))
  (vl-catch-all-apply
    'vla-Add
    (list coll
          (vlax-3d-point (list ux           uy           0.0))   ; origen
          (vlax-3d-point (list (+ ux 1.0)   uy           0.0))   ; punto en +X (Este)
          (vlax-3d-point (list ux           (+ uy 1.0)   0.0))   ; punto en +Y (Norte)
          oname))
)

(defun c:origenplanta ( / *error* acadObj doc msp ptRef px py conf
                          ptFrom ptTo vFrom vTo
                          xrefNames failXref
                          nTotal nOk nFail
                          ox oy ucsColl ucsPlanta ucsGeo metodo
                          huboError undoAbierto b l e nm)

  ;; --------------------------------------------------------------------------
  ;; Manejador de errores
  ;; --------------------------------------------------------------------------
  (defun *error* (msg)
    (if (and msg (not (member (strcase msg) '("FUNCTION CANCELLED" "QUIT / EXIT ABORT"))))
      (princ (strcat "\n[ORIGENPLANTA] Error inesperado: " msg))
    )
    (if undoAbierto
      (progn
        (vl-catch-all-apply '(lambda () (command "_.UNDO" "_End")))
        (setq undoAbierto nil)
      )
    )
    (princ)
  )

  (setq huboError nil)
  (setq acadObj (vlax-get-acad-object))
  (setq doc (vla-get-ActiveDocument acadObj))

  (princ "\n==================================================================")
  (princ "\n  ORIGENPLANTA - Reubicar el origen del dibujo al punto 0,0")
  (princ "\n==================================================================")

  ;; --------------------------------------------------------------------------
  ;; 1) Asegurar espacio del Modelo y 2) activar SCP World, ANTES de pedir el
  ;;    punto -para que un clic o unas coordenadas se interpreten en World-.
  ;; --------------------------------------------------------------------------
  (if (/= (getvar "CTAB") "Model")
    (progn
      (setvar "CTAB" "Model")
      (princ "\n[ORIGENPLANTA] Se activo la pestana Model, espacio del modelo.")
    )
  )
  (command "_.UCS" "_World")
  (princ "\n[ORIGENPLANTA] SCP activado: Universal / World.")

  ;; --------------------------------------------------------------------------
  ;; 3) Pedir el punto de referencia. El usuario elige el metodo:
  ;;      - Teclear     : escribe las coordenadas X e Y por separado.
  ;;      - Seleccionar : hace clic en el modelo (o escribe X,Y en linea).
  ;; --------------------------------------------------------------------------
  (initget "Teclear Seleccionar")
  (setq metodo
    (getkword "\nComo desea indicar el punto de referencia (el que pasara a 0,0)? [Teclear/Seleccionar] <Seleccionar>: "))
  (if (null metodo) (setq metodo "Seleccionar"))

  (cond
    ;; ---- Opcion Teclear: pedir X e Y por separado --------------------------
    ((= metodo "Teclear")
     (setq px (getreal "\nCoordenada X del punto de referencia: "))
     (if px (setq py (getreal "\nCoordenada Y del punto de referencia: ")))
     (if (and px py)
       (setq ptRef (list px py 0.0))
       (setq ptRef nil)
     )
    )
    ;; ---- Opcion Seleccionar: clic en el modelo -o X,Y en linea- ------------
    (T
     (setq ptRef (getpoint "\nSeleccione el punto de referencia en el modelo (o escriba X,Y): "))
    )
  )

  (cond

    ;; ---- No se indico punto valido ------------------------------------------
    ((null ptRef)
     (princ "\n[ORIGENPLANTA] ERROR: operacion cancelada, no se indico un punto valido.")
     (setq huboError T)
    )

    ;; ---- 4) Confirmacion antes de modificar el dibujo -----------------------
    ((progn
       (setq px (car ptRef)
             py (cadr ptRef))
       (initget "Si No")
       (setq conf
         (getkword (strcat "\nSe movera TODO el dibujo desde el punto  "
                           (rtos px 2 4) "," (rtos py 2 4)
                           "  hacia 0,0 y se crearan los UCS 'Planta' y 'Geografico'. Continuar? [Si/No] <Si>: ")))
       (if (null conf) (setq conf "Si"))
       (= conf "No")
     )
     (princ "\n[ORIGENPLANTA] Operacion cancelada por el usuario.")
     (setq huboError T)
    )

    ;; ---- Confirmado: ejecutar toda la rutina --------------------------------
    (T
     (setq ptFrom (list px py 0.0)
           ptTo   (list 0.0 0.0 0.0)
           vFrom  (vlax-3d-point ptFrom)
           vTo    (vlax-3d-point ptTo))

     (command "_.UNDO" "_Begin")
     (setq undoAbierto T)

     ;; ------------------------------------------------------------------------
     ;; 5) XREF -> Detach (desenlazar) ANTES de limpiar o mover -eliminadas del dibujo-
     ;; ------------------------------------------------------------------------
     (setq xrefNames nil
           failXref  nil)
     (vlax-for b (vla-get-Blocks doc)
       (if (= (vla-get-IsXRef b) :vlax-true)
         (setq xrefNames (cons (vla-get-Name b) xrefNames))
       )
     )
     (if xrefNames
       (progn
         (princ (strcat "\n[ORIGENPLANTA] XREF encontradas: " (itoa (length xrefNames))
                        ". Desenlazando (Detach) y eliminando del dibujo antes de mover o limpiar..."))
         (foreach nm xrefNames
           (if (vl-catch-all-error-p
                 (vl-catch-all-apply
                   '(lambda (x) (command "_.-XREF" "_Detach" x))
                   (list nm)))
             (setq failXref (cons nm failXref))
           )
         )
         (if failXref
           (progn
             (setq huboError T)
             (princ (strcat "\n[ORIGENPLANTA] AVISO: no se pudieron desenlazar estas XREF: "
                            (apply 'strcat (mapcar '(lambda (n) (strcat n " ")) failXref))))
           )
           (princ "\n[ORIGENPLANTA] XREF desenlazadas (eliminadas del dibujo) correctamente.")
         )
       )
       (princ "\n[ORIGENPLANTA] No se encontraron XREF en el dibujo.")
     )

     ;; ------------------------------------------------------------------------
     ;; 6) Capas: descongelar, encender y desbloquear TODAS -por COM-
     ;; ------------------------------------------------------------------------
     (vlax-for l (vla-get-Layers doc)
       (progn
         (if (= (vla-get-Lock l)    :vlax-true)  (vla-put-Lock    l :vlax-false))
         (if (= (vla-get-Freeze l)  :vlax-true)  (vla-put-Freeze  l :vlax-false))
         (if (= (vla-get-LayerOn l) :vlax-false) (vla-put-LayerOn l :vlax-true))
       )
     )
     (princ "\n[ORIGENPLANTA] Todas las capas: descongeladas, encendidas y desbloqueadas.")

     ;; ------------------------------------------------------------------------
     ;; 7) Mover TODO el espacio del modelo hacia 0,0 -por COM, objeto a objeto-
     ;; ------------------------------------------------------------------------
     (setq msp    (vla-get-ModelSpace doc)
           nTotal 0
           nOk    0
           nFail  0)
     (vlax-for e msp
       (setq nTotal (1+ nTotal))
       (if (vl-catch-all-error-p
             (vl-catch-all-apply 'vla-Move (list e vFrom vTo)))
         (setq nFail (1+ nFail))
         (setq nOk   (1+ nOk))
       )
     )

     (cond
       ((= nTotal 0)
        (princ "\n[ORIGENPLANTA] ERROR: el espacio del modelo esta vacio, no hay nada que mover.")
        (setq huboError T)
       )
       ((> nFail 0)
        (setq huboError T)
        (princ (strcat "\n[ORIGENPLANTA] Se movieron " (itoa nOk) " de " (itoa nTotal)
                       " elementos. NO se pudieron mover " (itoa nFail)
                       " elementos -posibles objetos protegidos o proxy-."))
       )
       (T
        (princ (strcat "\n[ORIGENPLANTA] Desplazamiento correcto: " (itoa nOk)
                       " elementos movidos. El punto " (rtos px 2 4) "," (rtos py 2 4)
                       " ahora corresponde a 0,0."))
       )
     )

     ;; ------------------------------------------------------------------------
     ;; 8) Vista en planta -World- y ZOOM Extents, para que el resultado se vea
     ;; ------------------------------------------------------------------------
     (vl-catch-all-apply '(lambda () (command "_.PLAN" "_W")))
     (vl-catch-all-apply '(lambda () (vla-ZoomExtents acadObj)))
     (princ "\n[ORIGENPLANTA] Vista alineada en planta y ZOOM Extents aplicados.")

     ;; ------------------------------------------------------------------------
     ;; 9) Crear/actualizar los UCS nombrados "Planta" -0,0- y "Geografico".
     ;;    Ambos alineados a World -X=Este, Y=Norte-.
     ;; ------------------------------------------------------------------------
     (setq ox        (- 0.0 px)
           oy        (- 0.0 py)
           ucsColl   (vla-get-UserCoordinateSystems doc)
           ucsPlanta (origenplanta:mkucs ucsColl "Planta"     0.0 0.0)
           ucsGeo    (origenplanta:mkucs ucsColl "Geografico" ox  oy))

     (if (vl-catch-all-error-p ucsPlanta)
       (progn
         (setq huboError T)
         (princ (strcat "\n[ORIGENPLANTA] AVISO: no se pudo crear el UCS 'Planta' -- "
                        (vl-catch-all-error-message ucsPlanta)))
       )
       (princ "\n[ORIGENPLANTA] UCS 'Planta' creado (origen 0,0, sistema local de trabajo).")
     )

     (if (vl-catch-all-error-p ucsGeo)
       (progn
         (setq huboError T)
         (princ (strcat "\n[ORIGENPLANTA] AVISO: no se pudo crear el UCS 'Geografico' -- "
                        (vl-catch-all-error-message ucsGeo)))
       )
       (princ (strcat "\n[ORIGENPLANTA] UCS 'Geografico' creado (origen "
                      (rtos ox 2 4) "," (rtos oy 2 4) ", coordenadas reales)."))
     )

     ;; ------------------------------------------------------------------------
     ;; 10) Dejar "Planta" como UCS activo de trabajo
     ;; ------------------------------------------------------------------------
     (if (not (vl-catch-all-error-p ucsPlanta))
       (progn
         (vl-catch-all-apply 'vla-put-ActiveUCS (list doc ucsPlanta))
         (princ "\n[ORIGENPLANTA] UCS activo: 'Planta'. Cambie a 'Geografico' para leer coordenadas reales.")
       )
     )

     (command "_.UNDO" "_End")
     (setq undoAbierto nil)
    )
  )

  ;; --------------------------------------------------------------------------
  ;; Reporte final
  ;; --------------------------------------------------------------------------
  (princ "\n------------------------------------------------------------------")
  (if huboError
    (princ "\n RESULTADO: proceso finalizado CON ADVERTENCIAS. Revise los mensajes anteriores.")
    (princ "\n RESULTADO: proceso finalizado CORRECTAMENTE. Origen en 0,0; UCS 'Planta' y 'Geografico' listos.")
  )
  (princ "\n------------------------------------------------------------------")

  (princ)
)

(princ "\nORIGENPLANTA.lsp (v5) cargado. Escriba  ORIGENPLANTA  para ejecutarlo.")
(princ)
