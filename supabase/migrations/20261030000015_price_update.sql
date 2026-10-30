-- Penyesuaian harga katalog (30 Okt 2026).
--
-- Dihitung dengan fee shopper Rp250.000 dan biaya pembelian Rp150.000 per kunjungan (tidak berubah).
-- Margin kotor: Essential & Insight ~47%, Performance ~40%, add-on 40–62%.
-- Kuesioner khusus sengaja di bawah target (subsidi silang dengan benchmark kompetitor). Add-on ini hanya
-- untuk Insight dan Performance, dan tetap "quote": Rp399.000 adalah harga mulai untuk lingkup standar,
-- lingkup yang lebih besar dikonfirmasi admin.

update public.package_prices pp
set price = v.price
from public.packages p
join (values ('essential', 1, 1099000), ('insight', 1, 1399000),
             ('performance', 3, 3999000), ('performance', 4, 4999000), ('performance', 5, 5999000)) as v(key, outlets, price)
  on v.key = p.key
where pp.package_id = p.id and pp.outlets = v.outlets;

update public.addons a
set price = v.price
from (values ('additional_outlet', 999000),
             ('additional_visit', 899000),
             ('re_audit', 899000),
             ('competitor_benchmark', 1299000),
             ('custom_questionnaire', 399000),
             ('additional_consultation', 399000),
             ('priority_report', 399000)) as v(key, price)
where a.key = v.key;
