// Memeriksa kunci di .env.local sudah terisi, tanpa menampilkan isinya.
// Jalankan: npm run env:cek
const KEYS = [
  ["NEXT_PUBLIC_SUPABASE_URL", true],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", true],
  ["SUPABASE_SERVICE_ROLE_KEY", true],
  ["SUPABASE_DB_URL", true],
  ["NEXT_PUBLIC_APP_URL", false],
];

let missing = 0;
for (const [key, required] of KEYS) {
  const ok = Boolean(process.env[key]?.trim());
  if (!ok && required) missing++;
  console.log(`${ok ? "✓ terisi " : required ? "✗ KOSONG " : "- kosong "} ${key}`);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (url && !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) console.log("! NEXT_PUBLIC_SUPABASE_URL tidak berbentuk https://xxxx.supabase.co");
console.log(missing ? `\n${missing} kunci wajib belum diisi.` : "\nSemua kunci wajib sudah terisi.");
process.exitCode = missing ? 1 : 0;
