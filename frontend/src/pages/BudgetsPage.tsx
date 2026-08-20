import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { EmptyState, ErrorBanner, Money, ProgressBar } from "../components/ui";
import { useApp } from "../context";
import type { Budget, Category } from "../types";
import { dollarsToCents } from "../utils";

export function BudgetsPage() {
  const { month } = useApp();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [limit, setLimit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bu, cats] = await Promise.all([
        api.get<Budget[]>(`/budgets?month=${month}`),
        api.get<Category[]>("/categories?type=expense"),
      ]);
      setBudgets(bu);
      setCategories(cats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/budgets", {
        category_id: Number(categoryId),
        limit_cents: dollarsToCents(limit),
        month,
      });
      setCategoryId("");
      setLimit("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function onDelete(id: number) {
    if (!confirm("Delete this budget?")) return;
    try {
      await api.delete(`/budgets/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const usedIds = new Set(budgets.map((b) => b.category_id));
  const available = categories.filter((c) => !usedIds.has(c.id));

  return (
    <div className="stack">
      <ErrorBanner message={error} />
      <section className="section">
        <h2>Set monthly limit</h2>
        <form className="form-grid" onSubmit={onSubmit}>
          <label>
            Category
            <select
              required
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Select…</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Limit
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="0.00"
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn primary" disabled={!available.length}>
              Add budget
            </button>
          </div>
        </form>
      </section>

      <section className="section">
        <h2>Budgets this month</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : budgets.length === 0 ? (
          <EmptyState
            title="No budgets yet"
            hint="Pick an expense category and set a spending limit."
          />
        ) : (
          <ul className="progress-list">
            {budgets.map((b) => (
              <li key={b.id}>
                <div className="row-between">
                  <strong>{b.category?.name ?? "Category"}</strong>
                  <div className="actions">
                    <span className="muted">
                      <Money cents={b.spent_cents} /> /{" "}
                      <Money cents={b.limit_cents} />
                    </span>
                    <button
                      type="button"
                      className="btn ghost small danger-text"
                      onClick={() => void onDelete(b.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <ProgressBar
                  value={b.spent_cents}
                  max={b.limit_cents}
                  color={b.category?.color}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
