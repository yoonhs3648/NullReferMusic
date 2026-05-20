# Expose local API :8787 via localtunnel (corp Wi-Fi AP isolation workaround).
param(
  [int]$Port = 8787,
  [int]$TimeoutSec = 90
)

$ErrorActionPreference = 'Stop'
$outFile = Join-Path $env:TEMP 'nrm_lt_8787_out.txt'
$urlFile = Join-Path $env:TEMP 'nrm_api_tunnel_url.txt'

Remove-Item $outFile, $urlFile -ErrorAction SilentlyContinue

Write-Host "[INFO] Starting API tunnel (localtunnel) on port $Port ..." -ForegroundColor Cyan
Write-Host '[TIP] If URL does not appear below, run: scripts\Start-Api-Tunnel-Window.bat' -ForegroundColor DarkGray

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'cmd.exe'
$psi.Arguments = "/c npx -y localtunnel --port $Port > `"$outFile`" 2>&1"
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$null = [System.Diagnostics.Process]::Start($psi)

$deadline = (Get-Date).AddSeconds($TimeoutSec)
$url = $null
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 1
  if (-not (Test-Path $outFile)) { continue }
  $text = Get-Content $outFile -Raw -ErrorAction SilentlyContinue
  if ($text -match '(https://[a-z0-9-]+\.loca\.lt)') {
    $url = $Matches[1].TrimEnd('/')
    break
  }
}

if (-not $url) {
  Write-Error "Could not read localtunnel URL within ${TimeoutSec}s. Check corp network allows npx/localtunnel."
  exit 1
}

Set-Content -Path $urlFile -Value $url -Encoding ASCII -NoNewline
Write-Host "[OK] API tunnel: $url" -ForegroundColor Green
Write-Host "     Health: $url/api/health"
Write-Host "     URL file: $urlFile"
Write-Output $url
