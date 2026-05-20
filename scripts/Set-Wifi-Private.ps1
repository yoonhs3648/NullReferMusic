# Try to set Wi-Fi to Private. SKIPPED on domain/GPO PCs (not required if firewall allows Domain/Public).
$ErrorActionPreference = 'Stop'

$wifi = Get-NetConnectionProfile | Where-Object {
  $_.InterfaceAlias -match 'Wi-?Fi|Wireless|WLAN' -and $_.IPv4Connectivity -eq 'Internet'
} | Select-Object -First 1

if (-not $wifi) {
  Write-Warning 'No active Wi-Fi profile found.'
  exit 1
}

$cat = [string]$wifi.NetworkCategory
$name = $wifi.InterfaceAlias

Write-Host ("Wi-Fi profile: {0}  Category: {1}" -f $name, $cat)

if ($cat -eq 'Private') {
  Write-Host '[OK] Already Private. No change needed.' -ForegroundColor Green
  exit 0
}

if ($cat -eq 'DomainAuthenticated') {
  Write-Host '[OK] DomainAuthenticated (company PC). Skip Private change.' -ForegroundColor Green
  Write-Host '     Open-DevFirewall.ps1 already allows Domain + Public + Private.' -ForegroundColor DarkGray
  exit 0
}

try {
  Set-NetConnectionProfile -InterfaceIndex $wifi.InterfaceIndex -NetworkCategory Private -ErrorAction Stop
  Write-Host ('[OK] Set to Private: {0}' -f $name) -ForegroundColor Green
  exit 0
} catch {
  Write-Host '[SKIP] Cannot change NetworkCategory (GPO / need Admin).' -ForegroundColor Yellow
  Write-Host ('       Reason: {0}' -f $_.Exception.Message)
  Write-Host '[OK] Continue if Open-DevFirewall.ps1 succeeded (Domain/Public rules).' -ForegroundColor Green
  exit 0
}
