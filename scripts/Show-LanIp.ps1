# Prints IPv4 addresses for interfaces that have a default gateway (usually your active Wi-Fi / Ethernet).

$here = $PSScriptRoot
. (Join-Path $here 'LanHint.ps1')

Get-LanHintLines | ForEach-Object { Write-Output $_ }
