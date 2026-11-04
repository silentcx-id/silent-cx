import type { MetadataRoute } from "next";
import { appOrigin } from "@/lib/app-origin";

// Dashboard, halaman masuk, dan voucher personal tidak untuk mesin pencari.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await appOrigin();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/app", "/admin", "/shopper", "/cs", "/auth", "/voucher", "/pratinjau", "/api", "/reset-password"] },
    sitemap: `${origin}/sitemap.xml`,
  };
}
