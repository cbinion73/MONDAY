"use strict";
// browser-read — fetches a URL and returns extracted readable text.
// Distinct from web-fetch: browser-read is domain-aware and returns structured output
// (wordCount, truncated flag, title extraction). web-fetch is a raw utility.
// Capability abstraction: fetch is the implementation. Swap for Playwright/Puppeteer
// for JS-rendered content without touching skill logic.

const TIMEOUT_MS = 12000;
const DEFAULT_MAX_CHARS = 4000;

async function readUrl({ url, maxChars = DEFAULT_MAX_CHARS } = {}) {
  if (!url || typeof url !== "string") {
    return { ok: false, error: "url is required" };
  }

  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: "Only http/https URLs are permitted" };
  }

  let res;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Monday/1.0 research assistant)",
        Accept: "text/html,text/plain,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return { ok: false, error: `Fetch failed: ${err.message}`, url };
  }

  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status} ${res.statusText}`, url };
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text") && !contentType.includes("html")) {
    return { ok: false, error: `Unsupported content type: ${contentType}`, url };
  }

  let raw;
  try {
    raw = await res.text();
  } catch (err) {
    return { ok: false, error: `Body read failed: ${err.message}`, url };
  }

  const title = extractTitle(raw);
  const text = extractText(raw);
  const truncated = text.length > maxChars;
  const data = text.slice(0, maxChars);

  return {
    ok: true,
    url,
    title,
    data,
    wordCount: data.split(/\s+/).filter(Boolean).length,
    truncated,
    chars: data.length,
  };
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]{0,200})<\/title>/i);
  if (!m) return null;
  return m[1]
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .trim();
}

function extractText(html) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s{2,}/g, " ")
    .trim();
}

module.exports = { readUrl };
