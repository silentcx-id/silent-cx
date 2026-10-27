"use client";

import { useActionState } from "react";
import { login, register, type FormState } from "@/app/(auth)/actions";
import { dict, type Lang } from "@/lib/i18n";

function Alert({ state }: { state: FormState }) {
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

export function LoginForm({ lang, next, initialError }: { lang: Lang; next?: string; initialError?: string }) {
  const t = dict(lang);
  const [state, action, pending] = useActionState(login, { error: initialError });
  return (
    <form action={action} className="grid gap-4" noValidate>
      <Alert state={state} />
      <input type="hidden" name="next" value={next ?? ""} />
      <div className="field">
        <label htmlFor="email">{t.common.email}</label>
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} />
      </div>
      <div className="field">
        <label htmlFor="password">{t.common.password}</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <button className="btn btn-primary mt-2" disabled={pending}>
        {pending ? t.auth.submitting : t.auth.submitLogin}
      </button>
    </form>
  );
}

export function RegisterForm({ lang, kind }: { lang: Lang; kind: "client" | "shopper" }) {
  const t = dict(lang);
  const [state, action, pending] = useActionState(register, {});
  if (state.notice) return <Alert state={state} />;
  return (
    <form action={action} className="grid gap-4" noValidate>
      <Alert state={state} />
      <input type="hidden" name="kind" value={kind} />
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
      <button className="btn btn-primary mt-2" disabled={pending}>
        {pending ? t.auth.submitting : t.auth.submitRegister}
      </button>
    </form>
  );
}
