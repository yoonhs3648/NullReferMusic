# Set active Wi-Fi to Private (helps some firewall / discovery policies).
# Run as Administrator if access denied.

$wifi = Get-NetConnectionProfile | Where-Object {
  $_.InterfaceAlias -match 'Wi-?Fi|Wireless|WLAN|무선' -and $_.IPv4Connectivity -eq 'Internet'
} | Select-Object -First 1

if (-not $wifi) {
  Write-Warning 'No active Wi-Fi profile found.'
  exit 1
}

if ($wifi.NetworkCategory -eq 'Private') {
  Write-Host ('Already Private: {0}' -f $wifi.InterfaceAlias) -ForegroundColor Green
  exit 0
}

Set-NetConnectionProfile -InterfaceIndex $wifi.InterfaceIndex -NetworkCategory Private
Write-Host ('Set to Private: {0}' -f $wifi.InterfaceAlias) -ForegroundColor Green
