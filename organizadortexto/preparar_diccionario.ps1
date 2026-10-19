# Organizador de texto tecnico: instalacion local del diccionario es_CO.
# Descarga diccionario RLA-ES / LibreOffice (GPLv3+, LGPLv3+ o MPL 1.1+)
# y Typo.js (licencia BSD modificada).
# No modifica archivos del sistema ni instala programas.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$folder = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $folder

# TLS 1.2 en versiones de Windows PowerShell donde no este activo.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function DescargarArchivo([string]$Url, [string]$Nombre, [int64]$MinBytes) {
    $ruta = Join-Path $folder $Nombre
    Write-Host ('Descargando: ' + $Nombre)
    Invoke-WebRequest -Uri $Url -UseBasicParsing -OutFile $ruta -TimeoutSec 90
    if (-not (Test-Path -LiteralPath $ruta)) { throw ('No fue posible descargar: ' + $Nombre) }
    $bytes = (Get-Item -LiteralPath $ruta).Length
    if ($bytes -lt $MinBytes) { throw ('Archivo incompleto: ' + $Nombre + ' (' + $bytes + ' bytes)') }
    return $ruta
}

try {
    $aff = DescargarArchivo 'https://raw.githubusercontent.com/LibreOffice/dictionaries/master/es/es_CO.aff' 'es_CO.aff' 20000
    $dic = DescargarArchivo 'https://raw.githubusercontent.com/LibreOffice/dictionaries/master/es/es_CO.dic' 'es_CO.dic' 100000
    $motor = DescargarArchivo 'https://raw.githubusercontent.com/cfinke/Typo.js/master/typo/typo.js' 'typo.js' 15000
    $licencia = DescargarArchivo 'https://raw.githubusercontent.com/LibreOffice/dictionaries/master/es/LICENSE.md' 'LICENCIA_DICCIONARIO_ES_CO.md' 200
    $licenciaMotor = DescargarArchivo 'https://raw.githubusercontent.com/cfinke/Typo.js/master/license.txt' 'LICENCIA_TYPO_JS.txt' 200

    $affText = [IO.File]::ReadAllText($aff, [Text.Encoding]::UTF8)
    $dicText = [IO.File]::ReadAllText($dic, [Text.Encoding]::UTF8)
    $motorText = [IO.File]::ReadAllText($motor, [Text.Encoding]::UTF8)
    if (-not $affText.Contains('SET UTF-8')) { throw 'El archivo es_CO.aff no contiene la configuracion UTF-8 esperada.' }
    if ($dicText -notmatch '^\s*\d+') { throw 'El archivo es_CO.dic no comienza con un contador de palabras.' }
    if ($motorText -notmatch 'Typo') { throw 'El archivo typo.js no contiene el motor esperado.' }

    # Base64 evita problemas de comillas, barras y tildes dentro del JavaScript.
    # Los dos recursos quedan integrados en UN archivo .js y se pueden usar con file://.
    $affBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($aff))
    $dicBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($dic))
    $contenido = '/* Diccionario es_CO de RLA-ES / LibreOffice; consulte LICENCIA_DICCIONARIO_ES_CO.md. */' + "`r`n" +
        'window.DICCIONARIO_ES_CO = {' + "`r`n" +
        '  affBase64: "' + $affBase64 + '",' + "`r`n" +
        '  dicBase64: "' + $dicBase64 + '"' + "`r`n" +
        '};' + "`r`n"
    $rutaJs = Join-Path $folder 'diccionario_es_CO.js'
    [IO.File]::WriteAllText($rutaJs, $contenido, (New-Object System.Text.UTF8Encoding($false)))
    if ((Get-Item $rutaJs).Length -lt 150000) { throw 'La generacion del diccionario_js ha resultado demasiado pequena.' }

    Write-Host ''
    Write-Host 'CORRECTO: es_CO completo descargado y diccionario_es_CO.js generado.' -ForegroundColor Green
    Write-Host 'Para GitHub, suba como minimo estos archivos al mismo directorio:'
    Write-Host '  - organizador_texto.html'
    Write-Host '  - typo.js'
    Write-Host '  - diccionario_es_CO.js'
    Write-Host '  - LICENCIA_DICCIONARIO_ES_CO.md'
    Write-Host '  - LICENCIA_TYPO_JS.txt'
    Write-Host 'Guarde tambien es_CO.aff y es_CO.dic como fuente original del diccionario.'
    exit 0
} catch {
    Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Revise que tenga conexion a Internet y acceso a raw.githubusercontent.com.'
    exit 1
}
