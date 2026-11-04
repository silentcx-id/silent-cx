import type { Metadata } from "next";
import Link from "next/link";
import { Pager } from "@/components/pager";
import { getFollowupLog, getStaff } from "@/lib/cs-data";
import { dayLabel } from "@/lib/field";
import { CHANNEL_LABEL, OUTCOME_LABEL } from "@/lib/followups";
import { dateTime } from "@/lib/format";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Riwayat follow-up" };

const PER_PAGE = 30;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function FollowupLog({ searchParams }: PageProps<"/cs/followups">) {
  const [viewer, params, staff] = await Promise.all([requireRole("cs", "/cs/followups"), searchParams, getStaff()]);
  // Bawaan: catatan saya sendiri. "semua" = seluruh tim.
  const who = one(params.staf);
  const staffId = who === "semua" ? null : staff.some((s) => s.id === who) ? who : viewer.id;
  const page = Math.max(1, Math.floor(Number(one(params.hal)) || 1));
  const { rows, total } = await getFollowupLog(staffId, page, PER_PAGE);
  const href = (p: number) => {
    const qs = new URLSearchParams({ staf: staffId ?? "semua" });
    if (p > 1) qs.set("hal", String(p));
    return `/cs/followups?${qs}`;
  };

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">Riwayat follow-up</h1>
        <p className="text-muted">Semua WhatsApp, telepon, dan catatan follow-up, termasuk konfirmasi proyek yang dikirim admin.</p>
      </section>

      <form action="/cs/followups" className="card flex flex-wrap items-end gap-3 p-4">
        <div className="field min-w-0 flex-[1_1_240px]">
          <label htmlFor="staf">Dicatat oleh</label>
          <select id="staf" name="staf" defaultValue={staffId ?? "semua"}>
            <option value="semua">Seluruh tim</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id === viewer.id ? `${s.full_name} (saya)` : s.full_name}
                {s.role === "admin" ? " · admin" : ""}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-sm btn-primary">Tampilkan</button>
      </form>

      {rows.length === 0 ? (
        <p className="card p-6 text-muted">Belum ada catatan follow-up{staffId === viewer.id ? " dari Anda" : ""}.</p>
      ) : (
        <section className="grid gap-3">
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Waktu</th>
                  <th className="px-4 py-3 font-semibold">Client</th>
                  <th className="px-4 py-3 font-semibold">Hasil</th>
                  <th className="px-4 py-3 font-semibold">Catatan</th>
                  <th className="px-4 py-3 font-semibold">Oleh</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line align-top last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted">
                      {dateTime(r.created_at, "id")}
                      <div className="text-xs">{CHANNEL_LABEL[r.channel]}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/cs/clients/${r.client_id}`} className="font-semibold hover:text-mark">
                        {r.company || r.client_name}
                      </Link>
                      {r.project_code && <div className="font-mono text-xs text-muted">{r.project_code}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="chip">{OUTCOME_LABEL[r.outcome]}</span>
                      {r.purpose === "project_confirm" && <div className="mt-1 text-xs text-mark">Konfirmasi proyek</div>}
                      {r.next_at && <div className="mt-1 text-xs font-semibold text-warn">Lagi: {dayLabel(String(r.next_at).slice(0, 10))}</div>}
                    </td>
                    <td className="max-w-[40ch] whitespace-pre-line px-4 py-3 text-muted">{r.note || "—"}</td>
                    <td className="px-4 py-3 text-muted">
                      {r.staff ?? "—"}
                      {r.staff_role === "admin" ? " (admin)" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} perPage={PER_PAGE} total={total} shown={rows.length} noun="catatan" href={href} label="Halaman riwayat follow-up" />
        </section>
      )}
    </>
  );
}
