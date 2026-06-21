"use strict";
// Gmail connector — pulls unread threads via Gmail REST API.
// Uses OAuth2 refresh token. Merges into email-context under source "gmail".

const { getAccessToken } = require("./google-auth");
const { mergeEmailThreads } = require("./email-context");

const BASE    = "https://gmail.googleapis.com/gmail/v1/users/me";
const TIMEOUT = Number(process.env.GMAIL_TIMEOUT_MS || 20000);
const MAX_RESULTS = Number(process.env.GMAIL_MAX_RESULTS || 30);

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

async function fetchThread(threadId, token) {
  const data = await gfetch(`/threads/${threadId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, token);
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

  return {
    id:        threadId,
    subject,
    from,
    snippet,
    unread,
    starred,
    source:    "gmail",
    updatedAt: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
  };
}

async function syncGmail() {
  const token = await getAccessToken();

  // Fetch unread + recently updated threads
  const listData = await gfetch(
    `/threads?q=in:inbox&maxResults=${MAX_RESULTS}&labelIds=INBOX`,
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

module.exports = { syncGmail };
