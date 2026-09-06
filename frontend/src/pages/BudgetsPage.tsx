import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { IconPencil, IconTrash } from "../components/NavIcons";
import { PillSelect } from "../components/PillSelect";
import { EmptyState, ErrorBanner, IconButton, Money, ProgressBar } from "../components/ui";
import { useApp } from "../context";
import { usePageComposer } from "../hooks/usePageComposer";
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

  function resetForm() {
    setEditingId(null);
    setCategoryId("");
    setLimit("");
    setCurrencyCode(defaultCurrency);
  }

  const { showComposer, closeComposer } = usePageComposer({
    isEditing: editingId != null,
    onReset: resetForm,
  });

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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (!categoryId) {
        throw new Error("Select a category");
      }
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
      closeComposer();
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
      if (editingId === id) closeComposer();
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

  function changeCurrency(next: string) {
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
  }

  return (
    <div className="stack">
      <ErrorBanner message={error} />
      {showComposer ? (
        <section className={`section txn-composer${editingId ? " is-editing" : ""}`}>
          <div className="txn-composer-head">
            <div>
              <h2>{editingId ? "Edit monthly limit" : "Set monthly limit"}</h2>
              <p className="muted">
                Limits repeat every month, like a subscription, until you edit or delete them.
              </p>
            </div>
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
                  aria-label="Limit"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <PillSelect
                className="txn-currency-select"
                ariaLabel="Currency"
                value={currencyCode}
                onChange={changeCurrency}
                options={currencies.map((c) => ({
                  value: c.code,
                  label: c.code,
                }))}
              />
            </div>

            <fieldset className="txn-fieldset">
              <legend>Category</legend>
              {available.length === 0 ? (
                <p className="muted small txn-empty-hint">
                  {categories.length === 0 ? (
                    <>
                      No expense categories yet.{" "}
                      <Link to="/settings">Add them in Settings</Link>.
                    </>
                  ) : (
                    "Every category already has a limit in this currency."
                  )}
                </p>
              ) : (
                <div className="txn-chips" role="radiogroup" aria-label="Category">
                  {available.map((c) => {
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

            <div className="form-actions txn-actions">
              <button
                type="submit"
                className="btn primary txn-submit"
                disabled={!available.length}
              >
                {editingId ? "Update budget" : "Add budget"}
              </button>
              <button type="button" className="btn ghost" onClick={closeComposer}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}

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
