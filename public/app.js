'use strict';

const $ = (id) => document.getElementById(id);
const C = { yellow: '#fcee0a', cyan: '#00f0ff', red: '#ff003c', pink: '#ff2a6d', orange: '#ff8a00', green: '#39ff88', dim: '#5d6b7a', deep: '#1b6bff', rem: '#b84dff' };
const state = { days: 14, data: null, sel: 0, status: null };

// ---------- helpers ----------
const has = (v) => v !== undefined && v !== null && !Number.isNaN(v);
const avg = (a) => { const v = a.filter(has); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const fmtDur = (s) => (has(s) ? `${Math.floor(s / 3600)}h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')}m` : '--');
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '--');
const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function grade(score) {
  if (!has(score)) return { t: 'NO SIGNAL', c: C.dim };
  if (score >= 85) return { t: 'OPTIMAL', c: C.cyan };
  if (score >= 70) return { t: 'NOMINAL', c: C.yellow };
  if (score >= 55) return { t: 'DEGRADED', c: C.orange };
  return { t: 'CRITICAL', c: C.red };
}

// ---------- gauges ----------
function gauge(label, score) {
  const g = grade(score), N = 40, cx = 100, cy = 98, r = 80;
  let ticks = '';
  for (let i = 0; i < N; i++) {
    const a = ((135 + (i * 270) / (N - 1)) * Math.PI) / 180;
    const lit = has(score) && i < Math.round((score / 100) * N);
    const long = i % 5 === 0 ? 14 : 9;
    ticks += `<line x1="${cx + (r - long) * Math.cos(a)}" y1="${cy + (r - long) * Math.sin(a)}" x2="${cx + r * Math.cos(a)}" y2="${cy + r * Math.sin(a)}" stroke="${lit ? g.c : '#1b2530'}" stroke-width="${lit ? 3.5 : 2.5}" ${lit ? `style="filter:drop-shadow(0 0 3px ${g.c})"` : ''}/>`;
  }
  return `<div class="gauge" style="color:${g.c}"><svg viewBox="0 0 200 170">${ticks}
    <text class="num" x="100" y="108" text-anchor="middle">${has(score) ? score : '--'}</text>
    <text class="lbl" x="100" y="132" text-anchor="middle">${label}</text></svg>
    <div class="st">${g.t}</div></div>`;
}

// ---------- svg charts ----------
function prep(svg) {
  const w = svg.clientWidth || 600, h = svg.clientHeight || 120;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  return { w, h, l: 34, r: 8, t: 8, b: 16 };
}

function grid(g, min, max, fmt = (v) => Math.round(v)) {
  let s = '';
  for (let i = 0; i <= 3; i++) {
    const y = g.t + ((g.h - g.t - g.b) * i) / 3;
    const v = max - ((max - min) * i) / 3;
    s += `<line x1="${g.l}" x2="${g.w - g.r}" y1="${y}" y2="${y}" stroke="rgba(0,240,255,.12)"/><text x="${g.l - 5}" y="${y + 3}" text-anchor="end">${fmt(v)}</text>`;
  }
  return s;
}

function xAt(g, i, n) { return n <= 1 ? g.l : g.l + ((g.w - g.l - g.r) * i) / (n - 1); }

function lineChart(id, series, { min, max, fmt, sel } = {}) {
  const svg = $(id), g = prep(svg), n = state.data.days.length;
  const all = series.flatMap((s) => s.vals).filter(has);
  if (!all.length) { svg.innerHTML = `<text x="${g.w / 2}" y="${g.h / 2}" text-anchor="middle">NO DATA</text>`; return; }
  min = min ?? Math.floor(Math.min(...all) - 2); max = max ?? Math.ceil(Math.max(...all) + 2);
  if (max === min) max = min + 1;
  const y = (v) => g.t + (g.h - g.t - g.b) * (1 - (v - min) / (max - min));
  let out = grid(g, min, max, fmt);
  if (has(sel)) out += `<line x1="${xAt(g, sel, n)}" x2="${xAt(g, sel, n)}" y1="${g.t}" y2="${g.h - g.b}" stroke="${C.yellow}" stroke-dasharray="3 3" opacity=".7"/>`;
  for (const s of series) {
    let path = '', pen = false;
    s.vals.forEach((v, i) => { if (!has(v)) { pen = false; return; } path += `${pen ? 'L' : 'M'}${xAt(g, i, n).toFixed(1)} ${y(v).toFixed(1)} `; pen = true; });
    out += `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2" style="filter:drop-shadow(0 0 3px ${s.color})"/>`;
    s.vals.forEach((v, i) => { if (has(v)) out += `<circle cx="${xAt(g, i, n)}" cy="${y(v)}" r="${i === sel ? 4 : 2}" fill="${i === sel ? '#fff' : s.color}"/>`; });
  }
  out += dateAxis(g, n);
  svg.innerHTML = out;
}

