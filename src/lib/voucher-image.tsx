import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { date } from "./format";
import { groupedRules, lastDay, type VoucherCard } from "./vouchers";

const ASSETS = path.join(process.cwd(), "assets");
const files = Promise.all([
  readFile(path.join(ASSETS, "pdf", "bricolage-grotesque-latin-800-normal.woff")),
  readFile(path.join(ASSETS, "pdf", "familjen-grotesk-latin-400-normal.woff")),
  readFile(path.join(ASSETS, "pdf", "familjen-grotesk-latin-600-normal.woff")),
  readFile(path.join(ASSETS, "og", "logo-gelap.png")),
]);

const GOLD = "#e5a93c";
const INK = "#06080c";
const MUTED = "#9aa0ab";

// Logo brand sebagai data URL (PNG atau JPG). Format lain atau gagal diambil = tampil inisial brand.
async function brandLogo(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "force-cache" });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/image\/(png|jpe?g)/.test(type)) return null;
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

// Gambar voucher: persegi 1080 untuk dikirim lewat WhatsApp, atau 1200×630 untuk pratinjau tautan.
export async function voucherImage(card: VoucherCard, host: string, wide = false) {
  const [display, regular, semibold, scxLogo] = await files;
  const logo = await brandLogo(card.logo);
  const rules = groupedRules(card);
  const period = `${date(card.starts_at, "id")} – ${date(lastDay(card.ends_at), "id")}`;
  const W = wide ? 1200 : 1080;
  const H = wide ? 630 : 1080;
  const s = wide ? 0.72 : 1;

  const brandBox = (
    <div style={{ display: "flex", width: 190 * s, height: 190 * s, borderRadius: 28 * s, background: "#ffffff", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- gambar di dalam ImageResponse
        <img src={logo} alt="" width={170 * s} height={170 * s} style={{ objectFit: "contain" }} />
      ) : (
        <span style={{ fontFamily: "Bricolage", fontSize: 96 * s, color: INK }}>{card.brand.trim().charAt(0).toUpperCase()}</span>
      )}
    </div>
  );

  const offers = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 * s }}>
      {rules.map((r) => (
        <div key={r.text} style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontFamily: "Bricolage", fontSize: (rules.length > 1 ? 64 : 88) * s, color: GOLD, lineHeight: 1 }}>{r.text}</span>
          <span style={{ fontSize: 30 * s, color: "#f4f2ec", marginTop: 6 * s }}>Paket {r.names}</span>
        </div>
      ))}
    </div>
  );

  const codeBox = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: wide ? "flex-start" : "center", gap: 8 * s }}>
      <span style={{ fontSize: 22 * s, letterSpacing: 4, color: MUTED, textTransform: "uppercase" }}>Kode voucher</span>
      <div style={{ display: "flex", border: `4px dashed ${GOLD}`, borderRadius: 20 * s, padding: `${18 * s}px ${36 * s}px`, background: "rgba(229,169,60,0.08)" }}>
        <span style={{ fontFamily: "Bricolage", fontSize: 64 * s, letterSpacing: 4, color: "#f4f2ec" }}>{card.code}</span>
      </div>
    </div>
  );

  const footer = (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 * s, alignItems: wide ? "flex-start" : "center" }}>
      <span style={{ fontSize: 26 * s, color: "#f4f2ec", fontWeight: 600 }}>Berlaku {period} · sekali pakai</span>
      <span style={{ fontSize: 24 * s, color: MUTED }}>Klaim di {host}/voucher/{card.code}</span>
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: INK, color: "#f4f2ec", fontFamily: "Familjen", padding: 56 * s, position: "relative" }}>
        <div style={{ display: "flex", position: "absolute", top: 0, left: 0, right: 0, height: 14, background: GOLD }} />
        <div style={{ display: "flex", flexDirection: "column", width: "100%", border: `2px solid #242a35`, borderRadius: 36 * s, padding: 48 * s, justifyContent: "space-between", background: "#0e1117" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- gambar di dalam ImageResponse */}
            <img src={`data:image/png;base64,${scxLogo.toString("base64")}`} alt="" height={64 * s} width={(64 * s * 2120) / 672} />
            <span style={{ display: "flex", fontSize: 24 * s, fontWeight: 600, color: INK, background: GOLD, borderRadius: 999, padding: `${10 * s}px ${24 * s}px` }}>Voucher khusus brand</span>
          </div>
          {wide ? (
            <div style={{ display: "flex", gap: 40, alignItems: "center" }}>
              {brandBox}
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <span style={{ fontSize: 30, color: MUTED }}>Khusus untuk</span>
                <span style={{ fontFamily: "Bricolage", fontSize: 52, lineHeight: 1.05 }}>{card.brand}</span>
                {offers}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28, textAlign: "center" }}>
              {brandBox}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 30, color: MUTED }}>Khusus untuk</span>
                <span style={{ fontFamily: "Bricolage", fontSize: 60, lineHeight: 1.05 }}>{card.brand}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                {rules.map((r) => (
                  <div key={r.text} style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
                    <span style={{ fontFamily: "Bricolage", fontSize: rules.length > 1 ? 64 : 88, color: GOLD, lineHeight: 1 }}>{r.text}</span>
                    <span style={{ fontSize: 30 }}>Paket {r.names}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: wide ? "row" : "column", justifyContent: "space-between", alignItems: wide ? "flex-end" : "center", gap: 28 * s }}>
            {codeBox}
            {footer}
          </div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: "Bricolage", data: display, weight: 800, style: "normal" },
        { name: "Familjen", data: regular, weight: 400, style: "normal" },
        { name: "Familjen", data: semibold, weight: 600, style: "normal" },
      ],
    },
  );
}
