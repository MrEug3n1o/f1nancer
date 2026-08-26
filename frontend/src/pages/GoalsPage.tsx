import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { EmptyState, ErrorBanner, Money, ProgressBar, Select } from "../components/ui";
import { useApp } from "../context";
import type { Category, Goal } from "../types";
import { dollarsToCents } from "../utils";

export function GoalsPage() {
  const { defaultCurrency, currencies } = useApp();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [currencyCode, setCurrencyCode] = useState(defaultCurrency);
  const [deadline, setDeadline] = useState("");
  const [contributeAmounts, setContributeAmounts] = useState<Record<number, string>>(
    {},
  );
  const [completeCategories, setCompleteCategories] = useState<Record<number, string>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setCurrencyCode(defaultCurrency);
  }, [defaultCurrency]);

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

  const defaultExpenseCategoryId = categories[0]?.id;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/goals", {
        name: name.trim(),
        target_amount: dollarsToCents(target),
        currency_code: currencyCode,
        deadline: deadline || null,
      });
      setName("");
      setTarget("");
      setDeadline("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function onContribute(goalId: number) {
    setError(null);
    try {
      const amount = dollarsToCents(contributeAmounts[goalId] ?? "");
      await api.post(`/goals/${goalId}/contribute`, { amount });
      setContributeAmounts((m) => ({ ...m, [goalId]: "" }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Contribution failed");
    }
  }

  async function onComplete(goal: Goal) {
    if (goal.current_amount <= 0) {
      if (!confirm("Mark this goal complete with no saved balance?")) return;
    } else if (
      !confirm(
        "Mark this goal complete? The saved amount will be recorded as an expense.",
      )
    ) {
      return;
    }
    setError(null);
    try {
      const selected = completeCategories[goal.id];
      const categoryId = selected
        ? Number(selected)
        : categories.find((c) => c.name === "Goals")?.id ?? defaultExpenseCategoryId;
      await api.post(`/goals/${goal.id}/complete`, {
        category_id: categoryId ?? null,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Complete failed");
    }
  }

  async function onDelete(id: number) {
    if (!confirm("Delete this goal?")) return;
    try {
      await api.delete(`/goals/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="stack">
      <ErrorBanner message={error} />
      <section className="section">
        <h2>New savings goal</h2>
        <form className="form-grid" onSubmit={onSubmit}>
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
          <div className="form-actions">
            <button type="submit" className="btn primary">
              Create goal
            </button>
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
            hint="Create a savings target to track progress."
          />
        ) : (
          <ul className="goal-list">
            {goals.map((g) => (
              <li key={g.id} className="goal-card">
                <div className="row-between">
                  <div>
                    <strong>{g.name}</strong>
                    <span className={`badge ${g.status}`}>{g.status}</span>
                  </div>
                  <button
                    type="button"
                    className="btn ghost small danger-text"
                    onClick={() => void onDelete(g.id)}
                  >
                    Delete
                  </button>
                </div>
                <p className="muted">
                  <Money cents={g.current_amount} currency={g.currency_code} /> of{" "}
                  <Money cents={g.target_amount} currency={g.currency_code} /> (
                  {g.progress_pct}%)
                  {g.deadline ? ` · due ${g.deadline}` : ""}
                </p>
                <ProgressBar value={g.current_amount} max={g.target_amount} />
                {g.status === "active" ? (
                  <>
                    <div className="contribute-row">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="Contribute"
                        value={contributeAmounts[g.id] ?? ""}
                        onChange={(e) =>
                          setContributeAmounts((m) => ({
                            ...m,
                            [g.id]: e.target.value,
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="btn primary small"
                        onClick={() => void onContribute(g.id)}
                      >
                        Add
                      </button>
                    </div>
                    <div className="contribute-row">
                      <Select
                        value={
                          completeCategories[g.id] ??
                          String(
                            categories.find((c) => c.name === "Goals")?.id ??
                              defaultExpenseCategoryId ??
                              "",
                          )
                        }
                        onChange={(e) =>
                          setCompleteCategories((m) => ({
                            ...m,
                            [g.id]: e.target.value,
                          }))
                        }
                        aria-label="Expense category for completion"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => void onComplete(g)}
                      >
                        Complete
                      </button>
                    </div>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
