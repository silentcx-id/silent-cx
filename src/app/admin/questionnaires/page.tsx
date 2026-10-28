import type { Metadata } from "next";
import Link from "next/link";
import { FieldSettingsForm, NewQuestionnaireForm } from "./builder";
import { businessTypeLabel, getBusinessTypes } from "@/lib/catalog";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Kuesioner" };

export default async function QuestionnairesPage() {
  await requireRole("admin", "/admin/questionnaires");
  const supabase = await createClient();
  const [{ data: list }, { data: field }, types] = await Promise.all([
    supabase.from("questionnaires").select("id, name, business_type, photo_limit, active, updated_at, questionnaire_sections(weight, questionnaire_questions(id))").order("name"),
    supabase.from("app_settings").select("value").eq("key", "field").maybeSingle(),
    getBusinessTypes(),
  ]);
  const rows = await Promise.all(
    (list ?? []).map(async (q) => {
      const { data: issues } = await supabase.rpc("questionnaire_issues", { p_questionnaire: q.id });
      const sections = q.questionnaire_sections ?? [];
      return { ...q, sections: sections.length, questions: sections.reduce((n, s) => n + (s.questionnaire_questions?.length ?? 0), 0), issues: (issues ?? []) as string[] };
    }),
  );
  const settings = (field?.value ?? {}) as { default_fee?: number; max_active_tasks?: number; default_response_hours?: number };

  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">Kuesioner</h1>
        <p className="text-muted">
          Template kuesioner per jenis bisnis. Saat ditetapkan ke proyek, kuesioner disalin dan dikunci, jadi perubahan di sini tidak mengubah audit yang sedang berjalan.
        </p>
      </section>

      <section className="grid gap-3">
        {rows.length === 0 ? (
          <p className="card p-6 text-muted">Belum ada kuesioner.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {rows.map((q) => (
              <li key={q.id}>
                <Link href={`/admin/questionnaires/${q.id}`} className={`card grid h-full gap-2 p-5 transition hover:border-muted ${q.active ? "" : "opacity-70"}`}>
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-lg font-extrabold">{q.name}</span>
                    <span className="flex gap-2">
                      {!q.active && <span className="chip text-muted">Nonaktif</span>}
                      <span className={`chip ${q.issues.length ? "border-warn/50 text-warn" : "border-good/50 text-good"}`}>{q.issues.length ? `${q.issues.length} perlu dibenahi` : "Siap dipakai"}</span>
                    </span>
                  </span>
                  <span className="text-sm text-muted">
                    {businessTypeLabel(types, q.business_type, "id")} · {q.sections} bagian · {q.questions} pertanyaan · maks. {q.photo_limit} foto
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <section className="card grid gap-4 p-5">
          <h2 className="text-xl font-extrabold">Buat kuesioner baru</h2>
          <NewQuestionnaireForm types={types} />
        </section>
        <section className="card grid gap-4 p-5">
          <div className="grid gap-1">
            <h2 className="text-xl font-extrabold">Pengaturan lapangan</h2>
            <p className="text-sm text-muted">Nilai bawaan saat membuat dan menawarkan tugas. Setiap tugas tetap bisa diubah satu per satu.</p>
          </div>
          <FieldSettingsForm initial={{ default_fee: settings.default_fee ?? 150000, max_active_tasks: settings.max_active_tasks ?? 3, default_response_hours: settings.default_response_hours ?? 24 }} />
        </section>
      </div>
    </>
  );
}
