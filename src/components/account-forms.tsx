"use client";

import { useState } from "react";
import { changePassword, updateAccount } from "@/app/account-actions";
import { Turnstile } from "./turnstile";
import { StatusText, useAction } from "./use-action";
import { dict, type Lang } from "@/lib/i18n";

// Nama dan nomor WhatsApp; email tampil tetapi tidak bisa diubah.
export function AccountDataForm({ lang, email, fullName, phone }: { lang: Lang; email: string; fullName: string; phone: string }) {
  const t = dict(lang);
  const { pending, status, act } = useAction();
  const [name, setName] = useState(fullName);
  const [wa, setWa] = useState(phone);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => updateAccount({ fullName: name, phone: wa }), t.account.saved);
      }}
    >
      <div className="field">
        <label htmlFor="account-email">{t.common.email}</label>
        <input id="account-email" value={email} readOnly aria-describedby="account-email-note" className="opacity-70" />
        <small id="account-email-note">{t.account.emailFixed}</small>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="account-name">{t.common.fullName}</label>
          <input id="account-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} required />
        </div>
        <div className="field">
          <label htmlFor="account-phone">{t.common.phone}</label>
          <input id="account-phone" value={wa} onChange={(e) => setWa(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" required />
          <small>{t.common.phoneHint}</small>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>
          {t.account.save}
        </button>
        <StatusText status={status} />
      </div>
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
