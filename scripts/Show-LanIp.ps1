# Prints IPv4 addresses for interfaces that have a default gateway (usually your active Wi-Fi / Ethernet).

Write-Host ""
Write-Host "=== PC LAN IP (same Wi-Fi as phone) ===" -ForegroundColor Cyan

$found = $false
foreach (
  $n in Get-NetIPConfiguration |
    Where-Object { $null -ne $_.IPv4DefaultGateway -and $_.NetAdapter -and $_.NetAdapter.Status -ne 'Disconnected' }
) {
  $ip = $n.IPv4Address.IPAddress
  if ($ip) {
    Write-Host ("  " + $n.InterfaceAlias + " -> " + $ip)
    Write-Host ("  API test in phone browser: http://" + $ip + ":8787/api/health")
    Write-Host ""
    $found = $true
  }
}

if (-not $found) {
  Write-Host "No active gateway interface found. All non-loopback IPv4:"
  Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '127.*' } |
    Format-Table InterfaceAlias, IPAddress -AutoSize
}

Write-Host "In the app: Download server = http://<PC_IP>:8787 (save, then connection test)." -ForegroundColor Gray
Write-Host ""
