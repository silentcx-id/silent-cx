"use server";

import { z } from "zod";
import { check, checkData, run } from "@/lib/action";
import { QUESTION_KIND_VALUES } from "@/lib/field";
import { INDUSTRY_VALUES } from "@/lib/shopper-application";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

const PATHS = ["/admin"];
const id = z.uuid();
const title = z.string().trim().min(2, "Judul minimal 2 karakter.").max(120);
const weight = z.coerce.number().int("Bobot harus bilangan bulat.").min(0, "Bobot 0 sampai 100.").max(100, "Bobot 0 sampai 100.");
const prompt = z.string().trim().min(3, "Pertanyaan minimal 3 karakter.").max(500);

async function admin() {
  await requireRole("admin", "/admin/questionnaires");
  return createClient();
}

export async function createQuestionnaire(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ name: title, business_type: z.enum(INDUSTRY_VALUES) }),
    raw,
    async (q) => checkData<{ id: string }>(await supabase.from("questionnaires").insert(q).select("id").single()).id,
    PATHS,
  );
}

export async function saveQuestionnaire(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({
      id,
      name: title,
      business_type: z.enum(INDUSTRY_VALUES),
      description: z.string().trim().max(500),
      photo_limit: z.coerce.number().int().min(3, "Batas foto 3 sampai 20.").max(20, "Batas foto 3 sampai 20."),
      active: z.boolean(),
    }),
    raw,
    async ({ id, ...fields }) => {
      check(await supabase.from("questionnaires").update(fields).eq("id", id));
    },
    PATHS,
  );
}

// Menyalin kuesioner beserta bagian dan pertanyaannya, misalnya untuk disesuaikan dengan client tertentu.
export async function duplicateQuestionnaire(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ id }),
    raw,
    async ({ id }) => {
      type Source = {
        name: string;
        business_type: string;
        description: string;
        photo_limit: number;
        questionnaire_sections: { position: number; title: string; weight: number; questionnaire_questions: { position: number; prompt: string; help: string; kind: string; photo_required: boolean }[] }[];
      };
      const src = checkData<Source>(
        await supabase
          .from("questionnaires")
          .select("name, business_type, description, photo_limit, questionnaire_sections(position, title, weight, questionnaire_questions(position, prompt, help, kind, photo_required))")
          .eq("id", id)
          .single(),
      );
      const copy = checkData<{ id: string }>(
        await supabase
          .from("questionnaires")
          .insert({ name: `${src.name} (salinan)`.slice(0, 120), business_type: src.business_type, description: src.description, photo_limit: src.photo_limit, active: false })
          .select("id")
          .single(),
      );
      for (const s of src.questionnaire_sections ?? []) {
        const sec = checkData<{ id: string }>(
          await supabase.from("questionnaire_sections").insert({ questionnaire_id: copy.id, position: s.position, title: s.title, weight: s.weight }).select("id").single(),
        );
        const questions = (s.questionnaire_questions ?? []).map((q) => ({ ...q, section_id: sec.id }));
        if (questions.length) check(await supabase.from("questionnaire_questions").insert(questions));
      }
      return copy.id;
    },
    PATHS,
  );
}

export async function deleteQuestionnaire(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ id }),
    raw,
    async ({ id }) => {
      check(await supabase.from("questionnaires").delete().eq("id", id));
    },
    PATHS,
  );
}

async function nextPosition(table: "questionnaire_sections" | "questionnaire_questions", column: string, parent: string) {
  const supabase = await createClient();
  const { data } = await supabase.from(table).select("position").eq(column, parent).order("position", { ascending: false }).limit(1);
  return (data?.[0]?.position ?? 0) + 1;
}

export async function addSection(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ questionnaireId: id, title, weight }),
    raw,
    async ({ questionnaireId, title, weight }) => {
      const position = await nextPosition("questionnaire_sections", "questionnaire_id", questionnaireId);
      check(await supabase.from("questionnaire_sections").insert({ questionnaire_id: questionnaireId, title, weight, position }));
    },
    PATHS,
  );
}

export async function saveSection(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ id, title, weight }),
    raw,
    async ({ id, ...fields }) => {
      check(await supabase.from("questionnaire_sections").update(fields).eq("id", id));
    },
    PATHS,
  );
}

export async function deleteSection(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ id }),
    raw,
    async ({ id }) => {
      check(await supabase.from("questionnaire_sections").delete().eq("id", id));
    },
    PATHS,
  );
}

const questionFields = z.object({ prompt, help: z.string().trim().max(500), kind: z.enum(QUESTION_KIND_VALUES), photo_required: z.boolean() });

export async function addQuestion(raw: unknown) {
  const supabase = await admin();
  return run(
    questionFields.extend({ sectionId: id }),
    raw,
    async ({ sectionId, ...fields }) => {
      const position = await nextPosition("questionnaire_questions", "section_id", sectionId);
      check(await supabase.from("questionnaire_questions").insert({ ...fields, section_id: sectionId, position }));
    },
    PATHS,
  );
}

export async function saveQuestion(raw: unknown) {
  const supabase = await admin();
  return run(
    questionFields.extend({ id }),
    raw,
    async ({ id, ...fields }) => {
      check(await supabase.from("questionnaire_questions").update(fields).eq("id", id));
    },
    PATHS,
  );
}

export async function deleteQuestion(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ id }),
    raw,
    async ({ id }) => {
      check(await supabase.from("questionnaire_questions").delete().eq("id", id));
    },
    PATHS,
  );
}

// Menggeser bagian atau pertanyaan satu langkah ke atas/bawah, lalu merapikan urutan menjadi 1..n.
export async function move(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ kind: z.enum(["section", "question"]), id, dir: z.enum(["up", "down"]) }),
    raw,
    async ({ kind, id, dir }) => {
      const table = kind === "section" ? "questionnaire_sections" : "questionnaire_questions";
      const parentCol = kind === "section" ? "questionnaire_id" : "section_id";
      const row = checkData<Record<string, string>>(await supabase.from(table).select(parentCol).eq("id", id).single());
      const siblings = checkData<{ id: string }[]>(await supabase.from(table).select("id").eq(parentCol, row[parentCol]).order("position").order("id"));
      const i = siblings.findIndex((s) => s.id === id);
      const j = dir === "up" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= siblings.length) return;
      [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
      for (const [n, s] of siblings.entries()) check(await supabase.from(table).update({ position: n + 1 }).eq("id", s.id));
    },
    PATHS,
  );
}

export async function saveFieldSettings(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({
      default_fee: z.coerce.number().int().min(0, "Fee tidak boleh negatif.").max(100_000_000),
      max_active_tasks: z.coerce.number().int().min(1, "Minimal 1 tugas aktif.").max(50),
      default_response_hours: z.coerce.number().int().min(1, "Batas respons 1 sampai 168 jam.").max(168, "Batas respons 1 sampai 168 jam."),
    }),
    raw,
    async (value) => {
      check(await supabase.from("app_settings").upsert({ key: "field", value }));
    },
    PATHS,
  );
}
