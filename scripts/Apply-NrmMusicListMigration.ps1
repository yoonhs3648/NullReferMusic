#Requires -Version 5.1
<#
.SYNOPSIS
  nrm_music_list 마이그레이션 + music_list_seed.sql 적용.

.PARAMETER DatabaseUrl
  Supabase Postgres connection URI (NRM_SUPABASE_DATABASE_URL)
#>
param(
    [string]$DatabaseUrl = $env:NRM_SUPABASE_DATABASE_URL
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$MigrationPath = Join-Path $RepoRoot 'supabase\migrations\20260629150000_nrm_music_list.sql'
$SeedPath = Join-Path $RepoRoot 'supabase\music_list_seed.sql'

if (-not $DatabaseUrl) {
    Write-Error "NRM_SUPABASE_DATABASE_URL 또는 -DatabaseUrl 이 필요합니다."
}

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    Write-Error 'psql 이 PATH에 없습니다. Supabase Dashboard SQL Editor에서 수동 실행하세요.'
}

if (-not (Test-Path $SeedPath)) {
    Write-Host 'music_list_seed.sql 없음 — generate-music-list-seed.mjs 실행 중...'
    & node (Join-Path $RepoRoot 'scripts\music-list-data\build.mjs')
    & node (Join-Path $RepoRoot 'scripts\music-list-data-global\build.mjs')
    & node (Join-Path $RepoRoot 'scripts\music-list-data-kr-rap\build.mjs')
    & node (Join-Path $RepoRoot 'scripts\generate-music-list-seed.mjs')
}

Write-Host "Applying migration: $MigrationPath"
& psql $DatabaseUrl -v ON_ERROR_STOP=1 -f $MigrationPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Applying seed: $SeedPath"
& psql $DatabaseUrl -v ON_ERROR_STOP=1 -f $SeedPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'OK: nrm_music_list migration + seed applied.'
exit 0
