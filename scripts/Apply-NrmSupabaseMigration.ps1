#Requires -Version 5.1
<#
.SYNOPSIS
  supabase/migrations + seed.sql 을 Supabase Postgres에 적용.

.PARAMETER DatabaseUrl
  Supabase Dashboard → Project Settings → Database → Connection string (URI)
  예: postgresql://postgres.[ref]:[PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres

.PARAMETER SkipSeed
  seed.sql 적용 생략 (스키마만)
#>
param(
    [string]$DatabaseUrl = $env:NRM_SUPABASE_DATABASE_URL,
    [switch]$SkipSeed
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$MigrationPath = Join-Path $RepoRoot 'supabase\migrations\20260629120000_nrm_initial_schema.sql'
$SeedPath = Join-Path $RepoRoot 'supabase\seed.sql'

if (-not $DatabaseUrl) {
    Write-Error @"
Database URL이 필요합니다.

방법 1) 환경변수:
  `$env:NRM_SUPABASE_DATABASE_URL = 'postgresql://postgres.[ref]:[PASSWORD]@...'

방법 2) 매개변수:
  -DatabaseUrl 'postgresql://...'

Supabase Dashboard → Project Settings → Database → Connection string (URI)
"@
}

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    Write-Error 'psql 이 PATH에 없습니다. PostgreSQL 클라이언트 또는 Supabase Dashboard SQL Editor에서 수동 실행하세요.'
}

Write-Host "Applying schema: $MigrationPath"
& psql $DatabaseUrl -v ON_ERROR_STOP=1 -f $MigrationPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $SkipSeed) {
    if (-not (Test-Path $SeedPath)) {
        Write-Host 'seed.sql 없음 — generate-supabase-seed.mjs 실행 중...'
        & node (Join-Path $RepoRoot 'scripts\generate-supabase-seed.mjs')
    }
    Write-Host "Applying seed: $SeedPath"
    & psql $DatabaseUrl -v ON_ERROR_STOP=1 -f $SeedPath
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host 'OK: Supabase migration applied.'
exit 0
