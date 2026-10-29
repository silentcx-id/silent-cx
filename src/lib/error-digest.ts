// Error dari server hanya membawa kode (digest) untuk dicocokkan dengan log; pesannya tidak dikirim ke browser.
export function errorDigest(error: unknown): string {
  return error instanceof Error && "digest" in error ? String(error.digest ?? "") : "";
}
