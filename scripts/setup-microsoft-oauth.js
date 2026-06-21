#!/usr/bin/env node
// One-time Microsoft OAuth2 setup for Monday (Outlook mail + calendar).
// Run: node --env-file=.env scripts/setup-microsoft-oauth.js
//
// Prerequisites — in Azure Portal (portal.azure.com):
//   1. App registrations → New registration
//      - Name: "Monday"
//      - Supported account types: "Personal Microsoft accounts only"
//      - Redirect URI: http://localhost:8086/oauth/callback  (type: Web)
//   2. API permissions → Add:
//      - Microsoft Graph → Delegated → Mail.Read
//      - Microsoft Graph → Delegated → Calendars.Read
//      - Microsoft Graph → Delegated → offline_access
//   3. Certificates & secrets → New client secret → copy the VALUE (not the ID)
//
// .env keys needed BEFORE running:
//   MICROSOFT_CLIENT_ID=<Application (client) ID from Overview page>
//   MICROSOFT_CLIENT_SECRET=<secret value from step 3>
//
// After this script runs, add the printed MICROSOFT_REFRESH_TOKEN to .env.

"use strict";
const http   = require("node:http");
const crypto = require("node:crypto");

const CLIENT_ID     = process.env.MICROSOFT_CLIENT_ID;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const TENANT_ID     = process.env.MICROSOFT_TENANT_ID || "common";
const REDIRECT_URI  = "http://localhost:8086/oauth/callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("ERROR: MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET must be set in .env");
  process.exit(1);
}

const SCOPES = [
  "Mail.Read",
  "Calendars.Read",
  "offline_access",
  "User.Read",
].join(" ");

const state = crypto.randomBytes(16).toString("hex");

const authUrl =
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?` +
  new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: "code",
    scope:         SCOPES,
    state,
  });

console.log("\n── Microsoft OAuth Setup ──────────────────────────────────────────");
console.log("Open this URL in your browser:\n");
console.log(authUrl);
console.log("\nWaiting for callback on http://localhost:8086 ...\n");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:8086");
  if (url.pathname !== "/oauth/callback") {
    res.writeHead(404); res.end(); return;
  }

  const code          = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const error         = url.searchParams.get("error");
  const errorDesc     = url.searchParams.get("error_description");

  if (error) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(`OAuth error: ${error}`);
    console.error(`\nOAuth error: ${error} — ${errorDesc}`);
    server.close();
    return;
  }

  if (returnedState !== state) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("State mismatch — possible CSRF. Try again.");
    server.close();
    return;
  }

  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const tokenRes = await fetch(tokenUrl, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri:  REDIRECT_URI,
      grant_type:    "authorization_code",
      scope:         SCOPES,
    }),
  });

  const tokens = await tokenRes.json();

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end("<h2>Authorized. You can close this tab.</h2>");
  server.close();

  if (!tokens.refresh_token) {
    console.error("\nERROR: No refresh_token returned.");
    console.error("Make sure 'offline_access' is in the requested scopes and granted.\n");
    if (tokens.error) console.error("Token error:", JSON.stringify(tokens));
    return;
  }

  console.log("\n── Add these to .env ──────────────────────────────────────────────");
  console.log(`MICROSOFT_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log("───────────────────────────────────────────────────────────────────\n");
  console.log("Done. Monday can now sync Outlook mail and calendar.");
});

server.listen(8086, "127.0.0.1");
server.on("error", (err) => {
  console.error("Server error:", err.message);
  process.exit(1);
});
