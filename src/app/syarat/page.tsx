import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Syarat & Ketentuan" };

export default function TermsPage() {
  return <LegalPage k="terms" />;
}
