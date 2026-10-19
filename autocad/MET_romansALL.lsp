;; Cambiar fuente de TODOS los estilos a Romans (sin cambiar width factor)
;; Comando: ROMANSALL
;; Autor: Mecanica - Arley Zarate
;; Fecha: 10/02/2026

(defun _set-style-font (styName fontFile / e flags)
  (setq e (tblobjname "STYLE" styName))
  (if e
    (progn
      (setq e (entget e))
      (setq flags (cdr (assoc 70 e)))

      ;; Saltar estilos dependientes de Xref (no editables)
      (if (= (logand flags 16) 16)
        nil
        (progn
          ;; Grupo 3 = archivo de fuente principal
          (if (assoc 3 e)
            (setq e (subst (cons 3 fontFile) (assoc 3 e) e))
            (setq e (append e (list (cons 3 fontFile))))
          )

          ;; Guardar cambios
          (entmod e)
          (entupd (tblobjname "STYLE" styName))
          T
        )
      )
    )
  )
)

(defun c:ROMANSALL (/ rec styName fontFile changed skipped)
  (setq changed 0)
  (setq skipped 0)

  (setq fontFile (getstring T "\nFuente destino [romans.shx]: "))
  (if (= fontFile "") (setq fontFile "romans.shx"))

  (setq rec (tblnext "STYLE" T))
  (while rec
    (setq styName (cdr (assoc 2 rec)))

    ;; Evitar estilos anónimos si aparecen (nombres que empiezan por *)
    (if (and styName (/= (substr styName 1 1) "*"))
      (progn
        (if (_set-style-font styName fontFile)
          (setq changed (1+ changed))
          (setq skipped (1+ skipped))
        )
      )
      (setq skipped (1+ skipped))
    )

    (setq rec (tblnext "STYLE"))
  )

  (command "_.REGENALL")
  (princ (strcat
           "\nListo. Estilos cambiados: " (itoa changed)
           " | Estilos omitidos: " (itoa skipped)
           " | Fuente: " fontFile
         ))
  (princ)
)
