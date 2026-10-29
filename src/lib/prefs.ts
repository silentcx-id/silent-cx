import { cookies } from "next/headers";
import { isLang, type Lang } from "./i18n";

// Bahasa tersimpan di cookie supaya halaman server langsung tampil benar tanpa kedipan.
// Tampilan memakai satu tema (gelap untuk dashboard); landing page mengatur warna per bagian.
export async function getLang(): Promise<Lang> {
  const value = (await cookies()).get("lang")?.value;
  return isLang(value) ? value : "id";
}
