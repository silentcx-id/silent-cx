"use client";

import { useState } from "react";
import { dict, type Lang } from "@/lib/i18n";

const OTHER = "__other";

// Dropdown kota dari daftar kota dilayani di Katalog, ditambah pilihan "Kota lain" yang membuka isian bebas.
// Nilai yang tidak ada di daftar dianggap kota lain. `note` tampil saat kota lain dipilih, misalnya keterangan
// bahwa shopper baru akan dicari di kota itu.
export function CityPicker({
  id,
  label,
  value,
  onChange,
  cities,
  lang,
  note,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  cities: string[];
  lang: Lang;
  note?: string;
  required?: boolean;
}) {
  const t = dict(lang).common;
  const known = cities.find((c) => c.toLowerCase() === value.trim().toLowerCase());
  const [other, setOther] = useState(Boolean(value.trim()) && !known);
  const selected = other ? OTHER : (known ?? "");

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={selected}
        required={required}
        onChange={(e) => {
          const next = e.target.value;
          setOther(next === OTHER);
          onChange(next === OTHER ? "" : next);
        }}
      >
        <option value="">{t.cityPick}</option>
        {cities.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value={OTHER}>{t.cityOther}</option>
      </select>
      {other && (
        <>
          <input id={`${id}-other`} aria-label={t.cityOtherLabel} value={value} maxLength={80} required={required} placeholder={t.cityOtherPlaceholder} onChange={(e) => onChange(e.target.value)} />
          {note && <small className="!text-warn">{note}</small>}
        </>
      )}
    </div>
  );
}
