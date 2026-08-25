import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../api";
import { EmptyState, ErrorBanner, Money, SegmentedControl, Select } from "../components/ui";
import { useApp } from "../context";
import type { Category, CategoryType, Transaction } from "../types";
import { centsToDollarsInput, dollarsToCents, todayISO } from "../utils";

export function TransactionsPage() {
  const { month, defaultCurrency, currencies } = useApp();
  const [items, setItems] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("");
  const [form, setForm] = useState({
    amount: "",
    currency_code: defaultCurrency,
    date: todayISO(),
    type: "expense" as CategoryType,
    category_id: "",
    note: "",
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!editingId) {
      setForm((f) => ({ ...f, currency_code: f.currency_code || defaultCurrency }));
    }
  }, [defaultCurrency, editingId]);

  const filteredCategories = useMemo(
    () => categories.filter((c) => c.type === form.type),
    [categories, form.type],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ month });
      if (filterCategory) params.set("category_id", filterCategory);
      if (filterCurrency) params.set("currency", filterCurrency);
      const [txns, cats] = await Promise.all([
        api.get<Transaction[]>(`/transactions?${params}`),
        api.get<Category[]>("/categories"),
      ]);
      setItems(txns);
      setCategories(cats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [month, filterCategory, filterCurrency]);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(txn: Transaction) {
    setEditingId(txn.id);
    setForm({
      amount: centsToDollarsInput(txn.amount),
      currency_code: txn.currency_code,
      date: txn.date,
      type: txn.type,
      category_id: String(txn.category_id),
      note: txn.note ?? "",
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm({
      amount: "",
      currency_code: defaultCurrency,
      date: todayISO(),
      type: "expense",
      category_id: "",
      note: "",
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        amount: dollarsToCents(form.amount),
        currency_code: form.currency_code,
        date: form.date,
        type: form.type,
        category_id: Number(form.category_id),
        note: form.note.trim() || null,
      };
      if (!payload.category_id) {
        throw new Error("Select a category");
      }
      if (editingId) {
        await api.patch(`/transactions/${editingId}`, payload);
      } else {
        await api.post("/transactions", payload);
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function onDelete(id: number) {
    if (!confirm("Delete this transaction?")) return;
    setError(null);
    try {
      await api.delete(`/transactions/${id}`);
      if (editingId === id) resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="stack">
      <ErrorBanner message={error} />
      <section className="section">
        <h2>{editingId ? "Edit transaction" : "Add transaction"}</h2>
        <form className="form-grid" onSubmit={onSubmit}>
          <label>
            Type
            <SegmentedControl
              value={form.type}
              onChange={(type) =>
                setForm((f) => ({
                  ...f,
                  type,
                  category_id: "",
                }))
              }
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
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="0.00"
            />
          </label>
          <label>
            Currency
            <Select
              required
              value={form.currency_code}
              onChange={(e) =>
                setForm((f) => ({ ...f, currency_code: e.target.value }))
              }
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
          </label>
          <label>
            Date
            <input
              type="date"
              required
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </label>
          <label>
            Category
            <Select
              required
              value={form.category_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, category_id: e.target.value }))
              }
            >
              <option value="">Select…</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="span-2">
            Note
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Optional"
            />
          </label>
          <div className="form-actions span-2">
            <button type="submit" className="btn primary">
              {editingId ? "Update" : "Add"}
            </button>
            {editingId ? (
              <button type="button" className="btn ghost" onClick={resetForm}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="section">
        <div className="row-between wrap">
          <h2>Transactions</h2>
          <div className="filters-row">
            <label className="inline-filter">
              Category
              <Select
                compact
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                <option value="">All</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="inline-filter">
              Currency
              <Select
                compact
                value={filterCurrency}
                onChange={(e) => setFilterCurrency(e.target.value)}
              >
                <option value="">All</option>
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        </div>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : items.length === 0 ? (
          <EmptyState
            title="No transactions this month"
            hint="Add income or expenses above."
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Note</th>
                <th className="num">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((txn) => (
                <tr key={txn.id}>
                  <td>{txn.date}</td>
                  <td>
                    <span
                      className="swatch inline"
                      style={{ background: txn.category?.color }}
                    />
                    {txn.category?.name ?? "—"}
                  </td>
                  <td className="muted">{txn.note ?? "—"}</td>
                  <td className={`num ${txn.type}`}>
                    {txn.type === "expense" ? "−" : "+"}
                    <Money cents={txn.amount} currency={txn.currency_code} />
                  </td>
                  <td className="actions">
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => startEdit(txn)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn ghost small danger-text"
                      onClick={() => void onDelete(txn.id)}
                    >
                      Delete
                    </button>
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
