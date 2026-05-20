# List LAN IPs (warn if multiple — Expo QR may pick wrong NIC).
. "$PSScriptRoot\Get-NrmLanIp.ps1"

Write-Host ''
Write-Host '=== Active LAN interfaces ===' -ForegroundColor Cyan
$list = @()
foreach ($n in Get-NetIPConfiguration -ErrorAction SilentlyContinue) {
  if (-not $n.IPv4DefaultGateway) { continue }
  if (-not $n.NetAdapter -or $n.NetAdapter.Status -eq 'Disconnected') { continue }
  $ip = $n.IPv4Address.IPAddress
  if (-not $ip -or $ip -like '127.*') { continue }
  $virt = Test-NrmVirtualInterface $n.InterfaceAlias
  $list += [pscustomobject]@{ Alias = $n.InterfaceAlias; IP = $ip; Skip = $virt }
  $tag = if ($virt) { '[virtual, ignored]' } else { '[used for Expo]' }
  Write-Host ('  {0,-36} {1,-16} {2}' -f $n.InterfaceAlias, $ip, $tag)
}

$best = Get-NrmLanIp
if ($best) {
  Write-Host ''
  Write-Host ('Selected for Expo: {0} ({1})' -f $best.Ip, $best.Alias) -ForegroundColor Green
}

$real = @($list | Where-Object { -not $_.Skip })
if ($real.Count -gt 1) {
  Write-Host ''
  Write-Host '[WARN] Multiple networks. For phone hotspot:' -ForegroundColor Yellow
  Write-Host '  Disconnect corp Wi-Fi on PC, or Expo QR may show wrong IP (10.x).' -ForegroundColor Yellow
}
Write-Host ''
