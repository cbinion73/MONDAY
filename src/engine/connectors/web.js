"use strict";

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 10000;

async function fetchUrl({ url, maxChars = 3000 } = {}) {
  if (!url) return { ok: false, error: "url is required" };

  let res;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Monday/1.0 (research assistant)" },
      redirect: "follow",
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    return { ok: false, error: `Fetch failed: ${err.message}`, url };
  }

  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status} ${res.statusText}`, url };
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text") && !contentType.includes("html") && !contentType.includes("json")) {
    return { ok: false, error: `Unsupported content type: ${contentType}`, url };
  }

  let raw;
  try {
    raw = await res.text();
  } catch (err) {
    return { ok: false, error: `Body read failed: ${err.message}`, url };
  }

  // Strip HTML tags and collapse whitespace
  const clean = raw
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);

  return { ok: true, data: clean, url, chars: clean.length, contentType };
}

module.exports = { fetchUrl };
