"use strict";
// Outlook connector — pulls inbox threads via Microsoft Graph API.
// Merges into email-context under source "outlook".

const { getAccessToken } = require("./microsoft-auth");
const { mergeEmailThreads } = require("./email-context");

const BASE        = "https://graph.microsoft.com/v1.0/me";
const TIMEOUT     = Number(process.env.OUTLOOK_TIMEOUT_MS || 20000);
const MAX_RESULTS = Number(process.env.OUTLOOK_MAX_RESULTS || 80);
const LOOKBACK_DAYS = Number(process.env.OUTLOOK_LOOKBACK_DAYS || 120);
const HISTORICAL_PAGE_SIZE = Number(process.env.OUTLOOK_HISTORICAL_PAGE_SIZE || 100);
const HISTORICAL_MAX_THREADS = Number(process.env.OUTLOOK_HISTORICAL_MAX_THREADS || 5000);

async function msfetch(path, token, extraHeaders = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Graph API ${path} failed [${res.status}]: ${body}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function msfetchAbsolute(url, token, extraHeaders = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Graph API absolute fetch failed [${res.status}]: ${body}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function sanitizeSearchQuery(query) {
  return String(query || "")
    .replace(/"/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+OR\s+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMessage(msg) {
  const bodyText = String(msg.body?.content || msg.bodyPreview || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
  const participants = [
    msg.from?.emailAddress?.address,
    ...(msg.toRecipients || []).map((item) => item.emailAddress?.address),
    ...(msg.ccRecipients || []).map((item) => item.emailAddress?.address),
  ].filter(Boolean).map((value) => String(value).toLowerCase());

  return {
    id:        msg.conversationId || msg.id,
    subject:   msg.subject || "(no subject)",
    from:      msg.from?.emailAddress?.address || null,
    snippet:   msg.bodyPreview || null,
    bodyText,
    unread:    !msg.isRead,
    starred:   msg.flag?.flagStatus === "flagged",
    categories: Array.isArray(msg.categories) ? msg.categories.map(String) : [],
    inferenceClassification: msg.inferenceClassification || null,
    folder: "Inbox",
    hasAttachments: Boolean(msg.hasAttachments),
    webLink: msg.webLink || null,
    participants: [...new Set(participants)],
    userParticipated: false,
    messageCount: 1,
    source:    "outlook",
    updatedAt: msg.receivedDateTime || new Date().toISOString(),
  };
}

async function syncOutlook() {
  const token = await getAccessToken();

  const select = "id,conversationId,subject,from,toRecipients,ccRecipients,bodyPreview,body,isRead,flag,receivedDateTime,categories,inferenceClassification,hasAttachments,webLink";
  const sinceIso = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
  const params = new URLSearchParams({
    $top: String(MAX_RESULTS),
    $select: select,
    $orderby: "receivedDateTime desc",
    $filter: `receivedDateTime ge ${sinceIso}`,
  });

  const data = await msfetch(`/messages?${params}`, token);
  const messages = (data.value || []).map(normalizeMessage);

  // Deduplicate by conversationId — keep most recent per thread
  const seen = new Set();
  const threads = messages.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  const result = mergeEmailThreads(threads, { source: "outlook" });
  console.log(`[outlook-sync] imported ${result.added} threads (${result.total} total in store)`);
  return result;
}

async function syncOutlookHistorical({
  maxThreads = HISTORICAL_MAX_THREADS,
  pageSize = HISTORICAL_PAGE_SIZE,
} = {}) {
  const token = await getAccessToken();
  const cappedPageSize = Math.max(1, Math.min(pageSize, 500));
  const select = "id,conversationId,subject,from,toRecipients,ccRecipients,bodyPreview,body,isRead,flag,receivedDateTime,categories,inferenceClassification,hasAttachments,webLink";
  const params = new URLSearchParams({
    $top: String(cappedPageSize),
    $select: select,
    $orderby: "receivedDateTime desc",
  });

  let nextUrl = `${BASE}/messages?${params.toString()}`;
  const messages = [];

  while (nextUrl && messages.length < maxThreads) {
    const data = await msfetchAbsolute(nextUrl, token);
    const pageMessages = (data.value || []).map(normalizeMessage);
    messages.push(...pageMessages);
    nextUrl = data["@odata.nextLink"] || null;
    if (pageMessages.length === 0) break;
  }

  const seen = new Set();
  const threads = messages.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  }).slice(0, maxThreads);

  const result = mergeEmailThreads(threads, { source: "outlook" });
  console.log(`[outlook-sync] historical import ${threads.length} threads (${result.total} total in store)`);
  return {
    source: "outlook",
    added: threads.length,
    total: result.total,
    pageSize: cappedPageSize,
    maxThreads,
  };
}

async function searchOutlookMessages(query, { maxResults = 20 } = {}) {
  const token = await getAccessToken();
  const safeQuery = sanitizeSearchQuery(query);
  const select = "id,conversationId,subject,from,toRecipients,ccRecipients,bodyPreview,body,isRead,flag,receivedDateTime,categories,inferenceClassification,hasAttachments,webLink";
  const params = new URLSearchParams({
    $top: String(maxResults),
    $select: select,
    $search: `"${safeQuery}"`,
  });

  const data = await msfetch(`/messages?${params}`, token, {
    ConsistencyLevel: "eventual",
  });
  const messages = (data.value || []).map(normalizeMessage);
  const seen = new Set();
  const threads = messages.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  if (threads.length > 0) {
    mergeEmailThreads(threads, { source: "outlook" });
  }
  return threads;
}

module.exports = { syncOutlook, syncOutlookHistorical, searchOutlookMessages };
