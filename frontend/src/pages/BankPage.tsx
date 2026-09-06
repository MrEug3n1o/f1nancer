import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { api } from "../api";
import { CreditDebtCard } from "../components/CreditDebtCard";
import { DatePicker } from "../components/DatePicker";
import { DepositCard } from "../components/DepositCard";
import { PillSelect } from "../components/PillSelect";
import { EmptyState, ErrorBanner, SegmentedControl } from "../components/ui";
import { useApp } from "../context";
import { usePageComposer } from "../hooks/usePageComposer";
import type { CreditDebt, CreditDebtDirection, Deposit } from "../types";
import { dollarsToCents, percentToBps, todayISO } from "../utils";

type ComposerKind = "deposit" | "credit";

export function BankPage() {
  const { defaultCurrency, currencies } = useApp();
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [credits, setCredits] = useState<CreditDebt[]>([]);
  const [kind, setKind] = useState<ComposerKind>("deposit");
  const [direction, setDirection] = useState<CreditDebtDirection>("debt");
  const [name, setName] = useState("");
  const [principal, setPrincipal] = useState("");
  const [currencyCode, setCurrencyCode] = useState(defaultCurrency);
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [ratePercent, setRatePercent] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [alreadyPaid, setAlreadyPaid] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const today = todayISO();

  useEffect(() => {
    setCurrencyCode(defaultCurrency);
  }, [defaultCurrency]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dep, cd] = await Promise.all([
        api.get<Deposit[]>("/deposits?type=bank"),
        api.get<CreditDebt[]>("/credits-debts?source=bank"),
      ]);
      setDeposits(dep);
      setCredits(cd);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setName("");
    setPrincipal("");
    setEndDate("");
    setDueDate("");
    setRatePercent("");
    setCounterparty("");
    setAlreadyPaid("");
    setNote("");
    setStartDate(todayISO());
  }

  const { showComposer, closeComposer } = usePageComposer({
    onReset: resetForm,
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (kind === "deposit") {
        if (!endDate) throw new Error("Select a maturity date");
        await api.post("/deposits", {
          name: name.trim(),
          type: "bank",
          principal_cents: dollarsToCents(principal),
          currency_code: currencyCode,
          start_date: startDate,
          end_date: endDate,
          annual_rate_bps: percentToBps(ratePercent),
          note: note.trim() || null,
        });
      } else {
        if (!dueDate) throw new Error("Select a due date");
        const body: Record<string, unknown> = {
          name: name.trim(),
          direction,
          source: "bank",
          principal_cents: dollarsToCents(principal),
          currency_code: currencyCode,
          start_date: startDate,
          due_date: dueDate,
          annual_rate_bps: percentToBps(ratePercent || "0"),
          counterparty: counterparty.trim() || null,
          note: note.trim() || null,
        };
        if (alreadyPaid.trim()) {
          body.already_paid_cents = dollarsToCents(alreadyPaid);
        }
        await api.post("/credits-debts", body);
      }
      closeComposer();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function onCompleteDeposit(id: number) {
    setError(null);
    try {
      await api.post(`/deposits/${id}/complete`, {});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Complete failed");
    }
  }

  async function onDeleteDeposit(id: number) {
    if (!confirm("Delete this deposit?")) return;
    try {
      await api.delete(`/deposits/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function onPayCredit(id: number, amountCents: number, date: string, noteText: string) {
    setError(null);
    try {
      await api.post(`/credits-debts/${id}/pay`, {
        amount: amountCents,
        date,
        note: noteText || null,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
      throw err;
    }
  }

  async function onDeleteCredit(id: number) {
    if (!confirm("Delete this item? Its transactions stay in your history.")) return;
    setError(null);
    try {
      await api.delete(`/credits-debts/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const isDeposit = kind === "deposit";
  const namePlaceholder = isDeposit
    ? "12-month CD"
    : direction === "credit"
      ? "Personal loan issued"
      : "Car loan";
  const hasItems = deposits.length > 0 || credits.length > 0;

  return (
    <div className="stack">
      <ErrorBanner message={error} />
      {showComposer ? (
        <section className={`section txn-composer${isDeposit ? "" : ` txn-${direction}`}`}>
          <div className="txn-composer-head">
            <h2>New {isDeposit ? "deposit" : "credit"}</h2>
            <div className="txn-composer-toggles">
              <SegmentedControl
                ariaLabel="Bank product"
                value={kind}
                onChange={setKind}
                options={[
                  { value: "deposit", label: "Deposit" },
                  { value: "credit", label: "Credit" },
                ]}
              />
              {!isDeposit ? (
                <SegmentedControl
                  ariaLabel="Direction"
                  value={direction}
                  onChange={setDirection}
                  options={[
                    { value: "debt", label: "I owe" },
                    { value: "credit", label: "Owed to me" },
                  ]}
                />
              ) : null}
            </div>
          </div>
          <form className="txn-form" onSubmit={onSubmit}>
            <div className="txn-amount-block">
              <div className="txn-amount-row">
                {!isDeposit ? (
                  <span className="txn-amount-sign" aria-hidden>
                    {direction === "debt" ? "−" : "+"}
                  </span>
                ) : null}
                <input
                  className="txn-amount-input"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  required
                  aria-label={isDeposit ? "Principal" : "Amount"}
                  value={principal}
                  onChange={(e) => setPrincipal(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <PillSelect
                className="txn-currency-select"
                ariaLabel="Currency"
                value={currencyCode}
                onChange={setCurrencyCode}
                options={currencies.map((c) => ({
                  value: c.code,
                  label: c.code,
                }))}
              />
            </div>

            <label>
              Name
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={namePlaceholder}
              />
            </label>

            <div className="txn-meta-row">
              <div className="txn-date-field">
                <label htmlFor="bank-start">Start date</label>
                <div className="txn-date-row">
                  <DatePicker
                    id="bank-start"
                    value={startDate}
                    onChange={setStartDate}
                  />
                  <div className="txn-date-chips">
                    <button
                      type="button"
                      className={`txn-chip${startDate === today ? " selected" : ""}`}
                      style={{ "--chip-color": "var(--accent)" } as CSSProperties}
                      onClick={() => setStartDate(today)}
                    >
                      Today
                    </button>
                  </div>
                </div>
              </div>
              <div className="txn-date-field">
                {isDeposit ? (
                  <>
                    <label htmlFor="bank-end">Maturity date</label>
                    <DatePicker
                      id="bank-end"
                      value={endDate}
                      onChange={setEndDate}
                      placeholder="Choose maturity"
                    />
                  </>
                ) : (
                  <>
                    <label htmlFor="bank-due">Due date</label>
                    <DatePicker
                      id="bank-due"
                      value={dueDate}
                      onChange={setDueDate}
                      placeholder="Choose due date"
                    />
                  </>
                )}
              </div>
            </div>

            <label>
              Annual rate (%)
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={ratePercent}
                onChange={(e) => setRatePercent(e.target.value)}
                placeholder="5.00"
              />
            </label>

            {!isDeposit ? (
              <>
                <label>
                  {direction === "credit" ? "Borrower" : "Lender"}
                  <input
                    value={counterparty}
                    onChange={(e) => setCounterparty(e.target.value)}
                    placeholder="Bank name"
                  />
                </label>
                <label>
                  <span className="txn-label-row">
                    Already paid <span className="txn-optional">optional</span>
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={alreadyPaid}
                    onChange={(e) => setAlreadyPaid(e.target.value)}
                    placeholder="0.00"
                  />
                </label>
              </>
            ) : null}

            <label className="txn-note-field">
              <span className="txn-label-row">
                Note <span className="txn-optional">optional</span>
              </span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional"
              />
            </label>

            <div className="form-actions txn-actions">
              <button type="submit" className="btn primary txn-submit">
                {isDeposit
                  ? "Create deposit"
                  : `Create ${direction === "credit" ? "credit" : "debt"}`}
              </button>
              <button type="button" className="btn ghost" onClick={closeComposer}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="section">
        <h2>Bank deposits & credits</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : !hasItems ? (
          <EmptyState
            title="Nothing at the bank yet"
            hint="Track term deposits and bank loans with an annual rate."
          />
        ) : (
          <div className="deposit-list">
            {deposits.map((d) => (
              <DepositCard
                key={`dep-${d.id}`}
                deposit={d}
                onComplete={(id) => void onCompleteDeposit(id)}
                onDelete={(id) => void onDeleteDeposit(id)}
              />
            ))}
            {credits.map((item) => (
              <CreditDebtCard
                key={`cd-${item.id}`}
                item={item}
                onPay={onPayCredit}
                onDelete={(id) => void onDeleteCredit(id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
