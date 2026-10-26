# ▓▒░ BIOMON // ŌURA-LINK

A Cyberpunk-2077-style biomonitor dashboard for your Oura Ring, served on your laptop.

```
Oura Ring ──BLE──▶ Oura app (iPhone) ──▶ Oura Cloud ──API v2──▶ this server (localhost) ──▶ browser
```

Oura rings only talk to the Oura app, so there is no direct phone→laptop link. The iPhone app syncs the ring to
Oura Cloud, and this app reads it from the official Oura API. Keep the Oura app updated on your iPhone and open it
now and then so the ring syncs.

## Run it

Requires Node 18+. No `npm install` needed.

```bash
node server.js          # http://localhost:3077
```

With no credentials it runs on **simulated demo data** so you can see the UI (`npm run demo` forces this).

## Link your real ring

1. Go to <https://cloud.ouraring.com/oauth/applications> and create an application.
   Set the redirect URI to `http://localhost:3077/callback`.
2. `cp .env.example .env` and fill in `OURA_CLIENT_ID` and `OURA_CLIENT_SECRET`.
3. `node server.js`, open <http://localhost:3077>, press **⚡ JACK IN**, and approve access.

Tokens are stored in `.oura-token.json` (git-ignored) and refreshed automatically. **UNLINK** in the footer deletes them.
If you already hold a valid bearer token you can set `OURA_TOKEN` instead (Oura has deprecated personal access tokens).

## What you get

Readiness / sleep / activity scores, an animated ECG pinned to your last BPM, 48h heart rate, sleep stages,
HRV, lowest HR, respiratory rate, SpO₂, body-temperature drift, stress/recovery time, steps, workouts and an
auto-generated system log. Click any date in the strip to inspect that day; 7/14/30/90-day ranges.

## Privacy

The server binds to `127.0.0.1` only and has no dependencies; your data goes Oura → your laptop and nowhere else.
