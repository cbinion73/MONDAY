"use strict";
// Review Worker — Monday's internal editorial board.
// When a workforce deliverable is ready, Monday reviews it before Chris sees anything.
// Only Monday's reviewed output reaches the surfacing queue.
// Raw deliverables stay on disk as the permanent record.

const { chatWithLLM } = require("../llm/llm-router");
const { readDeliverable, markDeliverableReviewed, listPendingDeliverables } = require("../db/deliverable-store");
const { enqueueSurfacing } = require("../db/surfacing-store");

const REVIEW_SYSTEM = `You are Monday's internal review board. A background worker just finished a report. Your job is to review it before Chris sees anything.

You are not a journalist. You are brutally selective.

Chris's six domains: Health, Publishing, Retirement, Family, Faith, Work.
Chris is in a retirement transition. Publishing matters. Family is non-negotiable. Faith grounds everything.

Your four questions:
1. What actually matters here — not what's interesting, what's load-bearing?
2. What changed? What's new since the last time we talked about this?
3. If Chris knows exactly one thing from this report, what is it?
4. What should Chris actually do? One concrete next step, or nothing.

Silence is valid. If this report doesn't genuinely matter right now, say so.
Monday doesn't surface noise. Monday doesn't create urgency. Monday surfaces truth.

Return JSON only — no commentary:
{
  "matters": "1-2 sentences on what's genuinely significant. null if nothing.",
  "changed": "What's new vs. baseline. null if nothing changed.",
  "chrisKnow": "What Monday would say to Chris in plain voice. null if not worth surfacing.",
  "chrisDo": "One concrete next step. null if no action needed.",
  "worthSurfacing": boolean,
  "surfacePriority": 1
}

surfacePriority: 1=deliver immediately, 2=today, 3=this week, 4=eventually, 5=low interest`;

/**
 * Review a single deliverable file.
 * Writes a surfacing queue entry if the review deems it worth surfacing.
 *
 * @param {object} opts
 *   opts.filePath  - absolute path to the .md deliverable
 *   opts.source    - worker source label (for logging)
 *   opts.domain    - domain override (falls back to deliverable frontmatter)
 * @returns {object} review result — { worthSurfacing, matters, changed, chrisKnow, chrisDo }
 */
async function runDeliverableReview({ filePath, source, domain } = {}) {
  const deliverable = readDeliverable(filePath);
  if (!deliverable) {
    console.error(`[review-worker] could not read: ${filePath}`);
    return { worthSurfacing: false };
  }

  const resolvedSource = source || deliverable.metadata?.source || "worker";
  const resolvedDomain = domain || deliverable.metadata?.domain || "general";
  const title = deliverable.metadata?.title || resolvedSource;

  const prompt = [
    { role: "system", content: REVIEW_SYSTEM },
    {
      role: "user",
      content: `Review this deliverable from the ${resolvedSource} worker:

Title: ${title}
Domain: ${resolvedDomain}
Confidence: ${deliverable.metadata?.confidence || "unknown"}
Created: ${deliverable.metadata?.created_at || "unknown"}

────────────────────────────────────────

${deliverable.content}

────────────────────────────────────────

Is this worth surfacing to Chris? Review it now.`,
    },
  ];

  try {
    const response = await chatWithLLM({ messages: prompt, temperature: 0.3, tier: "thinking", purpose: "deliverable-review" });
    const review = response?.json;

    if (!review || typeof review !== "object") {
      console.warn(`[review-worker] invalid review JSON for ${filePath}`);
      markDeliverableReviewed(filePath);
      return { worthSurfacing: false };
    }

    markDeliverableReviewed(filePath);

    if (review.worthSurfacing && review.chrisKnow) {
      const parts = [review.chrisKnow];
      if (review.chrisDo) parts.push(`Next: ${review.chrisDo}`);

      enqueueSurfacing({
        source:     resolvedSource,
        domain:     resolvedDomain !== "general" ? resolvedDomain : undefined,
        payload:    parts.join(" "),
        confidence: parseFloat(deliverable.metadata?.confidence || 0.6),
        priority:   Number(review.surfacePriority) || 3,
        ttlHours:   24,
      });

      console.log(`[review-worker] queued for surfacing: "${review.chrisKnow.slice(0, 80)}..."`);
    } else {
      console.log(`[review-worker] ${resolvedSource} deliverable reviewed — not worth surfacing`);
    }

    return review;
  } catch (err) {
    console.error(`[review-worker] error reviewing ${filePath}:`, err.message);
    return { worthSurfacing: false };
  }
}

/**
 * Process all pending (unreviewed) deliverables.
 * Called by daemon on a schedule or triggered after a worker run.
 */
async function reviewPendingDeliverables({ limit = 5 } = {}) {
  const pending = listPendingDeliverables({ limit });
  if (pending.length === 0) return { reviewed: 0 };

  console.log(`[review-worker] reviewing ${pending.length} pending deliverable(s)`);
  let surfaced = 0;

  for (const { filePath, metadata } of pending) {
    const result = await runDeliverableReview({
      filePath,
      source: metadata?.source,
      domain: metadata?.domain,
    });
    if (result.worthSurfacing) surfaced++;
  }

  return { reviewed: pending.length, surfaced };
}

module.exports = { runDeliverableReview, reviewPendingDeliverables };
