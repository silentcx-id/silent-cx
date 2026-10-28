import type { Metadata } from "next";
import Link from "next/link";
import { pickTab, Tabs } from "@/components/tabs";
import { TASK_STATUS_LABEL, TASK_STATUS_TONE, type TaskStatus } from "@/lib/field";
import { dateTime, rupiah } from "@/lib/format";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Quality control" };

type Row = {
  id: string;
  code: string;
  status: TaskStatus;
  score: number | null;
  submitted_at: string | null;
  revision_round: number;
  revision_due: string | null;
  revision_expired: boolean;
  excess_amount: number;
  shopper_id: string | null;
  projects: { id: string; code: string } | null;
  project_outlets: { name: string; city: string; is_competitor: boolean } | null;
};

const TABS = ["menunggu", "revisi"] as const;

export default async function QcPage({ searchParams }: PageProps<"/admin/qc">) {
  const [, params] = await Promise.all([requireRole("admin", "/admin/qc"), searchParams]);
  const supabase = await createClient();
  await supabase.rpc("expire_offers");
  const { data } = await supabase
    .from("audit_tasks")
    .select("id, code, status, score, submitted_at, revision_round, revision_due, revision_expired, excess_amount, shopper_id, projects(id, code), project_outlets(name, city, is_competitor)")
    .in("status", ["submitted", "revision"])
    .order("submitted_at", { ascending: true });
  const rows = (data ?? []) as unknown as Row[];
  const ids = [...new Set(rows.map((r) => r.shopper_id).filter((x): x is string => Boolean(x)))];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const name = new Map((people ?? []).map((p) => [p.id as string, p.full_name as string]));
  const waiting = rows.filter((r) => r.status === "submitted");
  const revising = rows.filter((r) => r.status === "revision");
  const tab = pickTab(params.tab, TABS, "menunggu");

  const list = (items: Row[]) => (
    <ul className="grid gap-3 xl:grid-cols-2">
      {items.map((r) => (
        <li key={r.id}>
          <Link href={`/admin/qc/${r.id}`} className="card grid gap-2 p-4 transition hover:border-muted sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <span className="grid gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-bold">{r.code}</span>
                <span className={`chip ${TASK_STATUS_TONE[r.status]}`}>{TASK_STATUS_LABEL[r.status]}</span>
                {r.project_outlets?.is_competitor && <span className="chip">Kompetitor</span>}
                {r.revision_round > 0 && <span className="chip">Revisi {r.revision_round}/2</span>}
                {r.revision_expired && <span className="chip border-warn/50 text-warn">Revisi tidak dikirim</span>}
                {r.excess_amount > 0 && <span className="chip border-warn/50 text-warn">Lebih {rupiah(r.excess_amount)}</span>}
              </span>
              <span className="text-sm">
                {r.project_outlets?.name} · {r.project_outlets?.city} <span className="text-muted">· {r.projects?.code}</span>
              </span>
              <span className="text-xs text-muted">
                {r.shopper_id ? name.get(r.shopper_id) : "—"} ·{" "}
                {r.status === "revision" && r.revision_due ? `revisi sampai ${dateTime(r.revision_due, "id")}` : `dikirim ${dateTime(r.submitted_at, "id")}`}
              </span>
            </span>
            <span className="font-display text-3xl font-extrabold tabular-nums">{r.score ?? "—"}</span>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">Quality control</h1>
        <p className="text-muted">Cocokkan jawaban dengan foto, struk, dan titik check-in, lalu setujui, minta revisi, atau tolak. Urut dari yang paling lama menunggu.</p>
      </section>
      <Tabs
        base="/admin/qc"
        label="Antrian QC"
        current={tab}
        items={[
          { id: "menunggu", label: "Menunggu QC", count: waiting.length },
          { id: "revisi", label: "Menunggu revisi shopper", count: revising.length },
        ]}
      />
      {tab === "menunggu" && (waiting.length ? list(waiting) : <p className="card p-6 text-muted">Tidak ada kunjungan yang menunggu QC.</p>)}
      {tab === "revisi" && (revising.length ? list(revising) : <p className="card p-6 text-muted">Tidak ada kunjungan yang menunggu revisi.</p>)}
    </>
  );
}
