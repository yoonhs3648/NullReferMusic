#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
$Tag = 'espeak-ng-v2'
$Repo = 'yoonhs3648/NullReferMusic'
$Base = "https://github.com/$Repo/releases/download/$Tag"
$files = @('espeak-ng', 'libespeak-ng.so', 'espeak-data.zip')
$minBytes = @{
    'espeak-ng' = 50000
    'libespeak-ng.so' = 200000
    'espeak-data.zip' = 5000000
}

foreach ($name in $files) {
    $url = "$Base/$name"
    try {
        $resp = Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing
        $len = [long]$resp.Headers['Content-Length']
        $min = $minBytes[$name]
        if ($len -lt $min) {
            Write-Host "FAIL $name too small ($len < $min)"
            exit 1
        }
        Write-Host "OK $name ($len bytes)"
    } catch {
        Write-Host "FAIL $url -> $($_.Exception.Message)"
        exit 1
    }
}

Write-Host 'All eSpeak NG release assets reachable.'
