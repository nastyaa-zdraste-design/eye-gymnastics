# Запись ролика: кадры снимаются изнутри программы и накладываются на фон.
# Пример: .\promo\rec.ps1 -Name glaza -Flags "--nag=2 --fx=eyes --edge=bottom" -Sec 10 -Mouse jiggle
param(
  [string]$Name = 'scene',
  [string]$Flags = '',
  [int]$Sec = 10,
  [ValidateSet('none', 'jiggle', 'circle')][string]$Mouse = 'jiggle'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$ff = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.2-full_build\bin\ffmpeg.exe"
$rec = "$env:APPDATA\Гимнастика для глаз\rec"
$out = Join-Path $root 'promo\out'

if (-not ([System.Management.Automation.PSTypeName]'Mouse').Type) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Mouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
}
"@
}

function Stop-App {
  Get-CimInstance Win32_Process -Filter "Name='electron.exe'" |
    Where-Object { $_.CommandLine -match '\.exe"\s+\.\s' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Get-Process -Name 'Гимнастика для глаз' -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 2
}

# фон должен уже работать: npx electron promo/bg.js
$bgOn = Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object { $_.CommandLine -match 'bg\.js' }
if (-not $bgOn) { throw 'сначала запусти фон: npx electron promo/bg.js' }

Stop-App
Set-Location $root
Start-Process -FilePath 'npx.cmd' -ArgumentList "electron . $Flags --rec=$Sec" -WindowStyle Hidden

# мышь: лёгкое шевеление, иначе программа решит, что смотрят фильм
$t0 = Get-Date
while (((Get-Date) - $t0).TotalSeconds -lt ($Sec + 6)) {
  $s = ((Get-Date) - $t0).TotalSeconds
  if ($Mouse -eq 'circle') {
    $x = [int](960 + 280 * [Math]::Cos($s * 1.1))
    $y = [int](540 + 190 * [Math]::Sin($s * 1.5))
    [Mouse]::SetCursorPos($x, $y) | Out-Null
    Start-Sleep -Milliseconds 16
  } elseif ($Mouse -eq 'jiggle') {
    [Mouse]::SetCursorPos(900 + ($s % 3), 500) | Out-Null
    Start-Sleep -Milliseconds 400
  } else {
    Start-Sleep -Milliseconds 400
  }
}

Stop-App
$n = (Get-ChildItem $rec -ErrorAction SilentlyContinue | Measure-Object).Count
"кадров: $n"
if ($n -lt 10) { throw 'кадров почти нет — программа не показала окно' }

& $ff -y -loop 1 -framerate 15 -i (Join-Path $out 'bg.png') -framerate 15 -i (Join-Path $rec 'f%04d.png') `
  -filter_complex "[0:v][1:v]overlay=shortest=1,scale=1280:-2,format=yuv420p" `
  -r 30 -c:v libx264 -crf 20 -movflags +faststart (Join-Path $out "$Name.mp4") 2>&1 | Select-Object -Last 1
"готово: promo\out\$Name.mp4"
