param(
  [string]$LanIp = '127.0.0.1',
  [int]$Port = 8081
)

$exp = "exp://${LanIp}:${Port}"
$bad = "http://${LanIp}:${Port}"

Write-Host ''
Write-Host '========== Expo Go (phone) ==========' -ForegroundColor Cyan
Write-Host $exp -ForegroundColor Green
Write-Host 'Open Expo Go app -> Scan QR code (in app)' -ForegroundColor Yellow
Write-Host "Do NOT use: $bad" -ForegroundColor DarkYellow
Write-Host '====================================' -ForegroundColor Cyan
Write-Host ''
