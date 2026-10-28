"use client";

import { useState } from "react";
import { saveCompetitors } from "../actions";
import { CityPicker } from "@/components/city-picker";
import { StatusText, useAction } from "@/components/use-action";
import { dict, type Lang } from "@/lib/i18n";
import type { ProjectOutlet } from "@/lib/orders";

type Item = { name: string; address: string; city: string; maps_url: string; paired_outlet_id: string };

// Kompetitor sesuai jumlah add-on benchmark. Shopper tidak diberi tahu bahwa outlet ini kompetitor.
export function CompetitorForm({
  projectId,
  allowance,
  competitors,
  outlets,
  cities,
  lang,
}: {
  projectId: string;
  allowance: number;
  competitors: ProjectOutlet[];
  outlets: ProjectOutlet[];
  cities: string[];
  lang: Lang;
}) {
  const t = dict(lang).orders;
  const { pending, status, act } = useAction();
  const [items, setItems] = useState<Item[]>(
    Array.from({ length: allowance }, (_, i) => {
      const c = competitors[i];
      return { name: c?.name ?? "", address: c?.address ?? "", city: c?.city ?? "", maps_url: c?.maps_url ?? "", paired_outlet_id: c?.paired_outlet_id ?? "" };
    }),
  );
  const set = (i: number, k: keyof Item) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setItems(items.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)));

  return (
    <form
      className="card grid gap-5 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => saveCompetitors({ projectId, items }), t.competitorsSaved);
      }}
    >
      <div className="grid gap-2">
        <h2 className="text-xl font-extrabold">{t.competitorsTitle}</h2>
        <p className="text-sm text-muted">{t.competitorsLede(allowance)}</p>
        <p className="rounded-lg border border-accent bg-accent/10 p-3 text-sm">{t.competitorPhotoNote}</p>
        <p className="text-xs text-muted">{t.competitorCityNote}</p>
      </div>
      {items.map((c, i) => (
        <fieldset key={i} className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
          <legend className="mb-2 font-extrabold">{t.competitorLabel(i + 1)}</legend>
          <div className="field">
            <label htmlFor={`k-name-${i}`}>{t.competitorName}</label>
            <input id={`k-name-${i}`} value={c.name} onChange={set(i, "name")} maxLength={120} required />
          </div>
          <CityPicker
            id={`k-city-${i}`}
            label={t.competitorCity}
            value={c.city}
            onChange={(city) => setItems(items.map((x, j) => (j === i ? { ...x, city } : x)))}
            cities={cities}
            lang={lang}
            note={dict(lang).common.cityOtherNote}
            required
          />
          <div className="field sm:col-span-2">
            <label htmlFor={`k-addr-${i}`}>{t.outletAddress}</label>
            <textarea id={`k-addr-${i}`} rows={2} value={c.address} onChange={set(i, "address")} maxLength={300} required />
          </div>
          <div className="field">
            <label htmlFor={`k-maps-${i}`}>{t.mapsUrl}</label>
            <input id={`k-maps-${i}`} type="url" value={c.maps_url} onChange={set(i, "maps_url")} placeholder="https://maps.app.goo.gl/…" />
          </div>
          <div className="field">
            <label htmlFor={`k-pair-${i}`}>{t.pairedOutlet}</label>
            <select id={`k-pair-${i}`} value={c.paired_outlet_id} onChange={set(i, "paired_outlet_id")}>
              <option value="">{t.pairedNone}</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name || t.cityLabel(o.position)} · {o.city}
                </option>
              ))}
            </select>
          </div>
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>
          {t.saveCompetitors}
        </button>
        <StatusText status={status} />
      </div>
    </form>
  );
}
