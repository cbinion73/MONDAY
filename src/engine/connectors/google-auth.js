"use strict";
// Google OAuth2 token refresh — shared by gmail-sync and google-calendar-sync.
// Requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN in env.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TIMEOUT_MS = Number(process.env.GOOGLE_AUTH_TIMEOUT_MS || 10000);

let _cached = null; // { accessToken, expiresAt }

async function getAccessToken() {
  if (_cached && _cached.expiresAt > Date.now() + 60_000) {
    return _cached.accessToken;
  }

  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Google OAuth not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN in .env. " +
      "Run: node scripts/setup-google-oauth.js"
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type:    "refresh_token",
      }),
      signal: controller.signal,
    });

    const payload = await res.json();
    if (!res.ok || !payload.access_token) {
      throw new Error(`Google token refresh failed: ${JSON.stringify(payload)}`);
    }

    _cached = {
      accessToken: payload.access_token,
      expiresAt:   Date.now() + (payload.expires_in || 3600) * 1000,
    };
    return _cached.accessToken;
  } finally {
    clearTimeout(timer);
  }
}

function clearTokenCache() {
  _cached = null;
}

module.exports = { getAccessToken, clearTokenCache };
