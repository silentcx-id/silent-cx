"use server";

import { z } from "zod";
import { check, checkData, run } from "@/lib/action";
import { requireRole } from "@/lib/session";
import { EXPERIENCE_VALUES, GENDER_VALUES, INDUSTRY_VALUES, QUIZ, VEHICLE_VALUES } from "@/lib/shopper-application";
import { createClient } from "@/lib/supabase/server";

const PATHS = ["/shopper", "/admin"];

// Draft boleh belum lengkap; kelengkapan diperiksa database saat lamaran dikirim.
const applicationSchema = z.object({
  fullName: z.string().trim().min(1, "Nama wajib diisi.").max(120),
  phone: z.string().trim().regex(/^(\+?[0-9]{8,15})?$/, "Nomor WhatsApp harus 8 sampai 15 angka, boleh diawali +."),
  domicile: z.string().trim().max(80),
  reachable_cities: z.array(z.string().trim().min(1).max(80)).max(20),
  birth_date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Tanggal lahir tidak valid."),
  gender: z.enum(GENDER_VALUES).or(z.literal("")),
  occupation: z.string().trim().max(80),
  vehicle: z.enum(VEHICLE_VALUES).or(z.literal("")),
  experience: z.enum(EXPERIENCE_VALUES).or(z.literal("")),
  experience_note: z.string().trim().max(500),
  industries: z.array(z.enum(INDUSTRY_VALUES)).max(INDUSTRY_VALUES.length),
});

export async function saveApplication(raw: unknown) {
  const viewer = await requireRole("shopper", "/shopper/profile");
  return run(
    applicationSchema,
    raw,
    async ({ fullName, phone, ...data }) => {
      const supabase = await createClient();
      check(await supabase.from("profiles").update({ full_name: fullName, phone: phone || null }).eq("id", viewer.id));
      checkData(await supabase.rpc("save_shopper_application", { p_data: data }));
    },
    PATHS,
  );
}

const submitSchema = z.object({
  answers: z.array(z.number().int().min(0).max(9)).length(QUIZ.length, "Jawab semua soal kuis."),
  pact: z.literal(true, "Setujui pakta kerahasiaan untuk mengirim lamaran."),
});

// Hasil: { submitted, correct, total }. Kuis yang belum benar semua tidak dianggap error.
export async function submitApplication(raw: unknown) {
  await requireRole("shopper", "/shopper/profile");
  return run(
    submitSchema,
    raw,
    async ({ answers, pact }) => {
      const supabase = await createClient();
      return checkData<{ submitted: boolean; correct: number; total: number }>(
        await supabase.rpc("submit_shopper_application", { p_answers: answers, p_pact: pact }),
      );
    },
    PATHS,
  );
}

const bankSchema = z.object({
  bank: z.string().trim().min(2, "Isi nama bank.").max(60),
  number: z.string().trim().regex(/^[0-9\s-]{5,30}$/, "Nomor rekening harus berupa angka."),
  holder: z.string().trim().min(2, "Isi nama pemilik rekening.").max(120),
});

export async function saveBankAccount(raw: unknown) {
  await requireRole("shopper", "/shopper/profile");
  return run(
    bankSchema,
    raw,
    async ({ bank, number, holder }) => {
      const supabase = await createClient();
      check(await supabase.rpc("save_bank_account", { p_bank: bank, p_number: number, p_holder: holder }));
    },
    PATHS,
  );
}