function dateAxis(g, n) {
  const days = state.data.days, step = Math.max(1, Math.ceil(n / 7));
  let s = '';
  for (let i = 0; i < n; i += step) s += `<text x="${xAt(g, i, n)}" y="${g.h - 3}" text-anchor="middle">${days[i].day.slice(5)}</text>`;
  return s;
}

function barChart(id, vals, { sel, color = C.cyan, fmt }) {
  const svg = $(id), g = prep(svg), n = vals.length, v = vals.filter(has);
  if (!v.length) { svg.innerHTML = `<text x="${g.w / 2}" y="${g.h / 2}" text-anchor="middle">NO DATA</text>`; return; }
  const max = Math.max(...v) * 1.1 || 1, bw = Math.max(2, ((g.w - g.l - g.r) / n) * 0.7);
  let out = grid(g, 0, max, fmt);
  vals.forEach((val, i) => {
    if (!has(val)) return;
    const h = (g.h - g.t - g.b) * (val / max), x = xAt(g, i, n) - bw / 2;
    const c = i === sel ? C.yellow : color;
    out += `<rect x="${x}" y="${g.h - g.b - h}" width="${bw}" height="${h}" fill="${c}" opacity="${i === sel ? 1 : 0.75}" style="filter:drop-shadow(0 0 3px ${c})"/>`;
  });
  svg.innerHTML = out + dateAxis(g, n);
}

function tempChart(id, vals, sel) {
  const svg = $(id), g = prep(svg), n = vals.length, v = vals.filter(has);
  if (!v.length) { svg.innerHTML = `<text x="${g.w / 2}" y="${g.h / 2}" text-anchor="middle">NO DATA</text>`; return; }
  const m = Math.max(1, ...v.map(Math.abs)), min = -m, max = m;
  const y = (val) => g.t + (g.h - g.t - g.b) * (1 - (val - min) / (max - min)), y0 = y(0), bw = Math.max(2, ((g.w - g.l - g.r) / n) * 0.7);
  let out = grid(g, min, max, (x) => x.toFixed(1)) + `<line x1="${g.l}" x2="${g.w - g.r}" y1="${y0}" y2="${y0}" stroke="${C.yellow}" opacity=".5"/>`;
  vals.forEach((val, i) => {
    if (!has(val)) return;
    const c = i === sel ? '#fff' : Math.abs(val) > 0.5 ? C.red : val >= 0 ? C.orange : C.cyan;
    out += `<rect x="${xAt(g, i, n) - bw / 2}" y="${Math.min(y(val), y0)}" width="${bw}" height="${Math.max(1, Math.abs(y(val) - y0))}" fill="${c}" style="filter:drop-shadow(0 0 3px ${c})"/>`;
  });
  svg.innerHTML = out + dateAxis(g, n);
}

