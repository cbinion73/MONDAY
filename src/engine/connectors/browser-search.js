"use strict";
// browser-search — web search via DuckDuckGo HTML endpoint.
// No API key. Capability abstraction: this file is the swappable implementation.
// Swap the ENGINE constant to add Bing, Brave, or SerpAPI without touching skill logic.

const ENGINE = "duckduckgo";
const DDG_URL = "https://html.duckduckgo.com/html/";
const DEFAULT_LIMIT = 8;
const TIMEOUT_MS = 12000;

async function search({ query, limit = DEFAULT_LIMIT } = {}) {
  if (!query || typeof query !== "string") {
    return { ok: false, error: "query is required", engine: ENGINE };
  }

  const params = new URLSearchParams({ q: query.trim() });

  let res;
  try {
    res = await fetch(DDG_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      body: params.toString(),
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return { ok: false, error: `Search request failed: ${err.message}`, engine: ENGINE };
  }

  if (!res.ok) {
    return { ok: false, error: `DuckDuckGo returned HTTP ${res.status}`, engine: ENGINE };
  }

  let html;
  try {
    html = await res.text();
  } catch (err) {
    return { ok: false, error: `Body read failed: ${err.message}`, engine: ENGINE };
  }

  const results = parseDdgHtml(html, limit);

  return {
    ok: true,
    engine: ENGINE,
    query,
    data: results,
    count: results.length,
  };
}

// DuckDuckGo HTML result blocks use consistent class names.
// Title links: <a class="result__a" href="...">Title</a>
// Snippets:    <a class="result__snippet" ...>Snippet</a>
function parseDdgHtml(html, limit) {
  const results = [];

  // Title + URL
  const titleRe = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  const titleMatches = [];
  let m;
  while ((m = titleRe.exec(html)) !== null && titleMatches.length < limit) {
    titleMatches.push({ href: m[1], title: stripTags(m[2]) });
  }

  const snippets = [];
  while ((m = snippetRe.exec(html)) !== null) {
    snippets.push(stripTags(m[1]));
  }

  for (let i = 0; i < titleMatches.length; i++) {
    const { href, title } = titleMatches[i];

    // DDG wraps real URLs in a redirect — extract uddg= param if present
    let url = href;
    const uddg = href.match(/[?&]uddg=([^&]+)/);
    if (uddg) {
      try { url = decodeURIComponent(uddg[1]); } catch { url = href; }
    }

    results.push({
      title: decodeEntities(title.trim()),
      url,
      snippet: decodeEntities((snippets[i] || "").trim()),
    });
  }

  return results;
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

module.exports = { search };
