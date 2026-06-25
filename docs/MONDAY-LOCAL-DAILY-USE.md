# Monday Local Daily Use

This is the production startup checklist for running Monday locally on the Mac mini for daily use.

Monday's browser experience is served by the gateway on port `4312`.

## 1. Exact Start Command

From the repo root:

```bash
cd /Users/chris/CODE/MONDAY
npm run gateway
```

Notes:

- This starts Monday's local gateway and serves Monday Daily.
- Leave this terminal window open while Monday is running.
- If you want the full background scheduler instead of just the gateway, use `npm run daemon`, but the standard daily-use browser entrypoint is `npm run gateway`.

## 2. Exact Stop Command

If Monday is running in the current terminal:

```bash
Ctrl+C
```

If Monday is already running in the background and you need to stop the process using port `4312`:

```bash
lsof -ti tcp:4312 | xargs kill
```

## 3. Exact Health Check Command

```bash
curl -s http://127.0.0.1:4312/gateway/health
```

Expected result:

```json
{"ok":true,"port":4312,"gateway":"Monday Gateway", ...}
```

## 4. Exact Local URL

Open Monday locally at:

```text
http://127.0.0.1:4312/
```

## 5. How To Confirm Gateway Is Running

Option A: check the health endpoint:

```bash
curl -s http://127.0.0.1:4312/gateway/health
```

Option B: check whether something is listening on port `4312`:

```bash
lsof -nP -iTCP:4312 -sTCP:LISTEN
```

Option C: look for the normal startup log in the terminal:

```text
[gateway] Monday Gateway listening on port 4312
```

## 6. How To Restart Safely

Use this sequence:

```bash
cd /Users/chris/CODE/MONDAY
lsof -ti tcp:4312 | xargs kill 2>/dev/null || true
npm run gateway
```

This safely clears the current listener if one exists, then starts Monday again.

## 7. How To View Logs

### If running in the foreground

The terminal window is the log stream.

### If you want to capture logs to a file during a run

```bash
cd /Users/chris/CODE/MONDAY
npm run gateway 2>&1 | tee -a /tmp/monday-gateway.log
```

Then inspect logs with:

```bash
tail -f /tmp/monday-gateway.log
```

## 8. How To Recover If Port 4312 Is Already In Use

First find the process:

```bash
lsof -nP -iTCP:4312 -sTCP:LISTEN
```

Then stop it:

```bash
lsof -ti tcp:4312 | xargs kill
```

Then restart Monday:

```bash
cd /Users/chris/CODE/MONDAY
npm run gateway
```

If the port is still stuck after a normal kill:

```bash
lsof -ti tcp:4312 | xargs kill -9
```

Use `kill -9` only if the normal kill does not work.

## 9. How To Add Monday To Mac Dock Or Browser Bookmarks

### Browser bookmark

Bookmark:

```text
http://127.0.0.1:4312/
```

Suggested bookmark name:

```text
Monday
```

### Add to Dock from Chrome or Safari

The simplest daily-use pattern is:

1. Start Monday with `npm run gateway`
2. Open `http://127.0.0.1:4312/`
3. Keep the browser tab pinned or bookmarked

If you want a dedicated Dock app feel:

1. Open Monday in Chrome
2. Use Chrome's "Create Shortcut" / "Open as window" flow
3. Drag that app or shortcut to the Dock

## 10. How To Open Monday From iPhone

### On the same local network

Use the Mac mini's local IP address:

```text
http://<mac-mini-local-ip>:4312/
```

To find the Mac mini's local IP:

```bash
ipconfig getifaddr en0
```

If Ethernet is in use instead of Wi-Fi:

```bash
ipconfig getifaddr en1
```

### Through Tailscale

Use the Mac mini's Tailscale IP or MagicDNS hostname:

```text
http://<tailscale-ip>:4312/
```

or

```text
http://<tailscale-hostname>:4312/
```

Example pattern:

```text
http://100.x.x.x:4312/
```

Important:

- Monday is currently plain HTTP locally, not HTTPS.
- Tailscale makes access private, but the browser may still say "Not Secure" because there is no TLS certificate on the local gateway.

## 11. Known Limitations

- Monday is currently served over local HTTP, not HTTPS.
- The local browser experience depends on the gateway process staying alive.
- If the gateway terminal closes, Monday stops serving.
- iPhone access on the same network requires the Mac mini to be reachable on that network.
- Some deeper background workflows depend on `.env` credentials being present and valid.
- `npm run gateway` serves Monday Daily; it does not automatically imply every background worker is running unless you explicitly use `npm run daemon`.

## 12. Daily-Use Checklist For Chris

Each morning:

1. Start Monday:

```bash
cd /Users/chris/CODE/MONDAY
npm run gateway
```

2. Confirm health:

```bash
curl -s http://127.0.0.1:4312/gateway/health
```

3. Open Monday:

```text
http://127.0.0.1:4312/
```

4. If the page does not load:

- check whether port `4312` is listening
- restart safely

5. If using iPhone:

- make sure the Mac mini and phone are on the same network, or
- connect through Tailscale and open the Tailscale URL

6. If Monday feels stale or unavailable:

- verify health
- restart the gateway
- reopen the page

## Quick Reference

Start:

```bash
cd /Users/chris/CODE/MONDAY && npm run gateway
```

Stop:

```bash
lsof -ti tcp:4312 | xargs kill
```

Health:

```bash
curl -s http://127.0.0.1:4312/gateway/health
```

Open:

```text
http://127.0.0.1:4312/
```
