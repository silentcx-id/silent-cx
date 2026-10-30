import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { C, LOGO } from "./pdf-base";
import {
  fmtDiff,
  fmtScore,
  gapRows,
  outletPatterns,
  PRIORITY_LABEL,
  reportFeatures,
  scoreBand,
  SEVERITY_LABEL,
  summaryTitle,
  type ReportData,
  type ReportFinding,
  type ReportScore,
} from "./types";

// Laporan audit dalam PDF A4: latar putih supaya hemat tinta, aksen emas-hitam SilentCX.

const s = StyleSheet.create({
  page: { fontFamily: "Familjen", fontSize: 10, color: C.text, paddingTop: 48, paddingBottom: 56, paddingHorizontal: 48, lineHeight: 1.45 },
  tape: { position: "absolute", top: 0, left: 0, right: 0, height: 8, backgroundColor: C.gold },
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, fontSize: 8, color: C.muted },
  h1: { fontFamily: "Bricolage", fontWeight: 800, fontSize: 30, color: C.ink, lineHeight: 1.05 },
  h2: { fontFamily: "Bricolage", fontWeight: 800, fontSize: 16, color: C.ink, marginBottom: 8 },
  eyebrow: { fontSize: 8, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase", marginBottom: 4 },
  section: { marginBottom: 22 },
  muted: { color: C.muted },
  row: { flexDirection: "row" },
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 14 },
  chip: { fontSize: 8, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4, fontWeight: 600 },
  th: { fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, paddingVertical: 6 },
  td: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.line },
  cell: { flexGrow: 1, flexBasis: 0, textAlign: "right" },
});

const tone = (n: number | null) => (n === null ? C.muted : n >= 70 ? C.good : n >= 55 ? C.warn : C.bad);
const sevColor = { critical: C.bad, major: C.warn, minor: C.muted } as const;

function Heading({ n, title }: { n: string; title: string }) {
  return (
    <>
      <Text style={s.eyebrow}>{n}</Text>
      <Text style={s.h2}>{title}</Text>
    </>
  );
}

// Judul bagian dan isi pertamanya dicetak dalam satu blok supaya judul tidak tertinggal sendirian di bawah halaman.
function Section<T>({ n, title, items, render, children }: { n: string; title: string; items?: T[]; render?: (item: T, i: number) => React.ReactNode; children?: React.ReactNode }) {
  const [first, ...rest] = items ?? [];
  return (
    <View style={s.section}>
      <View wrap={false}>
        <Heading n={n} title={title} />
        {items && first !== undefined && render?.(first, 0)}
        {!items && children}
      </View>
      {rest.map((item, i) => render?.(item, i + 1))}
    </View>
  );
}

function Bar({ value }: { value: number | null }) {
  return (
    <View style={{ height: 8, backgroundColor: C.track, borderRadius: 4, flexGrow: 1 }}>
      <View style={{ height: 8, width: `${Math.max(0, Math.min(100, value ?? 0))}%`, backgroundColor: C.gold, borderRadius: 4 }} />
    </View>
  );
}

function ScoreBar({ row }: { row: ReportScore & { weight?: number } }) {
  return (
    <View style={[s.row, { alignItems: "center", marginBottom: 7 }]} wrap={false}>
      <Text style={{ width: 200, paddingRight: 8 }}>
        {row.title}
        {row.weight !== undefined && <Text style={s.muted}> · bobot {row.weight}</Text>}
      </Text>
      <Bar value={row.score} />
      <Text style={{ width: 40, textAlign: "right", fontWeight: 600, color: tone(row.score) }}>{fmtScore(row.score)}</Text>
    </View>
  );
}

