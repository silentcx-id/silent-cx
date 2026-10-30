"use server";

import { z } from "zod";
import { check, checkData, run } from "@/lib/action";
import { QUESTION_KIND_VALUES } from "@/lib/field";
import { BUSINESS_KEY } from "@/lib/catalog-types";
import { journeyReference } from "@/lib/journey";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

const PATHS = ["/admin"];
const id = z.uuid();
const title = z.string().trim().min(2, "Judul minimal 2 karakter.").max(120);
const weight = z.coerce.number().int("Bobot harus bilangan bulat.").min(0, "Bobot 0 sampai 100.").max(100, "Bobot 0 sampai 100.");
const target = z.coerce.number().int("Target harus bilangan bulat.").min(0, "Target 0 sampai 100.").max(100, "Target 0 sampai 100.");
const prompt = z.string().trim().min(3, "Pertanyaan minimal 3 karakter.").max(500);

async function admin() {
  await requireRole("admin", "/admin/questionnaires");
  return createClient();
}

export async function createQuestionnaire(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ name: title, business_type: z.string().regex(BUSINESS_KEY, "Pilih jenis usaha.") }),
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
      business_type: z.string().regex(BUSINESS_KEY, "Pilih jenis usaha."),
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
        questionnaire_sections: {
          position: number;
          title: string;
          weight: number;
          target: number;
          questionnaire_questions: { position: number; prompt: string; help: string; kind: string; photo_required: boolean; is_sop: boolean; red_flag: boolean; journey_stage_id: string | null }[];
        }[];
      };
      const src = checkData<Source>(
        await supabase
          .from("questionnaires")
          .select("name, business_type, description, photo_limit, questionnaire_sections(position, title, weight, target, questionnaire_questions(position, prompt, help, kind, photo_required, is_sop, red_flag, journey_stage_id))")
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
          await supabase.from("questionnaire_sections").insert({ questionnaire_id: copy.id, position: s.position, title: s.title, weight: s.weight, target: s.target }).select("id").single(),
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
    z.object({ questionnaireId: id, title, weight, target: target.default(85) }),
    raw,
    async ({ questionnaireId, title, weight, target }) => {
      const position = await nextPosition("questionnaire_sections", "questionnaire_id", questionnaireId);
      check(await supabase.from("questionnaire_sections").insert({ questionnaire_id: questionnaireId, title, weight, target, position }));
    },
    PATHS,
  );
}

export async function saveSection(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ id, title, weight, target }),
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

const questionShape = {
  prompt,
  help: z.string().trim().max(500),
  kind: z.enum(QUESTION_KIND_VALUES),
  photo_required: z.boolean(),
  is_sop: z.boolean().default(false),
  red_flag: z.boolean().default(false),
  journey_stage_id: z.uuid().or(z.literal("")).default(""),
};
// SOP hanya untuk Ya/Tidak dan red flag tidak untuk isian teks (dijaga juga oleh constraint database).
const cleanQuestion = <T extends { kind: string; is_sop: boolean; red_flag: boolean; journey_stage_id: string }>(q: T) => ({
  ...q,
  is_sop: q.is_sop && q.kind === "yes_no",
  red_flag: q.red_flag && q.kind !== "text",
  journey_stage_id: q.journey_stage_id || null,
});

export async function addQuestion(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ ...questionShape, sectionId: id }),
    raw,
    async ({ sectionId, ...fields }) => {
      const position = await nextPosition("questionnaire_questions", "section_id", sectionId);
      check(await supabase.from("questionnaire_questions").insert({ ...cleanQuestion(fields), section_id: sectionId, position }));
    },
    PATHS,
  );
}

export async function saveQuestion(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ ...questionShape, id }),
    raw,
    async ({ id, ...fields }) => {
      check(await supabase.from("questionnaire_questions").update(cleanQuestion(fields)).eq("id", id));
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

// Tahap customer journey per jenis usaha. Perubahan berlaku untuk semua kuesioner jenis usaha itu;
// salinan kuesioner di proyek tidak ikut berubah.
const stageFields = { title: z.string().trim().min(2, "Nama tahap minimal 2 karakter.").max(80), hint: z.string().trim().max(300) };

export async function addStage(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ businessType: z.string().regex(BUSINESS_KEY), ...stageFields }),
    raw,
    async ({ businessType, title, hint }) => {
      const { data } = await supabase.from("journey_stages").select("position").eq("business_type", businessType).order("position", { ascending: false }).limit(1);
      check(await supabase.from("journey_stages").insert({ business_type: businessType, title, hint, position: (data?.[0]?.position ?? 0) + 1 }));
    },
    PATHS,
  );
}

export async function saveStage(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ id, ...stageFields }),
    raw,
    async ({ id, ...fields }) => {
      check(await supabase.from("journey_stages").update(fields).eq("id", id));
    },
    PATHS,
  );
}

export async function deleteStage(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ id }),
    raw,
    async ({ id }) => {
      check(await supabase.from("journey_stages").delete().eq("id", id));
    },
    PATHS,
  );
}

export async function moveStage(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ id, dir: z.enum(["up", "down"]) }),
    raw,
    async ({ id, dir }) => {
      const row = checkData<{ business_type: string }>(await supabase.from("journey_stages").select("business_type").eq("id", id).single());
      const list = checkData<{ id: string }[]>(await supabase.from("journey_stages").select("id").eq("business_type", row.business_type).order("position").order("title"));
      const i = list.findIndex((s) => s.id === id);
      const j = dir === "up" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      for (const [n, s] of list.entries()) check(await supabase.from("journey_stages").update({ position: n + 1 }).eq("id", s.id));
    },
    PATHS,
  );
}

// Menambahkan tahap dari referensi yang belum ada; nama yang sama tidak digandakan.
export async function addReferenceStages(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ businessType: z.string().regex(BUSINESS_KEY) }),
    raw,
    async ({ businessType }) => {
      const existing = checkData<{ title: string; position: number }[]>(await supabase.from("journey_stages").select("title, position").eq("business_type", businessType));
      const have = new Set(existing.map((s) => s.title.trim().toLowerCase()));
      let position = Math.max(0, ...existing.map((s) => s.position));
      const rows = journeyReference(businessType)
        .stages.filter((s) => !have.has(s.title.toLowerCase()))
        .map((s) => ({ business_type: businessType, title: s.title, hint: s.hint, position: ++position }));
      if (rows.length) check(await supabase.from("journey_stages").insert(rows));
      return rows.length;
    },
    PATHS,
  );
}
