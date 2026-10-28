-- Fase 4, bagian 1: status tugas untuk QC. Dipisah dari migrasi berikutnya karena nilai enum baru
-- baru bisa dipakai setelah transaksi yang menambahkannya selesai.
alter type public.task_status add value if not exists 'revision' after 'submitted';
alter type public.task_status add value if not exists 'approved' after 'revision';
alter type public.task_status add value if not exists 'rejected' after 'approved';
