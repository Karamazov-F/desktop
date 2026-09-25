# Live end-to-end check of the hover composer dock against the REAL app.
# Launches app/main.js detached, moves the physical cursor onto the character,
# and screenshots the dock area: pill must appear without focus theft, stay
# while the pointer rests on it, and close after the leave grace period.
# Usage: powershell -File scripts/verify_hover_live.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class U32 {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
}
"@

function Click($x, $y) {
  [U32]::SetCursorPos($x, $y) | Out-Null
  Start-Sleep -Milliseconds 80
  [U32]::mouse_event(0x02, 0, 0, 0, 0)  # LEFTDOWN
  Start-Sleep -Milliseconds 50
  [U32]::mouse_event(0x04, 0, 0, 0, 0)  # LEFTUP
}

function PressVoiceHotkey() {
  # Ctrl+` (VK_CONTROL 0x11, VK_OEM_3 0xC0)
  [U32]::keybd_event(0x11, 0, 0, 0)
  Start-Sleep -Milliseconds 40
  [U32]::keybd_event(0xC0, 0, 0, 0)
  Start-Sleep -Milliseconds 40
  [U32]::keybd_event(0xC0, 0, 2, 0)     # KEYEVENTF_KEYUP
  Start-Sleep -Milliseconds 40
  [U32]::keybd_event(0x11, 0, 2, 0)
}

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "comfy\verify"
New-Item -ItemType Directory -Force $out | Out-Null

function Shot($name, $x, $y, $w, $h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($x, $y, 0, 0, $bmp.Size)
  $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

# Pet window geometry: spawn = primary work area right/bottom inset 40.
$settings = Get-Content (Join-Path $env:APPDATA "desktop-pet-custom\desktop-pet-custom\settings.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$pack = Get-Content (Join-Path $root "packs\$($settings.packId)\pack.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$winW = [int]$pack.size.width + 32
$winH = [int]$pack.size.height + 32 + 16 + 240
$work = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$petX = $work.X + $work.Width - $winW - 40
$petY = $work.Y + $work.Height - $winH - 40
$charCX = $petX + [int]($winW / 2)
$charCY = $petY + $winH - 16 - [int]($pack.size.height / 2)   # character center
$dockTop = $petY + $winH - 34
$pillCY = $dockTop + 8 + 25                                  # pill vertical center
Write-Host "pack=$($settings.packId) pet=($petX,$petY ${winW}x$winH) char=($charCX,$charCY) pillY=$pillCY"

# Restart the real app.
Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*desktop-pet-custom*" } | Stop-Process -Force
Start-Sleep -Milliseconds 800
$appOut = Join-Path $out "live_app.out"; $appErr = Join-Path $out "live_app.err"
$proc = Start-Process -FilePath (Join-Path $root "app\node_modules\electron\dist\electron.exe") `
  -ArgumentList "." -WorkingDirectory (Join-Path $root "app") `
  -RedirectStandardOutput $appOut -RedirectStandardError $appErr -PassThru
Write-Host "app pid=$($proc.Id); settling 8s (load + prewarm)..."
Start-Sleep -Seconds 8

$result = [ordered]@{ ok = $true }
try {
  $fgBefore = [U32]::GetForegroundWindow()

  # 1) hover the character -> pill must appear
  [U32]::SetCursorPos($charCX, $charCY) | Out-Null
  Start-Sleep -Milliseconds 700
  Shot "live_hover_pill.png" ($charCX - 190) ($dockTop - 120) 380 220
  $fgDuringHover = [U32]::GetForegroundWindow()
  $result.focusStealOnHover = $fgDuringHover -ne $fgBefore

  # 2) rest on the pill past the close grace -> must stay open
  [U32]::SetCursorPos($charCX, $pillCY) | Out-Null
  Start-Sleep -Milliseconds 650
  Shot "live_hover_hold.png" ($charCX - 190) ($dockTop - 120) 380 220

  # 3) leave far away -> pill must close after the grace period
  [U32]::SetCursorPos($work.X + 120, $work.Y + 120) | Out-Null
  Start-Sleep -Milliseconds 1100
  Shot "live_hover_gone.png" ($charCX - 190) ($dockTop - 120) 380 220
  $fgAfter = [U32]::GetForegroundWindow()
  $result.focusStealTotal = ($fgDuringHover -ne $fgBefore) -or ($fgAfter -ne $fgBefore)
  $result.fgBefore = $fgBefore; $result.fgHover = $fgDuringHover; $result.fgAfter = $fgAfter

  # 4) hotkey voice with the cursor parked AWAY from the pet: the collapsed
  #    pill must still appear with a red mic (state-driven), without focus
  #    theft, and tidy itself after the cycle ends.
  $fgPreVoice = [U32]::GetForegroundWindow()
  PressVoiceHotkey
  Start-Sleep -Milliseconds 900
  Shot "live_voice_hot.png" ($charCX - 190) ($dockTop - 120) 380 220
  $fgVoice = [U32]::GetForegroundWindow()
  $result.focusStealOnVoice = $fgVoice -ne $fgPreVoice
  PressVoiceHotkey
  Start-Sleep -Milliseconds 1600
  Shot "live_voice_done.png" ($charCX - 190) ($dockTop - 120) 380 220

  # 5) expanded close semantics: hover -> pill -> click pencil -> expanded.
  #    Clicking the PET must keep it; clicking far outside must close it.
  [U32]::SetCursorPos($charCX, $charCY) | Out-Null
  Start-Sleep -Milliseconds 600
  Click ($charCX - 24) $pillCY          # pencil (left button in the pill)
  Start-Sleep -Milliseconds 600
  Shot "live_expanded.png" ($charCX - 190) ($dockTop - 120) 380 220
  Click $charCX $charCY                 # click the pet itself -> must stay
  Start-Sleep -Milliseconds 450
  Shot "live_expanded_stay.png" ($charCX - 190) ($dockTop - 120) 380 220
  Click ($work.X + [int]($work.Width / 2)) ($work.Bottom - 60)  # empty desktop
  Start-Sleep -Milliseconds 600
  Shot "live_expanded_closed.png" ($charCX - 190) ($dockTop - 120) 380 220
} finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
  Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*desktop-pet-custom*" } | Stop-Process -Force -ErrorAction SilentlyContinue
}
$result | ConvertTo-Json -Compress | Write-Host
Write-Host "shots: live_hover_pill/hold/gone + live_voice_hot/done + live_expanded/stay/closed in $out"
