# Prints one best LAN IPv4 for Expo + phone (stdout only). Used by StartServer.bat.
# Excludes common virtual adapters (Hyper-V, WSL, Docker, VPN, etc.).

function Test-NrmVirtualInterface {
  param([string]$Alias)
  if (-not $Alias) { return $true }
  $a = $Alias.ToLowerInvariant()
  return (
    $a -match 'vethernet|hyper-v|\bwsl\b|virtualbox|vmware|loopback|bluetooth|npcap|tailscale|zerotier|hamachi|tunnel|docker|default switch|host-only'
  )
}

function Get-NrmLanIp {
  $candidates = [System.Collections.Generic.List[object]]::new()

  foreach ($n in Get-NetIPConfiguration -ErrorAction SilentlyContinue) {
    if (-not $n.IPv4DefaultGateway) { continue }
    if (-not $n.NetAdapter -or $n.NetAdapter.Status -eq 'Disconnected') { continue }

    $alias = [string]$n.InterfaceAlias
    if (Test-NrmVirtualInterface $alias) { continue }

    $ip = $n.IPv4Address.IPAddress
    if (-not $ip -or $ip -like '127.*' -or $ip -like '169.254.*') { continue }

    $score = 0
    if ($alias -match 'Wi-?Fi|Wireless|WLAN|무선') { $score += 200 }
    elseif ($alias -match 'Ethernet|이더넷|LAN|로컬') { $score += 80 }

    if ($ip -match '^192\.168\.(43|137|88|89)\.') { $score += 400 }
    elseif ($ip -match '^192\.168\.') { $score += 40 }
    elseif ($ip -match '^10\.' -and $ip -notmatch '^10\.0\.2\.') { $score += 30 }
    elseif ($ip -match '^172\.(1[6-9]|2[0-9]|3[0-1])\.') { $score -= 80 }

    $candidates.Add([pscustomobject]@{ Ip = $ip; Score = $score; Alias = $alias })
  }

  if ($candidates.Count -eq 0) {
    foreach ($row in Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue) {
      $ip = $row.IPAddress
      $alias = [string]$row.InterfaceAlias
      if ($ip -like '127.*' -or $ip -like '169.254.*') { continue }
      if (Test-NrmVirtualInterface $alias) { continue }
      if ($ip -notmatch '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)') { continue }
      $score = 0
      if ($alias -match 'Wi-?Fi|Wireless|WLAN|무선') { $score += 100 }
      if ($ip -match '^172\.(1[6-9]|2[0-9]|3[0-1])\.') { $score -= 80 }
      $candidates.Add([pscustomobject]@{ Ip = $ip; Score = $score; Alias = $alias })
    }
  }

  $best = $candidates | Sort-Object Score -Descending | Select-Object -First 1
  return $best
}

$b = Get-NrmLanIp
if ($b -and $b.Ip) {
  Write-Output ($b.Ip.Trim())
}
