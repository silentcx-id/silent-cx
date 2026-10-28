"use client";

import { useState } from "react";
import { saveApplication, submitApplication } from "../actions";
import { StatusText, useAction } from "@/components/use-action";
import { dict, type Lang } from "@/lib/i18n";
import { EXPERIENCE, GENDERS, INDUSTRIES, PACT, QUIZ, VEHICLES, type Industry } from "@/lib/shopper-application";

export type ApplicationInput = {
  fullName: string;
  phone: string;
  domicile: string;
  reachable_cities: string[];
  birth_date: string;
  gender: string;
  occupation: string;
  vehicle: string;
  experience: string;
  experience_note: string;
  industries: Industry[];
};

// Formulir lamaran dua langkah: data diri (bisa disimpan sebagai draft), lalu kuis etika dan pakta kerahasiaan.
export function ApplicationForm({ initial, cities, lang }: { initial: ApplicationInput; cities: string[]; lang: Lang }) {
  const t = dict(lang).application;
  const { pending, status, setStatus, act } = useAction();
  const [step, setStep] = useState<"form" | "quiz">("form");
  const [v, setV] = useState(initial);
  const [answers, setAnswers] = useState<(number | null)[]>(QUIZ.map(() => null));
  const [pact, setPact] = useState(false);

  const set = (k: keyof ApplicationInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  const toggle = <T extends string>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  // Kota yang sudah dipilih tapi kini tidak dilayani tetap tampil supaya bisa dilepas.
  const cityOptions = [...cities, ...v.reachable_cities.filter((c) => !cities.includes(c))];

  const select = (id: keyof ApplicationInput, label: string, options: readonly { value: string; label: Record<Lang, string> }[]) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={v[id] as string} onChange={set(id)} required>
        <option value="">{t.choose}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label[lang]}
          </option>
        ))}
      </select>
    </div>
  );

  if (step === "quiz") {
    const all = answers.every((a) => a !== null);
    return (
      <form
        className="grid gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          act(
            () => submitApplication({ answers, pact }),
            undefined,
            (r) => {
              if (r && !r.submitted) setStatus({ tone: "error", text: t.quizFailed(r.correct, r.total) });
            },
          );
        }}
      >
        <section className="card grid gap-5 p-5">
          <div className="grid gap-1">
            <h2 className="text-xl font-extrabold">{t.quizTitle}</h2>
            <p className="text-sm text-muted">{t.quizLede}</p>
          </div>
          {QUIZ.map((q, qi) => (
            <fieldset key={qi} className="grid gap-2">
              <legend className="mb-2 font-semibold">
                <span className="mr-2 font-mono text-xs text-muted">{t.question(qi + 1)}</span>
                {q.question[lang]}
              </legend>
              {q.options.map((o, oi) => (
                <label
                  key={oi}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${answers[qi] === oi ? "border-accent bg-accent/10" : "border-line hover:border-muted"}`}
                >
                  <input
                    type="radio"
                    name={`q${qi}`}
                    className="mt-0.5 size-4 accent-[var(--accent)]"
                    checked={answers[qi] === oi}
                    onChange={() => setAnswers(answers.map((a, j) => (j === qi ? oi : a)))}
                  />
                  <span>{o[lang]}</span>
                </label>
              ))}
            </fieldset>
          ))}
        </section>

        <section className="card grid gap-4 p-5">
          <h2 className="text-xl font-extrabold">{PACT.title[lang]}</h2>
          <ol className="grid list-decimal gap-2 pl-5 text-sm">
            {PACT.points.map((p, i) => (
              <li key={i}>{p[lang]}</li>
            ))}
          </ol>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 text-sm font-semibold">
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={pact} onChange={(e) => setPact(e.target.checked)} />
            <span>{PACT.agree[lang]}</span>
          </label>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" disabled={pending || !all || !pact}>
            {t.submit}
          </button>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => {
              setStatus(null);
              setStep("form");
            }}
          >
            {t.back}
          </button>
          <StatusText status={status} />
        </div>
      </form>
    );
  }

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => saveApplication(v), undefined, () => setStep("quiz"));
      }}
    >
      <section className="card grid gap-4 p-5">
        <h2 className="text-xl font-extrabold">{t.personal}</h2>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="fullName">{dict(lang).common.fullName}</label>
            <input id="fullName" value={v.fullName} onChange={set("fullName")} maxLength={120} required />
          </div>
          <div className="field">
            <label htmlFor="phone">{dict(lang).common.phone}</label>
            <input id="phone" value={v.phone} onChange={set("phone")} inputMode="tel" required pattern="\+?[0-9]{8,15}" />
            <small>{dict(lang).common.phoneHint}</small>
          </div>
          <div className="field">
            <label htmlFor="birth_date">{t.birthDate}</label>
            <input id="birth_date" type="date" value={v.birth_date} onChange={set("birth_date")} required />
            <small>{t.birthHint}</small>
          </div>
          {select("gender", t.gender, GENDERS)}
        </div>
      </section>

      <section className="card grid gap-4 p-5">
        <h2 className="text-xl font-extrabold">{t.mobility}</h2>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="domicile">{t.domicile}</label>
            <input id="domicile" value={v.domicile} onChange={set("domicile")} maxLength={80} placeholder={t.domicileHint} required />
          </div>
          {select("vehicle", t.vehicle, VEHICLES)}
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold">{t.reachable}</legend>
          {cityOptions.length === 0 ? (
            <p className="text-sm text-warn">{t.noCities}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {cityOptions.map((c) => (
                <label key={c} className={`chip cursor-pointer px-3 py-1.5 font-sans text-sm ${v.reachable_cities.includes(c) ? "border-accent bg-accent/10" : ""}`}>
                  <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={v.reachable_cities.includes(c)} onChange={() => setV({ ...v, reachable_cities: toggle(v.reachable_cities, c) })} />
                  {c}
                </label>
              ))}
            </div>
          )}
          <small className="text-sm text-muted">{t.reachableHint}</small>
        </fieldset>
      </section>

      <section className="card grid gap-4 p-5">
        <h2 className="text-xl font-extrabold">{t.work}</h2>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="occupation">{t.occupation}</label>
            <input id="occupation" value={v.occupation} onChange={set("occupation")} maxLength={80} placeholder={t.occupationHint} required />
          </div>
          {select("experience", t.experience, EXPERIENCE)}
          <div className="field sm:col-span-2">
            <label htmlFor="experience_note">{t.experienceNote}</label>
            <textarea id="experience_note" rows={2} maxLength={500} value={v.experience_note} onChange={set("experience_note")} />
          </div>
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold">{t.industries}</legend>
          <div className="flex flex-wrap gap-2">
            {INDUSTRIES.map((o) => (
              <label key={o.value} className={`chip cursor-pointer px-3 py-1.5 font-sans text-sm ${v.industries.includes(o.value) ? "border-accent bg-accent/10" : ""}`}>
                <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={v.industries.includes(o.value)} onChange={() => setV({ ...v, industries: toggle(v.industries, o.value) })} />
                {o.label[lang]}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={pending || v.reachable_cities.length === 0 || v.industries.length === 0}>
          {t.toQuiz} →
        </button>
        <button type="button" className="btn" disabled={pending} onClick={() => act(() => saveApplication(v), t.saved)}>
          {t.saveDraft}
        </button>
        <StatusText status={status} />
      </div>
    </form>
  );
}
