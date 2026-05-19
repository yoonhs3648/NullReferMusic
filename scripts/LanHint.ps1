# Shared LAN hint lines for phone + API URL (used by Show-LanIp.ps1).

function Get-LanHintLines {
  $lines = [System.Collections.Generic.List[string]]::new()
  [void]$lines.Add('')
  [void]$lines.Add('=== PC LAN IP (same Wi-Fi as phone) ===')

  $found = $false
  foreach (
    $n in Get-NetIPConfiguration |
      Where-Object { $null -ne $_.IPv4DefaultGateway -and $_.NetAdapter -and $_.NetAdapter.Status -ne 'Disconnected' }
  ) {
    $ip = $n.IPv4Address.IPAddress
    if ($ip) {
      [void]$lines.Add('  ' + $n.InterfaceAlias + ' -> ' + $ip)
      [void]$lines.Add('  API test in phone browser: http://' + $ip + ':8787/api/health')
      [void]$lines.Add('')
      $found = $true
    }
  }

  if (-not $found) {
    [void]$lines.Add('No active gateway interface found. All non-loopback IPv4:')
    $tbl = Get-NetIPAddress -AddressFamily IPv4 |
      Where-Object { $_.IPAddress -notlike '127.*' } |
      Format-Table InterfaceAlias, IPAddress -AutoSize | Out-String -Width 200
    foreach ($row in $tbl -split "`n") { [void]$lines.Add($row) }
  }

  [void]$lines.Add('In the app: Download server = http://<PC_IP>:8787 (save, then connection test).')
  [void]$lines.Add('')
  return ,$lines.ToArray()
}
