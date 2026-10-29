"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { login, register, requestPasswordReset, resendConfirmation, setNewPassword, type FormState } from "@/app/(auth)/actions";
import { toast } from "./toaster";
import { Turnstile } from "./turnstile";
import { dict, type Lang } from "@/lib/i18n";

// Pesan juga dimunculkan sebagai pop-up setiap kali hasil form berubah.
function Alert({ state }: { state: FormState }) {
  useEffect(() => {
    if (state.error) toast("error", state.error);
    else if (state.notice) toast("ok", state.notice);
  }, [state]);
  if (state.error) {
    return (
      <p role="alert" className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-fg">
        {state.error}
      </p>
    );
  }
  if (state.notice) {
    return (
      <p role="status" className="rounded-lg border border-good/40 bg-good/10 px-3 py-2 text-sm text-fg">
        {state.notice}
      </p>
    );
  }
  return null;
}

// Supabase membatasi kirim ulang sekitar sekali per menit untuk tiap email.
const RESEND_WAIT = 60;

// Tombol kirim ulang email konfirmasi, dengan hitung mundur supaya tidak terkena batas kirim.
function ResendConfirmation({ lang, email, next, wait = 0 }: { lang: Lang; email: string; next?: string; wait?: number }) {
  const t = dict(lang).auth;
  return <ResendEmail lang={lang} label={t.resend} wait={wait} send={(captcha) => resendConfirmation(email, next ?? "", captcha)} />;
}

// Tombol kirim ulang email dengan hitung mundur, dipakai untuk konfirmasi akun dan tautan reset password.
function ResendEmail({ lang, label, wait = 0, send: request }: { lang: Lang; label: string; wait?: number; send: (captcha: string) => Promise<{ ok: boolean; message: string }> }) {
  const t = dict(lang).auth;
  const [left, setLeft] = useState(wait);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [captcha, setCaptcha] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  const send = () =>
    start(async () => {
      const r = await request(captcha).catch(() => ({ ok: false, message: t.network }));
      setResult(r);
      toast(r.ok ? "ok" : "error", r.message);
      setLeft(RESEND_WAIT);
    });
  return (
    <div className="grid gap-2 rounded-lg border border-line bg-raise px-3 py-3 text-sm">
      <span className="text-muted">{t.notReceived}</span>
      <button type="button" className="btn btn-sm justify-self-start" disabled={pending || left > 0} onClick={send}>
        {pending ? t.resending : left > 0 ? t.resendIn(left) : label}
      </button>
      <Turnstile onToken={setCaptcha} resetKey={result} />
      {result && (
        <p role="status" className={result.ok ? "text-good" : "text-bad"}>
          {result.message}
        </p>
      )}
    </div>
  );
}

export function LoginForm({ lang, next, initialError }: { lang: Lang; next?: string; initialError?: string }) {
  const t = dict(lang);
  const [state, action, pending] = useActionState(login, { error: initialError });
  return (
    <form action={action} className="grid gap-4" noValidate>
      <Alert state={state} />
      {state.unconfirmed && <ResendConfirmation key={state.unconfirmed} lang={lang} email={state.unconfirmed} next={state.next} />}
      <input type="hidden" name="next" value={next ?? ""} />
      <div className="field">
        <label htmlFor="email">{t.common.email}</label>
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} />
      </div>
      <div className="field">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="password">{t.common.password}</label>
          <Link href="/forgot-password" className="text-sm text-muted underline underline-offset-4 hover:text-fg">
            {t.auth.forgotLink}
          </Link>
        </div>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <Turnstile resetKey={state} />
      <button className="btn btn-primary mt-2" disabled={pending}>
        {pending ? t.auth.submitting : t.auth.submitLogin}
      </button>
    </form>
  );
}

export function RegisterForm({ lang, kind, next }: { lang: Lang; kind: "client" | "shopper"; next?: string }) {
  const t = dict(lang);
  const [state, action, pending] = useActionState(register, {});
  if (state.notice) {
    return (
      <div className="grid gap-4">
        <Alert state={state} />
        {state.unconfirmed && <ResendConfirmation lang={lang} email={state.unconfirmed} next={state.next} wait={RESEND_WAIT} />}
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-4" noValidate>
      <Alert state={state} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="next" value={next ?? ""} />
      <div className="field">
        <label htmlFor="full_name">{t.common.fullName}</label>
        <input id="full_name" name="full_name" autoComplete="name" required maxLength={120} defaultValue={state.values?.full_name} />
      </div>
      <div className="field">
        <label htmlFor="email">{t.common.email}</label>
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} />
      </div>
      <div className="field">
        <label htmlFor="phone">{t.common.phone}</label>
        <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required defaultValue={state.values?.phone} />
        <small>{t.common.phoneHint}</small>
      </div>
      <div className="field">
        <label htmlFor="password">{t.common.password}</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        <small>{t.password.rule}</small>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="agree" required className="mt-0.5 size-4 shrink-0 accent-accent" defaultChecked={state.values?.agree === "on"} />
        <span>
          {t.legal.agreeBefore}{" "}
          <a href="/syarat" target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4">
            {t.legal.terms}
          </a>{" "}
          {t.legal.agreeAnd}{" "}
          <a href="/privasi" target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4">
            {t.legal.privacy}
          </a>
          .
        </span>
      </label>
      <Turnstile resetKey={state} />
      <button className="btn btn-primary mt-2" disabled={pending}>
        {pending ? t.auth.submitting : t.auth.submitRegister}
      </button>
    </form>
  );
}

// Minta tautan reset password. Setelah terkirim, form diganti pesan dan tombol kirim ulang.
export function ForgotPasswordForm({ lang }: { lang: Lang }) {
  const t = dict(lang);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [pending, start] = useTransition();
  if (sent) {
    return (
      <div className="grid gap-4">
        <p role="status" className="rounded-lg border border-good/40 bg-good/10 px-3 py-2 text-sm text-fg">
          {t.auth.resetSent(sent)}
        </p>
        <ResendEmail lang={lang} label={t.auth.resendReset} wait={RESEND_WAIT} send={(c) => requestPasswordReset(sent, c)} />
      </div>
    );
  }
  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await requestPasswordReset(email, captcha).catch(() => ({ ok: false, message: t.auth.network }));
          setAttempt((a) => a + 1);
          if (r.ok) {
            setError(null);
            setSent(email.trim().toLowerCase());
            toast("ok", r.message);
          } else {
            setError(r.message);
            toast("error", r.message);
          }
        });
      }}
    >
      {error && (
        <p role="alert" className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-fg">
          {error}
        </p>
      )}
      <div className="field">
        <label htmlFor="email">{t.common.email}</label>
        <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <Turnstile onToken={setCaptcha} resetKey={attempt} />
      <button className="btn btn-primary mt-2" disabled={pending}>
        {pending ? t.auth.submitting : t.auth.sendReset}
      </button>
    </form>
  );
}

// Password baru dari tautan reset.
export function ResetPasswordForm({ lang }: { lang: Lang }) {
  const t = dict(lang);
  const [state, action, pending] = useActionState(setNewPassword, {});
  return (
    <form action={action} className="grid gap-4" noValidate>
      <Alert state={state} />
      <div className="field">
        <label htmlFor="password">{t.password.newPassword}</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        <small>{t.password.rule}</small>
      </div>
      <div className="field">
        <label htmlFor="confirm">{t.password.confirmPassword}</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </div>
      <button className="btn btn-primary mt-2" disabled={pending}>
        {pending ? t.password.saving : t.password.save}
      </button>
    </form>
  );
}
