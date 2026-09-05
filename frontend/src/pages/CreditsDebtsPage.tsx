import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { api } from "../api";
import { CreditDebtCard } from "../components/CreditDebtCard";
import { DatePicker } from "../components/DatePicker";
import { PillSelect } from "../components/PillSelect";
import { EmptyState, ErrorBanner, SegmentedControl } from "../components/ui";
import { useApp } from "../context";
import type { CreditDebt, CreditDebtDirection, CreditDebtSource } from "../types";
import { dollarsToCents, percentToBps, todayISO } from "../utils";

type Filter = "all" | "credit" | "debt";

export function CreditsDebtsPage() {
  const { defaultCurrency, currencies } = useApp();
  const [items, setItems] = useState<CreditDebt[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [direction, setDirection] = useState<CreditDebtDirection>("debt");
  const [source, setSource] = useState<CreditDebtSource>("informal");
  const [name, setName] = useState("");
  const [principal, setPrincipal] = useState("");
  const [currencyCode, setCurrencyCode] = useState(defaultCurrency);
  const [startDate, setStartDate] = useState(todayISO());
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
      setItems(await api.get<CreditDebt[]>("/credits-debts"));
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
    setDueDate("");
    setRatePercent("");
    setCounterparty("");
    setAlreadyPaid("");
    setNote("");
    setStartDate(todayISO());
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (source === "bank" && !dueDate) {
        throw new Error("Select a due date");
      }
      const body: Record<string, unknown> = {
        name: name.trim(),
        direction,
        source,
        principal_cents: dollarsToCents(principal),
        currency_code: currencyCode,
        start_date: startDate,
        due_date: dueDate || null,
        counterparty: counterparty.trim() || null,
        note: note.trim() || null,
      };
      if (source === "bank" || ratePercent.trim()) {
        body.annual_rate_bps = percentToBps(ratePercent || "0");
      }
      if (alreadyPaid.trim()) {
        body.already_paid_cents = dollarsToCents(alreadyPaid);
      }
      await api.post("/credits-debts", body);
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function onPay(id: number, amountCents: number, date: string, noteText: string) {
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

  async function onDelete(id: number) {
    if (!confirm("Delete this item? Its transactions stay in your history.")) return;
    setError(null);
    try {
      await api.delete(`/credits-debts/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((item) => item.direction === filter)),
    [filter, items],
  );

  const isBank = source === "bank";
  const namePlaceholder =
    direction === "credit"
      ? isBank
        ? "Personal loan issued"
        : "Lent to Alex"
      : isBank
        ? "Car loan"
        : "Borrowed from Sam";

  return (
    <div className="stack">
      <ErrorBanner message={error} />
      <section className={`section txn-composer txn-${direction}`}>
        <div className="txn-composer-head">
          <h2>New credit or debt</h2>
          <div className="txn-composer-toggles">
            <SegmentedControl
              ariaLabel="Direction"
              value={direction}
              onChange={setDirection}
              options={[
                { value: "debt", label: "I owe" },
                { value: "credit", label: "Owed to me" },
              ]}
            />
            <SegmentedControl
              ariaLabel="Source"
              value={source}
              onChange={setSource}
              options={[
                { value: "informal", label: "Informal" },
                { value: "bank", label: "Bank" },
              ]}
            />
          </div>
        </div>
        <form className="txn-form" onSubmit={onSubmit}>
          <div className="txn-amount-block">
            <div className="txn-amount-row">
              <span className="txn-amount-sign" aria-hidden>
                {direction === "debt" ? "−" : "+"}
              </span>
              <input
                className="txn-amount-input"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                required
                aria-label="Amount"
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
              <label htmlFor="credit-start">Start date</label>
              <div className="txn-date-row">
                <DatePicker
                  id="credit-start"
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
              <label htmlFor="credit-due">
                <span className="txn-label-row">
                  Due date
                  {isBank ? null : <span className="txn-optional">optional</span>}
                </span>
              </label>
              <DatePicker
                id="credit-due"
                value={dueDate}
                onChange={setDueDate}
                allowClear={!isBank}
                placeholder="Choose due date"
              />
            </div>
          </div>

          <label>
            <span className="txn-label-row">
              Annual rate (%)
              {isBank ? null : <span className="txn-optional">optional</span>}
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              required={isBank}
              value={ratePercent}
              onChange={(e) => setRatePercent(e.target.value)}
              placeholder={isBank ? "5.00" : "Optional"}
            />
          </label>

          <label>
            {direction === "credit" ? "Borrower" : "Lender"}
            <input
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              placeholder={isBank ? "Bank name" : "Person"}
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
              Create {direction === "credit" ? "credit" : "debt"}
            </button>
          </div>
        </form>
      </section>

      <section className="section">
        <div className="row-between">
          <h2>Credits & debts</h2>
          <div className="txn-chips" role="radiogroup" aria-label="Filter">
            {(
              [
                ["all", "All"],
                ["credit", "Credits"],
                ["debt", "Debts"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`txn-chip compact${filter === value ? " selected" : ""}`}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : visible.length === 0 ? (
          <EmptyState
            title={items.length === 0 ? "Nothing tracked yet" : "No matches"}
            hint="Record money you lent or money you owe — bank loans and informal IOUs."
          />
        ) : (
          <div className="deposit-list">
            {visible.map((item) => (
              <CreditDebtCard
                key={item.id}
                item={item}
                onPay={onPay}
                onDelete={(id) => void onDelete(id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
