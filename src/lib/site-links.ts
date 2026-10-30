// Tautan kontak dan media sosial di footer landing page, diisi admin di Konten → Info situs.
// Isian boleh berupa alamat lengkap (https://…) atau nama akun (@silentcx) untuk platform yang memakai nama akun.
export const SOCIALS = [
  { key: "instagram", label: "Instagram", placeholder: "@silentcx.id", base: "https://instagram.com/", d: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17.5 6.5h.01" },
  { key: "tiktok", label: "TikTok", placeholder: "@silentcx.id", base: "https://www.tiktok.com/@", d: "M14 3v11.5a3.5 3.5 0 1 1-3-3.46M14 3c.4 2.6 2.2 4.4 5 4.6" },
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/silentcx", base: "https://facebook.com/", d: "M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8.5a.5.5 0 0 1 .5-.5z" },
  { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/company/silentcx", base: "https://www.linkedin.com/company/", d: "M4 9h4v11H4zM6 4.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM10 9h3.8v1.6c.6-1 1.9-1.9 3.7-1.9 3 0 3.5 2 3.5 4.6V20h-4v-5.8c0-1.4-.3-2.4-1.7-2.4s-1.9 1-1.9 2.4V20H10z" },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@silentcx", base: "https://www.youtube.com/@", d: "M21 8.5a3 3 0 0 0-2.1-2.1C17 6 12 6 12 6s-5 0-6.9.4A3 3 0 0 0 3 8.5 31 31 0 0 0 2.7 12c0 1.2.1 2.4.3 3.5a3 3 0 0 0 2.1 2.1C7 18 12 18 12 18s5 0 6.9-.4a3 3 0 0 0 2.1-2.1c.2-1.1.3-2.3.3-3.5s-.1-2.4-.3-3.5zM10 15V9l5 3z" },
  { key: "threads", label: "Threads", placeholder: "@silentcx.id", base: "https://www.threads.com/@", d: "M18.5 7.5C17.3 4.6 15 3 12 3 7 3 4.5 6.6 4.5 12s2.5 9 7.5 9c3.8 0 6.5-2.2 6.5-5.4 0-3-2.4-4.5-5.2-4.5-2.5 0-4.1 1.3-4.1 3 0 1.6 1.3 2.6 3 2.6 2.5 0 3.8-2 3.8-5.3" },
  { key: "x", label: "X (Twitter)", placeholder: "@silentcx", base: "https://x.com/", d: "M4 4l16 16M20 4 4 20" },
] as const;

export type SocialKey = (typeof SOCIALS)[number]["key"];

// Alamat tautan dari isian admin; kosong kalau tidak diisi.
export function socialHref(key: SocialKey, value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  const social = SOCIALS.find((s) => s.key === key);
  return social ? social.base + v.replace(/^@/, "") : "";
}

export function websiteHref(value: string): string {
  const v = value.trim();
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

// Teks situs yang ditampilkan tanpa https:// dan garis miring di akhir.
export function websiteLabel(value: string): string {
  return value.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
}
