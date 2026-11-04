-- Syarat & Ketentuan Promo Launching: brand penerima voucher wajib memberi testimoni (ditampilkan di website
-- beserta nama pemberinya) dan logo brand ditampilkan di landing page sebagai mitra SilentCX.
-- Bagian baru disisipkan sebelum "## Lain-lain"; tidak diulang kalau sudah ada (misalnya sudah ditambahkan admin).

update public.articles
set body = replace(body, '## Lain-lain', $section$## Kewajiban brand penerima voucher

- Brand yang memakai voucher **wajib memberikan testimoni** tentang layanan SilentCX setelah laporan audit terbit.
- Testimoni ditampilkan di website SilentCX **beserta nama pemberi testimoni** dan nama brand.
- **Logo brand ditampilkan di landing page SilentCX sebagai mitra SilentCX.**
- Dengan memasang voucher di tagihan, brand dianggap menyetujui ketentuan ini.

## Lain-lain$section$)
where category = 'promo' and slug = 'syarat-ketentuan-promo-launching'
  and body like '%## Lain-lain%' and body not like '%## Kewajiban brand penerima voucher%';
