# covian Wi-Fi: API via localtunnel (works) + Metro on PC. No hotspot, no mobile data.
# Phone cannot use exp://PC_IP (AP isolation). Expo live on phone needs ngrok (often blocked).
$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\Get-NrmLanIp.ps1"

function Test-BackendUp {
  try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8787/api/health' -UseBasicParsing -TimeoutSec 3
    return $r.StatusCode -eq 200
  } catch { return $false }
}

function Test-PortListen([int]$Port) {
  $hit = netstat -ano 2>$null | Select-String ":$Port\s" | Select-String 'LISTENING'
  return [bool]$hit
}

Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  covian Wi-Fi (localtunnel API + PC Metro)' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''
Write-Host 'loca.lt on phone = covian Wi-Fi -> internet -> your PC (NOT mobile data).' -ForegroundColor Green
Write-Host 'Direct PC IP (10.x.x.x) = blocked (AP isolation).' -ForegroundColor Yellow
Write-Host 'Expo ngrok = often blocked on corp network.' -ForegroundColor Yellow
Write-Host ''
Write-Host '  [1] API tunnel + PC web dev (recommended, works)' -ForegroundColor Green
Write-Host '  [2] Try Expo ngrok tunnel again (needs NGROK_AUTHTOKEN)'
Write-Host '  [q] Quit'
Write-Host ''
$choice = Read-Host 'Choice'

if ($choice -eq 'q') { exit 0 }

if (Test-PortListen 8081) {
  Write-Host '[WARN] Close NRM Expo Go window first.' -ForegroundColor Yellow
  exit 1
}

# Backend
if (-not (Test-PortListen 8787)) {
  Write-Host '[1] Starting Backend ...' -ForegroundColor Cyan
  Start-Process cmd.exe -ArgumentList '/k', "title NRM Backend && cd /d `"$root\backend`" && mvnw.cmd spring-boot:run" -WindowStyle Normal
  $deadline = (Get-Date).AddSeconds(120)
  while ((Get-Date) -lt $deadline) {
    if (Test-BackendUp) { break }
    Start-Sleep -Seconds 2
  }
  if (-not (Test-BackendUp)) {
    Write-Host '[ERROR] Backend not ready.' -ForegroundColor Red
    exit 1
  }
} else {
  Write-Host '[OK] Backend on :8787' -ForegroundColor Green
}

if ($choice -eq '2') {
  if (-not $env:NGROK_AUTHTOKEN) {
    Write-Host '[WARN] Set NGROK_AUTHTOKEN first (free ngrok.com).' -ForegroundColor Yellow
  }
  $apiUrl = & "$PSScriptRoot\Start-Api-Tunnel.ps1"
  if (-not $apiUrl) { exit 1 }
  $env:EXPO_TUNNEL_TIMEOUT = '180000'
  $cmd = "cd /d `"$root\app`" && set EXPO_PUBLIC_API_BASE_URL=$apiUrl && set EXPO_TUNNEL_TIMEOUT=180000 && npx expo start --tunnel --port 8081"
  Start-Process cmd.exe -ArgumentList '/k', "title NRM Expo Go && $cmd" -WindowStyle Normal
  Write-Host ''
  Write-Host 'If ngrok fails again: corp blocks it. Use choice [1] instead.' -ForegroundColor Yellow
  Write-Host "Phone API: $apiUrl/api/health"
  Write-Host 'Phone Expo: scan tunnel QR'
  exit 0
}

# [1] API tunnel + PC Metro (LAN for PC only)
Write-Host '[2] API tunnel (localtunnel) ...' -ForegroundColor Cyan
$apiUrl = & "$PSScriptRoot\Start-Api-Tunnel.ps1"
if (-not $apiUrl) {
  Write-Host '[ERROR] API tunnel failed.' -ForegroundColor Red
  exit 1
}

Write-Host '[3] Metro for PC (LAN, phone uses tunnel API only) ...' -ForegroundColor Cyan
$best = Get-NrmLanIp
$ip = if ($best) { $best.Ip.Trim() } else { '127.0.0.1' }
$metroCmd = "cd /d `"$root\app`" && set EXPO_PUBLIC_API_BASE_URL=$apiUrl && set REACT_NATIVE_PACKAGER_HOSTNAME=$ip && npx expo start --lan --port 8081"
Start-Process cmd.exe -ArgumentList '/k', "title NRM Expo Go && $metroCmd" -WindowStyle Normal

Write-Host ''
Write-Host '========================================' -ForegroundColor Green
Write-Host '  WHAT WORKS on covian Wi-Fi' -ForegroundColor Green
Write-Host '========================================' -ForegroundColor Green
Write-Host ''
Write-Host 'PC:' -ForegroundColor Yellow
Write-Host '  http://localhost:8081  (UI dev)'
Write-Host ''
Write-Host 'Phone Chrome (API - this is what worked before):' -ForegroundColor Yellow
Write-Host "  $apiUrl/api/health"
Write-Host '  First visit: enter IP on loca.lt page -> Continue'
Write-Host ''
Write-Host 'Phone app (download server URL in app):' -ForegroundColor Yellow
Write-Host "  Save: $apiUrl"
Write-Host '  (app downloader / connection test)'
Write-Host ''
Write-Host 'Phone Expo Go LIVE reload:' -ForegroundColor Red
Write-Host '  NOT via 10.x.x.x. Needs ngrok (choice 2) or IT fix AP isolation.'
Write-Host ''
Write-Host 'Doc: docs\DEV-COVIAN-WIFI.md'
Write-Host ''
