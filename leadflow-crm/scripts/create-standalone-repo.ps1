# Extract leadflow-crm/ as a standalone Git repository (Windows PowerShell)
#
# Usage:
#   .\scripts\create-standalone-repo.ps1 [-Target <path>]
#
# Default target: ..\leadflow-crm-standalone

param(
    [string]$Target = "..\leadflow-crm-standalone"
)

$ErrorActionPreference = "Stop"

# Find the git root
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

$gitRoot = git rev-parse --show-toplevel
$sourceRel = "leadflow-crm"
$sourceAbs = Join-Path $gitRoot $sourceRel

if (-not (Test-Path $sourceAbs)) {
    Write-Error "Source not found: $sourceAbs"
    exit 1
}

# Resolve absolute target path
if (-not (Test-Path $Target)) {
    New-Item -ItemType Directory -Path $Target -Force | Out-Null
}
$targetAbs = (Resolve-Path $Target).Path

if ((Get-ChildItem $targetAbs -Force | Measure-Object).Count -gt 0) {
    Write-Error "Target directory is not empty: $targetAbs"
    Write-Host "Please choose an empty directory or remove its contents."
    exit 1
}

Write-Host "Extracting $sourceRel -> $targetAbs ..." -ForegroundColor Cyan

# Use git archive to get clean snapshot (tracked files only)
Set-Location $gitRoot
$tarball = Join-Path $env:TEMP "leadflow-extract.tar"
git archive HEAD $sourceRel --output=$tarball
tar -xf $tarball -C $targetAbs --strip-components=1
Remove-Item $tarball

Write-Host "OK Files extracted (tracked files only)" -ForegroundColor Green

# Initialize as new git repo
Set-Location $targetAbs
git init -b main
git add .
git -c "user.email=dev@leadflow.local" -c "user.name=LeadFlow Dev" commit -m @"
Initial commit: LeadFlow CRM + GTM Engine

Self-hosted Go-To-Market platform combining a full CRM with automated
lead sourcing, deduplication, enrichment, and AI scoring.

Features:
- GTM Engine with Apify Google Maps integration
- 3-strategy deduplication (placeId / domain / name+city)
- Waterfall enrichment pipeline
- BullMQ + Redis workers
- React + Vite + TailwindCSS frontend
- Express + Prisma + PostgreSQL backend
- Playwright E2E test suite
- Vercel + Railway deployment configs

See README.md for setup, DEPLOYMENT.md for production deploy.
"@

Write-Host ""
Write-Host "OK Standalone repository created at: $targetAbs" -ForegroundColor Green
Write-Host ""
Write-Host "----------------------------------------------------------" -ForegroundColor Cyan
Write-Host "  Next steps to publish to GitHub:" -ForegroundColor Cyan
Write-Host "----------------------------------------------------------" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1. Create a new repo on GitHub:"
Write-Host "     https://github.com/new"
Write-Host "     Name suggestion: leadflow-crm-gtm"
Write-Host ""
Write-Host "  2. Push (replace YOUR_USERNAME):"
Write-Host "     cd $targetAbs"
Write-Host "     git remote add origin https://github.com/YOUR_USERNAME/leadflow-crm-gtm.git"
Write-Host "     git push -u origin main"
Write-Host ""
Write-Host "  3. Or with gh CLI:"
Write-Host "     cd $targetAbs"
Write-Host "     gh repo create leadflow-crm-gtm --public --source=. --push"
Write-Host ""
