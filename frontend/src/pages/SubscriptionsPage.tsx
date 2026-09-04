import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../api";
import { IconTrash } from "../components/NavIcons";
import { EmptyState, ErrorBanner, IconButton, Money, SegmentedControl, Select } from "../components/ui";
import { useApp } from "../context";
import type { Cadence, Category, CategoryType, RecurringRule } from "../types";
import { dollarsToCents, todayISO } from "../utils";

export function SubscriptionsPage() {
  const { defaultCurrency, currencies } = useApp();
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState(defaultCurrency);
  const [type, setType] = useState<CategoryType>("expense");
  const [categoryId, setCategoryId] = useState("");
  const [cadence, setCadence] = useState<Cadence>("monthly");
  const [nextRun, setNextRun] = useState(todayISO());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/recurring", {
        amount: dollarsToCents(amount),
        currency_code: currencyCode,
        category_id: Number(categoryId),
        type,
        cadence,
        next_run_date: nextRun,
        note: note.trim() || null,
        active: true,
      });
      setAmount("");
      setCategoryId("");
      setNote("");
      setNextRun(todayISO());
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
      <section className="section">
        <h2>Add recurring payment</h2>
        <form className="form-grid" onSubmit={onSubmit}>
          <label>
            Type
            <SegmentedControl
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
          </label>
          <label>
            Amount
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
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
            Category
            <Select
              required
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Select…</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>
          <label>
            Cadence
            <SegmentedControl
              value={cadence}
              onChange={setCadence}
              options={[
                { value: "weekly", label: "Weekly" },
                { value: "monthly", label: "Monthly" },
                { value: "yearly", label: "Yearly" },
              ]}
            />
          </label>
          <label>
            Next run
            <input
              type="date"
              required
              value={nextRun}
              onChange={(e) => setNextRun(e.target.value)}
            />
          </label>
          <label>
            Note
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Netflix, rent…"
            />
          </label>
          <div className="form-actions span-2">
            <button type="submit" className="btn primary">
              Add subscription
            </button>
          </div>
        </form>
      </section>

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
                  <td>{r.cadence}</td>
                  <td>{r.next_run_date}</td>
                  <td className={`num ${r.type}`}>
                    <Money cents={r.amount} currency={r.currency_code} />
                  </td>
                  <td>{r.active ? "Active" : "Paused"}</td>
                  <td className="actions">
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
