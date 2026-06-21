"use strict";
// Microsoft OAuth2 token refresh — shared by outlook-sync and outlook-calendar-sync.
// Requires MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REFRESH_TOKEN in env.
// The app must request scopes: Mail.Read, Calendars.Read, offline_access.

const TIMEOUT_MS = Number(process.env.MICROSOFT_AUTH_TIMEOUT_MS || 10000);

let _cached = null;

async function getAccessToken() {
  if (_cached && _cached.expiresAt > Date.now() + 60_000) {
    return _cached.accessToken;
  }

  const clientId     = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const refreshToken = process.env.MICROSOFT_REFRESH_TOKEN;
  const tenantId     = process.env.MICROSOFT_TENANT_ID || "common";

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Microsoft OAuth not configured. Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REFRESH_TOKEN in .env. " +
      "Run: node scripts/setup-microsoft-oauth.js"
    );
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type:    "refresh_token",
        scope:         "Mail.Read Calendars.Read offline_access",
      }),
      signal: controller.signal,
    });

    const payload = await res.json();
    if (!res.ok || !payload.access_token) {
      throw new Error(`Microsoft token refresh failed: ${JSON.stringify(payload)}`);
    }

    // Microsoft issues a new refresh token — update env so next restart works
    if (payload.refresh_token && payload.refresh_token !== refreshToken) {
      process.env.MICROSOFT_REFRESH_TOKEN = payload.refresh_token;
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
