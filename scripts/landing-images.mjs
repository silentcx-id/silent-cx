// Membuat gambar bawaan landing page di public/landing/: ilustrasi hero dan 6 halaman contoh laporan.
// Semua gambar digambar dari kode ini (bukan foto atau ilustrasi pihak lain), dengan data fiktif PT ABC / Cafe 123
// yang sama dengan contoh laporan PDF. Admin bisa menggantinya lewat menu Konten.
// Jalankan: node scripts/landing-images.mjs
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = new URL("../public/landing/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const C = {
  ink: "#06080C",
  panel: "#0E1117",
  raise: "#161A22",
  line: "#242A35",
  gold: "#E5A93C",
  goldHi: "#F0BD5E",
  goldLo: "#B9822A",
  paper: "#FFFFFF",
  cream: "#F8F5EE",
  sand: "#ECE6D8",
  text: "#1B1F27",
  muted: "#6B717C",
  good: "#2E8540",
  warn: "#C9720A",
  bad: "#C0392B",
};
const FONT = "Arial, Helvetica, sans-serif";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Teks beberapa baris dengan pemenggalan kata sederhana.
function para(x, y, text, { size = 15, max = 60, lh = 1.45, color = C.text, weight = 400 } = {}) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > max) {
      lines.push(line.trim());
      line = w;
    } else line += " " + w;
  }
  if (line.trim()) lines.push(line.trim());
  const spans = lines.map((l, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : size * lh}">${esc(l)}</tspan>`).join("");
  return { svg: `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${color}">${spans}</text>`, height: lines.length * size * lh };
}
const t = (x, y, s, { size = 15, color = C.text, weight = 400, anchor = "start", family = FONT } = {}) =>
  `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${esc(s)}</text>`;
const tone = (score) => (score >= 80 ? C.good : score >= 60 ? C.gold : C.bad);

