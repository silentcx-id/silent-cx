import type { Metadata } from "next";
import { Space_Grotesk, Familjen_Grotesk, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/toaster";
import { getLang } from "@/lib/prefs";
import "./globals.css";

const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-space" });
const body = Familjen_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-familjen" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: { default: "SilentCX", template: "%s · SilentCX" },
  description: "Audit pengalaman pelanggan lewat mystery shopping.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} data-theme="dark" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
