# Quick LAN / firewall / port check for Expo Go + API dev.
. "$PSScriptRoot\Get-NrmLanIp.ps1"

Write-Host ''
Write-Host '=== NullReferMusic — Expo Go LAN diagnose ===' -ForegroundColor Cyan

$best = Get-NrmLanIp
if ($best) {
  Write-Host ('Recommended PC IP: {0}  ({1})' -f $best.Ip, $best.Alias) -ForegroundColor Green
  Write-Host ('  Expo Go URL:  exp://{0}:8081' -f $best.Ip)
  Write-Host ('  API health:   http://{0}:8787/api/health' -f $best.Ip)
} else {
  Write-Host 'No suitable LAN IP found (check Wi-Fi + default gateway).' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'All active interfaces (gateway, non-virtual):'
foreach ($n in Get-NetIPConfiguration -ErrorAction SilentlyContinue) {
  if (-not $n.IPv4DefaultGateway) { continue }
  if (-not $n.NetAdapter -or $n.NetAdapter.Status -eq 'Disconnected') { continue }
  $ip = $n.IPv4Address.IPAddress
  if (-not $ip) { continue }
  $virt = Test-NrmVirtualInterface $n.InterfaceAlias
  $tag = if ($virt) { '[skip virtual]' } else { '[candidate]' }
  Write-Host ('  {0,-40} {1,-16} {2}' -f $n.InterfaceAlias, $ip, $tag)
}

function Test-PortListen {
  param([int]$Port)
  $lines = netstat -ano 2>$null | Select-String ":$Port\s" | Select-String 'LISTENING'
  return [bool]$lines
}

Write-Host ''
Write-Host 'Listening on this PC:'
Write-Host ('  TCP 8081 (Metro):  {0}' -f (Test-PortListen 8081))
Write-Host ('  TCP 8787 (API):    {0}' -f (Test-PortListen 8787))

Write-Host ''
Write-Host 'On the phone (same Wi-Fi):'
Write-Host '  1) Open Chrome: http://<PC_IP>:8787/api/health  -> should show JSON'
Write-Host '  2) Do NOT use http://<PC_IP>:8081 for Expo Go (web-only). Use exp:// in Expo Go app.'
Write-Host '  3) If (1) fails: run scripts\Open-DevFirewall.ps1 as Administrator.'
Write-Host '     Domain PC: Set-Wifi-Private may be blocked by GPO — that is OK.'
Write-Host '  4) If (1) fails on phone (covian AP isolation): Start-CovianWifi-Dev.bat'
Write-Host '  5) If (1) works but Expo Go fails: watch NRM Expo Go window when you reload.'
Write-Host ''
