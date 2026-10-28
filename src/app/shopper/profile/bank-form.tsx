"use client";

import { useState } from "react";
import { saveBankAccount } from "../actions";
import { StatusText, useAction } from "@/components/use-action";
import { dict, type Lang } from "@/lib/i18n";
import type { BankAccount } from "@/lib/shopper";

export function BankForm({ initial, lang }: { initial: BankAccount | null; lang: Lang }) {
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
        act(() => saveBankAccount({ bank, number, holder }), t.bankSaved);
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
        <StatusText status={status} />
      </div>
    </form>
  );
}
