const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const SETTINGS_PATH = path.join(__dirname, 'data', 'settings.json');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readSettings() {
  return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
}

function writeSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function publicSettings(settings) {
  const { pin, ...rest } = settings;
  return rest;
}

function checkPin(req, res, next) {
  const settings = readSettings();
  const pin = req.body.pin || req.headers['x-pin'];
  if (pin !== settings.pin) {
    return res.status(401).json({ error: 'PIN salah' });
  }
  next();
}

// ---- Prayer times (Aladhan API) with simple daily cache per city/method ----
let prayerCache = { key: null, date: null, data: null };

async function getPrayerTimes(settings) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${settings.mosque.latitude}|${settings.mosque.longitude}|${settings.mosque.method}`;

  if (prayerCache.key === key && prayerCache.date === today && prayerCache.data) {
    return prayerCache.data;
  }

  // Pakai koordinat langsung (bukan timingsByCity) karena geocoding nama kota
  // di Aladhan API tidak selalu akurat untuk kota-kota di Indonesia.
  const url = new URL('https://api.aladhan.com/v1/timings');
  url.searchParams.set('latitude', settings.mosque.latitude);
  url.searchParams.set('longitude', settings.mosque.longitude);
  url.searchParams.set('method', settings.mosque.method);

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Aladhan API error: ${resp.status}`);
  const json = await resp.json();

  const timings = json.data.timings;
  const hijri = json.data.date.hijri;
  const corrections = settings.mosque.timeCorrections || {};

  function applyCorrection(key, hhmm) {
    const offsetMin = corrections[key] || 0;
    const [h, m] = hhmm.split(' ')[0].split(':').map(Number);
    const d = new Date(2000, 0, 1, h, m + offsetMin);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  const data = {
    date: today,
    hijri: `${hijri.day} ${hijri.month.en} ${hijri.year} H`,
    timings: {
      Imsak: applyCorrection('Imsak', timings.Imsak),
      Fajr: applyCorrection('Fajr', timings.Fajr),
      Sunrise: applyCorrection('Sunrise', timings.Sunrise),
      Dhuhr: applyCorrection('Dhuhr', timings.Dhuhr),
      Asr: applyCorrection('Asr', timings.Asr),
      Maghrib: applyCorrection('Maghrib', timings.Maghrib),
      Isha: applyCorrection('Isha', timings.Isha)
    }
  };

  prayerCache = { key, date: today, data };
  return data;
}

// ---- API routes ----

app.get('/api/settings', (req, res) => {
  res.json(publicSettings(readSettings()));
});

app.post('/api/settings', checkPin, (req, res) => {
  const settings = readSettings();
  const { mosque, iqamahOffsets, theme } = req.body;

  if (mosque) settings.mosque = { ...settings.mosque, ...mosque };
  if (iqamahOffsets) settings.iqamahOffsets = { ...settings.iqamahOffsets, ...iqamahOffsets };
  if (theme) settings.theme = { ...settings.theme, ...theme };

  writeSettings(settings);
  prayerCache = { key: null, date: null, data: null }; // invalidate cache on location change
  io.emit('settings-updated', publicSettings(settings));
  res.json(publicSettings(settings));
});

app.post('/api/auth/verify', (req, res) => {
  const settings = readSettings();
  res.json({ ok: req.body.pin === settings.pin });
});

app.post('/api/auth/change-pin', checkPin, (req, res) => {
  const settings = readSettings();
  const { newPin } = req.body;
  if (!newPin || String(newPin).length < 4) {
    return res.status(400).json({ error: 'PIN baru minimal 4 digit' });
  }
  settings.pin = String(newPin);
  writeSettings(settings);
  res.json({ ok: true });
});

app.get('/api/announcements', (req, res) => {
  res.json(readSettings().announcements);
});

