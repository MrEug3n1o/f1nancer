import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { DatePicker } from "../components/DatePicker";
import { IconTrash } from "../components/NavIcons";
import { PillSelect } from "../components/PillSelect";
import { EmptyState, ErrorBanner, IconButton, Money, SegmentedControl } from "../components/ui";
import { useApp } from "../context";
import { usePageComposer } from "../hooks/usePageComposer";
import type { Cadence, Category, CategoryType, MoneyLocation, RecurringRule } from "../types";
import { dollarsToCents, todayISO } from "../utils";

export function SubscriptionsPage() {
  const { defaultCurrency, currencies } = useApp();
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState(defaultCurrency);
  const [type, setType] = useState<CategoryType>("expense");
  const [moneyLocation, setMoneyLocation] = useState<MoneyLocation>("card");
  const [categoryId, setCategoryId] = useState("");
  const [cadence, setCadence] = useState<Cadence>("monthly");
  const [nextRun, setNextRun] = useState(todayISO());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const today = todayISO();

  useEffect(() => {
    setCurrencyCode(defaultCurrency);
  }, [defaultCurrency]);

  const filteredCategories = useMemo(
    () => categories.filter((c) => c.type === type),
    [categories, type],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await api.post("/recurring/process", {});
      const [list, cats] = await Promise.all([
        api.get<RecurringRule[]>("/recurring"),
        api.get<Category[]>("/categories"),
      ]);
      setRules(list);
      setCategories(cats);
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
    setAmount("");
    setCategoryId("");
    setNote("");
    setNextRun(todayISO());
    setCadence("monthly");
    setType("expense");
    setMoneyLocation("card");
  }

  const { showComposer, closeComposer } = usePageComposer({
    onReset: resetForm,
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (!categoryId) {
        throw new Error("Select a category");
      }
      await api.post("/recurring", {
        amount: dollarsToCents(amount),
        currency_code: currencyCode,
        category_id: Number(categoryId),
        type,
        money_location: moneyLocation,
        cadence,
        next_run_date: nextRun,
        note: note.trim() || null,
        active: true,
      });
      closeComposer();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function toggleActive(rule: RecurringRule) {
    try {
      await api.patch(`/recurring/${rule.id}`, { active: !rule.active });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function onDelete(id: number) {
    if (!confirm("Delete this subscription?")) return;
    try {
      await api.delete(`/recurring/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="stack">
      <ErrorBanner message={error} />
      {showComposer ? (
        <section className={`section txn-composer txn-${type}`}>
          <div className="txn-composer-head">
            <h2>Add recurring payment</h2>
            <SegmentedControl
              ariaLabel="Payment type"
              value={type}
              onChange={(next) => {
                setType(next);
                setCategoryId("");
              }}
              options={[
                { value: "expense", label: "Expense" },
                { value: "income", label: "Income" },
              ]}
            />
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
                <span className="txn-amount-sign" aria-hidden>
                  {type === "expense" ? "−" : "+"}
                </span>
                <input
                  className="txn-amount-input"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  required
                  aria-label="Amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
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

            <fieldset className="txn-fieldset">
              <legend>Category</legend>
              {filteredCategories.length === 0 ? (
                <p className="muted small txn-empty-hint">
                  No {type} categories yet.{" "}
                  <Link to="/settings">Add them in Settings</Link>.
                </p>
              ) : (
                <div className="txn-chips" role="radiogroup" aria-label="Category">
                  {filteredCategories.map((c) => {
                    const selected = categoryId === String(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`txn-chip${selected ? " selected" : ""}`}
                        style={{ "--chip-color": c.color } as CSSProperties}
                        onClick={() => setCategoryId(String(c.id))}
                      >
                        <span className="swatch" style={{ background: c.color }} />
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </fieldset>

            <div className="txn-meta-row">
              <div className="txn-date-field">
                <label htmlFor="sub-next-run">Next run</label>
                <div className="txn-date-row">
                  <DatePicker
                    id="sub-next-run"
                    value={nextRun}
                    onChange={setNextRun}
                  />
                  <div className="txn-date-chips">
                    <button
                      type="button"
                      className={`txn-chip${nextRun === today ? " selected" : ""}`}
                      style={{ "--chip-color": "var(--accent)" } as CSSProperties}
                      onClick={() => setNextRun(today)}
                    >
                      Today
                    </button>
                  </div>
                </div>
              </div>
              <div className="txn-goal-field">
                <span>Cadence</span>
                <SegmentedControl
                  ariaLabel="Cadence"
                  value={cadence}
                  onChange={setCadence}
                  options={[
                    { value: "weekly", label: "Weekly" },
                    { value: "monthly", label: "Monthly" },
                    { value: "yearly", label: "Yearly" },
                  ]}
                />
              </div>
            </div>

            <label className="txn-note-field">
              <span className="txn-label-row">
                Note <span className="txn-optional">optional</span>
              </span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Netflix, rent…"
              />
            </label>

            <div className="form-actions txn-actions">
              <button type="submit" className="btn primary txn-submit">
                {type === "income" ? "Add income" : "Add subscription"}
              </button>
              <button type="button" className="btn ghost" onClick={closeComposer}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="section">
        <h2>Subscriptions & recurring</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : rules.length === 0 ? (
          <EmptyState
            title="No recurring payments"
            hint="Add rent, salary, or subscriptions to auto-create transactions."
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Note / category</th>
                <th>From</th>
                <th>Cadence</th>
                <th>Next</th>
                <th className="num">Amount</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className={r.active ? "" : "dim"}>
                  <td>
                    {r.note || r.category?.name || "—"}
                    <div className="muted small">{r.category?.name}</div>
                  </td>
                  <td className="muted">
                    {r.money_location === "cash" ? "Cash" : "Card"}
                  </td>
                  <td>{r.cadence}</td>
                  <td>{r.next_run_date}</td>
                  <td className={`num ${r.type}`}>
                    <Money cents={r.amount} currency={r.currency_code} />
                  </td>
                  <td>{r.active ? "Active" : "Paused"}</td>
                  <td className="actions">
                    <span className="row-actions">
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => void toggleActive(r)}
                      >
                        {r.active ? "Pause" : "Resume"}
                      </button>
                      <IconButton
                        label="Delete"
                        danger
                        onClick={() => void onDelete(r.id)}
                      >
                        <IconTrash className="btn-icon" />
                      </IconButton>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
