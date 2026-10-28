"use server";

import { z } from "zod";
import { check, checkData, run } from "@/lib/action";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const PATHS = ["/app", "/admin"];

const orderSchema = z.object({
  package: z.string().regex(/^[a-z0-9_]{2,40}$/),
  cities: z.array(z.string().trim().min(2, "Isi kota setiap outlet.").max(80)).min(1).max(100),
  addons: z.array(z.object({ key: z.string().regex(/^[a-z0-9_]{2,40}$/), qty: z.number().int().min(1).max(20) })).max(20),
});

// Pesanan dibuat dan harganya dihitung ulang di database.
export async function createOrder(raw: unknown) {
  await requireRole("client", "/app/paket");
  return run(
    orderSchema,
    raw,
    async (o) => {
      const supabase = await createClient();
      return checkData<string>(await supabase.rpc("create_order", { p_package: o.package, p_cities: o.cities, p_addons: o.addons }));
    },
    PATHS,
  );
}

const PROOF_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

// Tautan unggah sekali pakai ke folder milik client dan invoice ini.
export async function prepareProofUpload(raw: unknown) {
  const viewer = await requireRole("client", "/app/billing");
  return run(
    z.object({ invoiceId: z.uuid(), type: z.string(), size: z.number().int().positive().max(5 * 1024 * 1024, "File bukti maksimal 5 MB.") }),
    raw,
    async ({ invoiceId, type }) => {
      const ext = PROOF_TYPES[type];
      if (!ext) throw new Error("Bukti harus berupa foto (JPG, PNG, WEBP) atau PDF.");
      const supabase = await createClient();
      const inv = checkData<{ status: string }>(await supabase.from("invoices").select("status").eq("id", invoiceId).maybeSingle());
      if (inv.status !== "unpaid") throw new Error("Invoice ini tidak sedang menunggu pembayaran.");
      const path = `${viewer.id}/${invoiceId}/${Date.now()}.${ext}`;
      const { token } = checkData(await createAdminClient().storage.from("payment-proofs").createSignedUploadUrl(path));
      return { path, token };
    },
  );
}

const proofSchema = z.object({
  invoiceId: z.uuid(),
  path: z.string().min(1).max(300),
  method: z.enum(["transfer", "qris"]),
  amount: z.coerce.number().int().positive("Isi nominal yang dibayar."),
  payer: z.string().trim().max(120),
});

export async function submitPaymentProof(raw: unknown) {
  const viewer = await requireRole("client", "/app/billing");
  return run(
    proofSchema,
    raw,
    async (p) => {
      // Pastikan file benar-benar sudah ada di folder milik client ini.
      const folder = `${viewer.id}/${p.invoiceId}`;
      const name = p.path.slice(folder.length + 1);
      if (!p.path.startsWith(`${folder}/`) || !name || name.includes("/")) throw new Error("File bukti tidak valid.");
      const files = checkData(await createAdminClient().storage.from("payment-proofs").list(folder, { search: name }));
      if (!files.some((f) => f.name === name)) throw new Error("File bukti belum terunggah. Coba unggah lagi.");
      const supabase = await createClient();
      check(await supabase.rpc("submit_payment_proof", { p_invoice: p.invoiceId, p_method: p.method, p_path: p.path, p_amount: p.amount, p_payer: p.payer }));
    },
    PATHS,
  );
}

const phone = z.string().trim().regex(/^(\+?[0-9]{8,15})?$/, "Nomor WhatsApp PIC harus 8 sampai 15 angka.");

const detailsSchema = z.object({
  projectId: z.uuid(),
  complete: z.boolean(),
  objectives: z.string().trim().max(2000),
  company: z.object({
    name: z.string().trim().max(120),
    industry: z.string().trim().max(80),
    address: z.string().trim().max(300),
    city: z.string().trim().max(80),
    instagram: z.string().trim().max(80),
    pic_name: z.string().trim().max(120),
    pic_position: z.string().trim().max(80),
    pic_phone: phone,
  }),
  outlets: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string().trim().max(120),
        address: z.string().trim().max(300),
        maps_url: z.string().trim().max(500).refine((v) => v === "" || v.startsWith("https://"), "Link Google Maps harus diawali https://"),
        notes: z.string().trim().max(500),
      }),
    )
    .max(100),
});

// Menyimpan data perusahaan dan outlet; dengan complete=true sekaligus menandai lengkap.
export async function saveProjectDetails(raw: unknown) {
  const viewer = await requireRole("client", "/app/outlets");
  return run(
    detailsSchema,
    raw,
    async (d) => {
      const supabase = await createClient();
      // Bukan upsert: kolom client_id memang tidak boleh di-update dari browser.
      const existing = check(await supabase.from("companies").select("client_id").eq("client_id", viewer.id).maybeSingle());
      if (existing) check(await supabase.from("companies").update(d.company).eq("client_id", viewer.id));
      else check(await supabase.from("companies").insert({ client_id: viewer.id, ...d.company }));
      for (const o of d.outlets) {
        const { id, ...fields } = o;
        check(await supabase.from("project_outlets").update(fields).eq("id", id).eq("project_id", d.projectId));
      }
      if (d.complete) check(await supabase.rpc("complete_project_details", { p_project: d.projectId, p_objectives: d.objectives }));
    },
    PATHS,
  );
}

const competitorSchema = z.object({
  projectId: z.uuid(),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(2, "Isi nama kompetitor.").max(120),
        address: z.string().trim().min(5, "Isi alamat kompetitor.").max(300),
        city: z.string().trim().min(2, "Isi kota kompetitor.").max(80),
        maps_url: z.string().trim().max(500).refine((v) => v === "" || v.startsWith("https://"), "Link Google Maps harus diawali https://"),
        paired_outlet_id: z.uuid().or(z.literal("")),
      }),
    )
    .max(10),
});

// Kompetitor untuk add-on benchmark; jumlah maksimal dan kompetitor yang sudah dijadwalkan dijaga database.
export async function saveCompetitors(raw: unknown) {
  await requireRole("client", "/app/outlets");
  return run(
    competitorSchema,
    raw,
    async ({ projectId, items }) => {
      const supabase = await createClient();
      check(await supabase.rpc("client_save_competitors", { p_project: projectId, p_items: items }));
    },
    PATHS,
  );
}