// ---------- heart rate ----------
function renderHR() {
  const hr = state.data.hr || [];
  const svg = $('hr48'), g = prep(svg);
  if (!hr.length) {
    svg.innerHTML = `<text x="${g.w / 2}" y="${g.h / 2}" text-anchor="middle">NO HEART RATE SAMPLES (SYNC RING IN OURA APP)</text>`;
    $('hrstats').innerHTML = ''; return;
  }
  const t0 = new Date(hr[0].t).getTime(), t1 = new Date(hr[hr.length - 1].t).getTime() || t0 + 1;
  const bpms = hr.map((h) => h.bpm), min = Math.floor(Math.min(...bpms) / 10) * 10, max = Math.ceil(Math.max(...bpms) / 10) * 10;
  const x = (t) => g.l + ((g.w - g.l - g.r) * (new Date(t).getTime() - t0)) / Math.max(1, t1 - t0);
  const y = (b) => g.t + (g.h - g.t - g.b) * (1 - (b - min) / (max - min));
  let line = '', prev = null;
  for (const h of hr) {
    const gap = prev && new Date(h.t) - new Date(prev.t) > 20 * 60e3;
    line += `${!prev || gap ? 'M' : 'L'}${x(h.t).toFixed(1)} ${y(h.bpm).toFixed(1)} `; prev = h;
  }
  svg.innerHTML = grid(g, min, max) + `<path d="${line}" fill="none" stroke="${C.red}" stroke-width="1.5" style="filter:drop-shadow(0 0 3px ${C.red})"/>`;
  const last = hr[hr.length - 1], rest = hr.filter((h) => h.src === 'rest' || h.src === 'sleep');
  $('bpm').textContent = last.bpm;
  $('hrstats').innerHTML = `<span>MIN <b>${Math.min(...bpms)}</b></span><span>AVG <b>${Math.round(avg(bpms))}</b></span><span>MAX <b>${Math.max(...bpms)}</b></span>` +
    (rest.length ? `<span>REST AVG <b>${Math.round(avg(rest.map((h) => h.bpm)))}</b></span>` : '') + `<span>LAST SAMPLE <b>${fmtTime(last.t)}</b></span>`;
}

