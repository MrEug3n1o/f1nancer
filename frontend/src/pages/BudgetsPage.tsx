import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { IconPencil, IconTrash } from "../components/NavIcons";
import { EmptyState, ErrorBanner, IconButton, Money, ProgressBar, Select } from "../components/ui";
import { useApp } from "../context";
import type { Budget, Category } from "../types";
import { centsToDollarsInput, dollarsToCents, formatMonthLabel } from "../utils";

export function BudgetsPage() {
  const { month, defaultCurrency, currencies, locale } = useApp();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [limit, setLimit] = useState("");
  const [currencyCode, setCurrencyCode] = useState(defaultCurrency);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!editingId) {
      setCurrencyCode((code) => code || defaultCurrency);
    }
  }, [defaultCurrency, editingId]);

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

  function startEdit(budget: Budget) {
    setEditingId(budget.id);
    setCategoryId(String(budget.category_id));
    setLimit(centsToDollarsInput(budget.limit_cents));
    setCurrencyCode(budget.currency_code);
  }

  function resetForm() {
    setEditingId(null);
    setCategoryId("");
    setLimit("");
    setCurrencyCode(defaultCurrency);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        category_id: Number(categoryId),
        limit_cents: dollarsToCents(limit),
        currency_code: currencyCode,
      };
      if (editingId) {
        await api.patch(`/budgets/${editingId}?month=${month}`, payload);
      } else {
        await api.post(`/budgets?month=${month}`, payload);
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function onDelete(id: number) {
    if (!confirm("Delete this monthly budget? It will be removed for every month.")) {
      return;
    }
    setError(null);
    try {
      await api.delete(`/budgets/${id}`);
      if (editingId === id) resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const usedKeys = new Set(
    budgets
      .filter((b) => b.id !== editingId)
      .map((b) => `${b.category_id}:${b.currency_code}`),
  );
  const available = categories.filter(
    (c) => !usedKeys.has(`${c.id}:${currencyCode}`),
  );

  return (
    <div className="stack">
      <ErrorBanner message={error} />
      <section className="section">
        <h2>{editingId ? "Edit monthly limit" : "Set monthly limit"}</h2>
        <p className="muted">
          Limits repeat every month, like a subscription, until you edit or delete them.
        </p>
        <form className="form-grid" onSubmit={onSubmit}>
          <label>
            Category
            <Select
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
            </Select>
          </label>
          <label>
            Currency
            <Select
              required
              value={currencyCode}
              onChange={(e) => {
                const next = e.target.value;
                setCurrencyCode(next);
                setCategoryId((current) => {
                  if (!current) return current;
                  const taken = budgets.some(
                    (b) =>
                      b.id !== editingId &&
                      String(b.category_id) === current &&
                      b.currency_code === next,
                  );
                  return taken ? "" : current;
                });
              }}
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
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
            <button
              type="submit"
              className="btn primary"
              disabled={!available.length}
            >
              {editingId ? "Update budget" : "Add budget"}
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
        <h2>Monthly limits</h2>
        <p className="muted">
          Spent vs limit for {formatMonthLabel(month, locale)}. Limits stay the
          same every month.
        </p>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : budgets.length === 0 ? (
          <EmptyState
            title="No budgets yet"
            hint="Pick an expense category and set a spending limit. It will apply every month."
          />
        ) : (
          <ul className="progress-list">
            {budgets.map((b) => (
              <li key={b.id}>
                <div className="row-between">
                  <strong>
                    {b.category?.name ?? "Category"}{" "}
                    <span className="muted small">({b.currency_code})</span>
                  </strong>
                  <div className="actions">
                    <span className="muted">
                      <Money cents={b.spent_cents} currency={b.currency_code} /> /{" "}
                      <Money cents={b.limit_cents} currency={b.currency_code} />
                    </span>
                    <IconButton label="Edit" edit onClick={() => startEdit(b)}>
                      <IconPencil className="btn-icon" />
                    </IconButton>
                    <IconButton
                      label="Delete"
                      danger
                      onClick={() => void onDelete(b.id)}
                    >
                      <IconTrash className="btn-icon" />
                    </IconButton>
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
