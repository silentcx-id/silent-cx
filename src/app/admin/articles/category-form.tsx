"use client";

import { useState } from "react";
import { addCategory } from "./actions";
import { toSlug } from "./article-editor";
import { StatusText, useAction } from "@/components/use-action";

const input = "min-h-10 w-full rounded-lg border border-line bg-raise px-3 py-2 text-sm";

// Kategori baru, misalnya "Tips CX" → /artikel/tips-cx.
export function CategoryForm() {
  const { pending, status, act } = useAction();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <form
      className="grid gap-3 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => addCategory({ name, slug: toSlug(name), description }), `Kategori ${name} ditambahkan.`, () => {
          setName("");
          setDescription("");
        });
      }}
    >
      <label className="grid gap-1 text-sm font-semibold">
        Nama kategori
        <input className={input} value={name} maxLength={60} required placeholder="Tips CX" onChange={(e) => setName(e.target.value)} />
        {name && <span className="text-xs font-normal text-muted">/artikel/{toSlug(name)}</span>}
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        Deskripsi (untuk Google)
        <input className={input} value={description} maxLength={300} placeholder="Tips meningkatkan pengalaman pelanggan." onChange={(e) => setDescription(e.target.value)} />
      </label>
      <button className="btn" disabled={pending || !name.trim()}>
        Tambah kategori
      </button>
      <div className="sm:col-span-3">
        <StatusText status={status} />
      </div>
    </form>
  );
}
