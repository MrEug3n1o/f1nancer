import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { DatePicker } from "../components/DatePicker";
import { IconPencil, IconTrash } from "../components/NavIcons";
import { PillSelect } from "../components/PillSelect";
import { EmptyState, ErrorBanner, IconButton, Money, SegmentedControl } from "../components/ui";
import { useApp } from "../context";
import type { Category, CategoryType, Goal, Transaction } from "../types";
import { centsToDollarsInput, dollarsToCents, shiftDateISO, todayISO } from "../utils";

export function TransactionsPage() {
  const { month, defaultCurrency, currencies } = useApp();
  const [items, setItems] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("");
  const [form, setForm] = useState({
    amount: "",
    currency_code: defaultCurrency,
    date: todayISO(),
    type: "expense" as CategoryType,
    category_id: "",
    note: "",
    goal_id: "",
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const amountRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLElement>(null);
  const today = todayISO();
  const yesterday = shiftDateISO(today, -1);

  useEffect(() => {
    if (!editingId) {
      setForm((f) => ({ ...f, currency_code: f.currency_code || defaultCurrency }));
    }
  }, [defaultCurrency, editingId]);

  const filteredCategories = useMemo(
    () => categories.filter((c) => c.type === form.type),
    [categories, form.type],
  );

  const goalOptions = useMemo(() => {
    if (form.type !== "expense") return [];
    return goals.filter(
      (g) =>
        String(g.id) === form.goal_id ||
        (g.status === "active" && g.currency_code === form.currency_code),
    );
  }, [form.currency_code, form.goal_id, form.type, goals]);

  const goalNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const g of goals) map.set(g.id, g.name);
    return map;
  }, [goals]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ month });
      if (filterCategory) params.set("category_id", filterCategory);
      if (filterCurrency) params.set("currency", filterCurrency);
      const [txns, cats, goalRows] = await Promise.all([
        api.get<Transaction[]>(`/transactions?${params}`),
        api.get<Category[]>("/categories"),
        api.get<Goal[]>("/goals"),
      ]);
      setItems(txns);
      setCategories(cats);
      setGoals(goalRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [month, filterCategory, filterCurrency]);

  useEffect(() => {
    void load();
  }, [load]);

  function focusAmount() {
    requestAnimationFrame(() => amountRef.current?.focus());
  }

  function startEdit(txn: Transaction) {
    setEditingId(txn.id);
    setForm({
      amount: centsToDollarsInput(txn.amount),
      currency_code: txn.currency_code,
      date: txn.date,
      type: txn.type,
      category_id: String(txn.category_id),
      note: txn.note ?? "",
      goal_id: txn.goal_id ? String(txn.goal_id) : "",
    });
    focusAmount();
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      goal_id: "",
    });
    focusAmount();
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
        goal_id:
          form.type === "expense" && form.goal_id ? Number(form.goal_id) : null,
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
      <section
        ref={composerRef}
        className={`section txn-composer txn-${form.type}${editingId ? " is-editing" : ""}`}
      >
        <div className="txn-composer-head">
          <h2>{editingId ? "Edit transaction" : "Add transaction"}</h2>
          <SegmentedControl
            ariaLabel="Transaction type"
            value={form.type}
            onChange={(type) =>
              setForm((f) => ({
                ...f,
                type,
                category_id: "",
                goal_id: type === "expense" ? f.goal_id : "",
              }))
            }
            options={[
              { value: "expense", label: "Expense" },
              { value: "income", label: "Income" },
            ]}
          />
        </div>

        <form className="txn-form" onSubmit={onSubmit}>
          <div className="txn-amount-block">
            <div className="txn-amount-row">
              <span className="txn-amount-sign" aria-hidden>
                {form.type === "expense" ? "−" : "+"}
              </span>
              <input
                id="txn-amount"
                ref={amountRef}
                className="txn-amount-input"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                required
                autoFocus
                aria-label="Amount"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <PillSelect
              className="txn-currency-select"
              ariaLabel="Currency"
              value={form.currency_code}
              onChange={(next) => {
                setForm((f) => {
                  const selected = goals.find((g) => String(g.id) === f.goal_id);
                  const keepGoal = selected && selected.currency_code === next;
                  return {
                    ...f,
                    currency_code: next,
                    goal_id: keepGoal ? f.goal_id : "",
                  };
                });
              }}
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
                No {form.type} categories yet.{" "}
                <Link to="/settings">Add them in Settings</Link>.
              </p>
            ) : (
              <div className="txn-chips" role="radiogroup" aria-label="Category">
                {filteredCategories.map((c) => {
                  const selected = form.category_id === String(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`txn-chip${selected ? " selected" : ""}`}
                      style={{ "--chip-color": c.color } as CSSProperties}
                      onClick={() =>
                        setForm((f) => ({ ...f, category_id: String(c.id) }))
                      }
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
              <label htmlFor="txn-date">Date</label>
              <div className="txn-date-row">
                <DatePicker
                  id="txn-date"
                  value={form.date}
                  onChange={(date) => setForm((f) => ({ ...f, date }))}
                />
                <div className="txn-date-chips">
                  <button
                    type="button"
                    className={`txn-chip${form.date === today ? " selected" : ""}`}
                    style={{ "--chip-color": "var(--accent)" } as CSSProperties}
                    onClick={() => setForm((f) => ({ ...f, date: today }))}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    className={`txn-chip${form.date === yesterday ? " selected" : ""}`}
                    style={{ "--chip-color": "var(--accent)" } as CSSProperties}
                    onClick={() => setForm((f) => ({ ...f, date: yesterday }))}
                  >
                    Yesterday
                  </button>
                </div>
              </div>
            </div>
            {form.type === "expense" && goalOptions.length > 0 ? (
              <div className="txn-goal-field">
                <span className="txn-label-row">
                  Goal <span className="txn-optional">optional</span>
                </span>
                <PillSelect
                  className="txn-goal-select"
                  align="left"
                  ariaLabel="Goal"
                  value={form.goal_id}
                  onChange={(goal_id) => setForm((f) => ({ ...f, goal_id }))}
                  options={[
                    { value: "", label: "None" },
                    ...goalOptions.map((g) => ({
                      value: String(g.id),
                      label: g.name,
                    })),
                  ]}
                />
              </div>
            ) : null}
          </div>

          <label className="txn-note-field">
            <span className="txn-label-row">
              Note <span className="txn-optional">optional</span>
            </span>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Coffee, rent, paycheck…"
            />
          </label>

          <div className="form-actions txn-actions">
            <button type="submit" className="btn primary txn-submit">
              {editingId
                ? "Save changes"
                : form.type === "income"
                  ? "Add income"
                  : "Add expense"}
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
            <PillSelect
              className="txn-filter-category"
              ariaLabel="Category"
              value={filterCategory}
              onChange={setFilterCategory}
              options={[
                { value: "", label: "All categories" },
                ...categories.map((c) => ({
                  value: String(c.id),
                  label: c.name,
                  swatch: c.color,
                })),
              ]}
            />
            <PillSelect
              ariaLabel="Currency"
              value={filterCurrency}
              onChange={setFilterCurrency}
              options={[
                { value: "", label: "All" },
                ...currencies.map((c) => ({
                  value: c.code,
                  label: c.code,
                })),
              ]}
            />
          </div>
        </div>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : items.length === 0 ? (
          <EmptyState title="No transactions this month" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Goal</th>
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
                  <td className="muted">
                    {txn.goal_id ? goalNameById.get(txn.goal_id) ?? "—" : "—"}
                  </td>
                  <td className="muted">{txn.note ?? "—"}</td>
                  <td className={`num ${txn.type}`}>
                    {txn.type === "expense" ? "−" : "+"}
                    <Money cents={txn.amount} currency={txn.currency_code} />
                  </td>
                  <td className="actions">
                    <IconButton label="Edit" edit onClick={() => startEdit(txn)}>
                      <IconPencil className="btn-icon" />
                    </IconButton>
                    <IconButton
                      label="Delete"
                      danger
                      onClick={() => void onDelete(txn.id)}
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
