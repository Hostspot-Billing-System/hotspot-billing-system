param(
  [string]$LocalHost = $env:PGHOST,
  [int]$LocalPort = $(if ($env:PGPORT) { [int]$env:PGPORT } else { 5432 }),
  [string]$LocalUser = $(if ($env:PGUSER) { $env:PGUSER } else { 'postgres' }),
  [string]$LocalDb = $(if ($env:PGDATABASE) { $env:PGDATABASE } else { 'hotspot_billing' }),
  [string]$RemoteDatabaseUrl = $(if ($env:DATABASE_URL) { $env:DATABASE_URL } elseif ($env:DATABASE_PUBLIC_URL) { $env:DATABASE_PUBLIC_URL } else { $env:REMOTE_DATABASE_URL }),
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

if (-not $RemoteDatabaseUrl -or $RemoteDatabaseUrl.Trim() -eq '') {
  $RemoteDatabaseUrl = Read-Host -Prompt 'Enter remote PostgreSQL DATABASE_URL (postgresql://...)'
}

if (-not $RemoteDatabaseUrl -or $RemoteDatabaseUrl.Trim() -eq '') {
  throw 'RemoteDatabaseUrl is required'
}

$dumpPath = Join-Path $PSScriptRoot 'local.backup.dump'

Write-Host "Dumping local DB -> $dumpPath" -ForegroundColor Cyan
& $pgDump -h $LocalHost -p $LocalPort -U $LocalUser -d $LocalDb --format=custom --no-owner --no-privileges -f $dumpPath

Write-Host 'Resetting remote schema (DROP SCHEMA public CASCADE)...' -ForegroundColor Yellow
& $psql $RemoteDatabaseUrl -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"

Write-Host 'Restoring dump to remote database...' -ForegroundColor Cyan
& $pgRestore --no-owner --no-privileges --dbname $RemoteDatabaseUrl $dumpPath

Write-Host 'Done. Your remote database now matches local.' -ForegroundColor Green
