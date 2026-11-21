const state = {
  settings: null,
  prayerTimes: null,
  announcements: [],
  slideList: ['prayer'],
  slideIndex: 0,
  slideTimer: null
};

const PRAYER_SLIDE_DURATION = 10000;
const HERO_IMAGES = ['hero.png', 'hero2.jpeg', 'hero3.jpeg', 'hero4.jpeg', 'hero5.jpeg'];
const HERO_PHOTO_INTERVAL = 12000;
const GRID_ORDER = ['Imsak', 'Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

async function loadSettings() {
  const res = await fetch('/api/settings');
  state.settings = await res.json();
  document.getElementById('mosqueName').textContent = state.settings.mosque.name;
  state.announcements = state.settings.announcements;
  buildSlides();
  buildTicker();
}

async function loadPrayerTimes() {
  try {
    const res = await fetch('/api/prayertimes');
    if (!res.ok) throw new Error('bad status');
    state.prayerTimes = await res.json();
    document.getElementById('dateHijri').textContent = state.prayerTimes.hijri;
    renderPrayerGrid();
    hideStatus();
  } catch (e) {
    showStatus('Gagal memuat jadwal sholat, memakai data terakhir.');
  }
}

function renderPrayerGrid() {
  const grid = document.getElementById('prayerGrid');
  grid.innerHTML = '';
  if (!state.prayerTimes) return;
  const next = getNextFard(state.prayerTimes.timings);

  GRID_ORDER.forEach(key => {
    const box = document.createElement('div');
    box.className = 'prayer-box' + (key === next.key ? ' active' : '');
    box.innerHTML = `<div class="label">${LABELS[key]}</div><div class="time">${state.prayerTimes.timings[key].split(' ')[0]}</div>`;
    grid.appendChild(box);
  });
}

function updateActiveBox(activeKey) {
  const grid = document.getElementById('prayerGrid');
  [...grid.children].forEach((box, i) => {
    box.classList.toggle('active', GRID_ORDER[i] === activeKey);
  });
}

const PRE_ADZAN_WINDOW_MS = 3 * 60 * 1000;

function updatePreAdzan(now) {
  const overlay = document.getElementById('preAdzanOverlay');
  for (const key of FARD_ORDER) {
    const prayerTime = parseTimeToday(state.prayerTimes.timings[key]);
    const diff = prayerTime - now;
    if (diff > 0 && diff <= PRE_ADZAN_WINDOW_MS) {
      overlay.classList.add('show');
      document.getElementById('preAdzanPrayerName').textContent = LABELS[key];
      document.getElementById('preAdzanCountdown').textContent = formatDuration(diff);
      return;
    }
  }
  overlay.classList.remove('show');
}

const ADZAN_DURATION_MS = 4 * 60 * 1000;

function updateAdzan(now) {
  const overlay = document.getElementById('adzanOverlay');
  for (const key of FARD_ORDER) {
    const prayerTime = parseTimeToday(state.prayerTimes.timings[key]);
    const adzanEndTime = new Date(prayerTime.getTime() + ADZAN_DURATION_MS);
    if (now >= prayerTime && now < adzanEndTime) {
      overlay.classList.add('show');
      document.getElementById('adzanPrayerName').textContent = LABELS[key];
      return;
    }
  }
  overlay.classList.remove('show');
}

let iqamahAudioCtx = null;
let iqamahWarnedKey = null;
let iqamahWarnedSec = null;

function getIqamahAudioCtx() {
  if (!iqamahAudioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    iqamahAudioCtx = new Ctx();
  }
  if (iqamahAudioCtx.state === 'suspended') {
    iqamahAudioCtx.resume().catch(() => {});
  }
  return iqamahAudioCtx;
}

// Bunyi 1x "beep" singkat setiap detik sebagai hitungan mundur menjelang iqamah
function playIqamahWarning() {
  const ctx = getIqamahAudioCtx();
  if (!ctx) return;
  const startTime = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.35, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.22);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + 0.25);
}

function updateIqamah(now) {
  const overlay = document.getElementById('iqamahOverlay');
  const offsets = state.settings.iqamahOffsets;
  for (const key of FARD_ORDER) {
    const offsetMin = offsets[key] || 0;
    if (!offsetMin) continue;
    const prayerTime = parseTimeToday(state.prayerTimes.timings[key]);
    const adzanEndTime = new Date(prayerTime.getTime() + ADZAN_DURATION_MS);
    const iqamahTime = new Date(adzanEndTime.getTime() + offsetMin * 60000);
    if (now >= adzanEndTime && now < iqamahTime) {
      overlay.classList.add('show');
      const totalSec = Math.max(0, Math.floor((iqamahTime - now) / 1000));
      const pad = n => String(n).padStart(2, '0');
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      document.getElementById('iqamahCountdown').textContent = `${pad(m)}:${pad(s)}`;
      updateIqamahHadist(now - adzanEndTime);
      if (totalSec <= 10 && (iqamahWarnedKey !== key || iqamahWarnedSec !== totalSec)) {
        iqamahWarnedKey = key;
        iqamahWarnedSec = totalSec;
        playIqamahWarning();
      }
      return;
    }
  }
  overlay.classList.remove('show');
  iqamahWarnedKey = null;
  iqamahWarnedSec = null;
  resetIqamahHadist();
}

