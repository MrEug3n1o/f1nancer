import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { api } from "../api";
import { CreditDebtCard } from "../components/CreditDebtCard";
import { DatePicker } from "../components/DatePicker";
import { DepositCard } from "../components/DepositCard";
import { PillSelect } from "../components/PillSelect";
import { EmptyState, ErrorBanner, SegmentedControl } from "../components/ui";
import { useApp } from "../context";
import { usePageComposer } from "../hooks/usePageComposer";
import type { CreditDebt, CreditDebtDirection, Deposit, MoneyLocation } from "../types";
import { dollarsToCents, todayISO } from "../utils";

type ComposerKind = "informal" | "rental";
type Filter = "all" | "debt" | "rental";

export function CreditsDebtsPage() {
  const { defaultCurrency, currencies } = useApp();
  const [items, setItems] = useState<CreditDebt[]>([]);
  const [rentals, setRentals] = useState<Deposit[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [kind, setKind] = useState<ComposerKind>("informal");
  const [direction, setDirection] = useState<CreditDebtDirection>("debt");
  const [name, setName] = useState("");
  const [principal, setPrincipal] = useState("");
  const [currencyCode, setCurrencyCode] = useState(defaultCurrency);
  const [startDate, setStartDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [alreadyPaid, setAlreadyPaid] = useState("");
  const [moneyLocation, setMoneyLocation] = useState<MoneyLocation>("card");
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
      const [cd, dep] = await Promise.all([
        api.get<CreditDebt[]>("/credits-debts?source=informal"),
        api.get<Deposit[]>("/deposits?type=rental"),
      ]);
      setItems(cd);
      setRentals(dep);
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
    setEndDate("");
    setCounterparty("");
    setAlreadyPaid("");
    setMoneyLocation("card");
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
      if (kind === "rental") {
        if (!endDate) throw new Error("Select an expected return date");
        await api.post("/deposits", {
          name: name.trim(),
          type: "rental",
          principal_cents: dollarsToCents(principal),
          currency_code: currencyCode,
          start_date: startDate,
          end_date: endDate,
          counterparty: counterparty.trim() || null,
          money_location: moneyLocation,
          note: note.trim() || null,
        });
      } else {
        const body: Record<string, unknown> = {
          name: name.trim(),
          direction,
          source: "informal",
          principal_cents: dollarsToCents(principal),
          currency_code: currencyCode,
          start_date: startDate,
          due_date: dueDate || null,
          money_location: moneyLocation,
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

  async function onPay(
    id: string,
    amountCents: number,
    date: string,
    noteText: string,
    location: MoneyLocation,
  ) {
    setError(null);
    try {
      await api.post(`/credits-debts/${id}/pay`, {
        amount: amountCents,
        date,
        note: noteText || null,
        money_location: location,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
      throw err;
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this item? Its transactions stay in your history.")) return;
    setError(null);
    try {
      await api.delete(`/credits-debts/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function onCompleteRental(id: string) {
    setError(null);
    try {
      await api.post(`/deposits/${id}/complete`, {});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Complete failed");
    }
  }

  async function onDeleteRental(id: string) {
    if (!confirm("Delete this deposit?")) return;
    try {
      await api.delete(`/deposits/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const visibleCredits = useMemo(() => {
    if (filter === "rental") return [];
    if (filter === "all") return items;
    return items.filter((item) => item.direction === filter);
  }, [filter, items]);

  const visibleRentals = useMemo(() => {
    if (filter === "debt") return [];
    return rentals;
  }, [filter, rentals]);

  const isRental = kind === "rental";
  const namePlaceholder = isRental
    ? "Apartment security"
    : direction === "credit"
      ? "Lent to Alex"
      : "Borrowed from Sam";
  const hasAny = items.length > 0 || rentals.length > 0;
  const hasVisible = visibleCredits.length > 0 || visibleRentals.length > 0;

  return (
    <div className="stack">
      <ErrorBanner message={error} />
      {showComposer ? (
        <section className={`section txn-composer${isRental ? "" : ` txn-${direction}`}`}>
          <div className="txn-composer-head">
            <h2>New {isRental ? "rental deposit" : "credit or debt"}</h2>
            <div className="txn-composer-toggles">
              <SegmentedControl
                ariaLabel="Type"
                value={kind}
                onChange={setKind}
                options={[
                  { value: "informal", label: "Informal" },
                  { value: "rental", label: "Rental" },
                ]}
              />
              {!isRental ? (
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
            <SegmentedControl
              ariaLabel="Cash or card"
              value={moneyLocation}
              onChange={setMoneyLocation}
              options={[
                { value: "cash", label: "Cash" },
                { value: "card", label: "Card" },
              ]}
            />
            <div className="txn-amount-block">
              <div className="txn-amount-row">
                {!isRental ? (
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
                  aria-label={isRental ? "Amount" : "Amount"}
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
                <label htmlFor="credit-start">
                  {isRental ? "Paid date" : "Start date"}
                </label>
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
                {isRental ? (
                  <>
                    <label htmlFor="rental-end">Expected return</label>
                    <DatePicker
                      id="rental-end"
                      value={endDate}
                      onChange={setEndDate}
                      placeholder="Choose return date"
                    />
                  </>
                ) : (
                  <>
                    <label htmlFor="credit-due">
                      <span className="txn-label-row">
                        Due date
                        <span className="txn-optional">optional</span>
                      </span>
                    </label>
                    <DatePicker
                      id="credit-due"
                      value={dueDate}
                      onChange={setDueDate}
                      allowClear
                      placeholder="Choose due date"
                    />
                  </>
                )}
              </div>
            </div>

            {isRental ? (
              <label>
                <span className="txn-label-row">
                  Landlord / property <span className="txn-optional">optional</span>
                </span>
                <input
                  value={counterparty}
                  onChange={(e) => setCounterparty(e.target.value)}
                  placeholder="Optional"
                />
              </label>
            ) : (
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
            )}

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
                {isRental
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
        <div className="txn-chips" role="radiogroup" aria-label="Filter">
          {(
            [
              ["all", "All"],
              ["debt", "Debts"],
              ["rental", "Rentals"],
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
        {loading ? (
          <p className="muted">Loading…</p>
        ) : !hasVisible ? (
          <EmptyState
            title={!hasAny ? "Nothing tracked yet" : "No matches"}
            hint="Record informal IOUs and rental security deposits."
          />
        ) : (
          <div className="deposit-list">
            {visibleCredits.map((item) => (
              <CreditDebtCard
                key={`cd-${item.id}`}
                item={item}
                onPay={onPay}
                onDelete={(id) => void onDelete(id)}
              />
            ))}
            {visibleRentals.map((d) => (
              <DepositCard
                key={`dep-${d.id}`}
                deposit={d}
                onComplete={(id) => void onCompleteRental(id)}
                onDelete={(id) => void onDeleteRental(id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
