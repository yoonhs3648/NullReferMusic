$addrs = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
  $ip = $_.IPAddress
  $ip -match '^192\.168\.' -or
  $ip -match '^10\.' -or
  $ip -match '^172\.(1[6-9]|2[0-9]|3[0-1])\.'
}
$first = $addrs | Select-Object -First 1 -ExpandProperty IPAddress
if ($first) { Write-Output $first }
