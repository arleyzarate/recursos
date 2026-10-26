@echo off
setlocal EnableExtensions DisableDelayedExpansion
color 0B
title RenovaRAM - Administracion Windows
set "APPDIR=%LOCALAPPDATA%\RenovaRAM"
set "SCRIPT=%APPDIR%\RenovaRAM.ps1"
:menu
cls
echo.
echo                R E N O V A R A M
echo               por Arley Zarate
echo.
echo          1. Instalar
echo          2. Desinstalar
echo          3. Salir
echo.
choice /C 123 /N /M "    Seleccione una opcion [1-3]: "
if errorlevel 3 exit /b 0
if errorlevel 2 goto uninstall
if errorlevel 1 goto install
goto menu
:install
cls
echo.
echo  RenovaRAM - Instalar
echo.
if not defined LOCALAPPDATA goto nofolder
if exist "%APPDIR%\RenovaRAM.exe" (
  echo  Existe una instalacion EXE anterior.
  echo  Desinstalela primero desde su instalador 2.1.
  goto pausemenu
)
where powershell.exe >nul 2>&1
if errorlevel 1 goto nops
if not exist "%APPDIR%" md "%APPDIR%" >nul 2>&1
if not exist "%APPDIR%" goto nofolder
set "SKIP="
for /f "tokens=1 delims=:" %%L in ('findstr /n /b /c:"::RENOVARAM_SCRIPT_START" "%~f0"') do set "SKIP=%%L"
if not defined SKIP (
 echo  No se encontro el componente integrado.
 goto pausemenu
)
more +%SKIP% "%~f0" > "%SCRIPT%"
if not exist "%SCRIPT%" goto nofolder
powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File "%SCRIPT%" -Mode Install
if errorlevel 1 (
echo.
 echo  Windows no pudo activar el componente. Revise el mensaje anterior.
)
goto pausemenu
:uninstall
cls
echo.
echo  RenovaRAM - Desinstalar
echo.
if not defined LOCALAPPDATA goto nofolder
if exist "%APPDIR%\RenovaRAM.exe" (
 echo  Esta version EXE debe retirarse desde el instalador anterior.
 goto pausemenu
)
if exist "%SCRIPT%" (
  where powershell.exe >nul 2>&1
  if not errorlevel 1 (
    powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File "%SCRIPT%" -Mode Remove
    if errorlevel 1 (
       echo  No se pudo detener el componente. Intente nuevamente.
       goto pausemenu
    )
  )
)
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v RenovaRAM /f >nul 2>&1
if exist "%APPDIR%\RenovaRAM.ps1" del /f /q "%APPDIR%\RenovaRAM.ps1" >nul 2>&1
if exist "%APPDIR%\servidor.pid" del /f /q "%APPDIR%\servidor.pid" >nul 2>&1
rd "%APPDIR%" >nul 2>&1
echo  Inicio automatico retirado.
echo  Si el asistente sigue activo, cierre la sesion de Windows.
goto pausemenu
:nops
echo  PowerShell 5.1 no esta disponible o esta bloqueado.
echo  No se realizara una instalacion incompleta.
goto pausemenu
:nofolder
echo  No se pudo acceder a la carpeta de usuario de Windows.
:pausemenu
echo.
pause
goto menu
::RENOVARAM_SCRIPT_START
param([ValidateSet('Install','Remove','Server')][string]$Mode='Server')
$ErrorActionPreference = 'Stop'
$port = 18867
$folder = Join-Path $env:LOCALAPPDATA 'RenovaRAM'
$pidfile = Join-Path $folder 'servidor.pid'
$runKey = 'Software\Microsoft\Windows\CurrentVersion\Run'
function Decode([string]$value) { return [System.Text.RegularExpressions.Regex]::Unescape($value) }
function Stop-OwnServer {
    if (-not (Test-Path -LiteralPath $pidfile)) { return }
    $candidate = 0
    if (-not [int]::TryParse(([string](Get-Content -LiteralPath $pidfile -TotalCount 1 -ErrorAction SilentlyContinue)),[ref]$candidate)) { return }
    if ($candidate -le 0 -or $candidate -eq $PID) { return }
    try {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$candidate" -ErrorAction Stop
        $cmd = [string]$proc.CommandLine
        if ($cmd.Contains($PSCommandPath) -and $cmd.Contains('-Mode Server')) {
            Stop-Process -Id $candidate -Force -ErrorAction Stop
            Start-Sleep -Milliseconds 300
        }
    } catch {}
}
if ($Mode -eq 'Remove') {
    try { $reg = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($runKey,$true); if ($reg) { $reg.DeleteValue('RenovaRAM',$false); $reg.Close() } } catch {}
    Stop-OwnServer
    try { Remove-Item -LiteralPath $pidfile -Force -ErrorAction SilentlyContinue } catch {}
    Write-Host 'Inicio automatico eliminado. El archivo local puede quitarse al terminar.'
    exit 0
}
if ($Mode -eq 'Install') {
    $policy = Get-ExecutionPolicy -List
    if (@($policy | Where-Object { $_.Scope -in @('MachinePolicy','UserPolicy') -and $_.ExecutionPolicy -eq 'Restricted' }).Count -gt 0) {
        Write-Host 'PowerShell esta restringido por la organizacion. No se realizo la instalacion.'
        exit 4
    }
    if (-not (Test-Path -LiteralPath $folder)) { New-Item -ItemType Directory -Path $folder -Force | Out-Null }
    Stop-OwnServer
    $engine = Join-Path $PSHOME 'powershell.exe'
    $args = '-NoLogo -NoProfile -ExecutionPolicy RemoteSigned -WindowStyle Hidden -File "' + $PSCommandPath + '" -Mode Server'
    $registryValue = '"' + $engine + '" ' + $args
    $reg = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($runKey)
    $reg.SetValue('RenovaRAM', $registryValue, [Microsoft.Win32.RegistryValueKind]::String)
    $reg.Close()
    try {
        $p = Start-Process -FilePath $engine -ArgumentList $args -WindowStyle Hidden -PassThru -ErrorAction Stop
        $ready = $false
        for ($i=0;$i -lt 16;$i++) {
            Start-Sleep -Milliseconds 350
            try {
                $result = Invoke-WebRequest -Uri 'http://127.0.0.1:18867/api/estado' -Headers @{Origin='https://arleyzarate.github.io'} -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
                if ((ConvertFrom-Json $result.Content).agentVersion -eq '2.2') { $ready = $true;break }
            } catch {}
        }
        if (-not $ready) { throw 'El componente no respondio. Compruebe que ninguna version anterior use el puerto 18867.' }
        Write-Host 'RenovaRAM esta conectado. Regrese al navegador y presione Liberar.'
        exit 0
    } catch {
        try { $reg = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($runKey,$true); if ($reg) { $reg.DeleteValue('RenovaRAM',$false); $reg.Close() } } catch {}
        Stop-OwnServer
        Write-Host ('No se pudo iniciar RenovaRAM: ' + $_.Exception.Message)
        exit 5
    }
}
if ($Mode -ne 'Server') { exit 1 }
if (-not (Test-Path -LiteralPath $folder)) { New-Item -ItemType Directory -Path $folder -Force | Out-Null }
Add-Type -ReferencedAssemblies 'System.Windows.Forms' -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;
public static class RenovaNative {
    [StructLayout(LayoutKind.Sequential)]
    public struct MEMORYSTATUSEX {
        public UInt32 dwLength;
        public UInt32 dwMemoryLoad;
        public UInt64 ullTotalPhys;
        public UInt64 ullAvailPhys;
        public UInt64 ullTotalPageFile;
        public UInt64 ullAvailPageFile;
        public UInt64 ullTotalVirtual;
        public UInt64 ullAvailVirtual;
        public UInt64 ullAvailExtendedVirtual;
    }
    [DllImport("kernel32.dll", SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX value);
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern IntPtr OpenProcess(UInt32 access, bool inherit, int pid);
    [DllImport("kernel32.dll", SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool K32EmptyWorkingSet(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool CloseHandle(IntPtr handle);
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern UInt32 GetWindowThreadProcessId(IntPtr hwnd, out UInt32 pid);
}
'@

function Get-MemoryReadout {
    $s = New-Object RenovaNative+MEMORYSTATUSEX
    $s.dwLength = [System.Runtime.InteropServices.Marshal]::SizeOf([type][RenovaNative+MEMORYSTATUSEX])
    if (-not [RenovaNative]::GlobalMemoryStatusEx([ref]$s)) { throw 'Windows no entreg\u00F3 el estado de memoria.' }
    $gib = [double]1073741824
    $total = [math]::Round([double]$s.ullTotalPhys / $gib, 3)
    $available = [math]::Round([double]$s.ullAvailPhys / $gib, 3)
    $used = [math]::Round(([double]$s.ullTotalPhys - [double]$s.ullAvailPhys) / $gib, 3)
    $pct = if($s.ullTotalPhys -gt 0) { [math]::Round(100.0 * ($s.ullTotalPhys - $s.ullAvailPhys) / $s.ullTotalPhys, 2) } else { 0 }
    [ordered]@{ totalGiB=$total; availableGiB=$available; usedGiB=$used; percent=$pct }
}
function Get-RamModules {
    $ret = @()
    try {
        $devices = @(Get-CimInstance -ClassName Win32_PhysicalMemory -ErrorAction Stop | Where-Object { [double]$_.Capacity -gt 0 })
        foreach ($item in $devices) {
            $cap = [math]::Round([double]$item.Capacity / 1073741824, 3)
            if ($cap -le 0) { continue }
            $loc = [string]$item.DeviceLocator
            if ([string]::IsNullOrWhiteSpace($loc)) { $loc = [string]$item.BankLabel }
            if ([string]::IsNullOrWhiteSpace($loc)) { $loc = 'Ubicacion no identificada' }
            $ret += [ordered]@{capacityGiB=$cap;locator=$loc;speedMHz=[int]$item.ConfiguredClockSpeed }
        }
    } catch { }
    return $ret
}
$modules = @(Get-RamModules)
function Get-State {
    $m = Get-MemoryReadout
    if($modules.Count -eq 0) {
        $m['modules'] = @([ordered]@{capacityGiB=$m.totalGiB;locator='Sistema \u00B7 inventario no disponible'})
    } else {
        $m['modules'] = @($modules)
    }
    $m['agentVersion'] = '2.2'
    $m['ok'] = $true
    return $m
}
function Ask-Permission([array]$targets, [double]$used) {
    if ($targets.Count -eq 0) { return $true }
    $names = (@($targets | ForEach-Object { $_.ProcessName } | Select-Object -Unique | Select-Object -First 5) -join ', ')
    $message = Decode 'RenovaRAM puede recuperar memoria residente de aplicaciones en segundo plano.\r\n\r\nLas aplicaciones continuar\u00E1n abiertas, pero podr\u00EDan tardar un poco en responder.\r\n\r\n\u00BFAutoriza la operaci\u00F3n?'
    $message += "`r`n`r`nAplicaciones: $names"
    $result = [System.Windows.Forms.MessageBox]::Show($message, (Decode 'RenovaRAM | Autorizaci\u00F3n'), [System.Windows.Forms.MessageBoxButtons]::YesNo, [System.Windows.Forms.MessageBoxIcon]::Information, [System.Windows.Forms.MessageBoxDefaultButton]::Button2)
    return ($result -eq [System.Windows.Forms.DialogResult]::Yes)
}
function Optimize-Memory {
    $before = Get-State
    # Explicit user-app allowlist, no Windows services or unknown processes.
    $safeNames = @('chrome','msedge','firefox','brave','opera','vivaldi','Code','notepad++','AcroRd32','FoxitPDFReader','Discord','Teams')
    $session = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
    $foreground = [uint32]0
    try { [void][RenovaNative]::GetWindowThreadProcessId([RenovaNative]::GetForegroundWindow(), [ref]$foreground) } catch {}
    $targets = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
        ($safeNames -contains $_.ProcessName) -and $_.Id -ne $PID -and $_.Id -ne $foreground -and
        $_.SessionId -eq $session -and $_.WorkingSet64 -ge 100663296
    } | Sort-Object WorkingSet64 -Descending | Select-Object -First 14)
    if ($targets.Count -eq 0) {
        return [ordered]@{ok=$true;approved=$true;trimmed=0;eligible=0;residentReducedMiB=0;before=$before;after=(Get-State);message='Sin candidatos aptos'}
    }
    if (-not (Ask-Permission -targets $targets -used $before.usedGiB)) {
        return [ordered]@{ok=$true;approved=$false;trimmed=0;eligible=$targets.Count;residentReducedMiB=0;before=$before;after=$before;message='Operacion cancelada'}
    }
    $success = 0
    $measured = @{}
    foreach ($p in $targets) {
        $handle = [IntPtr]::Zero
        try {
            $fresh = Get-Process -Id $p.Id -ErrorAction Stop
            $original = [double]$fresh.WorkingSet64
            $handle = [RenovaNative]::OpenProcess(0x1100, $false, [int]$p.Id)
            if ($handle -ne [IntPtr]::Zero) {
                if ([RenovaNative]::K32EmptyWorkingSet($handle)) { $success++; $measured[[string]$p.Id] = $original }
            }
        } catch {} finally { if ($handle -ne [IntPtr]::Zero) { [void][RenovaNative]::CloseHandle($handle) } }
    }
    Start-Sleep -Milliseconds 1200
    $residentReduced = 0.0
    foreach ($id in @($measured.Keys)) {
        try { $now = Get-Process -Id ([int]$id) -ErrorAction Stop
              $residentReduced += [math]::Max(0, [double]$measured[$id] - [double]$now.WorkingSet64) } catch {}
    }
    $after = Get-State
    return [ordered]@{ok=$true;approved=$true;trimmed=$success;eligible=$targets.Count;residentReducedMiB=[math]::Round($residentReduced/1048576.0,1);before=$before;after=$after;message='Lectura global posterior completada'}
}
function Write-Http([System.Net.Sockets.TcpClient]$client, [int]$code, [object]$obj, [string]$origin) {
    $json = ConvertTo-Json -InputObject $obj -Depth 8 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $status = if($code -eq 200){'OK'}elseif($code -eq 204){'No Content'}elseif($code -eq 403){'Forbidden'}elseif($code -eq 404){'Not Found'}else{'Bad Request'}
    $headers = "HTTP/1.1 $code $status`r`nContent-Type: application/json; charset=utf-8`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`nCache-Control: no-store`r`nX-Content-Type-Options: nosniff`r`n"
    if($origin -in @('https://arleyzarate.github.io','null')) {
        $headers += "Access-Control-Allow-Origin: $origin`r`nVary: Origin`r`nAccess-Control-Allow-Methods: GET, POST, OPTIONS`r`nAccess-Control-Allow-Headers: Content-Type, X-RenovaRAM-Action`r`nAccess-Control-Allow-Private-Network: true`r`n"
    }
    $headers += "`r`n"
    $stream = $client.GetStream()
    $headbytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
    $stream.Write($headbytes,0,$headbytes.Length)
    if($bytes.Length -gt 0) { $stream.Write($bytes,0,$bytes.Length) }
    $stream.Flush()
}
# Bind solely to loopback: no public network exposure.
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
try {
    $listener.Start(16)
    try { [System.IO.File]::WriteAllText($pidfile, [string]$PID) } catch {}
    while($true) {
        $client = $null
        try {
            $client = $listener.AcceptTcpClient()
            $client.ReceiveTimeout = 6000; $client.SendTimeout = 6000
            $stream = $client.GetStream()
            $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
            $first = $reader.ReadLine()
            if (-not $first -or $first.Length -gt 2048) { continue }
            $parts = $first.Split(' ')
            if($parts.Length -ne 3) { continue }
            $headers = @{}
            for($i=0;$i -lt 55;$i++) {
                $line = $reader.ReadLine()
                if($null -eq $line -or $line -eq '') { break }
                if($line.Length -gt 4096) { break }
                $at = $line.IndexOf(':')
                if($at -gt 0) { $headers[$line.Substring(0,$at).ToLowerInvariant()] = $line.Substring($at+1).Trim() }
            }
            $origin = [string]$headers['origin']
            $hostName = [string]$headers['host']
            # Evita peticiones v\u00EDa nombres arbitrarios (protecci\u00F3n contra DNS rebinding).
            if($hostName -notin @("127.0.0.1:$port", "localhost:$port")) {
                Write-Http $client 403 @{ok=$false;error='Host no autorizado'} ''
                continue
            }
            if($origin -notin @('https://arleyzarate.github.io','null')) {
                Write-Http $client 403 @{ok=$false;error='Origen no autorizado'} ''
                continue
            }
            $method=$parts[0];$route=$parts[1]
            if($method -eq 'OPTIONS') { Write-Http $client 200 @{ok=$true} $origin; continue }
            if($method -eq 'GET' -and $route -eq '/api/estado') {
                Write-Http $client 200 (Get-State) $origin
            } elseif($method -eq 'POST' -and $route -eq '/api/liberar') {
                if([string]$headers['x-renovaram-action'] -ne 'confirmar-2.2') { Write-Http $client 403 @{ok=$false;error='Accion no autorizada'} $origin; continue }
                $length = 0
                [void][int]::TryParse([string]$headers['content-length'],[ref]$length)
                if($length -lt 1 -or $length -gt 64) { Write-Http $client 400 @{ok=$false;error='Solicitud inv\u00E1lida'} $origin; continue }
                $body = New-Object char[] $length
                $got = 0
                while($got -lt $length) { $step=$reader.Read($body,$got,$length-$got); if($step -le 0){break};$got += $step }
                if(($got -ne $length) -or ((-join $body) -ne 'liberar=1')) { Write-Http $client 400 @{ok=$false;error='Operaci\u00F3n no reconocida'} $origin; continue }
                Write-Http $client 200 (Optimize-Memory) $origin
            } else { Write-Http $client 404 @{ok=$false;error='Ruta desconocida'} $origin }
        } catch {
            if($client) { try { Write-Http $client 400 @{ok=$false;error='No se pudo completar la solicitud'} '' } catch {} }
        } finally { if($client) {try{$client.Close()}catch{}} }
    }
} finally {
    try{$listener.Stop()}catch{}
    try{Remove-Item -LiteralPath $pidfile -Force -ErrorAction SilentlyContinue}catch{}
}
