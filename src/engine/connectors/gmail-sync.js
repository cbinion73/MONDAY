"use strict";
// Gmail connector — pulls unread threads via Gmail REST API.
// Uses OAuth2 refresh token. Merges into email-context under source "gmail".

const { getAccessToken } = require("./google-auth");
const { mergeEmailThreads } = require("./email-context");

const BASE    = "https://gmail.googleapis.com/gmail/v1/users/me";
const TIMEOUT = Number(process.env.GMAIL_TIMEOUT_MS || 20000);
const MAX_RESULTS = Number(process.env.GMAIL_MAX_RESULTS || 80);
const LOOKBACK_DAYS = Number(process.env.GMAIL_LOOKBACK_DAYS || 120);
const HISTORICAL_PAGE_SIZE = Number(process.env.GMAIL_HISTORICAL_PAGE_SIZE || 100);
const HISTORICAL_MAX_THREADS = Number(process.env.GMAIL_HISTORICAL_MAX_THREADS || 5000);

async function gfetch(path, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gmail API ${path} failed [${res.status}]: ${body}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function extractHeader(headers = [], name) {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || null;
}

function extractAddresses(value = "") {
  return String(value)
    .split(/,/)
    .map((part) => {
      const emailMatch = part.match(/<([^>]+)>/);
      return (emailMatch?.[1] || part).trim().toLowerCase();
    })
    .filter(Boolean);
}

function decodeBase64Url(input = "") {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, "base64").toString("utf8");
}

function extractPlainText(payload = {}) {
  if (!payload) return "";

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  const parts = payload.parts || [];
  for (const part of parts) {
    const text = extractPlainText(part);
    if (text) return text;
  }

  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  return "";
}

async function fetchThread(threadId, token) {
  const data = await gfetch(`/threads/${threadId}?format=full`, token);
  const messages = data.messages || [];
  const first = messages[0] || {};
  const last  = messages[messages.length - 1] || first;
  const headers = last.payload?.headers || [];
  const firstHeaders = first.payload?.headers || [];

  const subject  = extractHeader(firstHeaders, "Subject") || "(no subject)";
  const from     = extractHeader(firstHeaders, "From");
  const dateStr  = extractHeader(headers, "Date");
  const unread   = (last.labelIds || []).includes("UNREAD");
  const starred  = (last.labelIds || []).includes("STARRED");
  const snippet  = last.snippet || "";
  const bodyText = extractPlainText(last.payload).replace(/\s+/g, " ").trim().slice(0, 4000);
  const labelIds = [...new Set(messages.flatMap((msg) => msg.labelIds || []))];
  const providerCategory = labelIds.find((label) => label.startsWith("CATEGORY_")) || null;
  const participants = [...new Set(
    messages.flatMap((msg) => {
      const hdrs = msg.payload?.headers || [];
      return [
        ...extractAddresses(extractHeader(hdrs, "From") || ""),
        ...extractAddresses(extractHeader(hdrs, "To") || ""),
        ...extractAddresses(extractHeader(hdrs, "Cc") || ""),
      ];
    })
  )];
  const userParticipated = messages.some((msg) => (msg.labelIds || []).includes("SENT"));
  const hasAttachments = messages.some((msg) => (msg.payload?.parts || []).some((part) => !!part.filename));

  return {
    id:        threadId,
    subject,
    from,
    snippet,
    bodyText,
    unread,
    starred,
    labelIds,
    providerCategory,
    participants,
    userParticipated,
    messageCount: messages.length,
    hasAttachments,
    folder: "Inbox",
    source:    "gmail",
    updatedAt: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
  };
}

async function syncGmail() {
  const token = await getAccessToken();

  // Fetch recent all-mail threads except trash/spam so ticket emails do not disappear
  // just because they were auto-filed or no longer sit in the inbox.
  const lookbackQuery = `newer_than:${LOOKBACK_DAYS}d -in:trash -label:spam`;
  const listData = await gfetch(
    `/threads?q=${encodeURIComponent(lookbackQuery)}&maxResults=${MAX_RESULTS}`,
    token
  );

  const threadIds = (listData.threads || []).map((t) => t.id);
  if (!threadIds.length) {
    console.log("[gmail-sync] inbox is empty");
    return { source: "gmail", added: 0, total: 0 };
  }

  // Fetch metadata for each thread in parallel (capped at 10 concurrent)
  const threads = [];
  for (let i = 0; i < threadIds.length; i += 10) {
    const chunk = threadIds.slice(i, i + 10);
    const results = await Promise.allSettled(chunk.map((id) => fetchThread(id, token)));
    for (const r of results) {
      if (r.status === "fulfilled") threads.push(r.value);
    }
  }

  const result = mergeEmailThreads(threads, { source: "gmail" });
  console.log(`[gmail-sync] imported ${result.added} threads (${result.total} total in store)`);
  return result;
}

async function syncGmailHistorical({
  maxThreads = HISTORICAL_MAX_THREADS,
  pageSize = HISTORICAL_PAGE_SIZE,
  query = "-in:trash -label:spam",
} = {}) {
  const token = await getAccessToken();
  const cappedPageSize = Math.max(1, Math.min(pageSize, 500));
  const target = Math.max(1, maxThreads);
  const threadIds = [];
  let pageToken = null;

  while (threadIds.length < target) {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(Math.min(cappedPageSize, target - threadIds.length)),
    });
    if (pageToken) params.set("pageToken", pageToken);
    const listData = await gfetch(`/threads?${params.toString()}`, token);
    const ids = (listData.threads || []).map((t) => t.id).filter(Boolean);
    threadIds.push(...ids);
    pageToken = listData.nextPageToken || null;
    if (!pageToken || ids.length === 0) break;
  }

  const uniqueIds = [...new Set(threadIds)].slice(0, target);
  const threads = [];
  for (let i = 0; i < uniqueIds.length; i += 10) {
    const chunk = uniqueIds.slice(i, i + 10);
    const results = await Promise.allSettled(chunk.map((id) => fetchThread(id, token)));
    for (const result of results) {
      if (result.status === "fulfilled") threads.push(result.value);
    }
  }

  const merged = mergeEmailThreads(threads, { source: "gmail" });
  console.log(`[gmail-sync] historical import ${threads.length} threads (${merged.total} total in store)`);
  return {
    source: "gmail",
    added: threads.length,
    total: merged.total,
    pageSize: cappedPageSize,
    maxThreads: target,
  };
}

async function searchGmailThreads(query, { maxResults = 20, lookbackDays = 365 } = {}) {
  const token = await getAccessToken();
  const gmailQuery = `(${query}) newer_than:${lookbackDays}d -in:trash -label:spam`;
  const listData = await gfetch(
    `/threads?q=${encodeURIComponent(gmailQuery)}&maxResults=${maxResults}`,
    token
  );

  const threadIds = (listData.threads || []).map((t) => t.id);
  const threads = [];
  for (let i = 0; i < threadIds.length; i += 10) {
    const chunk = threadIds.slice(i, i + 10);
    const results = await Promise.allSettled(chunk.map((id) => fetchThread(id, token)));
    for (const result of results) {
      if (result.status === "fulfilled") threads.push(result.value);
    }
  }

  if (threads.length > 0) {
    mergeEmailThreads(threads, { source: "gmail" });
  }
  return threads;
}

module.exports = { syncGmail, syncGmailHistorical, searchGmailThreads };
