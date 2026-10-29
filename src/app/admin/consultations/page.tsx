import type { Metadata } from "next";
import Link from "next/link";
import { AddWindowForm, DeleteWindowButton } from "./consultation-forms";
import { getAdminConsultations, getWindows, SOURCE_LABEL, type AdminConsultation } from "./data";
import { MonthCalendar, type CalendarEvent } from "@/components/month-calendar";
import { pickTab, Tabs } from "@/components/tabs";
import { gridRange, isDay, isMonth, requestTime, todayWib, wibDay, wibTime } from "@/lib/calendar";
import { consultationState } from "@/lib/consultation";
import { date, dateTime } from "@/lib/format";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Konsultasi" };

const TABS = ["kalender", "jadwal", "jatah", "riwayat"] as const;
const hm = (v: string) => wibTime(v).replace(":", ".");

// Jadwal konsultasi client: admin membuka jam kosong di kalender, client booking sendiri,
// lalu admin menempelkan link meeting dan menulis ringkasan setelah sesi.
export default async function ConsultationsPage({ searchParams }: PageProps<"/admin/consultations">) {
  const [, params] = await Promise.all([requireRole("admin", "/admin/consultations"), searchParams]);
  const tab = pickTab(params.tab, TABS, "kalender");
  const today = todayWib();
  const month = isMonth(params.bulan) ? params.bulan : isDay(params.tgl) ? params.tgl.slice(0, 7) : today.slice(0, 7);
  const selected = isDay(params.tgl) ? params.tgl : today.startsWith(month) ? today : `${month}-01`;
  const range = gridRange(month);
  const [all, windows] = await Promise.all([getAdminConsultations(), getWindows(range.from, range.to)]);

  const now = requestTime();
  const scheduled = all.filter((c) => c.status === "scheduled");
  const noLink = scheduled.filter((c) => !c.meeting_url);
  const waiting = all.filter((c) => consultationState(c, now) === "available").sort((a, b) => a.expires_at.localeCompare(b.expires_at));
  const history = all.filter((c) => c.status === "done" || c.status === "no_show").sort((a, b) => (b.starts_at ?? "").localeCompare(a.starts_at ?? ""));

  const events: Record<string, CalendarEvent[]> = {};
  const push = (day: string, e: CalendarEvent) => (events[day] ??= []).push(e);
  for (const w of windows) push(wibDay(w.starts_at), { key: w.id, label: `${hm(w.starts_at)}–${hm(w.ends_at)} kosong`, tone: "open" });
  for (const c of all) {
    if (!c.starts_at) continue;
    const tone = c.status === "scheduled" ? (c.meeting_url ? "booked" : "alert") : "done";
    push(wibDay(c.starts_at), { key: c.id, label: `${hm(c.starts_at)} ${c.clientName}`, tone });
  }
  for (const list of Object.values(events)) list.sort((a, b) => a.label.localeCompare(b.label));

  const dayWindows = windows.filter((w) => wibDay(w.starts_at) === selected);
  const daySessions = all.filter((c) => c.starts_at && wibDay(c.starts_at) === selected);

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">Konsultasi</h1>
        <p className="text-muted">
          Buka jam kosong di kalender. Client Insight (30 menit), Performance (60 menit), dan pembeli add-on (60 menit) booking sendiri setelah laporan terbit, lalu Anda
          menempelkan link meeting dan menulis ringkasan setelah sesi.
        </p>
      </section>

      <ul className="grid gap-3 sm:grid-cols-3">
        <li className={`card grid gap-2 p-5 ${noLink.length ? "border-bad/60" : ""}`}>
          <span className="text-sm text-muted">Terjadwal tanpa link meeting</span>
          <span className={`font-display text-4xl font-extrabold tabular-nums ${noLink.length ? "text-bad" : ""}`}>{noLink.length}</span>
        </li>
        <li className="card grid gap-2 p-5">
          <span className="text-sm text-muted">Sesi terjadwal</span>
          <span className="font-display text-4xl font-extrabold tabular-nums">{scheduled.length}</span>
        </li>
        <li className="card grid gap-2 p-5">
          <span className="text-sm text-muted">Jatah belum dibooking</span>
          <span className="font-display text-4xl font-extrabold tabular-nums">{waiting.length}</span>
        </li>
      </ul>

      <Tabs
        base="/admin/consultations"
        label="Bagian konsultasi"
        current={tab}
        items={[
          { id: "kalender", label: "Kalender" },
          { id: "jadwal", label: "Sesi terjadwal", count: scheduled.length, alert: noLink.length > 0 },
          { id: "jatah", label: "Jatah belum dibooking", count: waiting.length },
          { id: "riwayat", label: "Riwayat" },
        ]}
      />

      {tab === "kalender" && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)] xl:items-start">
          <MonthCalendar
            base="/admin/consultations"
            query="tab=kalender&"
            month={month}
            selected={selected}
            events={events}
            lang="id"
            emptyText="Belum ada jadwal kosong atau sesi di bulan ini. Tambahkan jadwal kosong lewat form."
          />
          <aside className="grid gap-4">
            <section className="card grid gap-3 p-5">
              <h2 className="text-lg font-extrabold">{date(`${selected}T12:00:00+07:00`, "id")}</h2>
              {dayWindows.length === 0 && daySessions.length === 0 && <p className="text-sm text-muted">Belum ada jadwal kosong atau sesi di tanggal ini.</p>}
              {dayWindows.length > 0 && (
                <ul className="grid gap-2">
                  {dayWindows.map((w) => {
                    const label = `${hm(w.starts_at)}–${hm(w.ends_at)}`;
                    return (
                      <li key={w.id} className="flex items-start justify-between gap-2 rounded-lg border border-good/40 bg-good/5 p-3 text-sm">
                        <span>
                          <span className="font-semibold">{label} WIB</span>
                          <span className="block text-xs text-muted">Jadwal kosong</span>
                        </span>
                        <DeleteWindowButton id={w.id} label={label} />
                      </li>
                    );
                  })}
                </ul>
              )}
              {daySessions.length > 0 && (
                <ul className="grid gap-2">
                  {daySessions.map((c) => (
                    <li key={c.id}>
                      <SessionCard c={c} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="card p-5">
              <AddWindowForm key={selected} day={selected} />
            </section>
          </aside>
        </div>
      )}

      {tab === "jadwal" && <SessionTable rows={scheduled} empty="Belum ada sesi terjadwal." />}
      {tab === "riwayat" && <SessionTable rows={history} empty="Belum ada sesi yang selesai." />}

      {tab === "jatah" &&
        (waiting.length === 0 ? (
          <p className="card p-6 text-muted">Semua jatah konsultasi sudah dibooking atau dipakai.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Client</th>
                  <th className="px-4 py-3 font-semibold">Proyek</th>
                  <th className="px-4 py-3 font-semibold">Sumber</th>
                  <th className="px-4 py-3 font-semibold">Durasi</th>
                  <th className="px-4 py-3 font-semibold">Berlaku sampai</th>
                </tr>
              </thead>
              <tbody>
                {waiting.map((c) => {
                  const soon = new Date(c.expires_at).getTime() - now < 7 * 86_400_000;
                  return (
                    <tr key={c.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 font-semibold">{c.clientName}</td>
                      <td className="px-4 py-3 font-mono">{c.projectCode}</td>
                      <td className="px-4 py-3">{SOURCE_LABEL[c.source]}</td>
                      <td className="px-4 py-3 tabular-nums">{c.minutes} menit</td>
                      <td className={`px-4 py-3 ${soon ? "font-semibold text-warn" : ""}`}>{dateTime(c.expires_at, "id")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
    </>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  scheduled: { label: "Terjadwal", cls: "text-mark" },
  done: { label: "Selesai", cls: "text-good" },
  no_show: { label: "Tidak hadir", cls: "text-muted" },
};

function SessionCard({ c }: { c: AdminConsultation }) {
  return (
    <Link href={`/admin/consultations/${c.id}`} className={`grid gap-0.5 rounded-lg border p-3 text-sm transition hover:border-muted ${c.status === "scheduled" && !c.meeting_url ? "border-bad/50" : "border-line"}`}>
      <span className="font-semibold">
        {hm(c.starts_at!)}–{hm(c.ends_at!)} · {c.clientName}
      </span>
      <span className="text-xs text-muted">
        {c.code} · {c.minutes} menit · {STATUS[c.status]?.label}
        {c.status === "scheduled" && !c.meeting_url ? " · belum ada link" : ""}
      </span>
    </Link>
  );
}

function SessionTable({ rows, empty }: { rows: AdminConsultation[]; empty: string }) {
  if (rows.length === 0) return <p className="card p-6 text-muted">{empty}</p>;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
          <tr>
            <th className="px-4 py-3 font-semibold">Waktu</th>
            <th className="px-4 py-3 font-semibold">Client</th>
            <th className="px-4 py-3 font-semibold">Durasi</th>
            <th className="px-4 py-3 font-semibold">Topik</th>
            <th className="px-4 py-3 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            // Seluruh baris bisa diklik: tautan waktu direntangkan menutupi baris.
            <tr key={c.id} className={`relative border-b border-line align-top transition last:border-0 hover:bg-raise ${c.status === "scheduled" && !c.meeting_url ? "bg-bad/5" : ""}`}>
              <td className="px-4 py-3">
                <Link href={`/admin/consultations/${c.id}`} className="font-semibold text-mark after:absolute after:inset-0 after:content-['']">
                  {dateTime(c.starts_at, "id")}
                </Link>
              </td>
              <td className="px-4 py-3">
                {c.clientName}
                <span className="block font-mono text-xs text-muted">{c.projectCode}</span>
              </td>
              <td className="px-4 py-3 tabular-nums">{c.minutes} menit</td>
              <td className="max-w-[32ch] truncate px-4 py-3 text-muted">{c.topic || "—"}</td>
              <td className="px-4 py-3">
                {c.status === "scheduled" && !c.meeting_url ? (
                  <span className="chip border-bad/50 text-bad">Belum ada link</span>
                ) : (
                  <span className={`chip ${STATUS[c.status]?.cls}`}>{STATUS[c.status]?.label}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
