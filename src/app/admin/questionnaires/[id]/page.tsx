import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddSectionForm, QuestionnaireHeader, SectionCard } from "../builder";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Kuesioner" };

export default async function QuestionnaireDetail({ params }: PageProps<"/admin/questionnaires/[id]">) {
  const { id } = await params;
  await requireRole("admin", `/admin/questionnaires/${id}`);
  const supabase = await createClient();
  const [{ data: q }, { data: issues }, { count: used }] = await Promise.all([
    supabase
      .from("questionnaires")
      .select("id, name, business_type, description, photo_limit, active, questionnaire_sections(id, position, title, weight, questionnaire_questions(id, position, prompt, help, kind, photo_required))")
      .eq("id", id)
      .maybeSingle(),
    supabase.rpc("questionnaire_issues", { p_questionnaire: id }),
    supabase.from("project_questionnaires").select("project_id", { count: "exact", head: true }).eq("questionnaire_id", id),
  ]);
  if (!q) notFound();

  const sections = [...(q.questionnaire_sections ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((s) => ({ ...s, questions: [...(s.questionnaire_questions ?? [])].sort((a, b) => a.position - b.position) }));
  const totalWeight = sections.reduce((n, s) => n + s.weight, 0);
  const photoQuestions = sections.reduce((n, s) => n + s.questions.filter((x) => x.photo_required).length, 0);
  const problems = (issues ?? []) as string[];

  return (
    <>
      <Link href="/admin/questionnaires" className="text-sm text-muted hover:text-fg">
        ← Semua kuesioner
      </Link>

      <QuestionnaireHeader questionnaire={{ id: q.id, name: q.name, business_type: q.business_type, description: q.description, photo_limit: q.photo_limit, active: q.active }} usedBy={used ?? 0} />

      <section className="flex flex-wrap gap-3">
        <span className={`chip ${totalWeight === 100 ? "border-good/50 text-good" : "border-warn/50 text-warn"}`}>Total bobot {totalWeight}/100</span>
        <span className={`chip ${photoQuestions <= q.photo_limit - 2 ? "" : "border-warn/50 text-warn"}`}>
          Wajib foto {photoQuestions}/{q.photo_limit - 2}
        </span>
        <span className="chip">1 foto check-in + struk termasuk dalam batas {q.photo_limit} foto</span>
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

      <section className="grid gap-4">
        {sections.map((s, i) => (
          <SectionCard key={s.id} section={s} first={i === 0} last={i === sections.length - 1} />
        ))}
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="text-lg font-extrabold">Tambah bagian</h2>
        <AddSectionForm questionnaireId={q.id} remaining={Math.max(0, 100 - totalWeight)} />
      </section>
    </>
  );
}
