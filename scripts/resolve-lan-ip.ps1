. "$PSScriptRoot\Get-NrmLanIp.ps1"
$best = Get-NrmLanIp
if ($best -and $best.Ip) { Write-Output ($best.Ip.Trim()) }
