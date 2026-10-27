import { cookies } from "next/headers";
import { isLang, type Lang } from "./i18n";

export type Theme = "dark" | "light";

// Bahasa dan tema tersimpan di cookie supaya halaman server langsung tampil benar tanpa kedipan.
export async function getLang(): Promise<Lang> {
  const value = (await cookies()).get("lang")?.value;
  return isLang(value) ? value : "id";
}

export async function getTheme(): Promise<Theme> {
  return (await cookies()).get("theme")?.value === "light" ? "light" : "dark";
}
