import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { api } from "../api";
import { DatePicker } from "../components/DatePicker";
import { DepositCard } from "../components/DepositCard";
import { PillSelect } from "../components/PillSelect";
import { EmptyState, ErrorBanner, SegmentedControl } from "../components/ui";
import { useApp } from "../context";
import type { Deposit, DepositType } from "../types";
import { dollarsToCents, percentToBps, todayISO } from "../utils";

export function DepositsPage() {
  const { defaultCurrency, currencies } = useApp();
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [depositType, setDepositType] = useState<DepositType>("bank");
  const [name, setName] = useState("");
  const [principal, setPrincipal] = useState("");
  const [currencyCode, setCurrencyCode] = useState(defaultCurrency);
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState("");
  const [ratePercent, setRatePercent] = useState("");
  const [counterparty, setCounterparty] = useState("");
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
      setDeposits(await api.get<Deposit[]>("/deposits"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (!endDate) {
        throw new Error(
          depositType === "bank" ? "Select a maturity date" : "Select an expected return date",
        );
      }
      const body: Record<string, unknown> = {
        name: name.trim(),
        type: depositType,
        principal_cents: dollarsToCents(principal),
        currency_code: currencyCode,
        start_date: startDate,
        end_date: endDate,
        note: note.trim() || null,
      };
      if (depositType === "bank") {
        body.annual_rate_bps = percentToBps(ratePercent);
      } else {
        body.counterparty = counterparty.trim() || null;
      }
      await api.post("/deposits", body);
      setName("");
      setPrincipal("");
      setEndDate("");
      setRatePercent("");
      setCounterparty("");
      setNote("");
      setStartDate(todayISO());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function onComplete(id: number) {
    setError(null);
    try {
      await api.post(`/deposits/${id}/complete`, {});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Complete failed");
    }
  }

  async function onDelete(id: number) {
    if (!confirm("Delete this deposit?")) return;
    try {
      await api.delete(`/deposits/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="stack">
      <ErrorBanner message={error} />
      <section className="section txn-composer">
        <div className="txn-composer-head">
          <h2>New deposit</h2>
          <SegmentedControl
            ariaLabel="Deposit type"
            value={depositType}
            onChange={setDepositType}
            options={[
              { value: "bank", label: "Bank" },
              { value: "rental", label: "Rental" },
            ]}
          />
        </div>
        <form className="txn-form" onSubmit={onSubmit}>
          <div className="txn-amount-block">
            <div className="txn-amount-row">
              <input
                className="txn-amount-input"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                required
                aria-label={depositType === "bank" ? "Principal" : "Amount"}
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
              placeholder={
                depositType === "bank" ? "12-month CD" : "Apartment security"
              }
            />
          </label>

          <div className="txn-meta-row">
            <div className="txn-date-field">
              <label htmlFor="deposit-start">
                {depositType === "bank" ? "Start date" : "Paid date"}
              </label>
              <div className="txn-date-row">
                <DatePicker
                  id="deposit-start"
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
              <label htmlFor="deposit-end">
                {depositType === "bank" ? "Maturity date" : "Expected return"}
              </label>
              <DatePicker
                id="deposit-end"
                value={endDate}
                onChange={setEndDate}
                placeholder={
                  depositType === "bank" ? "Choose maturity" : "Choose return date"
                }
              />
            </div>
          </div>

          {depositType === "bank" ? (
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
          ) : (
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
              Create deposit
            </button>
          </div>
        </form>
      </section>

      <section className="section">
        <h2>Your deposits</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : deposits.length === 0 ? (
          <EmptyState
            title="No deposits yet"
            hint="Track a bank term deposit or a rental security deposit."
          />
        ) : (
          <div className="deposit-list">
            {deposits.map((d) => (
              <DepositCard
                key={d.id}
                deposit={d}
                onComplete={(id) => void onComplete(id)}
                onDelete={(id) => void onDelete(id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
