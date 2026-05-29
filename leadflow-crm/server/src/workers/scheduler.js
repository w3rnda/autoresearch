'use strict';

const prisma = require('../prisma');

/**
 * Periodic Scan Scheduler — the "continuous pipeline" engine.
 *
 * Instead of one-time CSV lists, ACTIVE workspaces are re-scanned on a cadence
 * defined by sourcingConfig.scheduleHours (default 168h = weekly). Each scan:
 *   re-sources fresh data → snapshots → detects intent signals → boosts scores.
 *
 * This is intentionally a lightweight setInterval rather than a distributed
 * cron, so it works in the single-node Docker setup with zero extra infra.
 * The interval checks every 15 minutes which ACTIVE workspaces are due.
 */

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // check every 15 min
const DEFAULT_SCHEDULE_HOURS = 168;       // weekly
let _timer = null;

async function runDueScans() {
  try {
    const workspaces = await prisma.gtmWorkspace.findMany({
      where: { status: 'ACTIVE' },
      include: {
        sourcingRuns: {
          where: { config: { path: ['periodic'], equals: true } },
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (workspaces.length === 0) return;

    const { signalQueue } = require('../queues');
    const now = Date.now();
    let queued = 0;

    for (const ws of workspaces) {
      const scheduleHours = ws.sourcingConfig?.scheduleHours || DEFAULT_SCHEDULE_HOURS;
      const lastScan = ws.sourcingRuns[0]?.startedAt;
      const dueAt = lastScan ? new Date(lastScan).getTime() + scheduleHours * 3600 * 1000 : 0;

      if (now >= dueAt) {
        await signalQueue.add(
          'scan-workspace',
          { workspaceId: ws.id },
          { jobId: `scan-${ws.id}-${now}` }
        );
        queued++;
      }
    }

    if (queued > 0) {
      console.log(`[SCHEDULER] Queued ${queued} periodic workspace scan(s)`);
    }
  } catch (err) {
    console.error('[SCHEDULER] runDueScans error:', err.message);
  }
}

function startScheduler() {
  if (_timer) return _timer;
  // Run once shortly after boot, then on the interval.
  setTimeout(runDueScans, 60 * 1000);
  _timer = setInterval(runDueScans, CHECK_INTERVAL_MS);
  console.log(`[SCHEDULER] Periodic scan scheduler started (checks every ${CHECK_INTERVAL_MS / 60000}min)`);
  return _timer;
}

function stopScheduler() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

module.exports = { startScheduler, stopScheduler, runDueScans };
