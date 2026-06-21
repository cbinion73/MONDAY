"use strict";
// Minimal cron-like scheduler. No npm dependency.
// Checks registered jobs every 60 seconds and fires when due.

const jobs = [];
let tickTimer = null;

/**
 * Register a recurring job.
 * @param {string} name - display name for logs
 * @param {object} opts
 *   opts.hour          - fire once daily at this 24h hour (0-23)
 *   opts.minuteInterval - fire every N minutes
 * @param {function} fn - async function to execute
 */
function schedule(name, opts, fn) {
  jobs.push({ name, opts, fn, lastRun: null });
}

function shouldFire(job, now) {
  const { opts, lastRun } = job;

  if (opts.hour !== undefined) {
    if (now.getHours() !== opts.hour || now.getMinutes() > 5) return false;
    if (!lastRun) return true;
    const hoursSince = (now - lastRun) / (1000 * 60 * 60);
    return hoursSince >= 22; // prevent double-fire within same day
  }

  if (opts.minuteInterval !== undefined) {
    if (!lastRun) return true; // fire immediately on first tick
    const minutesSince = (now - lastRun) / (1000 * 60);
    return minutesSince >= opts.minuteInterval;
  }

  return false;
}

async function tick() {
  const now = new Date();
  for (const job of jobs) {
    if (!shouldFire(job, now)) continue;
    job.lastRun = now;
    console.log(`[scheduler] firing: ${job.name}`);
    try {
      await job.fn();
    } catch (err) {
      console.error(`[scheduler] ${job.name} error:`, err.message);
    }
  }
}

function start() {
  if (tickTimer) return;
  // Check every 60 seconds
  tickTimer = setInterval(() => tick().catch(console.error), 60 * 1000);
  // Run an immediate tick so minuteInterval jobs fire on startup
  tick().catch(console.error);
  console.log("[scheduler] started — tick every 60s");
}

function stop() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
    console.log("[scheduler] stopped");
  }
}

function getJobs() {
  return jobs.map((j) => ({
    name: j.name,
    opts: j.opts,
    lastRun: j.lastRun ? j.lastRun.toISOString() : null,
  }));
}

module.exports = { schedule, start, stop, getJobs };