// Kerangka halaman laporan 960x640: kepala hitam, isi putih, kaki halaman.
function page(n, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 640" width="960" height="640" role="img" aria-label="Contoh laporan SilentCX: ${esc(title)}">
  <rect width="960" height="640" fill="${C.paper}"/>
  <rect width="960" height="64" fill="${C.ink}"/>
  <rect y="64" width="960" height="6" fill="${C.gold}"/>
  <g transform="translate(36 18)">
    <rect width="28" height="28" rx="7" fill="${C.gold}"/>
    <circle cx="12.5" cy="12.5" r="6.5" fill="none" stroke="${C.ink}" stroke-width="3"/>
    <path d="M17.5 17.5 23 23" stroke="${C.ink}" stroke-width="3.2" stroke-linecap="round"/>
  </g>
  <text x="76" y="40" font-family="${FONT}" font-size="20" font-weight="700" fill="#F4F2EC">Silent<tspan fill="${C.gold}">CX</tspan></text>
  ${t(924, 40, "Laporan Audit CX · PT ABC · PRJ-0013", { size: 14, color: "#9AA0AB", anchor: "end" })}
  ${t(48, 118, title, { size: 28, weight: 700 })}
  ${body}
  <line x1="48" y1="596" x2="912" y2="596" stroke="${C.sand}" stroke-width="1.5"/>
  ${t(48, 620, "Contoh laporan dengan data fiktif · Periode kunjungan 28 Okt – 1 Nov 2026", { size: 12, color: C.muted })}
  ${t(912, 620, `Halaman ${n} / 6`, { size: 12, color: C.muted, anchor: "end" })}
</svg>
`;
}

const areas = [
  ["Sapaan dan sikap pelayanan", 87],
  ["Pengetahuan produk", 71],
  ["Ketepatan pesanan", 93],
  ["Kecepatan pelayanan", 57],
  ["Kebersihan dan suasana", 80],
  ["Upselling dan closing", 45],
];

// 1. Ringkasan skor
{
  const score = 72.8;
  const r = 92;
  const circ = 2 * Math.PI * r;
  const summary = para(
    430,
    196,
    "Dari tiga outlet, Cabang A memimpin dengan skor 81,2, sedangkan Cabang C tertinggal di 62,5 terutama karena kecepatan pelayanan dan kebersihan area duduk. Upselling hampir tidak dilakukan di semua outlet. Prioritas manajemen: standar waktu saji lintas outlet dan pelatihan upselling singkat.",
    { size: 16, max: 52 },
  );
  const facts = [
    ["Paket", "SilentCX Performance"],
    ["Outlet", "3 outlet · 4 kunjungan"],
    ["Terbit", "4 Nov 2026"],
  ];
  writeFileSync(
    new URL("contoh-laporan-1.svg", OUT),
    page(
      1,
      "Ringkasan skor CX",
      `
  <circle cx="220" cy="300" r="${r}" fill="none" stroke="${C.sand}" stroke-width="22"/>
  <circle cx="220" cy="300" r="${r}" fill="none" stroke="${C.gold}" stroke-width="22" stroke-linecap="round" stroke-dasharray="${(circ * score) / 100} ${circ}" transform="rotate(-90 220 300)"/>
  ${t(220, 312, "72,8", { size: 50, weight: 700, anchor: "middle" })}
  ${t(220, 340, "dari 100", { size: 15, color: C.muted, anchor: "middle" })}
  ${t(220, 438, "Skor CX keseluruhan", { size: 17, weight: 700, anchor: "middle" })}
  <rect x="150" y="456" width="140" height="28" rx="14" fill="#FDF3DF"/>
  ${t(220, 475, "Cukup baik", { size: 14, color: C.goldLo, weight: 700, anchor: "middle" })}
  ${t(430, 166, "Ringkasan untuk manajemen", { size: 14, color: C.muted, weight: 700 })}
  ${summary.svg}
  ${facts
    .map(
      ([k, v], i) => `<rect x="${430 + i * 162}" y="440" width="150" height="84" rx="12" fill="${C.cream}"/>
  ${t(446 + i * 162, 468, k, { size: 13, color: C.muted })}${para(446 + i * 162, 494, v, { size: 15, weight: 700, max: 16, lh: 1.25 }).svg}`,
    )
    .join("")}`,
    ),
  );
}

// 2. Skor per area
{
  const rows = areas
    .map(([name, score], i) => {
      const y = 170 + i * 66;
      const w = (560 * score) / 100;
      return `${t(48, y + 22, name, { size: 16, weight: 700 })}
  <rect x="330" y="${y + 6}" width="560" height="22" rx="11" fill="${C.sand}"/>
  <rect x="330" y="${y + 6}" width="${w}" height="22" rx="11" fill="${tone(score)}"/>
  ${t(330 + w - 10, y + 22, String(score), { size: 14, color: "#FFFFFF", weight: 700, anchor: "end" })}`;
    })
    .join("");
  const legend = [
    [C.good, "≥ 80 baik"],
    [C.gold, "60–79 perlu perhatian"],
    [C.bad, "< 60 prioritas"],
  ]
    .map(([c, l], i) => `<rect x="${48 + i * 210}" y="562" width="14" height="14" rx="3" fill="${c}"/>${t(70 + i * 210, 574, l, { size: 13, color: C.muted })}`)
    .join("");
  writeFileSync(new URL("contoh-laporan-2.svg", OUT), page(2, "Skor per area penilaian", rows + legend));
}

// 3. Perbandingan outlet
{
  const bars = [
    ["Cabang A", "Jakarta", 81.2, false],
    ["Cabang B", "Bandung", 74.8, false],
    ["Cabang C", "Surabaya", 62.5, false],
    ["Cafe XYZ", "Kompetitor", 70.1, true],
  ];
  const base = 520;
  const chart = bars
    .map(([name, city, score, comp], i) => {
      const x = 90 + i * 150;
      const h = (300 * score) / 100;
      const fill = comp ? "none" : tone(score);
      const stroke = comp ? `stroke="${C.muted}" stroke-width="2.5" stroke-dasharray="7 6"` : "";
      return `<rect x="${x}" y="${base - h}" width="92" height="${h}" rx="10" fill="${fill}" ${stroke}/>
  ${t(x + 46, base - h - 12, String(score).replace(".", ","), { size: 18, weight: 700, anchor: "middle" })}
  ${t(x + 46, base + 26, name, { size: 15, weight: 700, anchor: "middle" })}
  ${t(x + 46, base + 46, city, { size: 13, color: C.muted, anchor: "middle" })}`;
    })
    .join("");
  const rank = [
    ["1", "Cafe 123 Cabang A", "81,2"],
    ["2", "Cafe 123 Cabang B", "74,8"],
    ["3", "Cafe 123 Cabang C", "62,5"],
  ]
    .map(
      ([n, name, s], i) => `<rect x="680" y="${176 + i * 74}" width="232" height="62" rx="12" fill="${i === 0 ? "#FDF3DF" : C.cream}"/>
  <circle cx="708" cy="${207 + i * 74}" r="15" fill="${i === 0 ? C.gold : C.ink}"/>${t(708, 212 + i * 74, n, { size: 15, color: i === 0 ? C.ink : "#FFFFFF", weight: 700, anchor: "middle" })}
  ${t(734, 203 + i * 74, name, { size: 14, weight: 700 })}${t(734, 222 + i * 74, `Skor ${s}`, { size: 13, color: C.muted })}`,
    )
    .join("");
  writeFileSync(
    new URL("contoh-laporan-3.svg", OUT),
    page(
      3,
      "Perbandingan outlet dan kompetitor",
      `<line x1="70" y1="${base}" x2="660" y2="${base}" stroke="${C.sand}" stroke-width="2"/>${chart}${t(680, 160, "Peringkat outlet", { size: 14, color: C.muted, weight: 700 })}${rank}
  ${para(680, 420, "Garis putus-putus: kompetitor langsung (add-on benchmark kompetitor).", { size: 13, color: C.muted, max: 30 }).svg}`,
    ),
  );
}

// 4. Temuan
{
  const sev = { critical: ["Kritis", C.bad, "#FBE9E7"], major: ["Mayor", C.warn, "#FDF0E1"], minor: ["Minor", C.good, "#E8F4EA"] };
  const items = [
    ["critical", "Upselling tidak dilakukan di 3 dari 3 outlet", "Tidak ada tawaran ukuran besar atau menu pendamping di semua kunjungan.", "Semua outlet"],
    ["major", "Meja kotor saat shopper duduk", "Dua meja dekat jendela masih berisi gelas bekas 10 menit setelah pelanggan pergi.", "Cabang C"],
    ["major", "Waktu tunggu 21 menit", "Antrian kasir menumpuk; tidak ada staf tambahan saat ramai.", "Cabang C"],
    ["minor", "Pengetahuan menu andalan baik", "Staf menjelaskan biji kopi dan rekomendasi sesuai selera.", "Cabang A"],
  ];
  const cards = items
    .map(([s, title, detail, outlet], i) => {
      const x = 48 + (i % 2) * 438;
      const y = 150 + Math.floor(i / 2) * 210;
      const [label, color, bg] = sev[s];
      return `<rect x="${x}" y="${y}" width="426" height="190" rx="14" fill="${C.paper}" stroke="${C.sand}" stroke-width="1.5"/>
  <rect x="${x}" y="${y}" width="6" height="190" rx="3" fill="${color}"/>
  <rect x="${x + 24}" y="${y + 22}" width="${label.length * 9 + 26}" height="26" rx="13" fill="${bg}"/>${t(x + 37, y + 40, label, { size: 13, color, weight: 700 })}
  ${t(x + 402, y + 40, outlet, { size: 13, color: C.muted, anchor: "end" })}
  ${para(x + 24, y + 80, title, { size: 18, weight: 700, max: 38, lh: 1.3 }).svg}
  ${para(x + 24, y + 136, detail, { size: 14, color: C.muted, max: 50 }).svg}`;
    })
    .join("");
  writeFileSync(new URL("contoh-laporan-4.svg", OUT), page(4, "Temuan dan tingkat keparahan", cards));
}

// 5. Bukti kunjungan: foto ilustrasi, struk, dan check-in lokasi.
{
  const photo = (x, y, scene, caption) => `<g transform="translate(${x} ${y})">
    <rect width="262" height="196" rx="12" fill="${C.cream}"/>
    <clipPath id="c${x}"><rect width="262" height="196" rx="12"/></clipPath>
    <g clip-path="url(#c${x})">${scene}</g>
    <rect y="196" width="262" height="0"/>
  </g>
  ${para(x, y + 226, caption, { size: 13, color: C.muted, max: 36 }).svg}`;
  const table = `<rect width="262" height="196" fill="#E9DFC9"/><rect y="120" width="262" height="76" fill="#C8A97A"/>
    <rect x="30" y="40" width="80" height="70" rx="6" fill="#F7F3EA" stroke="#D9CCB0"/><rect x="38" y="48" width="64" height="40" rx="3" fill="#BFD4DE"/>
    <ellipse cx="170" cy="138" rx="38" ry="10" fill="#FFFFFF" opacity="0.9"/><rect x="150" y="96" width="40" height="42" rx="6" fill="#FFFFFF"/><rect x="150" y="96" width="40" height="10" fill="${C.gold}"/>
    <ellipse cx="80" cy="150" rx="26" ry="7" fill="#FFFFFF" opacity="0.8"/><rect x="66" y="124" width="28" height="26" rx="4" fill="#FFFFFF" opacity="0.85"/>`;
  const counter = `<rect width="262" height="196" fill="#2B2F38"/><rect y="118" width="262" height="78" fill="#4A3B2A"/><rect x="0" y="110" width="262" height="12" fill="#6B5233"/>
    <rect x="24" y="30" width="96" height="60" rx="6" fill="#1B1E25" stroke="${C.gold}" stroke-width="2"/>${t(72, 56, "MENU", { size: 12, color: C.gold, weight: 700, anchor: "middle" })}
    <rect x="40" y="66" width="64" height="4" rx="2" fill="#5C6270"/><rect x="40" y="76" width="44" height="4" rx="2" fill="#5C6270"/>
    <rect x="170" y="70" width="56" height="40" rx="6" fill="#9AA0AB"/><rect x="178" y="78" width="40" height="18" rx="3" fill="#1B1E25"/>
    <circle cx="150" cy="70" r="14" fill="#E0B98C"/><rect x="134" y="84" width="32" height="30" rx="10" fill="${C.ink}"/>`;
  const receipt = `<rect width="262" height="196" fill="#DCD5C6"/>
    <path d="M86 18h90v150l-9 6-9-6-9 6-9-6-9 6-9-6-9 6-9-6-9 6-9-6z" fill="#FFFFFF"/>
    ${t(131, 42, "CAFE 123", { size: 12, weight: 700, anchor: "middle" })}
    ${[58, 72, 86, 100].map((y, i) => `<rect x="98" y="${y}" width="${[44, 52, 38, 48][i]}" height="5" rx="2" fill="#B9B2A3"/><rect x="152" y="${y}" width="14" height="5" rx="2" fill="#B9B2A3"/>`).join("")}
    <rect x="98" y="122" width="68" height="2" fill="#B9B2A3"/>${t(96, 142, "TOTAL", { size: 10, weight: 700 })}${t(168, 142, "86.000", { size: 10, weight: 700, anchor: "end" })}`;
  writeFileSync(
    new URL("contoh-laporan-5.svg", OUT),
    page(
      5,
      "Bukti kunjungan",
      `${photo(48, 150, table, "Cabang C · meja dekat jendela, 10 menit setelah pelanggan pergi")}
  ${photo(349, 150, counter, "Cabang A · area kasir saat jam ramai")}
  ${photo(650, 150, receipt, "Struk pembelian kunjungan (dicek QC)")}
  <rect x="48" y="452" width="864" height="96" rx="14" fill="${C.cream}"/>
  <g transform="translate(76 476)"><path d="M18 46s16-14 16-28a16 16 0 0 0-32 0c0 14 16 28 16 28z" fill="${C.gold}"/><circle cx="18" cy="18" r="6" fill="${C.ink}"/></g>
  ${t(132, 492, "Check-in lokasi sesuai", { size: 17, weight: 700 })}
  ${t(132, 518, "Cabang A · akurasi GPS 12 m · 30 Okt 2026, 10.42 WIB · dicocokkan admin dengan alamat outlet", { size: 14, color: C.muted })}
  <rect x="790" y="484" width="96" height="30" rx="15" fill="#E8F4EA"/>${t(838, 504, "Lolos QC", { size: 13, color: C.good, weight: 700, anchor: "middle" })}`,
    ),
  );
}

// 6. Rekomendasi
{
  const cols = [
    ["Sekarang", C.bad, ["Terapkan naskah upselling satu kalimat di semua outlet.", "Jadwalkan pembersih meja tiap 15 menit di jam ramai Cabang C."]],
    ["Segera", C.gold, ["Samakan standar waktu saji 10 menit di semua outlet.", "Pantau dengan audit ulang bulan depan."]],
    ["Nanti", C.good, ["Jadikan Cabang A outlet percontohan untuk pelatihan pelayanan."]],
  ];
  const body = cols
    .map(([label, color, items], i) => {
      const x = 48 + i * 292;
      let y = 214;
      const list = items
        .map((it) => {
          const p = para(x + 52, y + 4, it, { size: 15, max: 28 });
          const out = `<circle cx="${x + 32}" cy="${y - 1}" r="9" fill="none" stroke="${color}" stroke-width="2.5"/><path d="M${x + 27.5} ${y - 1}l3 3 5-6" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${p.svg}`;
          y += p.height + 30;
          return out;
        })
        .join("");
      return `<rect x="${x}" y="146" width="276" height="420" rx="14" fill="${C.cream}"/>
  <rect x="${x}" y="146" width="276" height="6" rx="3" fill="${color}"/>
  ${t(x + 24, 186, label, { size: 19, weight: 700 })}${list}`;
    })
    .join("");
  writeFileSync(new URL("contoh-laporan-6.svg", OUT), page(6, "Rekomendasi prioritas", body));
}

// Ilustrasi hero: kota kecil isometrik dengan outlet, shopper berkaca pembesar, dan papan skor CX.
{
  const S = 34;
  const ox = 400;
  const oy = 230;
  const cos = Math.cos(Math.PI / 6);
  const iso = (x, y, z = 0) => [ox + (x - y) * cos * S, oy + (x + y) * 0.5 * S - z * S];
  const pt = (p) => p.map((n) => n.toFixed(1)).join(",");
  const poly = (pts, fill, extra = "") => `<polygon points="${pts.map(pt).join(" ")}" fill="${fill}" ${extra}/>`;
  // Balok dengan sisi atas, kiri (menghadap kiri-bawah), dan kanan.
  const box = (x, y, z, w, d, h, [top, left, right], extra = "") =>
    poly([iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)], top, extra) +
    poly([iso(x, y + d, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x, y + d, z + h)], left, extra) +
    poly([iso(x + w, y, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x + w, y, z + h)], right, extra);
  // Bidang datar di sisi kiri (sumbu x-z) dan kanan (sumbu y-z) untuk menggambar konten 2D.
  const leftPlane = (x, y, z) => {
    const [a, b] = iso(x, y, z);
    return `matrix(${(cos * S) / S} ${0.5} 0 -1 ${a} ${b})`;
  };
  const rightPlane = (x, y, z) => {
    const [a, b] = iso(x, y, z);
    return `matrix(${(-cos * S) / S} ${0.5} 0 -1 ${a} ${b})`;
  };
  void rightPlane;

  const stripes = Array.from({ length: 8 }, (_, i) => {
    const x0 = 0.4 + i * 0.625;
    return poly([iso(x0, 4.4, 3.15), iso(x0 + 0.625, 4.4, 3.15), iso(x0 + 0.625, 5.1, 2.65), iso(x0, 5.1, 2.65)], i % 2 ? C.ink : C.gold);
  }).join("");

  const scoreBoard = (() => {
    // Papan skor berdiri di kanan depan; isi digambar pada bidang kiri papan.
    const front = box(7.2, 6.6, 0.2, 3.6, 0.25, 3.2, ["#2A303B", "#F4F2EC", "#C9C3B6"]);
    const bars = [62, 81, 47, 90, 74]
      .map((v, i) => `<rect x="${0.45 + i * 0.5}" y="0.55" width="0.32" height="${(v / 100) * 1.3}" rx="0.05" fill="${v >= 80 ? "#2E8540" : v >= 60 ? C.gold : "#C0392B"}"/>`)
      .join("");
    const content = `<g transform="${leftPlane(7.2, 6.85, 0.2)} scale(${S})">
      <g transform="scale(1 -1) translate(0 -3.2)">
        <rect x="0.25" y="0.25" width="3.1" height="0.06" fill="${C.gold}"/>
        <text x="0.3" y="0.62" font-family="${FONT}" font-size="0.26" font-weight="700" fill="${C.ink}">Skor CX</text>
        <text x="0.3" y="1.32" font-family="${FONT}" font-size="0.72" font-weight="700" fill="${C.ink}">86</text>
        <text x="1.22" y="1.32" font-family="${FONT}" font-size="0.22" fill="#6B717C">/100</text>
        <g transform="translate(0 1.25)">${bars.replace(/y="0.55"/g, 'y="0"').replace(/height="([\d.]+)"/g, (m, h) => `height="${h}" transform="translate(0 ${1.5 - Number(h)})"`)}</g>
      </g></g>`;
    return front + content;
  })();

  const person = (x, y, coat) => {
    const [px, py] = iso(x, y, 0);
    return `<g transform="translate(${px.toFixed(1)} ${py.toFixed(1)})">
      <ellipse cx="0" cy="2" rx="18" ry="7" fill="${C.ink}" opacity="0.35"/>
      <rect x="-9" y="-36" width="7" height="36" rx="3" fill="#1B1E25"/><rect x="2" y="-36" width="7" height="36" rx="3" fill="#1B1E25"/>
      <path d="M-14 -38 q0 -30 14 -30 q14 0 14 30 z" fill="${coat}"/>
      <rect x="-14" y="-44" width="28" height="12" rx="4" fill="${coat}"/>
      <circle cx="0" cy="-78" r="11" fill="#E0B98C"/>
      <path d="M-11 -80 q2 -14 13 -12 q10 2 9 12 q-6 -6 -22 0z" fill="#1B1E25"/>
    </g>`;
  };

  // Kaca pembesar dipegang shopper, diarahkan ke etalase outlet.
  const [mx, my] = iso(4.6, 6.6, 0);
  const magnifier = `<g transform="translate(${(mx - 30).toFixed(1)} ${(my - 64).toFixed(1)})">
    <rect x="10" y="10" width="26" height="9" rx="4" transform="rotate(40)" fill="${C.goldLo}"/>
    <circle r="20" fill="#BFD4DE" fill-opacity="0.3" stroke="${C.gold}" stroke-width="6"/>
    <path d="M-9 -8 a12 12 0 0 1 11 -6" stroke="#FFFFFF" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="0.8"/>
  </g>`;

  const card = (x, y, z, icon, label) => {
    const [cx, cy] = iso(x, y, z);
    const [gx, gy] = iso(x, y, 0);
    return `<line x1="${cx.toFixed(1)}" y1="${(cy + 30).toFixed(1)}" x2="${gx.toFixed(1)}" y2="${gy.toFixed(1)}" stroke="${C.gold}" stroke-width="1.5" stroke-dasharray="3 5" opacity="0.6"/>
    <g transform="translate(${(cx - 73).toFixed(1)} ${(cy - 30).toFixed(1)})">
      <rect width="146" height="56" rx="12" fill="${C.raise}" stroke="${C.line}" stroke-width="1.5"/>
      <rect x="10" y="10" width="36" height="36" rx="9" fill="${C.gold}"/>
      <g transform="translate(16 16)" fill="none" stroke="${C.ink}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${icon}"/></g>
      <text x="56" y="34" font-family="${FONT}" font-size="13" font-weight="700" fill="#F4F2EC">${esc(label)}</text>
    </g>`;
  };
  const ICON_PIN = "M12 22s8-7 8-13a8 8 0 0 0-16 0c0 6 8 13 8 13zM12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z".replace(/(\d+(\.\d+)?)/g, (n) => String(Number(n) * 1));
  const ICON_CAM = "M2 7h4l2-3h8l2 3h4v13H2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z";
  const ICON_OK = "M4 12l5 5L20 6";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="20 40 760 600" width="760" height="600" role="img" aria-label="Ilustrasi: mystery shopper memeriksa outlet dan papan skor CX">
  <defs>
    <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.gold}" stop-opacity="0.35"/><stop offset="1" stop-color="${C.gold}" stop-opacity="0"/></linearGradient>
  </defs>
  ${box(-0.4, -0.4, -0.5, 12.2, 11.2, 0.5, ["#141821", "#0B0E13", "#10141B"])}
  ${poly([iso(-0.4, -0.4, 0), iso(11.8, -0.4, 0), iso(11.8, 10.8, 0), iso(-0.4, 10.8, 0)], "none", `stroke="${C.gold}" stroke-width="2" opacity="0.7"`)}
  ${Array.from({ length: 5 }, (_, i) => poly([iso(0.4 + i * 2.2, 9.2, 0), iso(1.4 + i * 2.2, 9.2, 0), iso(1.4 + i * 2.2, 9.6, 0), iso(0.4 + i * 2.2, 9.6, 0)], "#2A303B")).join("")}
  ${box(0.4, 0.4, 0, 5, 4, 3.2, ["#2A303B", "#1B1F28", "#151920"])}
  ${poly([iso(0.4, 4.4, 3.2), iso(5.4, 4.4, 3.2), iso(5.4, 4.4, 3.8), iso(0.4, 4.4, 3.8)], C.gold)}
  <text transform="${leftPlane(1.1, 4.4, 3.33)} scale(${S}) scale(1 -1)" font-family="${FONT}" font-size="0.42" font-weight="700" fill="${C.ink}">CAFE 123</text>
  ${stripes}
  ${poly([iso(1.0, 4.4, 0.2), iso(2.6, 4.4, 0.2), iso(2.6, 4.4, 2.3), iso(1.0, 4.4, 2.3)], "#BFD4DE", 'opacity="0.55"')}
  ${poly([iso(3.2, 4.4, 0), iso(4.6, 4.4, 0), iso(4.6, 4.4, 2.3), iso(3.2, 4.4, 2.3)], "#0B0E13")}
  ${poly([iso(5.4, 1.0, 0.6), iso(5.4, 3.6, 0.6), iso(5.4, 3.6, 2.4), iso(5.4, 1.0, 2.4)], "#BFD4DE", 'opacity="0.35"')}
  ${box(7.6, 0.8, 0, 3, 2.6, 4.6, ["#242A35", "#161A22", "#11151C"])}
  ${Array.from({ length: 3 }, (_, r) => Array.from({ length: 3 }, (_, c) => poly([iso(7.9 + c * 0.9, 3.4, 0.8 + r * 1.2), iso(8.4 + c * 0.9, 3.4, 0.8 + r * 1.2), iso(8.4 + c * 0.9, 3.4, 1.5 + r * 1.2), iso(7.9 + c * 0.9, 3.4, 1.5 + r * 1.2)], r === 1 && c === 1 ? C.gold : "#2F3542")).join("")).join("")}
  ${scoreBoard}
  ${person(4.6, 6.6, C.gold)}
  ${magnifier}
  ${person(9.4, 9.2, "#3A4150")}
  ${card(-0.2, 3.0, 5.4, ICON_PIN, "Check-in GPS")}
  ${card(10.6, 4.6, 6.6, ICON_CAM, "Bukti foto")}
  ${card(1.6, 9.4, 3.4, ICON_OK, "Lolos QC")}
</svg>
`;
  writeFileSync(new URL("hero.svg", OUT), svg);
}

console.log("Gambar landing dibuat di public/landing/.");
