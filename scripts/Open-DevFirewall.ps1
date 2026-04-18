# Opens Windows Firewall inbound TCP for Metro (8081) and NullReferMusic API (8787).
# Run PowerShell as Administrator once.

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Error 'Run this script as Administrator (right-click PowerShell -> Run as administrator).'
  exit 1
}

$params = @{
  Direction      = 'Inbound'
  Action         = 'Allow'
  Protocol       = 'TCP'
  Profile        = 'Private','Domain'
}

New-NetFirewallRule -DisplayName 'NullReferMusic API 8787' -LocalPort 8787 @params -ErrorAction SilentlyContinue | Out-Null
New-NetFirewallRule -DisplayName 'NullReferMusic Metro 8081' -LocalPort 8081 @params -ErrorAction SilentlyContinue | Out-Null

Write-Host 'Firewall: allowed inbound TCP 8787 and 8081 (Private/Domain profile).'
Write-Host 'If the phone still cannot connect, set Wi-Fi to Private network or allow Public for these ports.'
