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
  Profile        = 'Private','Domain','Public'
}

New-NetFirewallRule -DisplayName 'NullReferMusic API 8787' -LocalPort 8787 @params -ErrorAction SilentlyContinue | Out-Null
New-NetFirewallRule -DisplayName 'NullReferMusic Metro 8081' -LocalPort 8081 @params -ErrorAction SilentlyContinue | Out-Null

# Update profile on existing rules (first run may have been Private-only).
Get-NetFirewallRule -DisplayName 'NullReferMusic API 8787','NullReferMusic Metro 8081' -ErrorAction SilentlyContinue |
  Set-NetFirewallRule -Profile Private,Domain,Public -Enabled True -ErrorAction SilentlyContinue | Out-Null

Write-Host 'Firewall: inbound TCP 8787 and 8081 allowed (Private, Domain, Public).'
Write-Host 'If phone still cannot reach PC on Wi-Fi, try phone hotspot or set NRM_EXPO_TUNNEL=1 for Metro.'
