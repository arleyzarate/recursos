;; rutina AutoLISP para AutoCAD 2024 y versiones posteriores que permite extraer las coordenadas de los vértices de una polilínea 3D. La herramienta solicita al usuario seleccionar una polilínea 3D y definir el vértice de inicio para el recorrido.
;; Comando: POLY3DXYZ
;; Autor: Arley Zarate
;; Fecha: 03/septiembre/2026

(defun c:POLY3DXYZ (/ ent coords nverts startIdx i idx pt vtx)

  (vl-load-com)

  ;; Selección de la polilínea 3D
  (setq ent (car (entsel "\nSeleccione una polilinea 3D: ")))

  (if (and ent
           (= (cdr (assoc 0 (entget ent))) "POLYLINE")
           (= (logand (cdr (assoc 70 (entget ent))) 8) 8)
      )

    (progn

      ;; Obtener todos los vértices
      (setq coords '())
      (setq vtx (entnext ent))

      (while (/= (cdr (assoc 0 (entget vtx))) "SEQEND")
        (setq coords
              (append coords
                      (list (cdr (assoc 10 (entget vtx))))))
        (setq vtx (entnext vtx))
      )

      (setq nverts (length coords))

      (prompt
        (strcat
          "\nLa polilinea contiene "
          (itoa nverts)
          " vertices."
        )
      )

      ;; Solicitar punto de inicio
      (setq startIdx
            (getint
              (strcat
                "\nNumero de vertice inicial [1-"
                (itoa nverts)
                "]: "
              )
            )
      )

      (if (and startIdx
               (>= startIdx 1)
               (<= startIdx nverts))

        (progn

          (prompt "\n")
          (setq i 0)

          (repeat nverts

            (setq idx (+ startIdx i))

            (while (> idx nverts)
              (setq idx (- idx nverts))
            )

            (setq pt (nth (1- idx) coords))

            (prompt
              (strcat
                "\n"
                (rtos (car pt) 2 3) ","
                (rtos (cadr pt) 2 3) ","
                (rtos (caddr pt) 2 3)
              )
            )

            (setq i (1+ i))
          )
        )

        (prompt "\nNumero de vertice no valido.")
      )
    )

    (prompt "\nEl objeto seleccionado no es una polilinea 3D.")
  )

  (princ)
)
