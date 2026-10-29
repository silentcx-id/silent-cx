// Nomor rekening hanya menampilkan 4 angka terakhir; nama pemilik hanya kata pertama dan inisial berikutnya.
export const maskAccountNumber = (n: string) => `•••• ${n.slice(-4)}`;

export const maskName = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((w, i) => (i === 0 ? w : `${w[0]}***`))
    .join(" ");
