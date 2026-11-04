-- Putaran 16, bagian 1: peran baru "cs" (customer service), dibuat admin dari panel admin.
-- Nilai enum baru baru bisa dipakai setelah transaksinya selesai, jadi fungsi dan tabel yang memakainya
-- ada di migration berikutnya (20261104000027).
alter type public.app_role add value if not exists 'cs';
