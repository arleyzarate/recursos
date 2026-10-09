@echo off
setlocal
cd /d "%~dp0"
echo Actualizando comandos de Recursos...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$directorio = (Get-Location).Path; $nombres = @(Get-ChildItem -LiteralPath $directorio -File -Filter '*.html' | Where-Object { $_.Name -ine 'index.html' } | Sort-Object Name | ForEach-Object { $_.Name }); $json = ConvertTo-Json -InputObject $nombres -Compress; $ruta = Join-Path $directorio 'archivos.js'; Set-Content -LiteralPath $ruta -Value ('window.RECURSOS_ARCHIVOS = ' + $json + ';') -Encoding UTF8; Write-Host ('Archivos HTML disponibles: ' + $nombres.Count)"
if errorlevel 1 (
  echo No se pudo actualizar la lista. Puede editar archivos.js manualmente.
  pause
  exit /b 1
)
echo Lista actualizada. Recargue index.html si ya estaba abierto.
pause