function FindingCard({ x, detailed }: { x: ReportFinding; detailed: boolean }) {
  return (
    <View style={[s.card, { marginBottom: 8, borderLeftWidth: 3, borderLeftColor: detailed ? sevColor[x.severity] : C.gold }]} wrap={false}>
      <View style={[s.row, { justifyContent: "space-between", marginBottom: 3 }]}>
        <Text style={{ fontWeight: 600, flexShrink: 1 }}>{x.title}</Text>
        {detailed && <Text style={[s.chip, { color: sevColor[x.severity], borderWidth: 1, borderColor: sevColor[x.severity] }]}>{SEVERITY_LABEL[x.severity]}</Text>}
      </View>
      <Text>{x.detail}</Text>
      {x.outlet && <Text style={[s.muted, { marginTop: 3, fontSize: 8 }]}>Outlet: {x.outlet}</Text>}
    </View>
  );
}

// Baris tabel sederhana: kolom pertama lebar tetap, sisanya rata kanan.
function Row({ cells, head = false, first = 150 }: { cells: { text: string; color?: string; bold?: boolean }[]; head?: boolean; first?: number }) {
  return (
    <View style={s.row} wrap={false}>
      {cells.map((c, i) => (
        <Text key={i} style={[head ? s.th : s.td, i === 0 ? { width: first } : s.cell, { color: c.color ?? (head ? C.muted : C.text), fontWeight: c.bold ? 600 : 400 }]}>
          {c.text}
        </Text>
      ))}
    </View>
  );
}

