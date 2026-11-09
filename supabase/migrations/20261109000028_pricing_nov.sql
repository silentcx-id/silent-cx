-- Putaran 17: harga baru (9 Nov 2026), promo launching 10% paket, voucher brand 20%, batas pembelian Rp50.000,
-- instruksi khusus client untuk shopper per outlet.
--
-- Hitungan: fee shopper Rp150.000 per kunjungan, pembelian ditanggung maksimal Rp50.000 per kunjungan.
-- Tagihan yang sudah terbit tidak diubah: harga dan voucher baru berlaku untuk pesanan dan pemasangan voucher berikutnya.

-- ---------------------------------------------------------------------------
-- 1. Promo paket: 10% untuk Essential, Insight, Performance. Promo dilepas dulu sebelum harga turun supaya
--    pemeriksaan "potongan nominal di bawah harga" tidak menolak perubahan harga.
--    Tanggal mulai/berakhir yang sudah diatur admin dipakai; kalau belum ada, berlaku sampai 5 Des 2026 23.59 WIB.
-- ---------------------------------------------------------------------------

do $$
declare
  v_end timestamptz := coalesce(
    (select max(promo_ends_at) from public.packages where key in ('essential', 'insight', 'performance') and promo_ends_at > now()),
    '2026-12-06 00:00:00+07');
begin
  update public.packages
  set promo_pct = 10,
      promo_amount = null,
      promo_free_outlet = false,
      promo_starts_at = case when promo_ends_at > now() then coalesce(promo_starts_at, now()) else now() end,
      promo_ends_at = case when promo_ends_at > now() then promo_ends_at else v_end end
  where key in ('essential', 'insight', 'performance');
end;
$$;

-- Promo add-on dihapus: add-on tidak mendapat potongan promo.
update public.addons set promo_pct = null, promo_amount = null, promo_starts_at = null, promo_ends_at = null;
update public.addon_promo set promo_pct = null, promo_amount = null, promo_starts_at = null, promo_ends_at = null, updated_at = now();

-- ---------------------------------------------------------------------------
-- 2. Harga paket. Performance hanya 3 outlet; outlet ke-4 dan seterusnya lewat add-on Outlet tambahan.
-- ---------------------------------------------------------------------------

delete from public.package_prices pp
using public.packages p
where pp.package_id = p.id and p.key = 'performance' and pp.outlets <> 3;

update public.package_prices pp
set price = v.price
from public.packages p
join (values ('essential', 1, 399000), ('insight', 1, 599000), ('performance', 3, 1299000)) as v(key, outlets, price)
  on v.key = p.key
where pp.package_id = p.id and pp.outlets = v.outlets;

-- Batas pembelian shopper yang ditanggung paket: Rp50.000 per kunjungan.
update public.packages
set purchase_allowance = 50000,
    features = array(select replace(replace(f, 'Rp150.000', 'Rp50.000'), '3–5 outlet', '3 outlet') from unnest(features) f)
where key in ('essential', 'insight', 'performance');

-- ---------------------------------------------------------------------------
-- 3. Add-on
-- ---------------------------------------------------------------------------

update public.addons a
set price = v.price
from (values ('additional_outlet', 349000),
             ('additional_visit', 349000),
             ('re_audit', 399000),
             ('competitor_benchmark', 699000),
             ('additional_consultation', 199000),
             ('priority_report', 349000)) as v(key, price)
where a.key = v.key;

update public.addons
set description = 'Pembelian shopper di atas Rp50.000 per kunjungan, ditagih sesuai struk.'
where key = 'excess_purchase';

update public.addons set active = false where key = 'custom_questionnaire';

-- Fee shopper bawaan untuk tugas baru.
update public.app_settings
set value = jsonb_set(value, '{default_fee}', '150000')
where key = 'field';

-- ---------------------------------------------------------------------------
-- 4. Voucher brand: 20% untuk paket yang sama di setiap voucher. Kode dan masa berlaku tidak berubah.
-- ---------------------------------------------------------------------------

update public.vouchers v
set rules = (select jsonb_agg(jsonb_build_object('package', r.value ->> 'package', 'pct', 20) order by r.ord)
             from jsonb_array_elements(v.rules) with ordinality as r(value, ord))
where exists (select 1 from jsonb_array_elements(v.rules) r where r ->> 'pct' is distinct from '20' or r ? 'amount');

-- ---------------------------------------------------------------------------
-- 5. Konten landing dan halaman legal (draf dan versi terbit): tanpa keterangan PPN, batas pembelian Rp50.000.
-- ---------------------------------------------------------------------------