// ---- Layar putih polos: berlangsung sejak iqamah selesai (mulai sholat), agar tidak mengganggu ----
const SHALAT_BLANK_DURATION_MS = {
  Fajr: 12 * 60 * 1000,
  Dhuhr: 11 * 60 * 1000,
  Asr: 12 * 60 * 1000,
  Maghrib: 10 * 60 * 1000,
  Isha: 12 * 60 * 1000
};

function updateShalatBlank(now) {
  const overlay = document.getElementById('shalatBlankOverlay');
  const offsets = state.settings.iqamahOffsets;
  for (const key of Object.keys(SHALAT_BLANK_DURATION_MS)) {
    const offsetMin = offsets[key] || 0;
    if (!offsetMin) continue;
    const prayerTime = parseTimeToday(state.prayerTimes.timings[key]);
    const adzanEndTime = new Date(prayerTime.getTime() + ADZAN_DURATION_MS);
    const iqamahTime = new Date(adzanEndTime.getTime() + offsetMin * 60000);
    const blankEndTime = new Date(iqamahTime.getTime() + SHALAT_BLANK_DURATION_MS[key]);
    if (now >= iqamahTime && now < blankEndTime) {
      overlay.classList.add('show');
      return;
    }
  }
  overlay.classList.remove('show');
}

function tick() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('dateMasehi').textContent = now.toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  if (state.prayerTimes && state.settings) {
    const next = getNextFard(state.prayerTimes.timings, now);
    const countdown = formatDuration(next.time - now);
    document.getElementById('heroNextLabel').textContent = `Menuju ${LABELS[next.key]}`;
    document.getElementById('heroCountdown').textContent = countdown;
    updateActiveBox(next.key);
    updatePreAdzan(now);
    updateAdzan(now);
    updateIqamah(now);
    updateShalatBlank(now);
  }
}

// ---- Hero slideshow: jadwal sholat & tiap pengumuman gantian ----
function buildSlides() {
  state.slideList = ['prayer', ...state.announcements.map(a => a.id)];
  goToSlide(0);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : str;
  return d.innerHTML;
}

// ---- Template per jenis konten (umum, kajian, infaq, hadist) ----
function renderAnnounceSlide(item, isFirst) {
  const type = item.type || 'umum';
  const textEl = document.getElementById('heroSlideText');
  const inner = document.getElementById('heroSlideInner');
  textEl.className = 'hero-slide hero-slide-text variant-' + type;

  if (type === 'kajian') {
    inner.innerHTML = `
      <div class="type-badge kajian">📖 Kajian Rutin</div>
      <h1 class="hero-title">${escapeHtml(item.title)}</h1>
      ${item.speaker ? `<div class="kajian-speaker">${escapeHtml(item.speaker)}</div>` : ''}
      <p class="hero-desc">${escapeHtml(item.body)}</p>
    `;
  } else if (type === 'infaq') {
    inner.innerHTML = `
      <div class="type-badge infaq">💚 ${escapeHtml(item.title)}</div>
      ${item.amount ? `<div class="infaq-amount">${escapeHtml(item.amount)}</div>` : ''}
      <p class="hero-desc">${escapeHtml(item.body)}</p>
    `;
  } else if (type === 'hadist') {
    inner.innerHTML = `
      <div class="hadist-mark">&ldquo;</div>
      <p class="hadist-text">${escapeHtml(item.body)}</p>
      ${item.narrator ? `<div class="hadist-narrator">${escapeHtml(item.narrator)}</div>` : ''}
    `;
  } else if (type === 'nasehat') {
    inner.innerHTML = `<div class="nasehat-text">${escapeHtml(item.body)}</div>`;
  } else if (type === 'laporan') {
    const rows = [
      ['Saldo Awal', item.saldoAwal],
      ['Pemasukan', item.pemasukan],
      ['Pengeluaran', item.pengeluaran]
    ].filter(([, val]) => val);
    inner.innerHTML = `
      <div class="type-badge infaq">📊 ${escapeHtml(item.title)}</div>
      ${item.period ? `<div class="laporan-period">${escapeHtml(item.period)}</div>` : ''}
      <div class="laporan-rows">
        ${rows.map(([label, val]) => `
          <div class="laporan-row">
            <span class="laporan-label">${escapeHtml(label)}</span>
            <span class="laporan-value">${escapeHtml(val)}</span>
          </div>
        `).join('')}
        ${item.saldoAkhir ? `
          <div class="laporan-row laporan-final">
            <span class="laporan-label">Saldo Akhir</span>
            <span class="laporan-value">${escapeHtml(item.saldoAkhir)}</span>
          </div>
        ` : ''}
      </div>
    `;
  } else {
    const eyebrow = isFirst ? 'Ahlan Wa Sahlan' : 'Pengumuman';
    const title = isFirst
      ? ((state.settings && state.settings.mosque.name) || item.title)
      : item.title;
    inner.innerHTML = `
      <div class="hero-eyebrow">${escapeHtml(eyebrow)}</div>
      <h1 class="hero-title">${escapeHtml(title)}</h1>
      <p class="hero-desc">${escapeHtml(item.body)}</p>
    `;
  }
}

