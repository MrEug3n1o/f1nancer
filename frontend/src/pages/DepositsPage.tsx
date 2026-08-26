import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { DepositCard } from "../components/DepositCard";
import { EmptyState, ErrorBanner, Select } from "../components/ui";
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
      <section className="section">
        <h2>New deposit</h2>
        <form className="form-grid" onSubmit={onSubmit}>
          <label>
            Type
            <Select
              required
              value={depositType}
              onChange={(e) => setDepositType(e.target.value as DepositType)}
            >
              <option value="bank">Bank / term deposit</option>
              <option value="rental">Rental deposit</option>
            </Select>
          </label>
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
          <label>
            {depositType === "bank" ? "Principal" : "Amount"}
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
              placeholder="0.00"
            />
          </label>
          <label>
            Currency
            <Select
              required
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value)}
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
          </label>
          <label>
            {depositType === "bank" ? "Start date" : "Paid date"}
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label>
            {depositType === "bank" ? "Maturity date" : "Expected return"}
            <input
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
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
              Landlord / property
              <input
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
                placeholder="Optional"
              />
            </label>
          )}
          <label>
            Note
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn primary">
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
