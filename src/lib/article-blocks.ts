// Isi artikel dari admin: "## " subjudul, "### " sub-subjudul, "- " butir, "1. " langkah bernomor,
// **tebal**, [teks](tautan), baris kosong = paragraf baru. Tidak ada HTML mentah, jadi aman ditampilkan.
export type ArticleBlock = { kind: "h2" | "h3" | "p"; text: string } | { kind: "ul"; items: string[] } | { kind: "ol"; items: string[] };

export function articleBlocks(body: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join("\n") });
    para = [];
  };
  const list = (kind: "ul" | "ol", item: string) => {
    flush();
    const last = blocks.at(-1);
    if (last?.kind === kind) last.items.push(item);
    else blocks.push({ kind, items: [item] });
  };
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) flush();
    else if (line.startsWith("### ")) {
      flush();
      blocks.push({ kind: "h3", text: line.slice(4).trim() });
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push({ kind: "h2", text: line.slice(3).trim() });
    } else if (line.startsWith("- ")) list("ul", line.slice(2).trim());
    else if (/^\d+\.\s/.test(line)) list("ol", line.replace(/^\d+\.\s+/, ""));
    else para.push(line);
  }
  flush();
  return blocks;
}

export type InlinePart = { kind: "text" | "bold"; text: string } | { kind: "link"; text: string; href: string };

// Tautan hanya ke https:// atau halaman SilentCX sendiri (diawali /).
const SAFE_HREF = /^(https:\/\/\S+|\/[\w\-./?=&#%]*)$/;

export function inlineParts(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  const push = (t: string) => {
    if (!t) return;
    const prev = parts.at(-1);
    if (prev?.kind === "text") prev.text += t;
    else parts.push({ kind: "text", text: t });
  };
  for (let m = re.exec(text); m; m = re.exec(text)) {
    push(text.slice(last, m.index));
    if (m[1] !== undefined) parts.push({ kind: "bold", text: m[1] });
    else if (SAFE_HREF.test(m[3])) parts.push({ kind: "link", text: m[2], href: m[3] });
    else push(m[0]);
    last = m.index + m[0].length;
  }
  push(text.slice(last));
  return parts;
}

// Teks polos untuk deskripsi SEO bila ringkasan kosong.
export function plainText(body: string, max = 160): string {
  const flat = body
    .replace(/^#{2,3}\s+/gm, "")
    .replace(/^(- |\d+\.\s+)/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}
