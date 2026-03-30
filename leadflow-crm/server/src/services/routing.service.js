'use strict';

const prisma = require('../prisma');

/**
 * Assigns a lead to the sales rep in the organization with the fewest active
 * (non-CUSTOMER) leads currently assigned. Ties are broken by user creation
 * order (oldest user first, which tends to be the admin).
 *
 * Returns the userId to assign, or null if no SALES_REP users exist in the org.
 *
 * @param {string} organizationId
 * @returns {Promise<string|null>}
 */
async function assignLeadRoundRobin(organizationId) {
  // Fetch all SALES_REP users in the org
  const reps = await prisma.user.findMany({
    where: { organizationId, role: 'SALES_REP' },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  if (reps.length === 0) {
    // Fall back to ADMIN if no reps exist
    const admin = await prisma.user.findFirst({
      where: { organizationId, role: 'ADMIN' },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return admin ? admin.id : null;
  }

  // Count active assigned leads per rep
  const counts = await Promise.all(
    reps.map(async (rep) => {
      const count = await prisma.lead.count({
        where: { assignedToId: rep.id, status: { not: 'CUSTOMER' } },
      });
      return { id: rep.id, count };
    })
  );

  // Pick the rep with the fewest assigned leads
  counts.sort((a, b) => a.count - b.count);
  return counts[0].id;
}

/**
 * Assigns a batch of leads to reps using balanced round-robin.
 * More efficient than calling assignLeadRoundRobin N times for imports.
 *
 * @param {string} organizationId
 * @param {number} batchSize
 * @returns {Promise<string[]>} Array of userIds in assignment order
 */
async function assignBatchRoundRobin(organizationId, batchSize) {
  const reps = await prisma.user.findMany({
    where: { organizationId, role: 'SALES_REP' },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  const pool = reps.length > 0 ? reps : await prisma.user.findMany({
    where: { organizationId, role: 'ADMIN' },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  if (pool.length === 0) return Array(batchSize).fill(null);

  // Get current load counts
  const counts = await Promise.all(
    pool.map(async (u) => ({
      id: u.id,
      count: await prisma.lead.count({ where: { assignedToId: u.id, status: { not: 'CUSTOMER' } } }),
    }))
  );

  // Build assignment list: greedily assign to least-loaded rep each time
  const mutable = counts.map(c => ({ ...c }));
  const assignments = [];
  for (let i = 0; i < batchSize; i++) {
    mutable.sort((a, b) => a.count - b.count);
    assignments.push(mutable[0].id);
    mutable[0].count++;
  }

  return assignments;
}

module.exports = { assignLeadRoundRobin, assignBatchRoundRobin };
