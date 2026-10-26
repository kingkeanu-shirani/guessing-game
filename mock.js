'use strict';
// Deterministic synthetic data in the same shape as the live payload, for demo mode.

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function buildMock(days) {
  const r = rng(2077);
  const now = new Date();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const wave = Math.sin((days - i) / 2.3);
    const sleepScore = Math.round(78 + wave * 8 + (r() - 0.5) * 14);
    const readiness = Math.round(76 + wave * 9 + (r() - 0.5) * 16);
    const steps = Math.round(7800 + (r() - 0.35) * 7000);
    const total = Math.round((6.6 + wave * 0.6 + (r() - 0.5) * 1.4) * 3600);
    const deep = Math.round(total * (0.14 + r() * 0.06));
    const rem = Math.round(total * (0.2 + r() * 0.05));
    const awake = Math.round(1500 + r() * 1800);
    const bed = new Date(d); bed.setHours(23, Math.round(r() * 50), 0, 0); bed.setDate(bed.getDate() - 1);
    const wake = new Date(bed.getTime() + (total + awake) * 1000);
    out.push({
      day: ymd(d),
      sleepScore, readiness,
      activityScore: Math.round(80 + (r() - 0.5) * 30),
      steps,
      activeCalories: Math.round(steps * 0.045 + r() * 120),
      totalCalories: Math.round(2150 + steps * 0.04),
      tempDev: +((r() - 0.5) * 1.1).toFixed(2),
      spo2: +(96.5 + r() * 2).toFixed(1),
      breathingDisturbance: Math.round(r() * 4),
      stressMin: Math.round(40 + r() * 200),
      recoveryMin: Math.round(60 + r() * 220),
      stressSummary: ['restored', 'normal', 'normal', 'stressful'][Math.floor(r() * 4)],
      sleep: {
        total, deep, rem, light: total - deep - rem, awake,
        efficiency: Math.round(100 * total / (total + awake)),
        avgHrv: Math.round(52 + wave * 10 + (r() - 0.5) * 14),
        lowestHr: Math.round(52 + (r() - 0.5) * 6 - wave * 2),
        avgHr: Math.round(58 + (r() - 0.5) * 5),
        avgBreath: +(14.5 + (r() - 0.5) * 1.6).toFixed(1),
        bedtimeStart: bed.toISOString(), bedtimeEnd: wake.toISOString(),
      },
    });
  }

  // 48h of 5-minute heart rate samples
  const hr = [];
  const start = now.getTime() - 48 * 3600 * 1000;
  for (let t = start; t <= now.getTime(); t += 5 * 60 * 1000) {
    const h = new Date(t).getHours() + new Date(t).getMinutes() / 60;
    const asleep = h < 6.8 || h > 23.3;
    let bpm = asleep ? 56 + Math.sin(t / 2.1e6) * 4 : 74 + Math.sin(t / 7e5) * 9;
    if (!asleep && r() < 0.05) bpm += 30 + r() * 25; // bursts of activity
    hr.push({ t: new Date(t).toISOString(), bpm: Math.round(bpm + (r() - 0.5) * 5), src: asleep ? 'rest' : 'awake' });
  }

  const workouts = [
    { activity: 'running', calories: 412, distance: 6200, start: new Date(now.getTime() - 26 * 3600e3).toISOString(), end: new Date(now.getTime() - 25 * 3600e3).toISOString(), intensity: 'hard' },
    { activity: 'strength training', calories: 238, distance: 0, start: new Date(now.getTime() - 74 * 3600e3).toISOString(), end: new Date(now.getTime() - 73 * 3600e3).toISOString(), intensity: 'moderate' },
    { activity: 'walking', calories: 160, distance: 4100, start: new Date(now.getTime() - 120 * 3600e3).toISOString(), end: new Date(now.getTime() - 119 * 3600e3).toISOString(), intensity: 'easy' },
  ];

  return {
    mode: 'demo',
    profile: { id: 'V-2077-DEMO', age: 29, sex: 'unspecified', weight: 72, height: 1.78, email: null },
    days: out, hr, workouts, warnings: [],
  };
}

module.exports = { buildMock };
