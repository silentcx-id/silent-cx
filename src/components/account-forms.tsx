"use client";

import { useState } from "react";
import { changeEmail, changePassword, updateAccount, updateCompany, updateShopperProfile } from "@/app/account-actions";
import { CityPicker } from "./city-picker";
import { Turnstile } from "./turnstile";
import { StatusText, useAction } from "./use-action";
import { businessTypeLabel, type BusinessType } from "@/lib/catalog-types";
import { dict, type Lang } from "@/lib/i18n";
import { DAYS, TIMES } from "@/lib/profile-changes";
import { GENDERS, optionLabel, VEHICLES } from "@/lib/shopper-application";

type Row = [string, React.ReactNode];

// Ringkasan isi bagian, dibaca sekilas sebelum menekan Ubah.
function Summary({ rows }: { rows: Row[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-0.5">
          <dt className="text-muted">{label}</dt>
          <dd className="break-words">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

// Satu bagian Akun saya: ringkasan dengan tombol Ubah, form terbuka di tempat, tertutup lagi setelah tersimpan.
function Section({
  id,
  title,
  note,
  rows,
  lang,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  rows: Row[];
  lang: Lang;
  children: (close: () => void) => React.ReactNode;
}) {
  const t = dict(lang).account;
  const [editing, setEditing] = useState(false);
  return (
    <section className="card grid max-w-3xl gap-4 p-6" aria-labelledby={`${id}-title`} data-testid={`section-${id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id={`${id}-title`} className="text-xl font-bold">
            {title}
          </h2>
          {note && <p className="text-sm text-muted">{note}</p>}
        </div>
        {!editing && (
          <button type="button" className="btn btn-sm" onClick={() => setEditing(true)} aria-label={`${t.edit} ${title.toLowerCase()}`}>
            {t.edit}
          </button>
        )}
      </div>
      {editing ? children(() => setEditing(false)) : <Summary rows={rows} />}
    </section>
  );
}

function Actions({
  lang,
  pending,
  disabled,
  onCancel,
  status,
  label,
}: {
  lang: Lang;
  pending: boolean;
  disabled?: boolean;
  onCancel: () => void;
  status: ReturnType<typeof useAction>["status"];
  label?: string;
}) {
  const t = dict(lang).account;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button className="btn btn-primary" disabled={pending || disabled}>
        {pending ? "Menyimpan…" : (label ?? t.save)}
      </button>
      <button type="button" className="btn" disabled={pending} onClick={onCancel}>
        {t.cancel}
      </button>
      <StatusText status={status} />
    </div>
  );
}

const list = (values: string[], labels: readonly { value: string; label: Record<Lang, string> }[], lang: Lang) =>
  values.map((v) => labels.find((o) => o.value === v)?.label[lang] ?? v).join(", ");

const toggle = (items: string[], item: string) => (items.includes(item) ? items.filter((x) => x !== item) : [...items, item]);

function Chips({ legend, options, value, onChange }: { legend: string; options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className={`chip cursor-pointer px-3 py-1.5 font-sans text-sm ${value.includes(o.value) ? "border-accent bg-accent/10" : ""}`}>
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={value.includes(o.value)} onChange={() => onChange(toggle(value, o.value))} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// Nama (client dan admin). Shopper memakai ShopperPersonalSection yang juga berisi data diri lain.
export function NameSection({ lang, fullName }: { lang: Lang; fullName: string }) {
  const t = dict(lang);
  return (
    <Section id="personal" title={t.account.personalTitle} rows={[[t.common.fullName, fullName]]} lang={lang}>
      {(close) => <NameForm lang={lang} fullName={fullName} close={close} />}
    </Section>
  );
}

function NameForm({ lang, fullName, close }: { lang: Lang; fullName: string; close: () => void }) {
  const t = dict(lang);
  const { pending, status, act } = useAction();
  const [name, setName] = useState(fullName);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => updateAccount({ fullName: name }), t.account.savedSection, close);
      }}
    >
      <div className="field sm:max-w-md">
        <label htmlFor="account-name">{t.common.fullName}</label>
        <input id="account-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} required />
      </div>
      <Actions lang={lang} pending={pending} onCancel={close} status={status} />
    </form>
  );
}

export type ShopperProfile = {
  fullName: string;
  gender: string;
  birth_date: string;
  occupation: string;
  vehicle: string;
  domicile: string;
  reachable_cities: string[];
  industries: string[];
  available_days: string[];
  available_times: string[];
};

export function ShopperPersonalSection({ lang, profile }: { lang: Lang; profile: ShopperProfile }) {
  const t = dict(lang);
  const a = t.application;
  return (
    <Section
      id="personal"
      title={t.account.personalTitle}
      note={t.account.personalNote}
      lang={lang}
      rows={[
        [t.common.fullName, profile.fullName],
        [a.gender, optionLabel(GENDERS, profile.gender, lang)],
        [a.birthDate, profile.birth_date],
        [a.occupation, profile.occupation],
        [a.vehicle, optionLabel(VEHICLES, profile.vehicle, lang)],
      ]}
    >
      {(close) => <ShopperPersonalForm lang={lang} profile={profile} close={close} />}
    </Section>
  );
}

function ShopperPersonalForm({ lang, profile, close }: { lang: Lang; profile: ShopperProfile; close: () => void }) {
  const t = dict(lang);
  const a = t.application;
  const { pending, status, act } = useAction();
  const [v, setV] = useState({ fullName: profile.fullName, gender: profile.gender, birth_date: profile.birth_date, occupation: profile.occupation, vehicle: profile.vehicle });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => updateShopperProfile(v), t.account.savedSection, close);
      }}
    >
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="sp-name">{t.common.fullName}</label>
          <input id="sp-name" value={v.fullName} onChange={set("fullName")} autoComplete="name" maxLength={120} required />
          <small>Samakan dengan nama pemilik rekening supaya pembayaran fee lancar.</small>
        </div>
        <div className="field">
          <label htmlFor="sp-gender">{a.gender}</label>
          <select id="sp-gender" value={v.gender} onChange={set("gender")} required>
            <option value="">{a.choose}</option>
            {GENDERS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label[lang]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sp-birth">{a.birthDate}</label>
          <input id="sp-birth" type="date" value={v.birth_date} onChange={set("birth_date")} required />
        </div>
        <div className="field">
          <label htmlFor="sp-occupation">{a.occupation}</label>
          <input id="sp-occupation" value={v.occupation} onChange={set("occupation")} maxLength={80} required />
        </div>
        <div className="field">
          <label htmlFor="sp-vehicle">{a.vehicle}</label>
          <select id="sp-vehicle" value={v.vehicle} onChange={set("vehicle")} required>
            <option value="">{a.choose}</option>
            {VEHICLES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label[lang]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Actions lang={lang} pending={pending} onCancel={close} status={status} />
    </form>
  );
}

// Email (lewat tautan konfirmasi) dan nomor HP/WA. Penggantian email yang belum dikonfirmasi tampil di atas bagian ini.
export function ContactSection({ lang, email, pendingEmail, phone }: { lang: Lang; email: string; pendingEmail: string | null; phone: string }) {
  const t = dict(lang);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const waiting = sentTo ?? pendingEmail;
  return (
    <>
      {waiting && (
        <p className="max-w-3xl rounded-xl border border-accent bg-accent/10 p-4 text-sm" role="status" data-testid="email-pending">
          {t.account.emailPending(waiting)}
        </p>
      )}
      <Section
        id="contact"
        title={t.account.contactTitle}
        lang={lang}
        rows={[
          [t.account.emailLabel, email],
          [t.common.phone, phone && <span className="font-mono">{phone}</span>],
        ]}
      >
        {(close) => <ContactForm lang={lang} email={email} phone={phone} close={close} onSent={setSentTo} />}
      </Section>
    </>
  );
}

function ContactForm({ lang, email, phone, close, onSent }: { lang: Lang; email: string; phone: string; close: () => void; onSent: (email: string) => void }) {
  const t = dict(lang);
  const { pending, status, setStatus, act } = useAction();
  const [newEmail, setNewEmail] = useState(email);
  const [wa, setWa] = useState(phone);
  const target = newEmail.trim().toLowerCase();
  const emailChanged = target !== email.toLowerCase();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        act(
          async () => {
            if (wa !== phone) {
              const res = await updateAccount({ phone: wa });
              if (!res.ok) return res;
            }
            if (emailChanged) {
              const res = await changeEmail({ email: target });
              if (!res.ok) return res;
              onSent(target);
              setStatus({ tone: "ok", text: t.account.emailSent(target) });
            } else if (wa !== phone) setStatus({ tone: "ok", text: t.account.savedSection });
            return { ok: true as const };
          },
          undefined,
          close,
        );
      }}
    >
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="account-email">{t.account.emailLabel}</label>
          <input id="account-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoComplete="email" required />
          <small>{t.account.emailChangeNote}</small>
        </div>
        <div className="field">
          <label htmlFor="account-phone">{t.common.phone}</label>
          <input id="account-phone" value={wa} onChange={(e) => setWa(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" required />
          <small>{t.common.phoneHint}</small>
        </div>
      </div>
      <Actions lang={lang} pending={pending} onCancel={close} status={status} label={emailChanged ? t.account.sendLink : undefined} />
    </form>
  );
}

export function AreaSection({ lang, profile, cities }: { lang: Lang; profile: ShopperProfile; cities: string[] }) {
  const t = dict(lang);
  return (
    <Section
      id="area"
      title={t.account.areaTitle}
      note={t.account.areaNote}
      lang={lang}
      rows={[
        [t.application.domicile, profile.domicile],
        [t.application.reachable, profile.reachable_cities.join(", ")],
      ]}
    >
      {(close) => <AreaForm lang={lang} profile={profile} cities={cities} close={close} />}
    </Section>
  );
}

function AreaForm({ lang, profile, cities, close }: { lang: Lang; profile: ShopperProfile; cities: string[]; close: () => void }) {
  const t = dict(lang);
  const { pending, status, act } = useAction();
  const [domicile, setDomicile] = useState(profile.domicile);
  const [reach, setReach] = useState(profile.reachable_cities);
  // Kota yang sudah dipilih tapi kini tidak dilayani tetap tampil supaya bisa dilepas.
  const options = [...cities, ...reach.filter((c) => !cities.includes(c))];
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => updateShopperProfile({ domicile, reachable_cities: reach }), t.account.savedSection, close);
      }}
    >
      <div className="sm:max-w-md">
        <CityPicker id="sp-domicile" label={t.application.domicile} value={domicile} onChange={setDomicile} cities={cities} lang={lang} required />
      </div>
      <Chips legend={t.application.reachable} options={options.map((c) => ({ value: c, label: c }))} value={reach} onChange={setReach} />
      <Actions lang={lang} pending={pending} disabled={reach.length === 0} onCancel={close} status={status} />
    </form>
  );
}

export function InterestSection({ lang, profile, types }: { lang: Lang; profile: ShopperProfile; types: BusinessType[] }) {
  const t = dict(lang);
  return (
    <Section
      id="interest"
      title={t.account.interestTitle}
      lang={lang}
      rows={[
        [t.application.industries, profile.industries.map((k) => businessTypeLabel(types, k, lang)).join(", ")],
        [t.account.days, list(profile.available_days, DAYS, lang) || t.account.notSet],
        [t.account.times, list(profile.available_times, TIMES, lang) || t.account.notSet],
      ]}
    >
      {(close) => <InterestForm lang={lang} profile={profile} types={types} close={close} />}
    </Section>
  );
}

function InterestForm({ lang, profile, types, close }: { lang: Lang; profile: ShopperProfile; types: BusinessType[]; close: () => void }) {
  const t = dict(lang);
  const { pending, status, act } = useAction();
  const [industries, setIndustries] = useState(profile.industries);
  const [days, setDays] = useState(profile.available_days);
  const [times, setTimes] = useState(profile.available_times);
  const typeOptions = types.filter((o) => o.active || industries.includes(o.key)).map((o) => ({ value: o.key, label: businessTypeLabel(types, o.key, lang) }));
  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => updateShopperProfile({ industries, available_days: days, available_times: times }), t.account.savedSection, close);
      }}
    >
      <Chips legend={t.application.industries} options={typeOptions} value={industries} onChange={setIndustries} />
      <Chips legend={t.account.days} options={DAYS.map((d) => ({ value: d.value, label: d.label[lang] }))} value={days} onChange={setDays} />
      <Chips legend={t.account.times} options={TIMES.map((d) => ({ value: d.value, label: d.label[lang] }))} value={times} onChange={setTimes} />
      <Actions lang={lang} pending={pending} disabled={industries.length === 0} onCancel={close} status={status} />
    </form>
  );
}

export type Company = { name: string; industry: string; city: string; address: string };

export function CompanySection({ lang, company, cities, types }: { lang: Lang; company: Company; cities: string[]; types: BusinessType[] }) {
  const t = dict(lang).account;
  return (
    <Section
      id="company"
      title={t.companyTitle}
      lang={lang}
      rows={[
        [t.companyName, company.name],
        [t.companyIndustry, company.industry && businessTypeLabel(types, company.industry, lang)],
        [t.companyCity, company.city],
        [t.companyAddress, company.address],
      ]}
    >
      {(close) => <CompanyForm lang={lang} company={company} cities={cities} types={types} close={close} />}
    </Section>
  );
}

function CompanyForm({ lang, company, cities, types, close }: { lang: Lang; company: Company; cities: string[]; types: BusinessType[]; close: () => void }) {
  const t = dict(lang);
  const { pending, status, act } = useAction();
  const [c, setC] = useState(company);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => updateCompany(c), t.account.savedSection, close);
      }}
    >
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="co-name">{t.account.companyName}</label>
          <input id="co-name" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} maxLength={120} autoComplete="organization" required />
        </div>
        <div className="field">
          <label htmlFor="co-industry">{t.account.companyIndustry}</label>
          <select id="co-industry" value={c.industry} onChange={(e) => setC({ ...c, industry: e.target.value })}>
            <option value="">{t.application.choose}</option>
            {types
              .filter((o) => o.active || o.key === c.industry)
              .map((o) => (
                <option key={o.key} value={o.key}>
                  {businessTypeLabel(types, o.key, lang)}
                </option>
              ))}
            {c.industry && !types.some((o) => o.key === c.industry) && <option value={c.industry}>{c.industry}</option>}
          </select>
        </div>
        <CityPicker id="co-city" label={t.account.companyCity} value={c.city} onChange={(city) => setC({ ...c, city })} cities={cities} lang={lang} />
        <div className="field sm:col-span-2">
          <label htmlFor="co-address">{t.account.companyAddress}</label>
          <textarea id="co-address" rows={2} maxLength={300} value={c.address} onChange={(e) => setC({ ...c, address: e.target.value })} />
        </div>
      </div>
      <Actions lang={lang} pending={pending} onCancel={close} status={status} />
    </form>
  );
}

// Ganti password: wajib password saat ini. Setelah berhasil, isian dikosongkan.
export function ChangePasswordForm({ lang }: { lang: Lang }) {
  const t = dict(lang);
  const { pending, status, act } = useAction();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [attempt, setAttempt] = useState(0);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        act(
          async () => {
            const res = await changePassword({ current, password, confirm, captcha });
            setAttempt((a) => a + 1);
            return res;
          },
          t.account.changed,
          () => {
            setCurrent("");
            setPassword("");
            setConfirm("");
          },
        );
      }}
    >
      <div className="field sm:max-w-sm">
        <label htmlFor="current-password">{t.account.currentPassword}</label>
        <input id="current-password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="new-password">{t.password.newPassword}</label>
          <input id="new-password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
          <small>{t.password.rule}</small>
        </div>
        <div className="field">
          <label htmlFor="confirm-password">{t.password.confirmPassword}</label>
          <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </div>
      </div>
      <Turnstile onToken={setCaptcha} resetKey={attempt} />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? t.password.saving : t.account.passwordTitle}
        </button>
        <StatusText status={status} />
      </div>
      <p className="text-sm text-muted">{t.account.forgot}</p>
    </form>
  );
}
