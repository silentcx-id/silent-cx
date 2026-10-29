import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { isEmailKind, notificationEmail } from "@/lib/email-content";
import type { Notification } from "@/lib/notification-text";
import { createAdminClient } from "@/lib/supabase/admin";

// Mengirim email notifikasi yang menunggu di kotak keluar (migration 013). Dipanggil jadwal database setiap menit
// dengan kunci rahasia; tanpa kunci yang cocok permintaan ditolak.
const BATCH = 40;
const MAX_ATTEMPTS = 3;
// Klaim yang macet (misalnya server mati di tengah pengiriman) dicoba lagi setelah 10 menit.
const STALE_MS = 10 * 60_000;

type Row = Notification & {
  user_id: string;
  email_status: string;
  email_attempts: number;
  profiles: { email: string; full_name: string; status: string } | null;
};

function authorized(request: NextRequest) {
  const secret = process.env.EMAIL_DISPATCH_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || secret.length < 24) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function send(to: string, message: { subject: string; html: string; text: string }, key: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "SilentCX <noreply@silentcx.com>", to: [to], ...message }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ skipped: "RESEND_API_KEY belum diisi" }, { status: 503 });
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/+$/, "");

  const admin = createAdminClient();
  const stale = new Date(Date.now() - STALE_MS).toISOString();
  const { data, error } = await admin
    .from("notifications")
    .select("id, kind, detail, read_at, created_at, user_id, email_status, email_attempts, profiles(email, full_name, status)")
    .or(`email_status.eq.pending,and(email_status.eq.sending,email_at.lt.${stale})`)
    .order("id")
    .limit(BATCH);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let failed = 0;
  for (const n of (data ?? []) as unknown as Row[]) {
    // Klaim dulu, supaya dua pemanggilan bersamaan tidak mengirim email yang sama.
    const { data: claimed } = await admin
      .from("notifications")
      .update({ email_status: "sending", email_at: new Date().toISOString() })
      .eq("id", n.id)
      .eq("email_status", n.email_status)
      .select("id");
    if (!claimed?.length) continue;

    const to = n.profiles?.email;
    if (!to || n.profiles?.status === "suspended" || !isEmailKind(n.kind)) {
      await admin.from("notifications").update({ email_status: "skipped", email_at: new Date().toISOString() }).eq("id", n.id);
      continue;
    }
    try {
      await send(to, notificationEmail(n, n.profiles?.full_name ?? "", appUrl), `notification-${n.id}`);
      await admin.from("notifications").update({ email_status: "sent", email_error: null, email_at: new Date().toISOString() }).eq("id", n.id);
      sent++;
    } catch (e) {
      const attempts = n.email_attempts + 1;
      const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      console.warn(`Email notifikasi ${n.id} gagal (percobaan ${attempts}): ${message}`);
      await admin
        .from("notifications")
        .update({ email_status: attempts >= MAX_ATTEMPTS ? "failed" : "pending", email_attempts: attempts, email_error: message, email_at: new Date().toISOString() })
        .eq("id", n.id);
      failed++;
    }
  }
  return NextResponse.json({ sent, failed });
}
