export type Block = { kind: "h2" | "p"; text: string } | { kind: "ul"; items: string[] };

// Teks halaman hukum dari CMS: "## " subjudul, "- " butir daftar, baris kosong pemisah paragraf.
export function legalBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join("\n") });
    para = [];
  };
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) flush();
    else if (line.startsWith("## ")) {
      flush();
      blocks.push({ kind: "h2", text: line.slice(3).trim() });
    } else if (line.startsWith("- ")) {
      flush();
      const last = blocks.at(-1);
      if (last?.kind === "ul") last.items.push(line.slice(2).trim());
      else blocks.push({ kind: "ul", items: [line.slice(2).trim()] });
    } else para.push(line);
  }
  flush();
  return blocks;
}