// ---------- ECG animation ----------
const ecg = { buf: [], phase: 0, last: 0 };
function beat(p) {
  const gs = (c, w, a) => a * Math.exp(-((p - c) ** 2) / (2 * w * w));
  return gs(0.18, 0.025, 0.12) - gs(0.3, 0.008, 0.15) + gs(0.325, 0.009, 1) - gs(0.35, 0.009, 0.25) + gs(0.6, 0.04, 0.22);
}
function ecgFrame(now) {
  const cv = $('ecg'), dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const bpm = Number($('bpm').textContent) || 60, dt = Math.min(0.1, (now - (ecg.last || now)) / 1000); ecg.last = now;
  const pps = 140, add = Math.round(dt * pps);
  for (let i = 0; i < add; i++) { ecg.phase = (ecg.phase + bpm / 60 / pps) % 1; ecg.buf.push(beat(ecg.phase)); }
  if (ecg.buf.length > w) ecg.buf.splice(0, ecg.buf.length - w);
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = C.red; ctx.lineWidth = 2; ctx.shadowColor = C.red; ctx.shadowBlur = 10; ctx.beginPath();
  const off = w - ecg.buf.length;
  ecg.buf.forEach((v, i) => { const px = off + i, py = h * 0.62 - v * h * 0.5; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
  ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.shadowBlur = 14;
  if (ecg.buf.length) { const v = ecg.buf[ecg.buf.length - 1]; ctx.beginPath(); ctx.arc(w - 1, h * 0.62 - v * h * 0.5, 3, 0, 7); ctx.fill(); }
  requestAnimationFrame(ecgFrame);
}

// ---------- render ----------
function selected() { return state.data.days[state.sel]; }

function delta(key, d, { lowerBetter = false, unit = '', digits = 0, get } = {}) {
  const val = get ? get(d) : d[key];
  if (!has(val)) return { val: null, html: '<span class="d flat">NO DATA</span>' };
  const others = state.data.days.filter((x) => x !== d).map((x) => (get ? get(x) : x[key]));
  const base = avg(others);
  if (base === null) return { val, html: '' };
  const diff = val - base, good = lowerBetter ? diff < 0 : diff > 0;
  const cls = Math.abs(diff) < Math.abs(base) * 0.02 ? 'flat' : good ? 'up' : 'down';
  return { val, html: `<span class="d ${cls}">${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff).toFixed(digits)}${unit} vs avg</span>` };
}

function tile(label, o, unit, digits = 0, pct) {
  const v = o.val;
  return `<div class="tile"><small>${label}</small><b>${has(v) ? Number(v).toFixed(digits) : '--'}<u>${unit}</u></b>${o.html}${has(pct) ? `<div class="bar"><i style="width:${Math.min(100, pct)}%"></i></div>` : ''}</div>`;
}

function renderDay() {
  const d = selected(), s = d.sleep || {};
  $('selday').textContent = d.day;
  document.querySelectorAll('#days button').forEach((b, i) => b.classList.toggle('on', i === state.sel));

  $('gauges').innerHTML = gauge('READINESS', d.readiness) + gauge('SLEEP', d.sleepScore) + gauge('ACTIVITY', d.activityScore);
  const worst = [['READINESS', d.readiness], ['SLEEP', d.sleepScore], ['ACTIVITY', d.activityScore]].filter(([, v]) => has(v)).sort((a, b) => a[1] - b[1])[0];
  $('status').innerHTML = worst ? `STATUS // ${grade(avg([d.readiness, d.sleepScore, d.activityScore])).t}<br>WEAKEST SUBSYSTEM: ${worst[0]} (${worst[1]})` : 'STATUS // NO SIGNAL FOR THIS DAY';

  // sleep stack
  const parts = [['deep', s.deep, C.deep], ['rem', s.rem, C.rem], ['light', s.light, C.cyan], ['awake', s.awake, C.red]];
  const tot = parts.reduce((a, [, v]) => a + (v || 0), 0);
  $('sleepbar').innerHTML = tot ? parts.map(([k, v, c]) => `<div style="flex:${v || 0};background:${c}" title="${k} ${fmtDur(v)}">${v / tot > 0.08 ? fmtDur(v) : ''}</div>`).join('') : '<div style="flex:1;background:#1b2530;color:#5d6b7a">NO SLEEP DATA</div>';
  $('sleepwin').textContent = s.bedtimeStart ? `${fmtTime(s.bedtimeStart)} → ${fmtTime(s.bedtimeEnd)}` : '--';
  $('sleepkv').innerHTML = [['TOTAL', fmtDur(s.total)], ['EFFICIENCY', has(s.efficiency) ? s.efficiency + '%' : '--'], ['DEEP', fmtDur(s.deep)], ['REM', fmtDur(s.rem)]].map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('');

  // tiles
  const T = [
    tile('HRV (SLEEP AVG)', delta('x', d, { get: (x) => x.sleep && x.sleep.avgHrv, unit: 'ms' }), 'ms'),
    tile('LOWEST HR', delta('x', d, { get: (x) => x.sleep && x.sleep.lowestHr, lowerBetter: true }), 'bpm'),
    tile('SLEEP HR AVG', delta('x', d, { get: (x) => x.sleep && x.sleep.avgHr, lowerBetter: true }), 'bpm'),
    tile('RESP RATE', delta('x', d, { get: (x) => x.sleep && x.sleep.avgBreath, digits: 1, lowerBetter: true }), '/min', 1),
    tile('SpO₂', delta('spo2', d, { digits: 1, unit: '%' }), '%', 1),
    tile('BODY TEMP Δ', delta('tempDev', d, { digits: 2, lowerBetter: true }), '°C', 2),
    tile('STEPS', delta('steps', d), '', 0, has(d.steps) ? (d.steps / 10000) * 100 : undefined),
    tile('ACTIVE KCAL', delta('activeCalories', d), 'kcal'),
    tile('STRESS TIME', delta('stressMin', d, { lowerBetter: true, unit: 'm' }), 'min'),
    tile('RECOVERY TIME', delta('recoveryMin', d, { unit: 'm' }), 'min'),
  ];
  $('tiles').innerHTML = T.join('');

  // charts with highlight
  drawTrends();
  writeLog();
}

function drawTrends() {
  const days = state.data.days, sel = state.sel;
  lineChart('hrvchart', [
    { vals: days.map((d) => d.sleep && d.sleep.avgHrv), color: C.cyan },
    { vals: days.map((d) => d.sleep && d.sleep.lowestHr), color: C.red },
  ], { sel });
  lineChart('scorechart', [
    { vals: days.map((d) => d.readiness), color: C.yellow },
    { vals: days.map((d) => d.sleepScore), color: C.cyan },
    { vals: days.map((d) => d.activityScore), color: C.pink },
  ], { min: 40, max: 100, sel });
  tempChart('tempchart', days.map((d) => d.tempDev), sel);
  barChart('stepchart', days.map((d) => d.steps), { sel, fmt: (v) => (v >= 1000 ? Math.round(v / 1000) + 'k' : Math.round(v)) });

  // sleep history (stacked hours)
  const svg = $('sleephist'), g = prep(svg), n = days.length;
  const tots = days.map((d) => d.sleep && d.sleep.total / 3600).filter(has);
  if (!tots.length) { svg.innerHTML = `<text x="${g.w / 2}" y="${g.h / 2}" text-anchor="middle">NO DATA</text>`; return; }
  const max = Math.max(10, Math.ceil(Math.max(...tots))), bw = Math.max(2, ((g.w - g.l - g.r) / n) * 0.7);
  const hy = (hours) => (g.h - g.t - g.b) * (hours / max);
  let out = grid(g, 0, max, (v) => Math.round(v) + 'h');
  out += `<line x1="${g.l}" x2="${g.w - g.r}" y1="${g.h - g.b - hy(8)}" y2="${g.h - g.b - hy(8)}" stroke="${C.yellow}" stroke-dasharray="4 4" opacity=".5"/>`;
  days.forEach((d, i) => {
    const s = d.sleep; if (!s) return;
    let base = g.h - g.b;
    for (const [v, c] of [[s.deep, C.deep], [s.rem, C.rem], [s.light, C.cyan]]) {
      const h = hy((v || 0) / 3600); base -= h;
      out += `<rect x="${xAt(g, i, n) - bw / 2}" y="${base}" width="${bw}" height="${h}" fill="${c}" opacity="${i === sel ? 1 : 0.7}"/>`;
    }
    if (i === sel) out += `<rect x="${xAt(g, i, n) - bw / 2 - 2}" y="${g.t}" width="${bw + 4}" height="${g.h - g.t - g.b}" fill="none" stroke="${C.yellow}" stroke-dasharray="3 3"/>`;
  });
  svg.innerHTML = out + dateAxis(g, n);
}

function writeLog() {
  const d = selected(), s = d.sleep || {}, L = [];
  const add = (txt, cls = '') => L.push(`<li class="${cls}">${txt}</li>`);
  add(`LINK <b>${state.data.mode === 'live' ? 'ESTABLISHED' : 'SIMULATED'}</b> // ${state.data.days.length} DAYS LOADED`);
  if (has(s.total)) {
    const h = s.total / 3600;
    add(`SLEEP <b>${fmtDur(s.total)}</b> LOGGED`, h < 6 ? 'c' : h < 7 ? 'w' : '');
    if (h < 7) add(`SLEEP DEBT <b>${(7.5 - h).toFixed(1)}h</b> vs 7.5h TARGET`, h < 6 ? 'c' : 'w');
  }
  const hrv = delta('x', d, { get: (x) => x.sleep && x.sleep.avgHrv });
  if (has(hrv.val)) { const base = avg(state.data.days.filter((x) => x !== d).map((x) => x.sleep && x.sleep.avgHrv)); if (base) add(`HRV <b>${hrv.val}ms</b> (${hrv.val >= base ? '+' : ''}${Math.round(hrv.val - base)} vs RANGE AVG)`, hrv.val < base * 0.85 ? 'w' : ''); }
  if (has(d.readiness) && d.readiness < 60) add(`READINESS <b>${d.readiness}</b> // RECOMMEND REST PROTOCOL`, 'c');
  if (has(d.tempDev) && Math.abs(d.tempDev) > 0.5) add(`THERMAL ANOMALY <b>${d.tempDev > 0 ? '+' : ''}${d.tempDev}°C</b> // CHECK FOR ILLNESS / CYCLE`, 'w');
  if (has(d.spo2) && d.spo2 < 95) add(`SpO₂ <b>${d.spo2}%</b> BELOW NOMINAL`, 'w');
  if (has(d.breathingDisturbance) && d.breathingDisturbance >= 5) add(`BREATHING DISTURBANCE INDEX <b>${d.breathingDisturbance}</b>`, 'w');
  if (d.stressSummary) add(`STRESS PROFILE: <b>${esc(d.stressSummary).toUpperCase()}</b>`, d.stressSummary === 'stressful' ? 'w' : '');
  if (has(d.steps)) add(`LOCOMOTION <b>${d.steps.toLocaleString()}</b> STEPS`);
  $('log').innerHTML = L.join('');
  $('log').classList.remove('flicker'); void $('log').offsetWidth; $('log').classList.add('flicker');
}

function renderWorkouts() {
  const w = state.data.workouts || [];
  $('workouts').innerHTML = w.length ? w.slice(0, 8).map((x) => {
    const mins = Math.round((new Date(x.end) - new Date(x.start)) / 60000);
    const when = new Date(x.start).toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `<li><b>${esc(x.activity)}</b><span>${when} · ${mins}m · ${x.calories ? Math.round(x.calories) + 'kcal' : '--'}${x.distance ? ' · ' + (x.distance / 1000).toFixed(1) + 'km' : ''}</span></li>`;
  }).join('') : '<li><span>NO WORKOUTS IN RANGE</span></li>';
}

function renderDayStrip() {
  const names = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  $('days').innerHTML = state.data.days.map((d, i) => { const dt = parseDay(d.day); return `<button data-i="${i}">${String(dt.getDate()).padStart(2, '0')}<span>${names[dt.getDay()]}</span></button>`; }).join('');
  $('days').onclick = (e) => { const b = e.target.closest('button'); if (b) { state.sel = Number(b.dataset.i); renderDay(); } };
}

function banner(msg, err) {
  const b = $('banner'); b.textContent = msg || ''; b.classList.toggle('hide', !msg); b.classList.toggle('err', Boolean(err));
}

function setLink(text, cls) { const l = $('slink'); l.textContent = text; l.className = cls; }

// ---------- data ----------
async function load(fresh) {
  setLink('SYNCING', 'warn');
  try {
    const [st, res] = await Promise.all([
      fetch('/api/status').then((r) => r.json()),
      fetch(`/api/data?days=${state.days}${fresh ? '&fresh=1' : ''}`),
    ]);
    state.status = st;
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || res.statusText);
    state.data = body;
  } catch (e) {
    setLink('OFFLINE', 'bad'); banner(`LINK FAILURE: ${e.message}`, true); return;
  }
  const dd = state.data, p = dd.profile || {};
  $('sid').textContent = p.id || '--------'; $('sage').textContent = has(p.age) ? p.age : '--';
  setLink(dd.mode === 'live' ? 'LIVE' : 'DEMO', dd.mode === 'live' ? 'ok' : 'warn');
  $('linkbtn').classList.toggle('hide', !(dd.mode === 'demo' && state.status.oauthConfigured && !state.status.linked));
  if (dd.mode === 'demo') banner('SIMULATED DATA — no Oura account linked. See README to connect your ring (add OURA_CLIENT_ID / OURA_CLIENT_SECRET to .env, then press JACK IN).');
  else banner(dd.warnings && dd.warnings.length ? `PARTIAL SIGNAL: ${dd.warnings.slice(0, 2).join(' | ')}` : '', Boolean(dd.warnings && dd.warnings.length));

  if (!dd.days.length) { banner('Oura returned no data for this range. Open the Oura app on your iPhone to sync the ring, then press SYNC.', true); return; }
  let i = dd.days.length - 1;
  while (i > 0 && !has(dd.days[i].readiness) && !has(dd.days[i].sleepScore)) i--;
  state.sel = i;
  renderDayStrip(); renderHR(); renderWorkouts(); renderDay();
  $('days').querySelector('button.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

// ---------- wire up ----------
$('range').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  state.days = Number(b.dataset.d);
  document.querySelectorAll('#range button').forEach((x) => x.classList.toggle('on', x === b));
  load();
};
$('refresh').onclick = () => load(true);
window.addEventListener('resize', () => { if (state.data && state.data.days.length) { drawTrends(); renderHR(); } });
setInterval(() => { $('clock').textContent = new Date().toLocaleTimeString([], { hour12: false }); }, 1000);
setInterval(() => load(true), 5 * 60 * 1000);
$('clock').textContent = new Date().toLocaleTimeString([], { hour12: false });
requestAnimationFrame(ecgFrame);
load();
