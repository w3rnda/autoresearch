#!/bin/sh
set -e

# Always regenerate the Prisma client from the current schema.prisma
# (the prisma/ directory is volume-mounted, so this stays current without rebuilds)
echo "==> Generating Prisma client..."
npx prisma generate

echo "==> Syncing database schema..."
npx prisma db push --accept-data-loss

echo "==> Checking if database needs seeding..."
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.organization.count()
  .then(count => { prisma.\$disconnect(); process.exit(count > 0 ? 0 : 1); })
  .catch(() => { prisma.\$disconnect(); process.exit(1); });
" && echo "==> Database already has data, skipping seed." \
  || (echo "==> Empty database detected — seeding demo data..." && npm run seed)

echo "==> Starting dev server..."
exec npm run dev
