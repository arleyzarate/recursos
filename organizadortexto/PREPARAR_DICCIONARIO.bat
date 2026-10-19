@echo off
setlocal
cd /d "%~dp0"
echo.
echo ===============================================
echo  ORGANIZADOR - DICCIONARIO ESPANOL COLOMBIANO
echo ===============================================
echo.
echo Descarga una sola vez el diccionario Hunspell es_CO

echo y prepara los archivos para Windows y GitHub Pages.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0preparar_diccionario.ps1"
set "RESULTADO=%ERRORLEVEL%"
echo.
if not "%RESULTADO%"=="0" (
  echo No se completo la preparacion. Revise el error anterior.
) else (
  echo Preparacion finalizada. Revise las instrucciones entregadas.
)
echo.
pause
exit /b %RESULTADO%