app.post('/api/announcements', checkPin, (req, res) => {
  const settings = readSettings();
  const {
    title, body, duration, type, speaker, amount, narrator,
    period, saldoAwal, pemasukan, pengeluaran, saldoAkhir, file
  } = req.body;
  const t = type || 'umum';

  if (t === 'laporan') {
    if (!saldoAkhir) return res.status(400).json({ error: 'Saldo akhir wajib diisi' });
  } else if (t === 'nasehat') {
    if (!body) return res.status(400).json({ error: 'Teks nasehat wajib diisi' });
  } else if (t === 'custom') {
    if (!file) return res.status(400).json({ error: 'Nama file HTML wajib diisi' });
  } else if (!title || !body) {
    return res.status(400).json({ error: 'title dan body wajib diisi' });
  }

  const announcement = {
    id: 'a' + Date.now(),
    type: t,
    title: title || (t === 'nasehat' ? 'Nasehat' : t === 'laporan' ? 'Laporan Keuangan' : t === 'custom' ? 'Slide Kustom' : title),
    body: body || '',
    duration: duration || 8000,
    ...(speaker ? { speaker } : {}),
    ...(amount ? { amount } : {}),
    ...(narrator ? { narrator } : {}),
    ...(period ? { period } : {}),
    ...(saldoAwal ? { saldoAwal } : {}),
    ...(pemasukan ? { pemasukan } : {}),
    ...(pengeluaran ? { pengeluaran } : {}),
    ...(saldoAkhir ? { saldoAkhir } : {}),
    ...(file ? { file } : {})
  };
  settings.announcements.push(announcement);
  writeSettings(settings);
  io.emit('announcements-updated', settings.announcements);
  res.json(announcement);
});

app.put('/api/announcements/:id', checkPin, (req, res) => {
  const settings = readSettings();
  const idx = settings.announcements.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Tidak ditemukan' });

  const {
    title, body, duration, type, speaker, amount, narrator,
    period, saldoAwal, pemasukan, pengeluaran, saldoAkhir, file
  } = req.body;
  settings.announcements[idx] = {
    ...settings.announcements[idx],
    ...(title !== undefined ? { title } : {}),
    ...(body !== undefined ? { body } : {}),
    ...(duration !== undefined ? { duration } : {}),
    ...(type !== undefined ? { type } : {}),
    ...(speaker !== undefined ? { speaker } : {}),
    ...(amount !== undefined ? { amount } : {}),
    ...(narrator !== undefined ? { narrator } : {}),
    ...(period !== undefined ? { period } : {}),
    ...(saldoAwal !== undefined ? { saldoAwal } : {}),
    ...(pemasukan !== undefined ? { pemasukan } : {}),
    ...(pengeluaran !== undefined ? { pengeluaran } : {}),
    ...(saldoAkhir !== undefined ? { saldoAkhir } : {}),
    ...(file !== undefined ? { file } : {})
  };
  writeSettings(settings);
  io.emit('announcements-updated', settings.announcements);
  res.json(settings.announcements[idx]);
});

app.delete('/api/announcements/:id', checkPin, (req, res) => {
  const settings = readSettings();
  settings.announcements = settings.announcements.filter(a => a.id !== req.params.id);
  writeSettings(settings);
  io.emit('announcements-updated', settings.announcements);
  res.json({ ok: true });
});

app.post('/api/announcements/reorder', checkPin, (req, res) => {
  const settings = readSettings();
  const { order } = req.body; // array of ids in new order
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order harus array' });

  const byId = new Map(settings.announcements.map(a => [a.id, a]));
  const reordered = order.map(id => byId.get(id)).filter(Boolean);
  for (const a of settings.announcements) {
    if (!order.includes(a.id)) reordered.push(a);
  }
  settings.announcements = reordered;
  writeSettings(settings);
  io.emit('announcements-updated', settings.announcements);
  res.json(settings.announcements);
});

app.get('/api/prayertimes', async (req, res) => {
  try {
    const settings = readSettings();
    const data = await getPrayerTimes(settings);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Gagal mengambil jadwal sholat', detail: String(err.message || err) });
  }
});

app.get('/', (req, res) => {
  res.redirect('/display.html');
});

server.listen(PORT, () => {
  console.log(`Masjid Display server jalan di http://localhost:${PORT}`);
  console.log(`  Layar TV : http://<IP-server-ini>:${PORT}/display.html`);
  console.log(`  Kontrol HP: http://<IP-server-ini>:${PORT}/admin.html`);
});
