const PIN_KEY = 'masjid_pin';
let settings = null;

const el = (id) => document.getElementById(id);

function getPin() {
  return localStorage.getItem(PIN_KEY) || '';
}
function setPin(pin) {
  localStorage.setItem(PIN_KEY, pin);
}
function clearPin() {
  localStorage.removeItem(PIN_KEY);
}

function showToast(msg) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

async function apiFetch(url, options = {}) {
  const opts = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Pin': getPin(),
      ...(options.headers || {})
    }
  };
  const res = await fetch(url, opts);
  if (res.status === 401) {
    clearPin();
    showLogin();
    throw new Error('PIN tidak valid, silakan masuk kembali.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request gagal (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

function showLogin() {
  el('loginScreen').classList.remove('hidden');
  el('mainScreen').classList.add('hidden');
}
function showMain() {
  el('loginScreen').classList.add('hidden');
  el('mainScreen').classList.remove('hidden');
}

// ---- Login ----
el('loginBtn').addEventListener('click', async () => {
  const pin = el('pinInput').value.trim();
  el('loginError').textContent = '';
  if (!pin) return;
  try {
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    const data = await res.json();
    if (data.ok) {
      setPin(pin);
      await bootMain();
    } else {
      el('loginError').textContent = 'PIN salah, coba lagi.';
    }
  } catch (e) {
    el('loginError').textContent = 'Gagal menghubungi server.';
  }
});

el('logoutBtn').addEventListener('click', () => {
  clearPin();
  showLogin();
});

// ---- Load & render settings ----
async function loadSettings() {
  settings = await apiFetch('/api/settings');
  el('headerMosqueName').textContent = settings.mosque.name;
  el('fName').value = settings.mosque.name;
  el('fCity').value = settings.mosque.city;
  el('fCountry').value = settings.mosque.country;
  el('fLatitude').value = settings.mosque.latitude;
  el('fLongitude').value = settings.mosque.longitude;
  el('fMethod').value = String(settings.mosque.method);

  el('oFajr').value = settings.iqamahOffsets.Fajr;
  el('oDhuhr').value = settings.iqamahOffsets.Dhuhr;
  el('oAsr').value = settings.iqamahOffsets.Asr;
  el('oMaghrib').value = settings.iqamahOffsets.Maghrib;
  el('oIsha').value = settings.iqamahOffsets.Isha;

  renderAnnouncements();
}

const TYPE_LABELS = { umum: 'Umum', kajian: 'Kajian', infaq: 'Infaq & Keuangan', laporan: 'Laporan Keuangan', hadist: 'Hadist', nasehat: 'Nasehat', custom: 'Custom HTML' };
const TYPE_GROUPS = { kajian: ['fieldSpeaker'], infaq: ['fieldAmount'], hadist: ['fieldNarrator'], laporan: ['fieldLaporan'], custom: ['fieldCustom'] };
const ALL_TYPE_GROUPS = ['fieldSpeaker', 'fieldAmount', 'fieldNarrator', 'fieldLaporan', 'fieldCustom'];

function updateTypeFields() {
  const type = el('newType').value;
  ALL_TYPE_GROUPS.forEach(id => el(id).classList.add('hidden'));
  (TYPE_GROUPS[type] || []).forEach(id => el(id).classList.remove('hidden'));
  el('fieldTitleWrap').classList.toggle('hidden', type === 'nasehat');
  el('fieldBodyWrap').classList.toggle('hidden', type === 'laporan' || type === 'custom');
  el('newBodyLabel').textContent = type === 'nasehat' ? 'Teks Nasehat' : 'Isi Pengumuman';
}
el('newType').addEventListener('change', updateTypeFields);
updateTypeFields();

function renderAnnouncements() {
  const list = el('announceList');
  list.innerHTML = '';
  settings.announcements.forEach((a, idx) => {
    const item = document.createElement('div');
    item.className = 'announce-item';
    const extra = a.speaker || a.amount || a.narrator || a.file ||
      (a.type === 'laporan' ? `${a.period || ''} · Saldo Akhir ${a.saldoAkhir || '-'}` : '');
    item.innerHTML = `
      <div class="title-row">
        <span>${escapeHtml(a.title)} <span class="type-tag">${TYPE_LABELS[a.type] || 'Umum'}</span></span>
        <span>${Math.round((a.duration || 8000) / 1000)}s</span>
      </div>
      ${extra ? `<div class="body-text"><strong>${escapeHtml(extra)}</strong></div>` : ''}
      <div class="body-text">${escapeHtml(a.body)}</div>
      <div class="actions">
        <button class="btn-secondary btn-small" data-act="up">▲</button>
        <button class="btn-secondary btn-small" data-act="down">▼</button>
        <button class="btn-secondary btn-small" data-act="edit">Edit</button>
        <button class="btn-danger btn-small" data-act="del">Hapus</button>
      </div>
    `;
    item.querySelector('[data-act="up"]').addEventListener('click', () => moveAnnouncement(idx, -1));
    item.querySelector('[data-act="down"]').addEventListener('click', () => moveAnnouncement(idx, 1));
    item.querySelector('[data-act="edit"]').addEventListener('click', () => editAnnouncement(a));
    item.querySelector('[data-act="del"]').addEventListener('click', () => deleteAnnouncement(a.id));
    list.appendChild(item);
  });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ---- Save mosque info ----
el('saveMosqueBtn').addEventListener('click', async () => {
  try {
    settings = await apiFetch('/api/settings', {
      method: 'POST',
      body: JSON.stringify({
        mosque: {
          name: el('fName').value.trim(),
          city: el('fCity').value.trim(),
          country: el('fCountry').value.trim(),
          latitude: Number(el('fLatitude').value),
          longitude: Number(el('fLongitude').value),
          method: Number(el('fMethod').value)
        }
      })
    });
    el('headerMosqueName').textContent = settings.mosque.name;
    showToast('Info masjid disimpan.');
  } catch (e) {
    showToast(e.message);
  }
});

// ---- Save iqamah offsets ----
el('saveOffsetsBtn').addEventListener('click', async () => {
  try {
    settings = await apiFetch('/api/settings', {
      method: 'POST',
      body: JSON.stringify({
        iqamahOffsets: {
          Fajr: Number(el('oFajr').value) || 0,
          Dhuhr: Number(el('oDhuhr').value) || 0,
          Asr: Number(el('oAsr').value) || 0,
          Maghrib: Number(el('oMaghrib').value) || 0,
          Isha: Number(el('oIsha').value) || 0
        }
      })
    });
    showToast('Jeda iqamah disimpan.');
  } catch (e) {
    showToast(e.message);
  }
});

// ---- Announcements CRUD ----
el('addAnnounceBtn').addEventListener('click', async () => {
  const type = el('newType').value;
  let title = el('newTitle').value.trim();
  const body = el('newBody').value.trim();
  const duration = (Number(el('newDuration').value) || 8) * 1000;
  const speaker = el('newSpeaker').value.trim();
  const amount = el('newAmount').value.trim();
  const narrator = el('newNarrator').value.trim();
  const period = el('newPeriod').value.trim();
  const saldoAwal = el('newSaldoAwal').value.trim();
  const pemasukan = el('newPemasukan').value.trim();
  const pengeluaran = el('newPengeluaran').value.trim();
  const saldoAkhir = el('newSaldoAkhir').value.trim();
  const file = el('newFile').value.trim();

  if (type === 'nasehat') {
    title = title || 'Nasehat';
    if (!body) {
      showToast('Teks nasehat wajib diisi.');
      return;
    }
  } else if (type === 'laporan') {
    title = title || 'Laporan Keuangan';
    if (!saldoAkhir) {
      showToast('Saldo akhir wajib diisi.');
      return;
    }
  } else if (type === 'custom') {
    title = title || 'Slide Kustom';
    if (!file) {
      showToast('Nama file HTML wajib diisi.');
      return;
    }
  } else if (!title || !body) {
    showToast('Judul dan isi pengumuman wajib diisi.');
    return;
  }

  try {
    await apiFetch('/api/announcements', {
      method: 'POST',
      body: JSON.stringify({
        type, title, body, duration,
        ...(type === 'kajian' ? { speaker } : {}),
        ...(type === 'infaq' ? { amount } : {}),
        ...(type === 'hadist' ? { narrator } : {}),
        ...(type === 'laporan' ? { period, saldoAwal, pemasukan, pengeluaran, saldoAkhir } : {}),
        ...(type === 'custom' ? { file } : {})
      })
    });
    ['newTitle', 'newBody', 'newSpeaker', 'newAmount', 'newNarrator', 'newPeriod', 'newSaldoAwal', 'newPemasukan', 'newPengeluaran', 'newSaldoAkhir', 'newFile']
      .forEach(id => { el(id).value = ''; });
    el('newDuration').value = 8;
    settings = await apiFetch('/api/settings');
    renderAnnouncements();
    showToast('Pengumuman ditambahkan.');
  } catch (e) {
    showToast(e.message);
  }
});

async function editAnnouncement(a) {
  const validTypes = ['umum', 'kajian', 'infaq', 'laporan', 'hadist', 'nasehat', 'custom'];
  const typeInput = prompt('Jenis (umum/kajian/infaq/laporan/hadist/nasehat/custom):', a.type || 'umum');
  if (typeInput === null) return;
  const type = validTypes.includes(typeInput.trim()) ? typeInput.trim() : (a.type || 'umum');

  let title = a.title;
  if (type !== 'nasehat') {
    title = prompt('Judul:', a.title);
    if (title === null) return;
  } else {
    title = a.title || 'Nasehat';
  }

  let speaker, amount, narrator, period, saldoAwal, pemasukan, pengeluaran, saldoAkhir, file;
  if (type === 'kajian') {
    speaker = prompt('Pemateri & jadwal:', a.speaker || '');
    if (speaker === null) return;
  } else if (type === 'infaq') {
    amount = prompt('Nominal (cth: Rp 59.250.000):', a.amount || '');
    if (amount === null) return;
  } else if (type === 'hadist') {
    narrator = prompt('Perawi (cth: HR. Bukhari Muslim):', a.narrator || '');
    if (narrator === null) return;
  } else if (type === 'laporan') {
    period = prompt('Periode (cth: Bulan Maret 2025):', a.period || '');
    if (period === null) return;
    saldoAwal = prompt('Saldo Awal:', a.saldoAwal || '');
    if (saldoAwal === null) return;
    pemasukan = prompt('Pemasukan:', a.pemasukan || '');
    if (pemasukan === null) return;
    pengeluaran = prompt('Pengeluaran:', a.pengeluaran || '');
    if (pengeluaran === null) return;
    saldoAkhir = prompt('Saldo Akhir:', a.saldoAkhir || '');
    if (saldoAkhir === null) return;
  } else if (type === 'custom') {
    file = prompt('Nama file HTML (di folder public/slides/):', a.file || '');
    if (file === null) return;
  }

  let body = a.body;
  if (type !== 'laporan' && type !== 'custom') {
    body = prompt(type === 'nasehat' ? 'Teks nasehat:' : 'Isi pengumuman:', a.body || '');
    if (body === null) return;
  }

  const durationSec = prompt('Durasi tampil (detik):', Math.round((a.duration || 8000) / 1000));
  if (durationSec === null) return;
  try {
    await apiFetch(`/api/announcements/${a.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        type, title, body, duration: (Number(durationSec) || 8) * 1000,
        ...(type === 'kajian' ? { speaker } : {}),
        ...(type === 'infaq' ? { amount } : {}),
        ...(type === 'hadist' ? { narrator } : {}),
        ...(type === 'laporan' ? { period, saldoAwal, pemasukan, pengeluaran, saldoAkhir } : {}),
        ...(type === 'custom' ? { file } : {})
      })
    });
    settings = await apiFetch('/api/settings');
    renderAnnouncements();
    showToast('Pengumuman diperbarui.');
  } catch (e) {
    showToast(e.message);
  }
}

async function deleteAnnouncement(id) {
  if (!confirm('Hapus pengumuman ini?')) return;
  try {
    await apiFetch(`/api/announcements/${id}`, { method: 'DELETE' });
    settings = await apiFetch('/api/settings');
    renderAnnouncements();
    showToast('Pengumuman dihapus.');
  } catch (e) {
    showToast(e.message);
  }
}

async function moveAnnouncement(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= settings.announcements.length) return;
  const order = settings.announcements.map(a => a.id);
  [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
  try {
    await apiFetch('/api/announcements/reorder', {
      method: 'POST',
      body: JSON.stringify({ order })
    });
    settings = await apiFetch('/api/settings');
    renderAnnouncements();
  } catch (e) {
    showToast(e.message);
  }
}

// ---- Change PIN ----
el('changePinBtn').addEventListener('click', async () => {
  const newPin = el('newPin').value.trim();
  if (newPin.length < 4) {
    showToast('PIN baru minimal 4 digit.');
    return;
  }
  try {
    await apiFetch('/api/auth/change-pin', {
      method: 'POST',
      body: JSON.stringify({ newPin })
    });
    setPin(newPin);
    el('newPin').value = '';
    showToast('PIN berhasil diganti.');
  } catch (e) {
    showToast(e.message);
  }
});

// ---- Live sync from other admin devices ----
const socket = io();
socket.on('announcements-updated', (announcements) => {
  if (settings) {
    settings.announcements = announcements;
    renderAnnouncements();
  }
});

// ---- Boot ----
async function bootMain() {
  try {
    await loadSettings();
    showMain();
  } catch (e) {
    showLogin();
  }
}

(function init() {
  if (getPin()) {
    bootMain();
  } else {
    showLogin();
  }
})();
