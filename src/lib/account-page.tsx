import "server-only";
import type { Metadata } from "next";
import {
  AreaSection,
  ChangePasswordForm,
  CompanySection,
  ContactSection,
  InterestSection,
  NameSection,
  ShopperPersonalSection,
  type ShopperProfile,
} from "@/components/account-forms";
import { StatusFlash } from "@/components/status-flash";
import { BankForm } from "@/app/shopper/profile/bank-form";
import { getBusinessTypes } from "./catalog";
import { dict, type Lang } from "./i18n";
import { getLang } from "./prefs";
import { ROLE_HOME, type Role } from "./roles";
import { requireRole } from "./session";
import { getActiveCities, getBankAccount } from "./shopper";
import { createClient } from "./supabase/server";

export const accountMetadata: Metadata = { title: "Akun saya" };

// Halaman Akun saya. Semua role: data diri, kontak (termasuk ganti email), dan password. Shopper aktif juga
// domisili, jangkauan, minat, waktu berkunjung, dan rekening; client juga data perusahaan.
export async function accountPage(role: Role) {
  const viewer = await requireRole(role, `${ROLE_HOME[role]}/account`);
  const lang = await getLang();
  const t = dict(lang).account;
  const supabase = await createClient();
  const [{ data: profile }, { data: auth }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone").eq("id", viewer.id).single(),
    supabase.auth.getUser(),
  ]);
  const fullName = profile?.full_name ?? "";
  const phone = profile?.phone ?? "";
  // Email baru yang belum dikonfirmasi lewat tautan.
  const pendingEmail = auth.user?.new_email ?? null;
  const shopperActive = role === "shopper" && viewer.status === "active";

  return (
    <>
      <StatusFlash messages={{ email: t.emailChanged }} />
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-3xl font-extrabold">{t.title}</h1>
        <p className="text-muted">{t.lede}</p>
      </section>
      {shopperActive ? <ShopperSections id={viewer.id} fullName={fullName} lang={lang} /> : <NameSection lang={lang} fullName={fullName} />}
      <ContactSection lang={lang} email={viewer.email} pendingEmail={pendingEmail} phone={phone} />
      {role === "client" && <ClientCompany id={viewer.id} lang={lang} />}
      {shopperActive && <ShopperBank id={viewer.id} lang={lang} />}
      <section className="card grid max-w-3xl gap-5 p-6">
        <div className="grid gap-1">
          <h2 className="text-xl font-bold">{t.passwordTitle}</h2>
          <p className="text-sm text-muted">{t.passwordLede}</p>
        </div>
        <ChangePasswordForm lang={lang} />
      </section>
    </>
  );
}

async function ShopperSections({ id, fullName, lang }: { id: string; fullName: string; lang: Lang }) {
  const supabase = await createClient();
  const [{ data: app }, cities, types] = await Promise.all([
    supabase
      .from("shopper_applications")
      .select("gender, birth_date, occupation, vehicle, domicile, reachable_cities, industries, available_days, available_times")
      .eq("shopper_id", id)
      .eq("status", "approved")
      .order("decided_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    getActiveCities(),
    getBusinessTypes(),
  ]);
  const p: ShopperProfile = {
    fullName,
    gender: app?.gender ?? "",
    birth_date: app?.birth_date ?? "",
    occupation: app?.occupation ?? "",
    vehicle: app?.vehicle ?? "",
    domicile: app?.domicile ?? "",
    reachable_cities: app?.reachable_cities ?? [],
    industries: app?.industries ?? [],
    available_days: app?.available_days ?? [],
    available_times: app?.available_times ?? [],
  };
  return (
    <>
      <ShopperPersonalSection lang={lang} profile={p} />
      <AreaSection lang={lang} profile={p} cities={cities} />
      <InterestSection lang={lang} profile={p} types={types} />
    </>
  );
}

async function ShopperBank({ id, lang }: { id: string; lang: Lang }) {
  const bank = await getBankAccount(id);
  const t = dict(lang);
  return (
    <section className="card grid max-w-3xl gap-4 p-6" data-testid="section-bank">
      <div className="grid gap-1">
        <h2 className="text-xl font-bold">{t.account.bankTitle}</h2>
        <p className="text-sm text-muted">{t.application.bankLede}</p>
      </div>
      <BankForm initial={bank} lang={lang} />
    </section>
  );
}

async function ClientCompany({ id, lang }: { id: string; lang: Lang }) {
  const supabase = await createClient();
  const [{ data: company }, cities, types] = await Promise.all([
    supabase.from("companies").select("name, industry, city, address").eq("client_id", id).maybeSingle(),
    getActiveCities(),
    getBusinessTypes(),
  ]);
  return (
    <CompanySection
      lang={lang}
      company={{ name: company?.name ?? "", industry: company?.industry ?? "", city: company?.city ?? "", address: company?.address ?? "" }}
      cities={cities}
      types={types}
    />
  );
}
