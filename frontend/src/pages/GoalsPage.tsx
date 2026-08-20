import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { EmptyState, ErrorBanner, Money, ProgressBar } from "../components/ui";
import type { Goal } from "../types";
import { dollarsToCents } from "../utils";

export function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [contributeAmounts, setContributeAmounts] = useState<Record<number, string>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setGoals(await api.get<Goal[]>("/goals"));
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
      await api.post("/goals", {
        name: name.trim(),
        target_amount: dollarsToCents(target),
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
                  <Money cents={g.current_amount} /> of{" "}
                  <Money cents={g.target_amount} /> ({g.progress_pct}%)
                  {g.deadline ? ` · due ${g.deadline}` : ""}
                </p>
                <ProgressBar value={g.current_amount} max={g.target_amount} />
                {g.status === "active" ? (
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
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
