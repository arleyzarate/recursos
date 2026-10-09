@echo off
setlocal
cd /d "%~dp0"
echo Actualizando archivos disponibles en Recursos...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; $excluidos = '^(index([.]|$)|leame([._ -]|$)|readme([._ -]|$)|actualizar([._ -]|$)|archivos([._ -]|$)|palabras([._ -]|$)|catalogo([._ -]|$)|license([.]|$)|[.]nojekyll$|[.]gitignore$|[.]ds_store$|recursos_web_arley_zarate([._ -]|$))'; $lista = @(Get-ChildItem -LiteralPath (Get-Location).Path -File | Where-Object { $_.Name -notmatch $excluidos -and $_.Name -notlike '.*' } | Sort-Object Name | ForEach-Object { $_.Name }); $json = ConvertTo-Json -InputObject $lista -Compress; Set-Content -LiteralPath 'archivos.js' -Value ('window.RECURSOS_ARCHIVOS = ' + $json + ';') -Encoding UTF8; Write-Host ('Archivos disponibles: ' + $lista.Count)"
if errorlevel 1 (
  echo No se pudo actualizar archivos.js.
  pause
  exit /b 1
)
echo Catálogo actualizado. Abra o recargue index.html.
pause
