"use client";

import { useState } from "react";
import { saveProjectDetails } from "../actions";
import { StatusText, useAction } from "@/components/use-action";
import { dict, type Lang } from "@/lib/i18n";
import type { ProjectOutlet } from "@/lib/orders";

export type CompanyInput = {
  name: string;
  industry: string;
  address: string;
  city: string;
  instagram: string;
  pic_name: string;
  pic_position: string;
  pic_phone: string;
};

// Data perusahaan, PIC, dan setiap outlet. Kota outlet tidak bisa diubah karena sudah menentukan harga.
export function DetailsForm({
  projectId,
  company,
  outlets,
  objectives,
  completed,
  lang,
}: {
  projectId: string;
  company: CompanyInput;
  outlets: ProjectOutlet[];
  objectives: string;
  completed: boolean;
  lang: Lang;
}) {
  const t = dict(lang).orders;
  const { pending, status, act } = useAction();
  const [c, setC] = useState(company);
  const [rows, setRows] = useState(outlets.map(({ id, city, position, name, address, maps_url, notes }) => ({ id, city, position, name, address, maps_url, notes })));
  const [goal, setGoal] = useState(objectives);

  const setCompany = (k: keyof CompanyInput) => (e: React.ChangeEvent<HTMLInputElement>) => setC({ ...c, [k]: e.target.value });
  const setRow = (i: number, k: "name" | "address" | "maps_url" | "notes") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)));

  const payload = (complete: boolean) => ({
    projectId,
    complete,
    objectives: goal,
    company: c,
    outlets: rows.map(({ id, name, address, maps_url, notes }) => ({ id, name, address, maps_url, notes })),
  });

  const field = (id: string, labelText: string, value: string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, extra: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {}) => (
    <div className="field">
      <label htmlFor={id}>{labelText}</label>
      <input id={id} value={value} onChange={onChange} {...extra} />
    </div>
  );

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => saveProjectDetails(payload(true)), t.completed);
      }}
    >
      <section className="card grid gap-4 p-5">
        <h2 className="text-xl font-extrabold">{t.company}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("c-name", t.companyName, c.name, setCompany("name"), { maxLength: 120, required: true })}
          {field("c-industry", t.industry, c.industry, setCompany("industry"), { maxLength: 80 })}
          {field("c-address", t.companyAddress, c.address, setCompany("address"), { maxLength: 300 })}
          {field("c-city", t.companyCity, c.city, setCompany("city"), { maxLength: 80 })}
          {field("c-ig", t.instagram, c.instagram, setCompany("instagram"), { maxLength: 80 })}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {field("c-pic", t.picName, c.pic_name, setCompany("pic_name"), { maxLength: 120, required: true })}
          {field("c-pos", t.picPosition, c.pic_position, setCompany("pic_position"), { maxLength: 80 })}
          {field("c-phone", t.picPhone, c.pic_phone, setCompany("pic_phone"), { inputMode: "tel", required: true })}
        </div>
      </section>

      {rows.map((r, i) => (
        <section key={r.id} className="card grid gap-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-extrabold">{t.cityLabel(r.position)}</h2>
            <span className="chip">{r.city}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {field(`o-name-${i}`, t.outletName, r.name, setRow(i, "name"), { maxLength: 120, required: true })}
            {field(`o-maps-${i}`, t.mapsUrl, r.maps_url, setRow(i, "maps_url"), { type: "url", placeholder: "https://maps.app.goo.gl/…" })}
            <div className="field sm:col-span-2">
              <label htmlFor={`o-addr-${i}`}>{t.outletAddress}</label>
              <textarea id={`o-addr-${i}`} rows={2} maxLength={300} required value={r.address} onChange={setRow(i, "address")} />
            </div>
            <div className="field sm:col-span-2">
              <label htmlFor={`o-notes-${i}`}>{t.outletNotes}</label>
              <textarea id={`o-notes-${i}`} rows={2} maxLength={500} value={r.notes} onChange={setRow(i, "notes")} />
            </div>
          </div>
        </section>
      ))}

      <section className="card grid gap-3 p-5">
        <div className="field">
          <label htmlFor="objectives">{t.objectives}</label>
          <textarea id="objectives" rows={3} maxLength={2000} value={goal} onChange={(e) => setGoal(e.target.value)} />
          <small>{t.objectivesHint}</small>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>
          {t.markComplete}
        </button>
        {!completed && (
          <button type="button" className="btn" disabled={pending} onClick={() => act(() => saveProjectDetails(payload(false)), t.saved)}>
            {t.saveDraft}
          </button>
        )}
        <StatusText status={status} />
      </div>
    </form>
  );
}
