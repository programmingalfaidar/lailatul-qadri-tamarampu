const FARD_ORDER = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const LABELS = {
  Imsak: 'Imsak', Fajr: 'Subuh', Sunrise: 'Syuruq', Dhuhr: 'Dzuhur',
  Asr: 'Ashar', Maghrib: 'Maghrib', Isha: 'Isya'
};

function parseTimeToday(hhmm) {
  const clean = hhmm.split(' ')[0];
  const [h, m] = clean.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function getNextFard(timings, now) {
  now = now || new Date();
  for (const key of FARD_ORDER) {
    const t = parseTimeToday(timings[key]);
    if (t > now) return { key, time: t };
  }
  const t = parseTimeToday(timings.Fajr);
  t.setDate(t.getDate() + 1);
  return { key: 'Fajr', time: t };
}

function formatDuration(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