export function ReportDocument({ data, draft = false }: { data: ReportData; draft?: boolean }) {
  const f = reportFeatures(data.entitlements);
  const ranked = [...data.outlets].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const multi = f.multiOutlet && data.outlets.length > 1;
  const showPhotos = f.evidence && data.photos.length > 0;
  const showCompetitors = f.competitor && data.competitors.length > 0;
  const gaps = gapRows(data.sections);
  const patterns = outletPatterns(data);
  const sop = data.sop;
  const violated = sop?.items.filter((i) => i.no > 0) ?? [];
  const prev = data.previous;
  let n = 0;
  const next = () => String(++n).padStart(2, "0");

  return (
    <Document title={`Laporan audit ${data.code}`} author="SilentCX" subject={`Laporan audit pengalaman pelanggan ${data.company}`}>
      {/* Sampul */}
      <Page size="A4" style={[s.page, { paddingTop: 64 }]}>
        <View style={s.tape} fixed />
        <View style={[s.row, { justifyContent: "space-between", alignItems: "center" }]}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image react-pdf tidak punya prop alt */}
          <Image src={LOGO} style={{ width: 150 }} />
          {draft && <Text style={[s.chip, { backgroundColor: C.goldSoft, color: C.warn }]}>DRAF, BELUM TERBIT</Text>}
        </View>
        <View style={{ marginTop: 120 }}>
          <Text style={s.eyebrow}>Laporan audit pengalaman pelanggan</Text>
          <Text style={s.h1}>{data.company}</Text>
          <Text style={{ marginTop: 10, fontSize: 12, color: C.muted }}>
            {data.packageName} · {data.outletCount} outlet · {data.visitCount} kunjungan rahasia
          </Text>
        </View>
        <View style={[s.row, { marginTop: 48, gap: 16 }]}>
          <View style={[s.card, { width: 190, backgroundColor: C.ink, borderColor: C.ink }]}>
            <Text style={[s.eyebrow, { color: "#9AA0AB" }]}>Skor CX keseluruhan</Text>
            <Text style={{ fontFamily: "Bricolage", fontWeight: 800, fontSize: 54, color: C.gold, lineHeight: 1 }}>{fmtScore(data.score)}</Text>
            <Text style={{ color: "#FFFFFF", marginTop: 4, fontWeight: 600 }}>{scoreBand(data.score)}</Text>
          </View>
          <View style={[s.card, { flexGrow: 1 }]}>
            {[
              ["Kode proyek", data.code],
              ["Periode kunjungan", data.visitPeriod],
              ["Diterbitkan", data.publishedAt ?? "Belum terbit"],
              ["Skala skor", "0–100, dihitung dari jawaban dan bobot kuesioner"],
            ].map(([k, v]) => (
              <View key={k} style={{ marginBottom: 6 }}>
                <Text style={s.eyebrow}>{k}</Text>
                <Text>{v}</Text>
              </View>
            ))}
          </View>
        </View>
        <Text style={{ position: "absolute", bottom: 48, left: 48, right: 48, fontSize: 8, color: C.muted }}>
          Dokumen ini rahasia dan hanya untuk penggunaan internal {data.company}. Identitas mystery shopper tidak dicantumkan.
        </Text>
      </Page>

      {/* Isi */}
      <Page size="A4" style={s.page}>
        <View style={s.tape} fixed />

        <Section n={next()} title={summaryTitle(data.entitlements)}>
          <Text>{data.summary}</Text>
          {f.sop && sop && sop.score !== null && <Text style={[s.muted, { marginTop: 6 }]}>Kepatuhan SOP keseluruhan: {fmtScore(sop.score)}%</Text>}
        </Section>

        {prev && (
          <Section n={next()} title="Perbandingan dengan audit sebelumnya">
            <Text style={[s.muted, { marginBottom: 6 }]}>
              Audit sebelumnya {prev.code}
              {prev.publishedAt ? ` · terbit ${prev.publishedAt}` : ""}
            </Text>
            <Row head cells={[{ text: "Area" }, { text: "Sebelumnya" }, { text: "Sekarang" }, { text: "Perubahan" }]} first={200} />
            {[
              { title: "Skor keseluruhan", before: prev.score, now: data.score },
              ...(f.sop ? [{ title: "Kepatuhan SOP (%)", before: prev.sop, now: sop?.score ?? null }] : []),
              ...data.sections.map((x) => ({ title: x.title, before: prev.sections.find((y) => y.title === x.title)?.score ?? null, now: x.score })),
            ].map((r) => {
              const diff = r.before !== null && r.now !== null ? r.now - r.before : null;
              return (
                <Row
                  key={r.title}
                  first={200}
                  cells={[
                    { text: r.title },
                    { text: fmtScore(r.before), color: C.muted },
                    { text: fmtScore(r.now), bold: true },
                    { text: diff === null ? "—" : fmtDiff(diff), color: diff === null ? C.muted : diff >= 0 ? C.good : C.bad },
                  ]}
                />
              );
            })}
          </Section>
        )}

        <Section n={next()} title="Skor per area penilaian" items={data.sections} render={(row) => <ScoreBar key={row.title} row={row} />} />

        {f.sop && (
          <Section n={next()} title="Kepatuhan SOP">
            {!sop || sop.yes + sop.no === 0 ? (
              <Text style={s.muted}>Belum ada pemeriksaan SOP di kunjungan yang lolos QC.</Text>
            ) : (
              <>
                <View style={[s.row, { alignItems: "center", marginBottom: 8 }]}>
                  <Bar value={sop.score} />
                  <Text style={{ width: 70, textAlign: "right", fontFamily: "Bricolage", fontWeight: 800, fontSize: 16, color: tone(sop.score) }}>{fmtScore(sop.score)}%</Text>
                </View>
                <Text style={[s.muted, { marginBottom: 6 }]}>
                  {sop.yes} patuh · {sop.no} tidak patuh dari {sop.yes + sop.no} pemeriksaan
                </Text>
                {violated.length === 0 ? (
                  <Text style={{ color: C.good }}>Semua SOP yang diperiksa dipatuhi.</Text>
                ) : (
                  violated.map((i) => (
                    <View key={i.prompt} style={[s.card, { marginBottom: 6, padding: 10 }]} wrap={false}>
                      <View style={[s.row, { justifyContent: "space-between", gap: 8 }]}>
                        <Text style={{ fontWeight: 600, flexShrink: 1 }}>{i.prompt}</Text>
                        <Text style={{ color: C.bad, fontSize: 8 }}>
                          {i.no} dari {i.yes + i.no} tidak patuh
                        </Text>
                      </View>
                      <Text style={[s.muted, { fontSize: 8, marginTop: 2 }]}>
                        {i.section}
                        {multi && i.outlets.length ? ` · ${i.outlets.join(", ")}` : ""}
                      </Text>
                    </View>
                  ))
                )}
              </>
            )}
          </Section>
        )}

        {f.sop && (
          <Section n={next()} title="Customer journey">
            {data.journey.length === 0 ? (
              <Text style={s.muted}>Belum ada data per tahap customer journey.</Text>
            ) : (
              data.journey.map((j, i) => <ScoreBar key={j.title} row={{ title: `${i + 1}. ${j.title}`, score: j.score }} />)
            )}
          </Section>
        )}

        {f.sop && gaps.length > 0 && (
          <Section n={next()} title="Analisis gap">
            <Row head cells={[{ text: "Area" }, { text: "Target" }, { text: "Aktual" }, { text: "Gap" }]} first={200} />
            {gaps.map((g) => (
              <Row
                key={g.title}
                first={200}
                cells={[{ text: g.title }, { text: String(g.target), color: C.muted }, { text: fmtScore(g.score), bold: true, color: tone(g.score) }, { text: fmtDiff(g.gap), color: g.gap >= 0 ? C.good : C.bad }]}
              />
            ))}
            <Text style={[s.muted, { fontSize: 8, marginTop: 6 }]}>Diurutkan dari gap terbesar. Gap = skor aktual dikurangi target area.</Text>
          </Section>
        )}

        <Section n={next()} title={multi ? "Peringkat outlet" : "Skor outlet"}>
          <View style={s.row}>
            <Text style={[s.th, { width: 24 }]}>#</Text>
            <Text style={[s.th, { flexGrow: 1 }]}>Outlet</Text>
            <Text style={[s.th, { width: 60 }]}>Kunjungan</Text>
            {f.benchmarking && <Text style={[s.th, { width: 50, textAlign: "right" }]}>SOP</Text>}
            {f.benchmarking && <Text style={[s.th, { width: 50, textAlign: "right" }]}>Red flag</Text>}
            <Text style={[s.th, { width: 50, textAlign: "right" }]}>Skor</Text>
          </View>
          {ranked.map((o, i) => (
            <View key={o.name} style={s.row}>
              <Text style={[s.td, { width: 24, color: C.muted }]}>{i + 1}</Text>
              <Text style={[s.td, { flexGrow: 1 }]}>
                {o.name} <Text style={s.muted}>· {o.city}</Text>
              </Text>
              <Text style={[s.td, { width: 60 }]}>{o.visits}</Text>
              {f.benchmarking && <Text style={[s.td, { width: 50, textAlign: "right" }]}>{o.sop === null || o.sop === undefined ? "—" : `${fmtScore(o.sop)}%`}</Text>}
              {f.benchmarking && <Text style={[s.td, { width: 50, textAlign: "right", color: o.redFlags ? C.bad : C.muted }]}>{o.redFlags ?? 0}</Text>}
              <Text style={[s.td, { width: 50, textAlign: "right", fontWeight: 600, color: tone(o.score) }]}>{fmtScore(o.score)}</Text>
            </View>
          ))}
        </Section>

        {multi && (
          <View style={s.section} wrap={false}>
            <Text style={[s.muted, { marginBottom: 6 }]}>Perbandingan antar outlet per area</Text>
            <View style={s.row}>
              <Text style={[s.th, { width: 150 }]}>Area</Text>
              {ranked.map((o) => (
                <Text key={o.name} style={[s.th, s.cell]}>
                  {o.name}
                </Text>
              ))}
            </View>
            {data.sections.map((sec) => (
              <View key={sec.title} style={s.row}>
                <Text style={[s.td, { width: 150 }]}>{sec.title}</Text>
                {ranked.map((o) => {
                  const v = o.sections.find((x) => x.title === sec.title)?.score ?? null;
                  return (
                    <Text key={o.name} style={[s.td, s.cell, { color: tone(v) }]}>
                      {fmtScore(v)}
                    </Text>
                  );
                })}
              </View>
            ))}
          </View>
        )}

        {f.benchmarking && multi && (patterns.areas.length > 0 || patterns.sharedSop.length > 0) && (
          <Section n={next()} title="Pola antar outlet">
            {patterns.sharedSop.map((i) => (
              <View key={i.prompt} style={[s.card, { marginBottom: 6, padding: 10, borderColor: C.bad }]} wrap={false}>
                <Text style={{ fontWeight: 600 }}>
                  SOP dilanggar di {i.outlets.length} outlet: {i.prompt}
                </Text>
                <Text style={[s.muted, { fontSize: 8 }]}>{i.outlets.join(", ")}. Kemungkinan masalah sistem atau pelatihan, bukan satu cabang saja.</Text>
              </View>
            ))}
            {patterns.areas.map((a) => (
              <View key={a.title} style={{ marginBottom: 6 }} wrap={false}>
                <Text style={{ fontWeight: 600 }}>
                  {a.title} <Text style={{ color: a.below ? C.warn : C.good, fontWeight: 400 }}>· {a.below === 0 ? "semua outlet mencapai target" : `${a.below} dari ${a.total} outlet di bawah target`}</Text>
                </Text>
                <Text style={s.muted}>
                  Terendah {a.low.name} ({fmtScore(a.low.score)}), tertinggi {a.high.name} ({fmtScore(a.high.score)}), selisih {fmtScore(a.spread)} poin.
                </Text>
              </View>
            ))}
          </Section>
        )}

        {f.benchmarking && (
          <Section n={next()} title="Red flag">
            {data.redFlags.length === 0 ? (
              <Text style={{ color: C.good }}>Tidak ada red flag di kunjungan yang lolos QC.</Text>
            ) : (
              data.redFlags.map((r, i) => (
                <View key={i} style={[s.card, { marginBottom: 6, padding: 10, borderLeftWidth: 3, borderLeftColor: C.bad }]} wrap={false}>
                  <Text style={{ fontWeight: 600 }}>{r.prompt}</Text>
                  <Text style={[s.muted, { fontSize: 8 }]}>
                    {r.outlet} · {r.section}
                    {r.count > 1 ? ` · ${r.count} kunjungan` : ""}
                  </Text>
                </View>
              ))
            )}
            <Text style={[s.muted, { fontSize: 8, marginTop: 4 }]}>Red flag perlu ditindaklanjuti segera dan tidak mengurangi skor.</Text>
          </Section>
        )}

        <Section n={next()} title="Temuan utama" items={data.findings} render={(x, i) => <FindingCard key={i} x={x} detailed={f.detailed} />} />

        <Section
          n={next()}
          title={f.benchmarking ? "Rekomendasi untuk manajemen" : "Rekomendasi"}
          items={data.recommendations}
          render={(r, i) => (
            <View key={i} style={[s.row, { marginBottom: 7, gap: 10 }]} wrap={false}>
              <Text style={{ fontFamily: "Bricolage", fontWeight: 800, color: C.gold, width: 16 }}>{i + 1}</Text>
              <Text style={{ flexGrow: 1, flexShrink: 1 }}>{r.text}</Text>
              <Text style={[s.chip, { backgroundColor: C.goldSoft, color: C.ink }]}>{PRIORITY_LABEL[r.priority]}</Text>
            </View>
          )}
        />

        {showPhotos && (
          <Section n={next()} title="Bukti kunjungan">
            <View style={[s.row, { flexWrap: "wrap", gap: 12 }]}>
              {data.photos.map((p, i) => (
                <View key={i} style={{ width: 240 }} wrap={false}>
                  {/* eslint-disable-next-line jsx-a11y/alt-text -- Image react-pdf tidak punya prop alt */}
                  <Image src={p.src} style={{ width: 240, height: 160, objectFit: "cover", borderRadius: 6 }} />
                  <Text style={[s.muted, { fontSize: 8, marginTop: 4 }]}>{p.caption}</Text>
                </View>
              ))}
            </View>
          </Section>
        )}

        {showCompetitors && (
          <Section n={next()} title="Benchmark kompetitor">
            <View style={s.row}>
              <Text style={[s.th, { width: 150 }]}>Area</Text>
              <Text style={[s.th, s.cell]}>{data.company}</Text>
              {data.competitors.map((c) => (
                <Text key={c.name} style={[s.th, s.cell]}>
                  {c.name}
                </Text>
              ))}
            </View>
            {[{ title: "Skor keseluruhan", score: data.score }, ...data.sections].map((sec, i) => (
              <View key={sec.title} style={s.row}>
                <Text style={[s.td, { width: 150, fontWeight: i === 0 ? 600 : 400 }]}>{sec.title}</Text>
                <Text style={[s.td, s.cell, { fontWeight: 600 }]}>{fmtScore(sec.score)}</Text>
                {data.competitors.map((c) => {
                  const v = i === 0 ? c.score : (c.sections.find((x) => x.title === sec.title)?.score ?? null);
                  const diff = v !== null && sec.score !== null ? sec.score - v : null;
                  return (
                    <Text key={c.name} style={[s.td, s.cell]}>
                      {fmtScore(v)}
                      {diff !== null && <Text style={{ color: diff >= 0 ? C.good : C.bad, fontSize: 8 }}> {fmtDiff(diff)}</Text>}
                    </Text>
                  );
                })}
              </View>
            ))}
            <Text style={[s.muted, { fontSize: 8, marginTop: 8 }]}>
              Angka kecil di samping skor kompetitor adalah selisihnya: hijau berarti {data.company} unggul, merah berarti tertinggal. Foto kunjungan ke kompetitor tidak
              dicantumkan dan hanya dipakai untuk pemeriksaan kualitas. Data kompetitor hanya untuk penggunaan internal dan tidak untuk dipublikasikan.
            </Text>
          </Section>
        )}

        <Section n="Metodologi" title="Cara membaca laporan ini">
          <Text>
            Setiap kunjungan dilakukan mystery shopper terlatih tanpa diketahui staf outlet, lalu diperiksa tim SilentCX (quality control) sebelum masuk laporan.
            Jawaban Ya bernilai 1, Tidak bernilai 0, dan skala 1–5 dikonversi ke 0–1. Pertanyaan yang tidak teramati tidak dihitung. Skor area adalah rata-rata
            pertanyaannya, skor outlet adalah rata-rata kunjungan yang lolos QC, dan skor keseluruhan adalah rata-rata outlet.
          </Text>
          <Text style={{ marginTop: 6 }}>Kategori skor: 85–100 sangat baik · 70–84 baik · 55–69 perlu perbaikan · di bawah 55 kritis.</Text>
          {f.sop && <Text style={{ marginTop: 6 }}>Kepatuhan SOP = pemeriksaan yang patuh dibagi seluruh pemeriksaan SOP. Customer journey = rata-rata indikator di setiap tahap.</Text>}
          {f.benchmarking && <Text style={{ marginTop: 6 }}>Red flag = pertanyaan bertanda red flag yang dijawab Tidak atau bernilai 1–2 pada skala 1–5.</Text>}
          {f.customScope && <Text style={{ marginTop: 6 }}>Kuesioner audit ini disusun khusus sesuai kebutuhan {data.company}.</Text>}
        </Section>
        {/* Teks kaki di setiap halaman isi. Nomor halaman (render) tidak tercetak di react-pdf 4.9 untuk dokumen ini, jadi teks statis saja. */}
        <Text style={s.footer} fixed>
          SilentCX · {data.code} · Rahasia, untuk penggunaan internal {data.company}
        </Text>
      </Page>
    </Document>
  );
}
