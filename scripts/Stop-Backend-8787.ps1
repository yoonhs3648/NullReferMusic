# Stops whatever process is listening on TCP 8787 (NullReferMusic Spring API).

$conns = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
if (-not $conns) {
  Write-Host 'Nothing is listening on port 8787.'
  exit 0
}

foreach ($c in $conns) {
  $procId = $c.OwningProcess
  $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
  $name = if ($proc) { $proc.ProcessName } else { 'unknown' }
  Write-Host "Stopping PID $procId ($name) on port 8787..."
  Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Milliseconds 500
$still = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
if ($still) {
  Write-Warning 'Port 8787 may still be in use. Close the other window or retry as Administrator.'
  exit 1
}

Write-Host 'Port 8787 is free. Start the backend again.'
