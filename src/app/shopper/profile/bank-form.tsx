"use client";

import { useState } from "react";
import { saveBankAccount } from "../actions";
import { StatusText, useAction } from "@/components/use-action";
import { dict, type Lang } from "@/lib/i18n";
import { maskAccountNumber, maskName } from "@/lib/mask";
import type { BankAccount } from "@/lib/shopper";

// Rekening yang sudah diisi tampil sebagai kartu ringkas yang disamarkan; form muncul saat belum ada atau saat diubah.
export function BankForm({ initial, lang }: { initial: BankAccount | null; lang: Lang }) {
  const t = dict(lang).application;
  const [editing, setEditing] = useState(!initial);
  const [shown, setShown] = useState(false);

  if (initial && !editing) {
    return (
      <div className="grid gap-4">
        <div className="grid gap-1 rounded-lg border border-line bg-raise p-4" data-testid="bank-card">
          <span className="text-sm text-muted">{initial.bank_name}</span>
          <span className="font-mono text-lg font-bold tracking-wider">{shown ? initial.account_number : maskAccountNumber(initial.account_number)}</span>
          <span className="text-sm">{t.holderOf(shown ? initial.account_holder : maskName(initial.account_holder))}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" aria-pressed={shown} onClick={() => setShown((s) => !s)}>
            {shown ? t.hideBank : t.showBank}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
            {t.editBank}
          </button>
        </div>
      </div>
    );
  }
  const close = () => {
    setEditing(false);
    setShown(false);
  };
  return <BankEditor initial={initial} lang={lang} onDone={close} cancellable={Boolean(initial)} />;
}

// Form isi/ubah rekening. Setelah tersimpan kembali ke kartu; tombol Batal hanya saat mengubah rekening yang sudah ada.
function BankEditor({ initial, lang, onDone, cancellable }: { initial: BankAccount | null; lang: Lang; onDone: () => void; cancellable: boolean }) {
  const t = dict(lang).application;
  const { pending, status, act } = useAction();
  const [bank, setBank] = useState(initial?.bank_name ?? "");
  const [number, setNumber] = useState(initial?.account_number ?? "");
  const [holder, setHolder] = useState(initial?.account_holder ?? "");
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => saveBankAccount({ bank, number, holder }), t.bankSaved, onDone);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="field">
          <label htmlFor="bank">{t.bankName}</label>
          <input id="bank" value={bank} onChange={(e) => setBank(e.target.value)} maxLength={60} placeholder="BCA" required />
        </div>
        <div className="field">
          <label htmlFor="number">{t.accountNumber}</label>
          <input id="number" value={number} onChange={(e) => setNumber(e.target.value)} inputMode="numeric" maxLength={30} required />
        </div>
        <div className="field">
          <label htmlFor="holder">{t.accountHolder}</label>
          <input id="holder" value={holder} onChange={(e) => setHolder(e.target.value)} maxLength={120} required />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>
          {t.saveBank}
        </button>
        {cancellable && (
          <button type="button" className="btn" disabled={pending} onClick={onDone}>
            {t.cancelEdit}
          </button>
        )}
        <StatusText status={status} />
      </div>
    </form>
  );
}
