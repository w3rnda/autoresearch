#!/usr/bin/env bash
# Extract leadflow-crm/ as a standalone Git repository.
#
# Usage:
#   ./scripts/create-standalone-repo.sh [target-dir]
#
# Default target: ../leadflow-crm-standalone
#
# What it does:
#   1. Uses `git archive` to extract a clean copy (no node_modules, .env, etc.)
#   2. Initializes a fresh git repo with a single "Initial commit"
#   3. Prints next steps to push to a new GitHub repo

set -euo pipefail

TARGET="${1:-../leadflow-crm-standalone}"
SOURCE_REL="leadflow-crm"

# Find the git root
cd "$(dirname "$0")/.."
GIT_ROOT="$(git rev-parse --show-toplevel)"
SOURCE_ABS="$GIT_ROOT/$SOURCE_REL"

if [ ! -d "$SOURCE_ABS" ]; then
  echo "❌ Source not found: $SOURCE_ABS"
  exit 1
fi

# Resolve absolute target path
mkdir -p "$TARGET"
TARGET_ABS="$(cd "$TARGET" && pwd)"

if [ "$(ls -A "$TARGET_ABS" 2>/dev/null)" ]; then
  echo "❌ Target directory is not empty: $TARGET_ABS"
  echo "   Please choose an empty directory or remove its contents."
  exit 1
fi

echo "📦 Extracting $SOURCE_REL → $TARGET_ABS ..."

# Use git archive to get a clean snapshot of tracked files only.
# This automatically excludes node_modules, .env, dist/, etc.
cd "$GIT_ROOT"
git archive HEAD "$SOURCE_REL" | tar -x -C "$TARGET_ABS" --strip-components=1

echo "✅ Files extracted (tracked files only — no node_modules, no .env)"

# Initialize as new git repo
cd "$TARGET_ABS"
git init -b main
git add .
git -c user.email="dev@leadflow.local" -c user.name="LeadFlow Dev" commit -m "Initial commit: LeadFlow CRM + GTM Engine

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

See README.md for setup, DEPLOYMENT.md for production deploy."

echo ""
echo "✅ Standalone repository created at: $TARGET_ABS"
echo ""
echo "─────────────────────────────────────────────────────────────"
echo "  Next steps to publish to GitHub:"
echo "─────────────────────────────────────────────────────────────"
echo ""
echo "  1. Create a new repo on GitHub:"
echo "     https://github.com/new"
echo "     Name suggestion: leadflow-crm-gtm"
echo ""
echo "  2. Push (replace YOUR_USERNAME):"
echo "     cd $TARGET_ABS"
echo "     git remote add origin https://github.com/YOUR_USERNAME/leadflow-crm-gtm.git"
echo "     git push -u origin main"
echo ""
echo "  3. Or with gh CLI:"
echo "     cd $TARGET_ABS"
echo "     gh repo create leadflow-crm-gtm --public --source=. --push"
echo ""
