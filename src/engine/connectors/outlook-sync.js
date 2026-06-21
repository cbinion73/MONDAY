"use strict";
// Outlook connector — pulls inbox threads via Microsoft Graph API.
// Merges into email-context under source "outlook".

const { getAccessToken } = require("./microsoft-auth");
const { mergeEmailThreads } = require("./email-context");

const BASE        = "https://graph.microsoft.com/v1.0/me";
const TIMEOUT     = Number(process.env.OUTLOOK_TIMEOUT_MS || 20000);
const MAX_RESULTS = Number(process.env.OUTLOOK_MAX_RESULTS || 30);

async function msfetch(path, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
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

function normalizeMessage(msg) {
  return {
    id:        msg.conversationId || msg.id,
    subject:   msg.subject || "(no subject)",
    from:      msg.from?.emailAddress?.address || null,
    snippet:   msg.bodyPreview || null,
    unread:    !msg.isRead,
    starred:   msg.flag?.flagStatus === "flagged",
    source:    "outlook",
    updatedAt: msg.receivedDateTime || new Date().toISOString(),
  };
}

async function syncOutlook() {
  const token = await getAccessToken();

  const select = "id,conversationId,subject,from,bodyPreview,isRead,flag,receivedDateTime";
  const params = new URLSearchParams({
    $top: String(MAX_RESULTS),
    $select: select,
    $orderby: "receivedDateTime desc",
  });

  const data = await msfetch(`/mailFolders/Inbox/messages?${params}`, token);
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

module.exports = { syncOutlook };
