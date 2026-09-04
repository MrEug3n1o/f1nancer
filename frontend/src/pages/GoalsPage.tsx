import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { IconPencil, IconTrash } from "../components/NavIcons";
import { EmptyState, ErrorBanner, IconButton, Money, ProgressBar, Select } from "../components/ui";
import { useApp } from "../context";
import type { Category, Goal, Transaction } from "../types";
import { centsToDollarsInput, dollarsToCents, todayISO } from "../utils";

type TxnDraft = {
  editingId: number | null;
  amount: string;
  date: string;
  category_id: string;
  note: string;
};

function emptyDraft(categoryId = ""): TxnDraft {
  return {
    editingId: null,
    amount: "",
    date: todayISO(),
    category_id: categoryId,
    note: "",
  };
}

export function GoalsPage() {
  const { defaultCurrency, currencies } = useApp();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [currencyCode, setCurrencyCode] = useState(defaultCurrency);
  const [deadline, setDeadline] = useState("");
  const [editingGoalId, setEditingGoalId] = useState<number | null>(null);
  const [txnDrafts, setTxnDrafts] = useState<Record<number, TxnDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!editingGoalId) {
      setCurrencyCode(defaultCurrency);
    }
  }, [defaultCurrency, editingGoalId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [goalRows, categoryRows] = await Promise.all([
        api.get<Goal[]>("/goals"),
        api.get<Category[]>("/categories?type=expense"),
      ]);
      setGoals(goalRows);
      setCategories(categoryRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const defaultExpenseCategoryId =
    categories.find((c) => c.name === "Goals")?.id ?? categories[0]?.id;

  function draftFor(goalId: number): TxnDraft {
    return (
      txnDrafts[goalId] ?? emptyDraft(defaultExpenseCategoryId ? String(defaultExpenseCategoryId) : "")
    );
  }

  function setDraft(goalId: number, patch: Partial<TxnDraft>) {
    setTxnDrafts((m) => {
      const current =
        m[goalId] ??
        emptyDraft(defaultExpenseCategoryId ? String(defaultExpenseCategoryId) : "");
      return { ...m, [goalId]: { ...current, ...patch } };
    });
  }

  function startEditGoal(goal: Goal) {
    setEditingGoalId(goal.id);
    setName(goal.name);
    setTarget(centsToDollarsInput(goal.target_amount));
    setCurrencyCode(goal.currency_code);
    setDeadline(goal.deadline ?? "");
  }

  function resetGoalForm() {
    setEditingGoalId(null);
    setName("");
    setTarget("");
    setCurrencyCode(defaultCurrency);
    setDeadline("");
  }

  async function onSubmitGoal(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        target_amount: dollarsToCents(target),
        currency_code: currencyCode,
        deadline: deadline || null,
      };
      if (editingGoalId) {
        await api.patch(`/goals/${editingGoalId}`, payload);
      } else {
        await api.post("/goals", payload);
      }
      resetGoalForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  function startEditTxn(goal: Goal, txn: Transaction) {
    setDraft(goal.id, {
      editingId: txn.id,
      amount: centsToDollarsInput(txn.amount),
      date: txn.date,
      category_id: String(txn.category_id),
      note: txn.note ?? "",
    });
  }

  function resetTxnForm(goalId: number) {
    setDraft(goalId, emptyDraft(defaultExpenseCategoryId ? String(defaultExpenseCategoryId) : ""));
  }

  async function onSubmitTxn(e: FormEvent, goal: Goal) {
    e.preventDefault();
    setError(null);
    const draft = draftFor(goal.id);
    try {
      const categoryId = Number(draft.category_id);
      if (!categoryId) {
        throw new Error("Select a category");
      }
      if (draft.editingId) {
        await api.patch(`/transactions/${draft.editingId}`, {
          amount: dollarsToCents(draft.amount),
          date: draft.date,
          category_id: categoryId,
          note: draft.note.trim() || null,
          type: "expense",
          currency_code: goal.currency_code,
          goal_id: goal.id,
        });
      } else {
        await api.post(`/goals/${goal.id}/contribute`, {
          amount: dollarsToCents(draft.amount),
          date: draft.date,
          category_id: categoryId,
          note: draft.note.trim() || null,
        });
      }
      resetTxnForm(goal.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function onDeleteTxn(goalId: number, txnId: number) {
    if (!confirm("Delete this transaction?")) return;
    setError(null);
    try {
      await api.delete(`/transactions/${txnId}`);
      if (draftFor(goalId).editingId === txnId) resetTxnForm(goalId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function onComplete(goal: Goal) {
    if (!confirm("Mark this goal complete? Its transactions stay in your history.")) {
      return;
    }
    setError(null);
    try {
      await api.post(`/goals/${goal.id}/complete`, {});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Complete failed");
    }
  }

  async function onDelete(id: number) {
    if (!confirm("Delete this goal? Tagged transactions stay in your history.")) return;
    setError(null);
    try {
      await api.delete(`/goals/${id}`);
      if (editingGoalId === id) resetGoalForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const editingGoal = goals.find((g) => g.id === editingGoalId);
  const currencyLocked = Boolean(editingGoal && (editingGoal.transactions?.length ?? 0) > 0);

  return (
    <div className="stack">
      <ErrorBanner message={error} />
      <section className="section">
        <h2>{editingGoalId ? "Edit savings goal" : "New savings goal"}</h2>
        <form className="form-grid" onSubmit={onSubmitGoal}>
          <label>
            Name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Emergency fund"
            />
          </label>
          <label>
            Target
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="0.00"
            />
          </label>
          <label>
            Currency
            <Select
              required
              value={currencyCode}
              disabled={currencyLocked}
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
            Deadline
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </label>
          <div className="form-actions span-2">
            <button type="submit" className="btn primary">
              {editingGoalId ? "Update goal" : "Create goal"}
            </button>
            {editingGoalId ? (
              <button type="button" className="btn ghost" onClick={resetGoalForm}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="section">
        <h2>Your goals</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : goals.length === 0 ? (
          <EmptyState
            title="No goals yet"
            hint="Create a savings target, then add transactions toward it."
          />
        ) : (
          <ul className="goal-list">
            {goals.map((g) => {
              const draft = draftFor(g.id);
              const txns = g.transactions ?? [];
              return (
                <li key={g.id} className="goal-card">
                  <div className="row-between">
                    <div>
                      <strong>{g.name}</strong>
                      <span className={`badge ${g.status}`}>{g.status}</span>
                    </div>
                    <div className="actions">
                      <IconButton
                        label="Edit"
                        edit
                        onClick={() => startEditGoal(g)}
                      >
                        <IconPencil className="btn-icon" />
                      </IconButton>
                      <IconButton
                        label="Delete"
                        danger
                        onClick={() => void onDelete(g.id)}
                      >
                        <IconTrash className="btn-icon" />
                      </IconButton>
                    </div>
                  </div>
                  <p className="muted">
                    <Money cents={g.current_amount} currency={g.currency_code} /> of{" "}
                    <Money cents={g.target_amount} currency={g.currency_code} /> (
                    {g.progress_pct}%)
                    {g.deadline ? ` · due ${g.deadline}` : ""}
                  </p>
                  <ProgressBar value={g.current_amount} max={g.target_amount} />

                  {txns.length === 0 ? (
                    <p className="muted small goal-txn-empty">No transactions yet.</p>
                  ) : (
                    <table className="table compact">
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
                        {txns.map((txn) => (
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
                            <td className="num expense">
                              −
                              <Money cents={txn.amount} currency={txn.currency_code} />
                            </td>
                            <td className="actions">
                              <IconButton
                                label="Edit"
                                edit
                                onClick={() => startEditTxn(g, txn)}
                              >
                                <IconPencil className="btn-icon" />
                              </IconButton>
                              <IconButton
                                label="Delete"
                                danger
                                onClick={() => void onDeleteTxn(g.id, txn.id)}
                              >
                                <IconTrash className="btn-icon" />
                              </IconButton>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {g.status === "active" || draft.editingId ? (
                    <form
                      className="form-grid goal-txn-form"
                      onSubmit={(e) => void onSubmitTxn(e, g)}
                    >
                      <label>
                        Amount
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          required
                          placeholder="0.00"
                          value={draft.amount}
                          onChange={(e) =>
                            setDraft(g.id, { amount: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Date
                        <input
                          type="date"
                          required
                          value={draft.date}
                          onChange={(e) =>
                            setDraft(g.id, { date: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Category
                        <Select
                          required
                          value={draft.category_id}
                          onChange={(e) =>
                            setDraft(g.id, { category_id: e.target.value })
                          }
                        >
                          <option value="">Select…</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <label>
                        Note
                        <input
                          type="text"
                          value={draft.note}
                          onChange={(e) =>
                            setDraft(g.id, { note: e.target.value })
                          }
                          placeholder="Optional"
                        />
                      </label>
                      <div className="form-actions span-2">
                        <button type="submit" className="btn primary small">
                          {draft.editingId ? "Update" : "Add transaction"}
                        </button>
                        {draft.editingId ? (
                          <button
                            type="button"
                            className="btn ghost small"
                            onClick={() => resetTxnForm(g.id)}
                          >
                            Cancel
                          </button>
                        ) : null}
                        {g.status === "active" ? (
                          <button
                            type="button"
                            className="btn small"
                            onClick={() => void onComplete(g)}
                          >
                            Complete
                          </button>
                        ) : null}
                      </div>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
