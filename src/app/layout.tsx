import type { Metadata } from "next";
import { Bricolage_Grotesque, Familjen_Grotesk, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/toaster";
import { getLang, getTheme } from "@/lib/prefs";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "800"], variable: "--font-bricolage" });
const body = Familjen_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-familjen" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: { default: "SilentCX", template: "%s · SilentCX" },
  description: "Audit pengalaman pelanggan lewat mystery shopping.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [lang, theme] = await Promise.all([getLang(), getTheme()]);
  return (
    <html lang={lang} data-theme={theme} className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
