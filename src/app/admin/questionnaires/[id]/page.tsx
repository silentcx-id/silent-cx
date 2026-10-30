import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddSectionForm, JourneyPanel, QuestionnaireHeader, SectionCard } from "../builder";
import { getBusinessTypes } from "@/lib/catalog";
import { businessTypeLabel } from "@/lib/catalog-types";
import type { JourneyStage } from "@/lib/journey";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Kuesioner" };

export default async function QuestionnaireDetail({ params }: PageProps<"/admin/questionnaires/[id]">) {
  const { id } = await params;
  await requireRole("admin", `/admin/questionnaires/${id}`);
  const supabase = await createClient();
  const [{ data: q }, { data: issues }, { count: used }, types] = await Promise.all([
    supabase
      .from("questionnaires")
      .select(
        "id, name, business_type, description, photo_limit, active, questionnaire_sections(id, position, title, weight, target, questionnaire_questions(id, position, prompt, help, kind, photo_required, is_sop, red_flag, journey_stage_id))",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.rpc("questionnaire_issues", { p_questionnaire: id }),
    supabase.from("project_questionnaires").select("project_id", { count: "exact", head: true }).eq("questionnaire_id", id),
    getBusinessTypes(),
  ]);
  if (!q) notFound();
  const { data: stageRows } = await supabase
    .from("journey_stages")
    .select("id, business_type, position, title, hint")
    .eq("business_type", q.business_type)
    .order("position")
    .order("title");
  const stages = (stageRows ?? []) as JourneyStage[];

  type Q = {
    id: string;
    position: number;
    prompt: string;
    help: string;
    kind: string;
    photo_required: boolean;
    is_sop: boolean;
    red_flag: boolean;
    journey_stage_id: string | null;
  };
  type S = {
    id: string;
    position: number;
    title: string;
    weight: number;
    target: number;
    questionnaire_questions: Q[] | null;
  };
  const sections = [...((q.questionnaire_sections ?? []) as S[])]
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      ...s,
      questions: [...(s.questionnaire_questions ?? [])].sort((a, b) => a.position - b.position),
    }));
  const totalWeight = sections.reduce((n, s) => n + s.weight, 0);
  const all = sections.flatMap((s) => s.questions);
  const photoQuestions = all.filter((x) => x.photo_required).length;
  const sop = all.filter((x) => x.is_sop).length;
  const flags = all.filter((x) => x.red_flag).length;
  const scored = all.filter((x) => x.kind !== "text");
  const perStage = stages.map((st) => ({
    ...st,
    count: scored.filter((x) => x.journey_stage_id === st.id).length,
  }));
  const usedStages = perStage.filter((st) => st.count > 0).length;
  const noStage = scored.filter((x) => !x.journey_stage_id).length;
  const problems = (issues ?? []) as string[];
  const typeLabel = businessTypeLabel(types, q.business_type, "id");
  // Syarat paket yang dicek database saat kuesioner ditetapkan ke proyek (snapshot_feature_issues).
  const insightReady = sop > 0 && usedStages >= 2;
  const performanceReady = insightReady && flags > 0;

  return (
    <>
      <Link href="/admin/questionnaires" className="text-sm text-muted hover:text-fg">
        ← Semua kuesioner
      </Link>
      <h1 className="text-3xl font-extrabold">{q.name}</h1>

      <QuestionnaireHeader
        questionnaire={{
          id: q.id,
          name: q.name,
          business_type: q.business_type,
          description: q.description,
          photo_limit: q.photo_limit,
          active: q.active,
        }}
        usedBy={used ?? 0}
        types={types}
      />

      <section className="flex flex-wrap gap-3">
        <span className={`chip ${totalWeight === 100 ? "border-good/50 text-good" : "border-warn/50 text-warn"}`}>Total bobot {totalWeight}/100</span>
        <span className={`chip ${photoQuestions <= q.photo_limit - 2 ? "" : "border-warn/50 text-warn"}`}>
          Wajib foto {photoQuestions}/{q.photo_limit - 2}
        </span>
        <span className="chip">1 foto check-in + struk termasuk dalam batas {q.photo_limit} foto</span>
      </section>

      <section className="card grid gap-4 p-5" aria-labelledby="ringkasan-isi">
        <h2 id="ringkasan-isi" className="text-lg font-extrabold">
          Ringkasan isi laporan
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Pertanyaan SOP", String(sop), "Dasar kepatuhan SOP"],
            ["Red flag", String(flags), "Masuk daftar red flag laporan"],
            ["Tahap journey dipakai", `${usedStages}/${stages.length}`, "Dasar evaluasi customer journey"],
            ["Dinilai tanpa tahap", String(noStage), "Tidak masuk customer journey"],
          ].map(([k, v, hint]) => (
            <div key={k} className="rounded-xl border border-line p-3">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="font-display text-2xl font-extrabold tabular-nums">{v}</dd>
              <dd className="text-xs text-muted">{hint}</dd>
            </div>
          ))}
        </dl>
        {perStage.length > 0 && (
          <ul className="flex flex-wrap gap-2 text-sm" aria-label="Pertanyaan per tahap">
            {perStage.map((st) => (
              <li key={st.id} className={`chip ${st.count ? "" : "text-muted"}`}>
                {st.position}. {st.title} · {st.count}
              </li>
            ))}
          </ul>
        )}
        <ul className="grid gap-1 text-sm">
          <li className={insightReady ? "text-good" : "text-warn"}>
            {insightReady ? "✓" : "!"} Paket Insight:{" "}
            {insightReady ? "siap" : "butuh minimal 1 pertanyaan SOP dan pertanyaan yang dinilai di minimal 2 tahap journey"}
          </li>
          <li className={performanceReady ? "text-good" : "text-warn"}>
            {performanceReady ? "✓" : "!"} Paket Performance: {performanceReady ? "siap" : "butuh syarat Insight dan minimal 1 pertanyaan red flag"}
          </li>
          <li className="text-muted">Paket Essential bisa memakai kuesioner apa pun yang sudah siap.</li>
        </ul>
      </section>

      {problems.length > 0 && (
        <div className="grid gap-1 rounded-xl border border-warn/50 bg-warn/10 p-4 text-sm">
          <p className="font-semibold">Belum bisa ditetapkan ke proyek:</p>
          <ul className="list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <JourneyPanel businessType={q.business_type} typeLabel={typeLabel} stages={stages} />

      <section className="grid gap-4">
        {sections.map((s, i) => (
          <SectionCard key={s.id} section={s} first={i === 0} last={i === sections.length - 1} stages={stages} />
        ))}
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="text-lg font-extrabold">Tambah bagian</h2>
        <AddSectionForm questionnaireId={q.id} remaining={Math.max(0, 100 - totalWeight)} />
      </section>
    </>
  );
}
