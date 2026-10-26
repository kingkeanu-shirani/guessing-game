'use strict';
// Local Oura biomonitor server. Zero dependencies (Node >= 18).
// Pulls data from the Oura Cloud API v2 (where the iPhone Oura app syncs the ring) and serves the dashboard.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildMock } = require('./mock');

// ---- env ---------------------------------------------------------------
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* no .env */ }

const PORT = Number(process.env.PORT) || 3077;
const HOST = '127.0.0.1'; // laptop only; health data is never exposed to the network
const REDIRECT = process.env.OURA_REDIRECT_URI || `http://localhost:${PORT}/callback`;
const CLIENT_ID = process.env.OURA_CLIENT_ID;
const CLIENT_SECRET = process.env.OURA_CLIENT_SECRET;
const API = 'https://api.ouraring.com';
const TOKEN_FILE = path.join(__dirname, '.oura-token.json');
const SCOPES = 'email personal daily heartrate workout session spo2';
const PUBLIC = path.join(__dirname, 'public');

let oauthState = null;

// ---- token handling ----------------------------------------------------
const readTokens = () => { try { return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')); } catch { return null; } };
const writeTokens = (t) => fs.writeFileSync(TOKEN_FILE, JSON.stringify(t, null, 2), { mode: 0o600 });

async function tokenRequest(params) {
  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...params, client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });
  if (!res.ok) throw new Error(`token endpoint ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const tokens = { ...j, expires_at: Date.now() + (j.expires_in || 86400) * 1000 };
  writeTokens(tokens);
  return tokens;
}

async function getAccessToken() {
  if (process.env.OURA_TOKEN) return process.env.OURA_TOKEN;
  let t = readTokens();
  if (!t) return null;
  if (t.expires_at - 60000 < Date.now()) {
    // refresh tokens are single-use; the new one is persisted by tokenRequest
    t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
  }
  return t.access_token;
}

const demoForced = () => ['1', 'true'].includes(String(process.env.OURA_DEMO || '').toLowerCase());
const oauthConfigured = () => Boolean(CLIENT_ID && CLIENT_SECRET);

// ---- oura api ----------------------------------------------------------
async function ouraGet(token, endpoint, params = {}) {
  const items = [];
  let next;
  do {
    const qs = new URLSearchParams(params);
    if (next) qs.set('next_token', next);
    const res = await fetch(`${API}/v2/${endpoint}?${qs}`, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`${endpoint} → ${res.status} ${(await res.text()).slice(0, 160)}`);
    const j = await res.json();
    if (Array.isArray(j.data)) items.push(...j.data); else return j; // personal_info is an object
    next = j.next_token;
  } while (next);
  return items;
}

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

async function fetchLive(token, days) {
  const now = new Date();
  const start = new Date(now); start.setDate(start.getDate() - days);
  const end = new Date(now); end.setDate(end.getDate() + 1);
  const range = { start_date: ymd(start), end_date: ymd(end) };
  const hrRange = { start_datetime: new Date(now - 48 * 3600e3).toISOString(), end_datetime: now.toISOString() };

  const jobs = {
    info: ['usercollection/personal_info', {}],
    sleepScore: ['usercollection/daily_sleep', range],
    readiness: ['usercollection/daily_readiness', range],
    activity: ['usercollection/daily_activity', range],
    sleep: ['usercollection/sleep', range],
    spo2: ['usercollection/daily_spo2', range],
    stress: ['usercollection/daily_stress', range],
    workouts: ['usercollection/workout', range],
    hr: ['usercollection/heartrate', hrRange],
  };
  const keys = Object.keys(jobs);
  const settled = await Promise.allSettled(keys.map((k) => ouraGet(token, ...jobs[k])));
  const raw = {}; const warnings = [];
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') raw[keys[i]] = s.value;
    else { raw[keys[i]] = []; warnings.push(String(s.reason.message || s.reason)); }
  });
  if (warnings.length === keys.length) throw new Error(warnings[0]);
  return normalize(raw, warnings, days);
}

function normalize(raw, warnings, days) {
  const byDay = new Map();
  const row = (day) => { if (!byDay.has(day)) byDay.set(day, { day }); return byDay.get(day); };

  for (const x of raw.sleepScore) row(x.day).sleepScore = x.score;
  for (const x of raw.readiness) { const r = row(x.day); r.readiness = x.score; r.tempDev = x.temperature_deviation; }
  for (const x of raw.activity) {
    const r = row(x.day);
    Object.assign(r, { activityScore: x.score, steps: x.steps, activeCalories: x.active_calories, totalCalories: x.total_calories });
  }
  for (const x of raw.spo2) {
    const r = row(x.day);
    r.spo2 = x.spo2_percentage ? x.spo2_percentage.average : undefined;
    r.breathingDisturbance = x.breathing_disturbance_index;
  }
  for (const x of raw.stress) {
    const r = row(x.day);
    r.stressMin = x.stress_high != null ? Math.round(x.stress_high / 60) : undefined;
    r.recoveryMin = x.recovery_high != null ? Math.round(x.recovery_high / 60) : undefined;
    r.stressSummary = x.day_summary;
  }
  // main sleep period per day = longest one
  for (const x of raw.sleep) {
    const r = row(x.day);
    if (r.sleep && r.sleep.total >= (x.total_sleep_duration || 0)) continue;
    r.sleep = {
      total: x.total_sleep_duration, deep: x.deep_sleep_duration, rem: x.rem_sleep_duration,
      light: x.light_sleep_duration, awake: x.awake_time, efficiency: x.efficiency,
      avgHrv: x.average_hrv, lowestHr: x.lowest_heart_rate, avgHr: x.average_heart_rate,
      avgBreath: x.average_breath, bedtimeStart: x.bedtime_start, bedtimeEnd: x.bedtime_end,
    };
  }

  const info = raw.info || {};
  return {
    mode: 'live',
    profile: { id: (info.id || 'UNKNOWN').slice(0, 12).toUpperCase(), age: info.age, sex: info.biological_sex, weight: info.weight, height: info.height, email: info.email },
    days: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-days - 1),
    hr: raw.hr.map((h) => ({ t: h.timestamp, bpm: h.bpm, src: h.source })),
    workouts: raw.workouts.map((w) => ({
      activity: (w.activity || 'workout').replace(/_/g, ' '), calories: w.calories, distance: w.distance,
      start: w.start_datetime, end: w.end_datetime, intensity: w.intensity,
    })).reverse(),
    warnings,
  };
}

// ---- http --------------------------------------------------------------
const cache = new Map(); // days -> { at, payload }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
const redirect = (res, to) => { res.writeHead(302, { location: to }); res.end(); };

async function handle(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/status') {
    const linked = Boolean(process.env.OURA_TOKEN || readTokens());
    return json(res, 200, { linked, oauthConfigured: oauthConfigured(), demo: demoForced() || !linked, redirect: REDIRECT });
  }

  if (url.pathname === '/api/data') {
    const days = Math.min(Math.max(parseInt(url.searchParams.get('days'), 10) || 14, 3), 90);
    if (demoForced()) return json(res, 200, buildMock(days));
    const hit = cache.get(days);
    if (hit && Date.now() - hit.at < 120000 && !url.searchParams.has('fresh')) return json(res, 200, hit.payload);
    try {
      const token = await getAccessToken();
      if (!token) return json(res, 200, buildMock(days));
      const payload = await fetchLive(token, days);
      cache.set(days, { at: Date.now(), payload });
      return json(res, 200, payload);
    } catch (e) {
      console.error('[oura]', e.message);
      return json(res, 502, { error: e.message });
    }
  }

  if (url.pathname === '/login') {
    if (!oauthConfigured()) { res.writeHead(400, { 'content-type': 'text/plain' }); return res.end('Set OURA_CLIENT_ID and OURA_CLIENT_SECRET in .env first (see README).'); }
    oauthState = crypto.randomBytes(16).toString('hex');
    const q = new URLSearchParams({ response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT, scope: SCOPES, state: oauthState });
    return redirect(res, `https://cloud.ouraring.com/oauth/authorize?${q}`);
  }

  if (url.pathname === '/callback') {
    try {
      if (!oauthState || url.searchParams.get('state') !== oauthState) throw new Error('state mismatch');
      oauthState = null;
      if (url.searchParams.get('error')) throw new Error(url.searchParams.get('error'));
      await tokenRequest({ grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: REDIRECT });
      cache.clear();
      return redirect(res, '/');
    } catch (e) {
      res.writeHead(400, { 'content-type': 'text/plain' });
      return res.end(`Oura link failed: ${e.message}`);
    }
  }

  if (url.pathname === '/logout') {
    try { fs.unlinkSync(TOKEN_FILE); } catch { /* none */ }
    cache.clear();
    return redirect(res, '/');
  }

  // static
  let rel = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

http.createServer((req, res) => {
  handle(req, res).catch((e) => { console.error(e); if (!res.headersSent) json(res, 500, { error: String(e.message || e) }); });
}).listen(PORT, HOST, () => {
  const mode = demoForced() ? 'DEMO (forced)' : process.env.OURA_TOKEN ? 'LIVE (OURA_TOKEN)' : readTokens() ? 'LIVE (OAuth)' : oauthConfigured() ? 'DEMO until linked — open /login' : 'DEMO (no credentials)';
  console.log(`\n  ▓▒░ OURA BIOMON ░▒▓\n  http://localhost:${PORT}\n  mode: ${mode}\n`);
});