update public.site_content
set draft = case when draft is null then null else
  replace(replace(replace(replace(replace(replace(draft::text,
    'Harga sudah termasuk PPN. ', ''), 'Prices include VAT. ', ''),
    ' Semua harga sudah termasuk PPN.', ''), ' All prices include VAT.', ''),
    'Rp150.000', 'Rp50.000'), 'IDR 150,000', 'IDR 50,000')::jsonb end,
    published = case when published is null then null else
  replace(replace(replace(replace(replace(replace(published::text,
    'Harga sudah termasuk PPN. ', ''), 'Prices include VAT. ', ''),
    ' Semua harga sudah termasuk PPN.', ''), ' All prices include VAT.', ''),
    'Rp150.000', 'Rp50.000'), 'IDR 150,000', 'IDR 50,000')::jsonb end;

-- ---------------------------------------------------------------------------
-- 6. Artikel promo ditulis ulang untuk promo dan voucher baru.
-- ---------------------------------------------------------------------------

update public.articles set
  title = 'Promo Launching SilentCX: Diskon 10% Semua Paket Mystery Shopping',
  excerpt = 'Rayakan peluncuran SilentCX: diskon 10% untuk paket Essential, Insight, dan Performance sampai 5 Desember 2026. Punya voucher brand? Hemat 20% dari harga normal.',
  seo_title = 'Promo Launching SilentCX: Diskon 10% Mystery Shopping',
  seo_description = 'Diskon 10% paket Essential, Insight, dan Performance sampai 5 Des 2026. Voucher brand hemat 20% dari harga normal.',
  body = $body$Bagaimana pengalaman pelanggan di outlet Anda saat Anda tidak ada di sana? Sapaan kasir, kecepatan pelayanan, kebersihan meja, sampai cara tim menawarkan menu tambahan: semuanya membentuk keputusan pelanggan untuk kembali atau tidak.

Untuk merayakan peluncuran SilentCX, semua paket audit mystery shopping mendapat **diskon 10%** sampai **5 Desember 2026**.

## Harga promo

- **SilentCX Essential:** dari Rp399.000 menjadi **Rp359.100** untuk 1 outlet, 1 kunjungan.
- **SilentCX Insight:** dari Rp599.000 menjadi **Rp539.100** untuk 1 outlet, 1 kunjungan.
- **SilentCX Performance:** dari Rp1.299.000 menjadi **Rp1.169.100** untuk 3 outlet, 1 kunjungan per outlet.

Diskon berlaku untuk harga paket. Add-on seperti outlet tambahan, kunjungan tambahan, dan audit ulang memakai harga normal.

## Punya voucher brand?

Tim SilentCX juga mengirim **voucher personal** dengan nama dan logo brand Anda, misalnya kode KOPISENJA-7K2Q untuk Kopi Senja. Voucher memberi **potongan 20% dari harga normal paket**:

- **Essential:** Rp319.200
- **Insight:** Rp479.200
- **Performance:** Rp1.039.200

Voucher tidak digabung dengan diskon promo 10%. Kalau Anda memakai voucher, harga paket dihitung dari harga normal lalu dipotong 20%.

## Paket mana yang cocok?

### Essential
Untuk brand yang ingin mulai dari potret dasar: sekitar 30 indikator audit, mulai dari sapaan, pengetahuan produk, ketepatan pesanan, kecepatan, kebersihan, sampai upselling. Hasilnya skor CX, 3–5 temuan utama, dan rekomendasi cepat.

### Insight
Paket paling populer untuk diagnosis mendalam: sekitar 50–70 indikator, pemeriksaan kepatuhan SOP, bukti foto, tingkat keparahan temuan, analisis gap, dan konsultasi 30 menit bersama tim SilentCX.

### Performance
Untuk brand dengan beberapa cabang: audit 3 outlet sekaligus, peringkat antar outlet, benchmark CX, identifikasi red flag, dan ringkasan eksekutif. Outlet ke-4 dan seterusnya bisa ditambah lewat add-on Outlet tambahan.

## Kenapa mystery shopping?

1. Anda melihat pengalaman pelanggan apa adanya, bukan saat tim sedang diawasi.
2. Temuan disertai bukti, jadi perbaikan bisa langsung diarahkan ke titik yang tepat.
3. Laporan memberi prioritas: mana yang harus dibereskan minggu ini, mana yang bisa menyusul.

## Cara memakai promo

Diskon 10% langsung terpasang saat Anda memesan paket, tanpa kode. Untuk voucher brand, klik tombol WhatsApp di bawah dan sebutkan nama brand Anda, lalu ikuti [panduan klaim voucher](/artikel/promo/cara-klaim-voucher-silentcx).

