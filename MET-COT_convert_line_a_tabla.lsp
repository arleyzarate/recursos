;; © Juan Villarreal 11.26.2010
;|
*EDIT*-Dec 01, 2010
Minor update on V1.2 to avoid removing spaces when merging cells. Removed V1.1 as optional merging seemed preferred.

*EDIT*-Dec 02, 2010
Minor update to include field strings.

*EDIT*-Dec 06, 2010
Minor update to include functionality when merging a row or column of empty cells.

*EDIT*-Jan 07, 2011
Updated to include regeneratetablesuppressed 

*EDIT*-July 20, 2011 - V1.5
Quick Fix to support any table format. Removed prompt for merging as it will typically be necessary w/this version.

*EDIT*-July 21,2011 - V1.5
Slight Mod to merged cell search process

*V1.6* - Nov 16, 2011
-*Now supports diagonal merging*
-Zoom Extents to selected objects
-Modified code to utilize associated lists, making it easier to transfer properties to table cells.
-Added rotation property for text.
-Now uses center of bounding box for text and block entities.
-Supports 'merged cells' containing a block.
-If multiple blocks are detected within an area to merge, an alert will inform the user.
 (apparently, multiple blocks are allowed in a cell, but i'm not yet sure how to accomplish this in the routine)

*EDIT*-Nov 17,2011 - V1.6
-Made suppressing Title/headers optional
  -If suppressed, all merging continues
  -Otherwise, merging involving the top row is disabled

*EDIT*-Dec 16, 2011 - V1.6a
-Optional Table Style Creation
  -Retains original appearance

*EDIT*-Dec 19, 2011
-Minor update/fix (Variable names)
|;
;---------------------------------------------------------------------------------------------------------------------------------
;-------------------------------------- GATHERING TABLE INFORMATION ------------------------------------
;---------------------------------------------------------------------------------------------------------------------------------
(defun tableinfo ( ss  / n entlist)
 (setq n 0)
 (repeat (sslength ss)
   (setq entlist (entget (ssname ss n)))
   (cond ((member (cdr (assoc 0 entlist)) '("LINE" "LWPOLYLINE"))
             (getlinepts entlist)(setq linelist (cons (ssname ss n) linelist)))
            ((member (cdr (assoc 0 entlist)) '("TEXT" "MTEXT"))
             (setq textlist (cons (ssname ss n) textlist)))
            ((member (cdr (assoc 0 entlist)) '("INSERT"))
             (setq blocklist (cons (ssname ss n) blocklist)))
   )
   (setq n (1+ n))
 )
)
;-------------------------- Cell Count/Height/Width Determination ----------------------
;;Gathers x and y positions of lines and polylines in separate lists
;;This is used to determine height/width & # of rows/columns
;;Line info must be gathered first in order to determine
;;cell position of any other gathered information
;---------------------------------------------------------------------------------------
(defun getlinepts (alist / x  xpt ypt)
  (foreach x alist
     (if (member (car x) '(10 11))
         (progn
           (if (not (vl-position (setq xpt (atof (rtos (car (trans (cdr x) 0 1)) 2 2))) lpxlist))
               (setq lpxlist (cons xpt lpxlist)))
           (if (not (vl-position (setq ypt (atof (rtos (cadr (trans (cdr x) 0 1)) 2 2))) lpylist))
               (setq lpylist (cons ypt lpylist)))
         )        
      )
   )
);defun
;---------------------------- Text Info and Cell Position -----------------------------------------------------
;;Determine cell position by insertionpoint of text objects
;;(Using text center is probably more reliable)
;;Create list of indexed lists containing "Order", "Position", "Content", "Height", "Rotation", "StyleName" and "TrueColor"
;;to be used to fill acad table after creation
;;If row and column is already in list, replace with combined string
;--------------------------------------------------------------------------------------------------------------
(defun gettxtinfo (alist / x vlaobj pos rpos cpos expos)
(setq vlaobj (vlax-ename->vla-object txt)
        pos (trans (midp vlaobj) 0 1);Midpoint
        rpos (1- (vl-position (cadr pos)(vl-sort (cons (cadr pos) lpylist) '>)));Row Position
        cpos (1- (vl-position (car pos) (vl-sort (cons (car pos) lpxlist) '<))));Column Position
(if (setq expos (vl-position (list rpos cpos) (mapcar '(lambda (x)(cdr (assoc "Position" x))) tinfo)));if cell is taken
   (setq tinfo
     (replace tinfo expos
      (replace
       (nth expos tinfo)
        2
        (cons "Content"
       (if (> (cadr pos) (cdr (assoc "Order" (nth expos tinfo))));in order according to y position
          (strcat (vla-fieldcode vlaobj) " " (cdr (assoc "Content" (nth expos tinfo))))
          (strcat (cdr (assoc "Content" (nth expos tinfo))) " " (vla-fieldcode vlaobj))
       )))))
(setq tinfo
 (cons
  (list
   (Cons "Order" (cadr pos))
   (Cons "Position" (list rpos cpos));Position
   (Cons "Content" (vla-fieldcode vlaobj));Content
   (Cons "Height" (vla-get-height vlaobj))
   (Cons "Rotation" (vla-get-rotation vlaobj))
   (Cons "StyleName" (vla-get-StyleName vlaobj))
   (Cons "TrueColor"
    (if
     (= (vla-get-colorindex (vla-get-truecolor vlaobj)) 256)
      (vla-get-truecolor
       (vla-item
        (vla-get-layers ActDoc)
        (vla-get-layer vlaobj)))
      (vla-get-truecolor vlaobj)
    )
  )
 )
tinfo)))
(vla-delete vlaobj)
);defun
;--------------------------- Block Info and Cell Position -------------------------------------------------------
;;Gather block information
;;determine cell position according to insertion point
;;Create an indexed list of lists containing "Position" (row, column), "ObjID",
;;"Attributes" (attribute id, attributetextstring) and "Scale" 
;----------------------------------------------------------------------------------------------------------------
(defun getblockinfo (obj / pos rpos cpos bname objid bobj attid)
  (if (= (type obj) 'ename)
    (setq obj (vlax-ename->vla-object obj))
  )
(setq pos (trans (midp obj) 0 1)
        rpos (1- (vl-position (cadr pos)(vl-sort (cons (cadr pos) lpylist) '>)));Row Position
        cpos (1- (vl-position (car pos) (vl-sort (cons (car pos) lpxlist) '<)));Column Position
        bname (vla-get-name obj);Block Name
        bobj (vla-item (vla-get-blocks ActDoc) bname));Block Vla Object
(vlax-for i bobj ; Foreach item in block
(if (eq (vla-get-objectname i) "AcDbAttributeDefinition");If item is an attribute
  (setq attid (append attid (list (vla-get-objectid i))));List Attribute Id
)
)
(setq objid (vla-get-objectid bobj));Block Object Id
 (setq binfo
   (cons
    (list
     (Cons "Position" (list rpos cpos))
     (Cons "ObjID" objid)
  (if (= (vla-get-hasattributes obj) :vlax-true)
   (Cons "Attributes"
    (mapcar
      '(lambda (x y) (cons y (vla-get-textstring x)))
      (vlax-safearray->list (variant-value (vla-getattributes obj)))
      attid
    )
   )
  )
     (Cons "Scale" (vla-get-xscalefactor obj))
    )
binfo))
(vla-delete obj)
)
;------------------------------------------------------------------------------------------------------------------------
;-------------------------------------------- REPLACE by Charles Alan Butler---------------------------------------------
;;Cab's replace function used in this routine to avoid overwriting cells and to update cell merge lists
;------------------------------------------------------------------------------------------------------------------------
(defun replace (lst i itm)
  (setq i (1+ i))
  (mapcar
    '(lambda (x)
      (if (zerop (setq i (1- i))) itm x)
    )
    lst
  )
)

;-------------------------Midpoint-----------------
(defun midp (obj / ObjLl ObjUr)
 (vla-GetBoundingBox obj 'ObjLl 'ObjUr)
 (mapcar
  '(lambda (a b) (/ (+ a b) 2.0))
   (safearray-value ObjLl)
   (safearray-value ObjUr))
)

;-------------------------Q&D Number Accumulation---------------------------
;Used in this routine for polar distances to determine which cells to merge.
;;Recursive function possible. Ask Gile (recursion master) if desired.
(defun acnumlist (nlist / acnlist)
 (repeat (length nlist)
  (setq acnlist (cons (apply '+ nlist) acnlist)
        nlist (reverse (cdr (reverse nlist))))
 )
 acnlist
)
;--------------------------------------------------------------------------
;; ø Remove_nth ø  (Lee Mac)          ;;
;; ~ Removes the nth item in a list.  ;;

(defun Remove_nth (i lst / j)
  (setq j -1)
  (vl-remove-if
    (function
      (lambda (x)
        (eq i (setq j (1+ j))))) lst))
;--------------------------------------------------------------------------
;-------------------------GetTableStyle---------------------------
;Returns a list with selected table style and vla-object
(defun GetTableStyle (ActDoc / ObjTblStyDic tstylest tstylelst2 tstylelst3 txt spos tbl_name i)
 (setq tstylelst
  (cons "Create"
   (acad_strlsort
     (vlax-for i
       (setq ObjTblStyDic (vla-item (vla-get-dictionaries ActDoc) "ACAD_TABLESTYLE"))
       (setq tstylelst (cons (vla-get-name i) tstylelst)))))
 i -1)

(if (= (length tstylelst) 1)(setq kword (car tstylelst))
(progn 
(setq tstylelst2
 (mapcar
  '(lambda (x / txt)
    (setq txt x spos 0)
    (while (setq spos (vl-string-position (ascii " ") txt spos))
          (setq txt (vl-string-subst "" " " txt spos))
    )
    txt
   ) 
  tstylelst
 )
)
(initget (setq tstylelst3 (apply 'strcat (mapcar '(lambda (x)
            (if (nth (1+ (setq i (1+ i))) tstylelst2)
                (strcat x " ") (strcat x))) tstylelst2))))

(setq spos -3)
(while (setq spos (vl-string-position (ascii " ") tstylelst3 (+ spos 3)))
       (setq tstylelst3 (vl-string-subst " / " " " tstylelst3 spos))
)
(setq kword
(if (setq kword (getkword (strcat "\nSelect Table Style: [ " tstylelst3 " ]:<Standard>"))) kword "Standard"))
(setq kword (nth (vl-position kword tstylelst2) tstylelst))
)
)
 (if (= kword "Create")(setq newstyle (vla-addobject objTblStyDic (setq kword (getstring T "Table Style Name: " )) "AcDbTableStyle")))
 (list kword (vla-item ObjTblStyDic kword))
);defun


;---------------------------------------------------------------------------------------------------------------------
;------------------------------------------- CONVERT OLD TABLE ROUTINE -----------------------------------------------
;---------------------------------------------------------------------------------------------------------------------
(defun c:COT (/ ActDoc   *error* orerror otcontents textlist    colwidths i mlist  p0 hmergelist2 vmergelist2
                       *Space*  lpxlist lpylist  tinfo     cwidths     check        tstyle     spos newstring
                       tstylelst hmergelist vmergelist blocklist  rowheights selsets       tstylelst2 tstylelst3
                       kword     linelist       binfo        rheights     ssitem   tblobj mb dmergelist supkword 
                       colorlst colorlst2 th tr ts tc newstyle RowTypes)
                
(vl-load-com)
(setq oerror *error*)
(defun *error* ( msg )
        (princ (strcat "\n<" msg ">\n"))
	(mapcar '(lambda (x)(and x (not (vlax-object-released-p x))(vlax-release-object x))) (list ssitem)) 
        (setq *error* oerror)
        (setvar 'nomutt 0)
	(vla-EndUndoMark ActDoc)
        (princ)
);defun *error*
(setq ActDoc (vla-get-activedocument (vlax-get-acad-object))
        *Space* (vlax-get-property ActDoc (nth (vla-get-ActiveSpace ActDoc)'("PaperSpace" "ModelSpace"))))

(vla-EndUndoMark ActDoc)
(vla-StartUndoMark ActDoc)

(setq kword (GetTableStyle ActDoc))

(initget "No Yes")
(setq supkword (if (setq supkword (getkword "\nSuppress Title/Headers? [ No / Yes ]:<No>")) supkword "No"))
(vla-put-horzcellmargin (cadr kword) 0.0)
(vla-put-vertcellmargin (cadr kword) 0.0)
(setq otcontents (ssget))
(command "._zoom" "object" otcontents "")
(princ "\nSorting Line Info...")
(tableinfo otcontents)
(setq lpxlist (vl-sort lpxlist '<) lpylist (vl-sort lpylist '>)) 
(princ "\nSorting Text Info...")                                   
(mapcar '(lambda (txt)(gettxtinfo (entget txt))) textlist)   
(princ "\nSorting Block Info...")             
(mapcar '(lambda (blk)(getblockinfo blk)) blocklist)   
(setq colwidths (mapcar '(lambda (x)(- (nth (1+ (vl-position x lpxlist)) lpxlist) x))(reverse (cdr (reverse lpxlist))))
      rowheights (mapcar '(lambda (x)(- x (nth (1+ (vl-position x lpylist)) lpylist)))(reverse(cdr (reverse lpylist)))))
(setq p0 (vlax-3d-point (trans (list (car lpxlist) (car lpylist) 0.0) 1 0)));;<---Table Placement (Currently using Top Left corner)
(progn
(princ "\nSearching for merged cells...") 
(princ)
(setvar 'nomutt 1)
;-----------------------------------Method to determine which cells to merge--------------------------------------------
;Method fails if missed selection is not possible at zoom level.
;To determine which cells to merge, a selection at point is used.
;For each row, a selection is attempted at each vertical line at row's center.
;If no selection is made, the point is at the center or left of horizontally merged cells.
;For each column, a selection is attempted at each horizontal line at column's center.
;If no selection is made, the point is at the center or upper region of vertically merged cells.
;Continuation of merging is determined by a 'consecutive miss'.
;When a 'consecutive miss' is made, max column/row item is replaced by the next column/row.
;-----------------------------------------------------------------------------------------------------------------------
(setq selsets (vla-get-selectionsets ActDoc))
(vl-catch-all-error-p (vl-catch-all-apply 'vla-add (list selsets "InxCheckSet")))
(setq ssitem (vla-item selsets "InxCheckSet")
        cwidths (acnumlist colwidths)
        rheights (acnumlist rowheights));;col widths & row heights accumulated for polar use
(mapcar '(lambda (pt rh)
 (mapcar '(lambda (x)
   (vl-catch-all-error-p (vl-catch-all-apply 'vla-clear (list ssitem)))
   (vla-selectatpoint ssitem (vlax-3d-point (polar (list (car lpxlist) (+ pt (/ rh 2)) 0.0) 0 x)))
   (if (zerop (vla-get-count ssitem))
         (if check
           (setq hmergelist (replace hmergelist 0 (replace mlist 3 (1+ (vl-position x cwidths)))))
           (setq hmergelist
            (cons
             (setq mlist
               (list
                 (1- (vl-position pt lpylist))
                 (vl-position x cwidths)
                 (1- (vl-position pt lpylist))
                 (1+ (vl-position x cwidths))
               )) hmergelist)
             check T)
         );if
       (setq check nil mlist nil
             colorlst
              (append colorlst
               (list (list  (1- (vl-position pt lpylist))
                     (vl-position x cwidths)
                     (if
                       (= (vla-get-colorindex (vla-get-truecolor (vla-item ssitem 0))) 256)
                       (vla-get-truecolor
                         (vla-item
                           (vla-get-layers ActDoc)
                           (vla-get-layer (vla-item ssitem 0))))
                       (vla-get-truecolor (vla-item ssitem 0))
                     )
               ))))
   ));lambda
   cwidths
  );mapcar
);lambda
(member (nth 1 lpylist) lpylist)
rowheights
);mapcar

(mapcar '(lambda (pt cw)
  (mapcar '(lambda (x)
    (vl-catch-all-error-p (vl-catch-all-apply 'vla-clear (list ssitem)))
    (vla-selectatpoint ssitem (vlax-3d-point (polar (list (+ pt (/ cw 2)) (car lpylist) 0.0) (* pi 1.5) x)))
    (if (zerop (vla-get-count ssitem))
         (if check
           (setq vmergelist (replace vmergelist 0 (replace mlist 2 (1+ (vl-position x rheights)))))
           (setq vmergelist
            (cons
             (setq mlist
               (list
                 (vl-position x rheights)
                 (vl-position pt lpxlist)
                 (1+ (vl-position x rheights))
                 (vl-position pt lpxlist)
               )) vmergelist)
             check T)
         );if
       (setq check nil mlist nil
             colorlst2
              (append colorlst2
               (list (list (vl-position x rheights)
                     (vl-position pt lpxlist)
                     (if
                       (= (vla-get-colorindex (vla-get-truecolor (vla-item ssitem 0))) 256)
                       (vla-get-truecolor
                         (vla-item
                           (vla-get-layers ActDoc)
                           (vla-get-layer (vla-item ssitem 0))))
                       (vla-get-truecolor (vla-item ssitem 0))
                     )
               ))))
   ));lambda
   rheights
  );mapcar
);lambda
lpxlist
colwidths
);mapcar
(setvar 'nomutt 0)
);progn
(mapcar '(lambda (x)(entdel x)) linelist);;Delete all lines in selection set
(setq hmergelist2 (mapcar '(lambda (b)(list (car b)(cadr b))) hmergelist))
(setq vmergelist2 (mapcar '(lambda (b)(list (car b)(cadr b))) vmergelist))
(mapcar
'(lambda (a / expos)
  (if
   (setq expos (vl-position (list (car a)(cadr a)) vmergelist2))
   (setq dmergelist (cons (list (car a)(cadr a)(caddr (nth expos vmergelist))(cadddr a)) dmergelist))))
   hmergelist
)
;-------------------------------------- Table Creation and Info Placement------------------------------------------------
;;Create table object
;;Fill table with gathered text and block info and set selected style.
;------------------------------------------------------------------------------------------------------------------------
(princ "\nCreating Table...")
(setq tblobj
  (vla-addtable
    *Space* p0
    (float (1- (length lpylist)))
    (float (1- (length lpxlist)))
    (apply 'max rowheights)
    (apply 'max colwidths)))
(if (= supkword "Yes")
 (progn
   (vla-put-TitleSuppressed tblobj :vlax-true)
   (vla-put-HeaderSuppressed tblobj :vlax-true)
   (Vla-unmergecells tblobj 0 0 0 (length colwidths))
 )
)
(vla-put-regeneratetablesuppressed tblobj :vlax-true)
(princ "\nProcessing Text Info...")
(setq newstring "")
(mapcar
 '(lambda (x / r c)
   (setq r (cadr (assoc "Position" x)) c (caddr (assoc "Position" x)))
   (if (and (= supkword "No")(zerop r))
    (setq newstring (strcat newstring (cdr (assoc "Content" x)))
          th (cdr (assoc "Height" x))
          tr (cdr (assoc "Rotation" x))
          ts (cdr (assoc "StyleName" x))
          tc (cdr (assoc "TrueColor" x)))
    (vla-settext tblobj r c (cdr (assoc "Content" x))))
   (vla-setrotation tblobj r c 0 (cdr (assoc "Rotation" x)))
   (vla-setcelltextheight tblobj r c (cdr (assoc "Height" x)))
  (if newstyle
   (progn
   (vla-setcelltextstyle tblobj r c (cdr (assoc "StyleName" x)))
   (vla-setcellcontentcolor tblobj r c (cdr (assoc "TrueColor" x)))
   (vla-setcellalignment tblobj r c acMiddleCenter)
   )
  )
 )
 tinfo
)

(if (= supkword "No")
 (progn
  (vla-settext tblobj 0 0 newstring)
  (vla-setcelltextheight tblobj 0 0 th)
  (vla-setrotation tblobj 0 0 0 tr)
  (if newstyle (progn
  (vla-setcelltextstyle tblobj 0 0 ts)
  (vla-setcellcontentcolor tblobj 0 0 tc)))))
(princ "\nProcessing Block Info...")
(mapcar
 '(lambda (x / r p)
   (setq r (cadr (assoc "Position" x)) c (caddr (assoc "Position" x)))
   (vla-setcelltype tblobj r c acBlockCell)
   (vla-SetBlockTableRecordId tblobj r c (cdr (assoc "ObjID" x)) :vlax-false)
   (mapcar
    '(lambda (y)
      (vla-setblockattributevalue tblobj r c (car y) (cdr y)))
      (cdr (assoc "Attributes" x)))
   (vla-SetBlockScale tblobj r c (cdr (assoc "Scale" x)))
   (vla-setcellalignment tblobj r c acMiddleCenter)
 )
 binfo
)
 (vla-put-StyleName tblObj (car kword))
(if (= supkword "No")
 (progn
 (setq i 0)
 (mapcar
  '(lambda (a )
    (and (zerop (car a))(setq hmergelist (remove_nth i hmergelist) i (1- i)))
    (setq i (1+ i))
   )
   hmergelist2
 )
 (setq i 0)
 (mapcar
  '(lambda (a )
    (and (zerop (car a))(setq vmergelist (remove_nth i vmergelist) i (1- i)))
    (setq i (1+ i))
   )
   vmergelist2
 )))


(and newstyle (mapcar '(lambda (Col)(vla-setcellgridcolor tblobj (nth 0 col)(1+ (nth 1 col)) acVertLeft (nth 2 col))) colorlst))
(and newstyle (mapcar '(lambda (Col)(vla-setcellgridcolor tblobj (nth 0 col)(nth 1 col) acHorzBottom (nth 2 col))) colorlst2))

 
(progn
(princ "\nProcessing Merge Info")
;---------------------------------------- Method used to merge cells -----------------------------------------------------
;For each list of cells to merge
;All cell content is combined and placed in the first cell
;The max cell text height found in the cells to merge is applied to the first cell
;Cells are merged and content of first cell is displayed.
;-------------------------------------------------------------------------------------------------------------------------
;Diagonal Merge
;-------------------------------------------------------------------------------------------------------------------------
(mapcar
 '(lambda (x / minrow maxrow mincol maxcol newstring  thlist expos col sty)
   (setq hmergelist2 (mapcar '(lambda (b)(list (car b)(cadr b))) hmergelist))
   (setq vmergelist2 (mapcar '(lambda (b)(list (car b)(cadr b))) vmergelist))
   (setq newstring "" thlist nil expos nil)
   (setq minrow (car x) mincol (cadr x) maxrow (caddr x) maxcol (cadddr x))
   (repeat (1+ (- maxrow minrow))
    (setq mincol (cadr x))
    (setq hmergelist (remove_nth (vl-position (list minrow mincol) hmergelist2) hmergelist))
    (repeat (1+ (- maxcol mincol))
      (if (= minrow (car x)) (setq vmergelist (remove_nth (vl-position (list minrow mincol) vmergelist2) vmergelist)))
       (cond
        ((= (vla-getCellType tblobj minrow mincol) acTextCell)    
         (or expos (setq newstring (strcat newstring (if (eq newstring "") "" " ") (vla-gettext tblobj minrow mincol))))
          (if (/= (vla-gettext tblobj minrow mincol) "")
          (setq thlist (cons (vla-getcelltextheight tblobj minrow mincol) thlist)
                col (vla-getcellcontentcolor tblobj minrow mincol) 
                sty (vla-getcelltextstyle tblobj minrow mincol)))
         )
        ((= (vla-getCellType tblobj minrow mincol) acBlockCell)
         (if expos (setq mb T))
         (setq expos (vl-position (list minrow mincol) (mapcar '(lambda (x)(cdr (assoc "Position" x))) binfo)) newstring nil thlist nil col nil sty nil)
        ))
      (setq mincol (1+ mincol))
     );repeat
    (setq minrow (1+ minrow))
   );repeat
   (setq minrow (car x) mincol (cadr x) maxrow (caddr x) maxcol (cadddr x))
   (and newstring (/= newstring "")(vla-settext tblobj minrow mincol newstring))
   (if thlist (vla-setcelltextheight tblobj minrow mincol (apply 'max thlist)))
   (and newstyle col (vla-setcellcontentcolor tblobj minrow mincol col))
   (and newstyle sty (vla-setcelltextstyle tblobj minrow mincol sty))
   (and newstyle (vla-setcellalignment tblobj minrow mincol acMiddleCenter))
   (vla-mergecells tblobj minrow maxrow mincol maxcol)
   (if expos
    (progn
     (vla-setcelltype tblobj minrow mincol acBlockCell)
     (vla-SetBlockTableRecordId tblobj minrow mincol (cdr (assoc "ObjID" (nth expos binfo))) :vlax-false)
     (mapcar
     '(lambda (y)
      (vla-setblockattributevalue tblobj minrow mincol (car y) (cdr y)))
      (cdr (assoc "Attributes" (nth expos binfo))))
     (vla-SetBlockScale tblobj minrow mincol (cdr (assoc "Scale" (nth expos binfo))))))
 )
dmergelist
)

;-----------------------------------------------------------------------------------------------------------
;Horizontal Merge
;-------------------------------------------------------------------------------------------------------------------------
(mapcar
 '(lambda (x / r newstring c thlist expos col sty)
   (setq newstring "" thlist nil r (car x) c (1- (cadr x)) expos nil)
    (repeat (- (1+ (cadddr x)) (cadr x))
     (setq  c (1+ c))
     (cond
      ((= (vla-getCellType tblobj r c) acTextCell)    
       (or expos (setq newstring (strcat newstring (if (eq newstring "") "" " ") (vla-gettext tblobj (car x) c))))
       (if (/= (vla-gettext tblobj (car x) c) "")
          (setq thlist (cons (vla-getcelltextheight tblobj (car x) c) thlist)
                col (vla-getcellcontentcolor tblobj (car x) c)
                sty (vla-getcelltextstyle tblobj (car x) c)))
      )
      ((= (vla-getCellType tblobj r c) acBlockCell)
       (if expos (setq mb T))
       (setq expos (vl-position (list r c) (mapcar '(lambda (x)(cdr (assoc "Position" x))) binfo)) newstring nil thlist nil col nil sty nil)
     ))
    )
  
   (and newstring (/= newstring "")(vla-settext tblobj (car x) (cadr x) newstring))
   (if thlist (vla-setcelltextheight tblobj (car x)(cadr x)(apply 'max thlist)))
   (and newstyle col (vla-setcellcontentcolor tblobj (car x)(cadr x) col))
   (and newstyle sty (vla-setcelltextstyle tblobj (car x)(cadr x) sty))
   (and newstyle (vla-setcellalignment tblobj (car x)(cadr x) acMiddleCenter))
   (vla-mergecells tblobj (car x) (caddr x) (cadr x) (cadddr x))
   (if expos
    (progn
     (vla-setcelltype tblobj (car x) (cadr x) acBlockCell)
     (vla-SetBlockTableRecordId tblobj (car x) (cadr x) (cdr (assoc "ObjID" (nth expos binfo))) :vlax-false)
     (mapcar
     '(lambda (y)
      (vla-setblockattributevalue tblobj (car x) (cadr x) (car y) (cdr y)))
      (cdr (assoc "Attributes" (nth expos binfo))))
     (vla-SetBlockScale tblobj (car x) (cadr x) (cdr (assoc "Scale" (nth expos binfo))))))
 )
 hmergelist
)
;-------------------------------------------------------------------------------------------------------------------------
;Vertical Merge
;-------------------------------------------------------------------------------------------------------------------------
(mapcar
 '(lambda (x / newstring r thlist expos col sty)
   (setq newstring "" r (1- (car x)) c (cadr x) expos nil)
    (repeat (- (1+ (caddr x)) (car x))
       (setq r (1+ r))
     (cond
      ((= (vla-getCellType tblobj r c) acTextCell)    
       (or expos (setq newstring (strcat newstring (if (eq newstring "") "" " ")(vla-gettext tblobj r c))))
       (if (/= (vla-gettext tblobj r c) "")
          (setq thlist (cons (vla-getcelltextheight tblobj r c) thlist)
                col (vla-getcellcontentcolor tblobj r c)
                sty (vla-getcelltextstyle tblobj r c)))
      )
      ((= (vla-getCellType tblobj r c) acBlockCell)
       (if expos (setq mb T))
       (setq expos (vl-position (list r c) (mapcar '(lambda (x)(cdr (assoc "Position" x))) binfo)) newstring nil thlist nil col nil sty nil)
     ))
    )
   (and newstring (/= newstring "")(vla-settext tblobj (car x) (cadr x) newstring))
   (if thlist (vla-setcelltextheight tblobj (car x)(cadr x)(apply 'max thlist)))
   (and newstyle col (vla-setcellcontentcolor tblobj (car x)(cadr x) col))
   (and newstyle sty (vla-setcelltextstyle tblobj (car x)(cadr x) sty))
   (and newstyle (vla-setcellalignment tblobj (car x) (cadr x) acMiddleCenter))
   (vla-mergecells tblobj (car x) (caddr x) (cadr x) (cadddr x))
   (if expos
    (progn
     (vla-setcelltype tblobj (car x) (cadr x) acBlockCell)
     (vla-SetBlockTableRecordId tblobj (car x) (cadr x) (cdr (assoc "ObjID" (nth expos binfo))) :vlax-false)
     (mapcar
     '(lambda (y)
      (vla-setblockattributevalue tblobj (car x) (cadr x) (car y) (cdr y)))
      (cdr (assoc "Attributes" (nth expos binfo))))
     (vla-SetBlockScale tblobj (car x) (cadr x) (cdr (assoc "Scale" (nth expos binfo))))))
 )
 vmergelist
)
)
;-------------------------------------------------------------------------------------------------------------------------
(setq i -1)
(mapcar
 '(lambda (x)
   (vla-setcolumnwidth tblobj (setq i (1+ i)) x)
 )
 colwidths
)

(setq i -1)
(mapcar
 '(lambda (x)
   (vla-setrowheight tblobj (setq i (1+ i)) x)
 )
 rowheights
)
(vla-put-regeneratetablesuppressed tblobj :vlax-false)
(vla-rotate tblobj p0 (- (* 2 pi) (getvar 'viewtwist)))
(if (= supkword "No")
(setq RowTypes (list acTitleRow acHeaderRow acDataRow) r 0)
(setq RowTypes (list acDataRow) r 1)
)

(setq c (vla-getrowtype tblobj r))
(if newstyle
 (progn
 (mapcar
  '(lambda (RowType / thlist ts)
     (while (/= c RowType)
          (setq r (1+ r) c (vla-getrowtype tblobj r))
     )
    (mapcar
     '(lambda (x)
        (if (= (cadr (assoc "Position" x)) r)
          (setq thlist (cons (cdr (assoc "Height" x)) thlist)
                ts (cdr (assoc "StyleName" x)))
        )
      )
       tinfo
     )
     (vla-settextheight newstyle RowType (apply 'max thlist))
     (vla-settextstyle newstyle RowType ts)
   )
    RowTypes
 )
 (vla-setgridcolor newstyle 63 7 (nth 2 (car colorlst)))
  (vla-setAlignment newstyle 7 acMiddleCenter)
 )
)
(princ "\nConversion Complete")
(if MB
 (alert
  "\nMultiple Blocks were detected during an attempt to merge cells.
  \nBecause multiple blocks are not allowed in a single cell, blocks were deleted.
  \nUndo Recommended - Please fix the table and try again."))
(mapcar '(lambda (x)(and x (not (vlax-object-released-p x))(vlax-release-object x))) (list ssitem)) 
(setq *error* oerror)
(vla-EndUndoMark ActDoc)
(princ)
);defun

