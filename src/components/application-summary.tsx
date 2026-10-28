import { businessTypeLabel, getBusinessTypes } from "@/lib/catalog";
import { dict, type Lang } from "@/lib/i18n";
import { age, EXPERIENCE, GENDERS, optionLabel, VEHICLES, type ShopperApplication } from "@/lib/shopper-application";

// Isi lamaran shopper dalam bentuk ringkas. Dipakai di halaman shopper dan antrian seleksi admin.
export async function ApplicationSummary({ app, lang }: { app: ShopperApplication; lang: Lang }) {
  const types = await getBusinessTypes();
  const t = dict(lang).application;
  const years = age(app.birth_date);
  const rows: [string, React.ReactNode][] = [
    [t.domicile, app.domicile || "—"],
    [
      t.reachable,
      app.reachable_cities.length ? (
        <span className="flex flex-wrap gap-1">
          {app.reachable_cities.map((c) => (
            <span key={c} className="chip">
              {c}
            </span>
          ))}
        </span>
      ) : (
        "—"
      ),
    ],
    [t.birthDate, app.birth_date ? `${app.birth_date}${years !== null ? ` (${t.years(years)})` : ""}` : "—"],
    [t.gender, optionLabel(GENDERS, app.gender, lang)],
    [t.occupation, app.occupation || "—"],
    [t.vehicle, optionLabel(VEHICLES, app.vehicle, lang)],
    [t.experience, optionLabel(EXPERIENCE, app.experience, lang)],
    [t.industries, app.industries.length ? app.industries.map((i) => businessTypeLabel(types, i, lang)).join(", ") : "—"],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-0.5">
          <dt className="text-muted">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
      {app.experience_note && (
        <div className="grid gap-0.5 sm:col-span-2">
          <dt className="text-muted">{t.experienceNote}</dt>
          <dd className="whitespace-pre-line">{app.experience_note}</dd>
        </div>
      )}
    </dl>
  );
}