Sebelum memesan, baca juga [syarat dan ketentuan promo](/artikel/promo/syarat-ketentuan-promo-launching).$body$
where category = 'promo' and slug = 'promo-launching-silentcx';

update public.articles set
  excerpt = 'Ketentuan Promo Launching SilentCX dan voucher brand: masa berlaku, besar potongan, dan aturan pemakaian.',
  seo_description = 'Diskon 10% paket sampai 5 Des 2026 dan voucher brand 20% dari harga normal: masa berlaku, potongan, dan aturan pemakaian.',
  body = $body$Syarat dan ketentuan berikut berlaku untuk Promo Launching SilentCX dan voucher brand.

## Promo Launching

- Diskon **10% dari harga paket** SilentCX Essential, Insight, dan Performance.
- Berlaku untuk pesanan yang dibuat sampai **5 Desember 2026 pukul 23.59 WIB**.
- Diskon terpasang otomatis di tagihan, tanpa kode.
- Diskon hanya untuk harga paket. **Add-on tidak mendapat diskon promo**, termasuk outlet tambahan, kunjungan tambahan, audit ulang, benchmark kompetitor, konsultasi tambahan, dan laporan express.

## Voucher brand

- Potongan **20% dari harga normal paket** yang tertulis di voucher.
- Potongan voucher hanya untuk harga paket. Add-on, biaya tugas luar kota, dan kelebihan biaya pembelian shopper tidak termasuk.
- Masa berlaku mengikuti tanggal yang tertulis di voucher. Voucher harus dipasang di tagihan sebelum masa berlakunya berakhir.
- Satu voucher khusus untuk satu brand dan hanya bisa dipakai **satu kali**.
- Voucher dikirim langsung oleh tim SilentCX. Kode voucher tidak untuk diperjualbelikan.

## Voucher dan promo tidak digabung

- Kalau Anda memakai voucher, diskon promo 10% dilepas dan harga paket kembali ke harga normal, lalu dipotong 20%.
- Halaman Tagihan menampilkan perbandingan total dengan promo dan dengan voucher sebelum Anda memilih.
- Voucher bisa dilepas selama bukti bayar belum diunggah, dan diskon promo dipulihkan. Setelah bukti bayar diunggah, voucher terkunci di tagihan tersebut.
- Kalau tagihan kedaluwarsa atau dibatalkan, voucher kembali bisa dipakai selama masa berlakunya belum lewat.
- Pembayaran DP tetap bisa dipilih. DP minimal 80% dihitung dari total setelah potongan.
- Voucher tidak bisa ditukar dengan uang tunai.

## Biaya pembelian saat kunjungan

- Paket menanggung pembelian shopper sampai **Rp50.000 per kunjungan**.
- Pembelian di atas Rp50.000 ditagih terpisah sesuai struk.

## Kewajiban brand penerima voucher

- Brand yang memakai voucher **wajib memberikan testimoni** tentang layanan SilentCX setelah laporan audit terbit.
- Testimoni ditampilkan di website SilentCX **beserta nama pemberi testimoni** dan nama brand.
- **Logo brand ditampilkan di landing page SilentCX sebagai mitra SilentCX.**
- Dengan memasang voucher di tagihan, brand dianggap menyetujui ketentuan ini.

## Lain-lain

- SilentCX berhak membatalkan voucher yang disalahgunakan.
- Ketentuan layanan lainnya mengikuti [Syarat & Ketentuan SilentCX](/syarat).

Ada pertanyaan? Hubungi kami lewat tombol WhatsApp di bawah.$body$
where category = 'promo' and slug = 'syarat-ketentuan-promo-launching';

update public.articles set
  body = $body$Voucher SilentCX dipakai di halaman **Tagihan**, setelah Anda memesan paket dan sebelum membayar. Voucher memberi potongan **20% dari harga normal paket**. Berikut langkahnya.

## Langkah klaim

1. **Buka tautan voucher** yang dikirim tim SilentCX, misalnya silentcx.com/voucher/KOPISENJA-7K2Q. Di sana terlihat nama dan logo brand Anda, besar potongan, dan masa berlakunya.
2. **Klik Daftar & pakai voucher** (atau Masuk kalau sudah punya akun). Kode voucher tersimpan otomatis di browser Anda.
3. **Pilih paket** di menu Paket & add-on, isi kota outlet, lalu kirim pesanan.
4. **Buka menu Tagihan.** Kolom kode voucher sudah terisi. Klik **Cek voucher** untuk melihat potongannya.
5. **Klik Pakai voucher.** Total tagihan langsung diperbarui dan potongan voucher tampil sebagai baris tersendiri di invoice.
6. **Pilih cara bayar** (bayar penuh atau DP minimal 80%), transfer sesuai total baru, lalu unggah bukti bayar.

