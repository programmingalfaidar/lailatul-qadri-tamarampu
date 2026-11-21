// ---- Hadist di layar iqamah: tampil bergantian selama hitung mundur ----
const IQAMAH_HADIST = [
  {
    text: "Luruskan dan rapatkan saf-saf kalian, karena sesungguhnya merapatkan saf termasuk kesempurnaan sholat berjama'ah.",
    narrator: 'HR. Bukhari & Muslim'
  },
  {
    text: 'Tidaklah seorang hamba Muslim melaksanakan shalat sunnah karena Allah setiap hari sebanyak 12 rakaat bukan shalat wajib, melainkan Allah akan membangunkan baginya sebuah rumah di surga.',
    narrator: 'HR. Muslim, no. 728'
  },
  {
    text: 'Dua rakaat fajar (shalat sunnah qabliyah Subuh) lebih baik daripada dunia dan seisinya.',
    narrator: 'HR. Muslim no. 725'
  }
];
const IQAMAH_HADIST_INTERVAL_MS = 15000; // lama tiap hadist tampil
const IQAMAH_HADIST_FADE_MS = 500;       // samakan dengan transition opacity .bg-hadist-iqamah di display.css

let iqamahHadistIndex = -1;

// elapsedMs = sudah berapa lama layar iqamah tampil; hadist berganti tiap IQAMAH_HADIST_INTERVAL_MS
function updateIqamahHadist(elapsedMs) {
  const index = Math.floor(Math.max(0, elapsedMs) / IQAMAH_HADIST_INTERVAL_MS) % IQAMAH_HADIST.length;
  if (index === iqamahHadistIndex) return;

  const isFirst = iqamahHadistIndex < 0;
  iqamahHadistIndex = index;

  const hadist = IQAMAH_HADIST[index];
  const box = document.getElementById('iqamahHadistBox');
  const swap = () => {
    document.getElementById('iqamahHadistText').textContent = hadist.text;
    document.getElementById('iqamahHadistNarrator').textContent = hadist.narrator;
    box.classList.remove('is-fading');
  };
  if (isFirst) { swap(); return; }
  box.classList.add('is-fading');
  setTimeout(swap, IQAMAH_HADIST_FADE_MS);
}

// Dipanggil saat layar iqamah tertutup, agar tampilan berikutnya langsung muncul tanpa fade
function resetIqamahHadist() {
  iqamahHadistIndex = -1;
}
