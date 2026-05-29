'use strict';

/**
 * Demo helper: seed an artificial "30 days ago" baseline snapshot for every
 * entity in a workspace, with review counts ~40% lower than current. Running
 * signal detection afterwards will then fire REVIEW_GROWTH (and friends)
 * against the current live data — useful for demonstrating the Signal Engine
 * without waiting a month for real-world change.
 *
 * Usage (inside backend container):
 *   node scripts/seed-baseline-snapshots.js <workspaceId>
 */

const prisma = require('../src/prisma');

async function main() {
  const workspaceId = process.argv[2] || 'cmoo76q0j0005q9cwhx2fncz0';

  const entities = await prisma.gtmEntity.findMany({
    where: { workspaceId },
    select: { id: true, rawData: true, website: true },
  });

  if (entities.length === 0) {
    console.log('No entities found for workspace', workspaceId);
    return;
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  let seeded = 0;

  for (const e of entities) {
    const raw = e.rawData || {};
    const currentReviews = Number(raw.reviewsCount ?? raw.reviewCount ?? 0);
    const currentRating = Number(raw.totalScore ?? raw.rating ?? 0);
    const currentImages = Number(raw.imagesCount ?? 0);

    // Baseline = 40% fewer reviews, slightly lower rating, fewer images, no website.
    const baseline = {
      reviewCount: Math.max(0, Math.round(currentReviews * 0.6)),
      rating: currentRating ? Math.max(0, Math.round((currentRating - 0.2) * 10) / 10) : null,
      imagesCount: Math.max(0, Math.round(currentImages * 0.5)),
      hasWebsite: false, // so WEBSITE_CHANGE fires for entities that now have one
      socialCount: null,
      employeeCount: null,
    };

    await prisma.entitySnapshot.create({
      data: { entityId: e.id, data: baseline, capturedAt: thirtyDaysAgo },
    });
    seeded++;
  }

  console.log(`Seeded ${seeded} baseline snapshots (dated 30 days ago) for workspace ${workspaceId}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