## Voucher dan diskon promo 10%

Voucher tidak digabung dengan diskon Promo Launching 10%. Saat Anda mengecek voucher, halaman Tagihan menampilkan dua total berdampingan: **dengan promo sekarang** dan **dengan voucher**. Voucher 20% dihitung dari harga normal, jadi biasanya lebih hemat:

- **Essential:** promo Rp359.100, voucher Rp319.200.
- **Insight:** promo Rp539.100, voucher Rp479.200.
- **Performance:** promo Rp1.169.100, voucher Rp1.039.200.

Potongan voucher hanya untuk harga paket. Add-on tetap memakai harga normal.

## Ingin membatalkan voucher?

Klik **Lepas voucher** di halaman Tagihan selama bukti bayar belum diunggah. Harga dan diskon promo semula kembali seperti sebelumnya, dan voucher bisa dipasang lagi nanti selama masih berlaku.

## Pesan yang mungkin muncul

- **Kode tidak ditemukan:** periksa lagi penulisan kode. Huruf besar atau kecil tidak berpengaruh.
- **Berlaku untuk paket lain:** voucher hanya untuk paket yang tertulis di voucher.
- **Sudah dipakai:** setiap voucher hanya bisa dipakai satu kali.
- **Sudah berakhir:** masa berlaku voucher sudah lewat.

Belum punya voucher? Minta lewat tombol WhatsApp di bawah dan sebutkan nama brand Anda. Ketentuan lengkap ada di [syarat & ketentuan promo](/artikel/promo/syarat-ketentuan-promo-launching).$body$
where category = 'promo' and slug = 'cara-klaim-voucher-silentcx';

-- ---------------------------------------------------------------------------
-- 7. Instruksi khusus client untuk shopper, per outlet. Tampil langsung di tugas shopper.
-- ---------------------------------------------------------------------------

alter table public.project_outlets add column shopper_note text not null default '' check (char_length(shopper_note) <= 1000);
grant update (shopper_note) on public.project_outlets to authenticated;

create or replace function public.shopper_task(p_task uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t public.audit_tasks;
  o public.project_outlets;
  f public.task_offers;
  snap jsonb;
begin
  perform public.expire_offers();
  select * into t from public.audit_tasks where id = p_task and shopper_id = auth.uid()
    and status in ('offered', 'accepted', 'in_progress', 'submitted', 'revision', 'approved', 'rejected');
  if not found then
    return null;
  end if;
  select * into o from public.project_outlets where id = t.outlet_id;
  select * into f from public.task_offers where task_id = t.id and status = 'offered';
  if t.status <> 'offered' then
    select snapshot into snap from public.project_questionnaires where project_id = t.project_id;
  end if;
  return jsonb_build_object(
    'id', t.id, 'code', t.code, 'status', t.status,
    'outlet', jsonb_build_object('name', o.name, 'address', o.address, 'city', o.city, 'maps_url', o.maps_url),
    'client_note', coalesce(o.shopper_note, ''),
    'window_start', t.window_start, 'window_end', t.window_end, 'hours_start', t.hours_start, 'hours_end', t.hours_end,
    'fee', t.fee, 'reimburse_cap', t.reimburse_cap, 'scenario', t.scenario, 'mandatory_purchase', t.mandatory_purchase,
    'respond_by', f.respond_by, 'urgent', coalesce(f.urgent, false),
    'checkin_at', t.checkin_at, 'answers', t.answers, 'purchase_amount', t.purchase_amount, 'purchase_note', t.purchase_note,
    'submitted_at', t.submitted_at,
    'revision', case when t.status = 'revision' then jsonb_build_object('items', t.revision_questions, 'note', t.revision_note, 'due', t.revision_due, 'round', t.revision_round) end,
    'qc', case when t.status in ('approved', 'rejected') then jsonb_build_object('note', t.qc_note, 'fee', t.fee_decision, 'decided_at', t.qc_decided_at) end,
    'questionnaire', case when snap is null then null else jsonb_build_object('photo_limit', snap -> 'photo_limit', 'sections', snap -> 'sections') end,
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'question_id', p.question_id, 'path', p.path) order by p.created_at)
                        from public.visit_photos p where p.task_id = t.id), '[]'::jsonb)
  );
end;
$$;
