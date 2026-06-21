#!/usr/bin/env node
// One-time Google OAuth2 setup for Monday.
// Run: node --env-file=.env scripts/setup-google-oauth.js
//
// Prerequisites — in Google Cloud Console:
//   1. Create a project (or reuse the JARVIS one)
//   2. Enable the Gmail API and Google Calendar API
//   3. Create an OAuth2 credential → "Desktop app" type
//   4. Download the JSON → copy client_id and client_secret into .env
//
// .env keys needed BEFORE running:
//   GOOGLE_CLIENT_ID=<your_client_id>
//   GOOGLE_CLIENT_SECRET=<your_client_secret>
//
// After this script runs, add the printed GOOGLE_REFRESH_TOKEN to .env.

"use strict";
const http   = require("node:http");
const crypto = require("node:crypto");

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI  = "http://localhost:8085/oauth/callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("ERROR: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env");
  process.exit(1);
}

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

const state = crypto.randomBytes(16).toString("hex");

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth?` +
  new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: "code",
    scope:         SCOPES,
    access_type:   "offline",
    prompt:        "consent",
    state,
  });

console.log("\n── Google OAuth Setup ─────────────────────────────────────────────");
console.log("Open this URL in your browser:\n");
console.log(authUrl);
console.log("\nWaiting for callback on http://localhost:8085 ...\n");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:8085");
  if (url.pathname !== "/oauth/callback") {
    res.writeHead(404); res.end(); return;
  }

  const code       = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const error      = url.searchParams.get("error");

  if (error) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(`OAuth error: ${error}`);
    console.error(`\nOAuth error: ${error}`);
    server.close();
    return;
  }

  if (returnedState !== state) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("State mismatch — possible CSRF. Try again.");
    server.close();
    return;
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri:  REDIRECT_URI,
      grant_type:    "authorization_code",
    }),
  });

  const tokens = await tokenRes.json();

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end("<h2>Authorized. You can close this tab.</h2>");
  server.close();

  if (!tokens.refresh_token) {
    console.error("\nERROR: No refresh_token returned.");
    console.error("If you already authorized this app, revoke access at");
    console.error("https://myaccount.google.com/permissions and try again.\n");
    return;
  }

  console.log("\n── Add these to .env ──────────────────────────────────────────────");
  console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log("───────────────────────────────────────────────────────────────────\n");
  console.log("Done. Monday can now sync Gmail and Google Calendar.");
});

server.listen(8085, "127.0.0.1");
server.on("error", (err) => {
  console.error("Server error:", err.message);
  process.exit(1);
});
