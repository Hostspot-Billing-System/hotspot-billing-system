param(
  [string]$LocalHost = $env:PGHOST,
  [int]$LocalPort = $(if ($env:PGPORT) { [int]$env:PGPORT } else { 5432 }),
  [string]$LocalUser = $(if ($env:PGUSER) { $env:PGUSER } else { 'postgres' }),
  [string]$LocalDb = $(if ($env:PGDATABASE) { $env:PGDATABASE } else { 'hotspot_billing' }),
  [string]$RailwayDatabaseUrl = $env:RAILWAY_DATABASE_URL,
  [string]$PgBin = "C:\Program Files\PostgreSQL\18\bin"
)

$ErrorActionPreference = 'Stop'

function Require-File([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Missing $Label at: $Path"
  }
}

$pgDump = Join-Path $PgBin 'pg_dump.exe'
$pgRestore = Join-Path $PgBin 'pg_restore.exe'
$psql = Join-Path $PgBin 'psql.exe'

Require-File $pgDump 'pg_dump'
Require-File $pgRestore 'pg_restore'
Require-File $psql 'psql'

if (-not $LocalHost -or $LocalHost.Trim() -eq '') { $LocalHost = 'localhost' }

if (-not $RailwayDatabaseUrl -or $RailwayDatabaseUrl.Trim() -eq '') {
  $RailwayDatabaseUrl = Read-Host -Prompt 'Enter Railway DATABASE_URL (postgresql://...)'
}

if (-not $RailwayDatabaseUrl -or $RailwayDatabaseUrl.Trim() -eq '') {
  throw 'RailwayDatabaseUrl is required'
}

$dumpPath = Join-Path $PSScriptRoot 'local.backup.dump'

Write-Host "Dumping local DB -> $dumpPath" -ForegroundColor Cyan
& $pgDump -h $LocalHost -p $LocalPort -U $LocalUser -d $LocalDb --format=custom --no-owner --no-privileges -f $dumpPath

Write-Host 'Resetting Railway schema (DROP SCHEMA public CASCADE)...' -ForegroundColor Yellow
& $psql $RailwayDatabaseUrl -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"

Write-Host 'Restoring dump to Railway...' -ForegroundColor Cyan
& $pgRestore --no-owner --no-privileges --dbname $RailwayDatabaseUrl $dumpPath

Write-Host 'Done. Your Railway DB now matches local.' -ForegroundColor Green
Write-Host 'Next: set backend DATABASE_URL to the same Railway URL (and PGSSL=true if required).' -ForegroundColor Green
