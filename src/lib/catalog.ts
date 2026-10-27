import "server-only";
import type { Addon, City, Package, PackagePrice, PaymentSettings } from "./catalog-types";
import { createClient } from "./supabase/server";

export * from "./catalog-types";

// Katalog untuk tampilan. Admin melihat yang nonaktif juga (diatur RLS).
export async function getCatalog() {
  const supabase = await createClient();
  const [{ data: packages }, { data: addons }, { data: cities }] = await Promise.all([
    supabase.from("packages").select("*, package_prices(outlets, price)").order("sort_order").order("name"),
    supabase.from("addons").select("*").order("sort_order").order("name"),
    supabase.from("service_cities").select("id, name, active").order("name"),
  ]);
  return {
    packages: (packages ?? []).map(({ package_prices, ...p }) => ({
      ...p,
      prices: [...(package_prices ?? [])].sort((a: PackagePrice, b: PackagePrice) => a.outlets - b.outlets),
    })) as Package[],
    addons: (addons ?? []) as Addon[],
    cities: (cities ?? []) as City[],
  };
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "payment").maybeSingle();
  const v = (data?.value ?? {}) as Partial<PaymentSettings>;
  return { bank_name: v.bank_name ?? "", account_number: v.account_number ?? "", account_holder: v.account_holder ?? "", qris_url: v.qris_url ?? "" };
}