function goToSlide(index) {
  clearTimeout(state.slideTimer);
  if (!state.slideList.length) return;
  state.slideIndex = ((index % state.slideList.length) + state.slideList.length) % state.slideList.length;
  const slideKey = state.slideList[state.slideIndex];

  const prayerEl = document.getElementById('heroSlidePrayer');
  const textEl = document.getElementById('heroSlideText');
  const customEl = document.getElementById('heroSlideCustom');
  const heroEl = document.getElementById('hero');
  const dashboardEl = document.getElementById('dashboard');

  let duration = PRAYER_SLIDE_DURATION;
  heroEl.classList.remove('prayer-active', 'nasehat-active');
  dashboardEl.classList.remove('custom-active');

  if (slideKey === 'prayer') {
    prayerEl.classList.add('show');
    textEl.classList.remove('show');
    customEl.classList.remove('show');
    heroEl.classList.add('prayer-active');
  } else {
    const item = state.announcements.find(a => a.id === slideKey);
    if (!item) {
      return goToSlide(state.slideIndex + 1);
    }
    prayerEl.classList.remove('show');

    if ((item.type || 'umum') === 'custom' && item.file) {
      const frame = document.getElementById('heroCustomFrame');
      frame.src = '/slides/' + item.file;
      textEl.classList.remove('show');
      customEl.classList.add('show');
      dashboardEl.classList.add('custom-active');
    } else {
      const isFirst = state.announcements[0] && state.announcements[0].id === item.id;
      renderAnnounceSlide(item, isFirst);
      textEl.classList.add('show');
      customEl.classList.remove('show');
      if ((item.type || 'umum') === 'nasehat') {
        heroEl.classList.add('nasehat-active');
      }
    }
    duration = item.duration || 8000;
  }

  state.slideTimer = setTimeout(() => goToSlide(state.slideIndex + 1), duration);
}

// ---- Ticker berjalan di bawah ----
function tickerTextFor(item) {
  const type = item.type || 'umum';
  if (type === 'nasehat') return item.body;
  if (type === 'laporan') return `${item.title}${item.period ? ' ' + item.period : ''}: Saldo Akhir ${item.saldoAkhir || '-'}`;
  if (type === 'custom') return item.title;
  return item.body ? `${item.title}: ${item.body}` : item.title;
}

function buildTicker() {
  const el = document.getElementById('tickerContent');
  el.innerHTML = '';

  state.announcements.forEach((item, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'ticker-sep';
      sep.textContent = '|';
      el.appendChild(sep);
    }
    const span = document.createElement('span');
    span.textContent = tickerTextFor(item);
    el.appendChild(span);
  });

  const totalLen = state.announcements.reduce((sum, a) => sum + tickerTextFor(a).length, 0);
  el.style.animationDuration = `${Math.max(18, totalLen * 0.12)}s`;
}

function showStatus(msg) {
  const el = document.getElementById('statusBanner');
  el.textContent = msg;
  el.classList.add('show');
}
function hideStatus() {
  document.getElementById('statusBanner').classList.remove('show');
}

// ---- Background hero: gonta-ganti gambar dari folder images ----
function initHeroPhotoRotation() {
  if (!HERO_IMAGES.length) return;

  const a = document.getElementById('heroPhotoA');
  const b = document.getElementById('heroPhotoB');
  let index = 0;
  let useA = true;

  a.style.backgroundImage = `url('/images/${HERO_IMAGES[0]}')`;
  a.classList.add('show');

  if (HERO_IMAGES.length <= 1) return;

  setInterval(() => {
    index = (index + 1) % HERO_IMAGES.length;
    const next = useA ? b : a;
    const prev = useA ? a : b;
    next.style.backgroundImage = `url('/images/${HERO_IMAGES[index]}')`;
    next.classList.add('show');
    prev.classList.remove('show');
    useA = !useA;
  }, HERO_PHOTO_INTERVAL);
}

// ---- Socket.io live updates ----
const socket = io();
socket.on('connect', hideStatus);
socket.on('disconnect', () => showStatus('Koneksi ke server terputus, mencoba menyambung ulang...'));
socket.on('settings-updated', (settings) => {
  state.settings = settings;
  document.getElementById('mosqueName').textContent = settings.mosque.name;
  state.announcements = settings.announcements;
  buildTicker();
  loadPrayerTimes();
});
socket.on('announcements-updated', (announcements) => {
  state.announcements = announcements;
  buildSlides();
  buildTicker();
});

// ---- Init ----
(async function init() {
  initHeroPhotoRotation();
  await loadSettings();
  await loadPrayerTimes();
  tick();
  setInterval(tick, 1000);
  setInterval(loadPrayerTimes, 60 * 60 * 1000);
})();
