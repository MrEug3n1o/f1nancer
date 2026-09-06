import type { LocalExportPayload } from "@f1nancer/domain";
import { ISO_CURRENCY_CATALOG } from "../currencyCatalog";
import { handleGet, handlePatch, handlePost } from "./repo";

function catalogName(code: string): string {
  return ISO_CURRENCY_CATALOG.find((c) => c.code === code)?.name ?? code;
}
export async function fetchLocalExport(): Promise<LocalExportPayload | null> {
  try {
    const res = await fetch("/api/local-export");
    if (!res.ok) return null;
    return (await res.json()) as LocalExportPayload;
  } catch {
    return null;
  }
}

export async function cloudLooksEmpty(): Promise<boolean> {
  const [txns, goals, deposits, credits] = await Promise.all([
    handleGet("/transactions") as Promise<unknown[]>,
    handleGet("/goals") as Promise<unknown[]>,
    handleGet("/deposits") as Promise<unknown[]>,
    handleGet("/credits-debts") as Promise<unknown[]>,
  ]);
  return (
    txns.length === 0 &&
    goals.length === 0 &&
    deposits.length === 0 &&
    credits.length === 0
  );
}

export async function importLocalPayload(payload: LocalExportPayload): Promise<void> {
  const categoryMap = new Map<number, string>();
  const goalMap = new Map<number, string>();
  const creditMap = new Map<number, string>();
  const recurringMap = new Map<number, string>();

  for (const currency of payload.currencies ?? []) {
    const code = String(currency.code || "").toUpperCase();
    if (!code) continue;
    try {
      await handlePost("/currencies", {
        code,
        name: currency.name || catalogName(code),
      });
    } catch {
      /* already enabled */
    }
  }

  if (payload.settings) {
    await handlePatch("/settings", {
      default_currency_code: payload.settings.default_currency_code,
      theme: payload.settings.theme,
      locale: payload.settings.locale || "en-US",
      dashboard_widgets: payload.settings.dashboard_widgets,
      dashboard_widget_views:
        typeof payload.settings.dashboard_widget_views === "string"
          ? JSON.parse(payload.settings.dashboard_widget_views)
          : payload.settings.dashboard_widget_views,
      dashboard_widget_layout:
        typeof payload.settings.dashboard_widget_layout === "string"
          ? JSON.parse(payload.settings.dashboard_widget_layout)
          : payload.settings.dashboard_widget_layout,
    });
  }

  const existingCats = (await handleGet("/categories")) as Array<{
    id: string;
    name: string;
    type: string;
  }>;
  for (const cat of payload.categories ?? []) {
    const found = existingCats.find((c) => c.name === cat.name && c.type === cat.type);
    if (found) {
      categoryMap.set(cat.id, found.id);
      continue;
    }
    const created = (await handlePost("/categories", {
      name: cat.name,
      type: cat.type,
      color: cat.color,
    })) as { id: string };
    categoryMap.set(cat.id, created.id);
    existingCats.push({ id: created.id, name: cat.name, type: cat.type });
  }

  for (const goal of payload.goals ?? []) {
    const oldId = Number(goal.id);
    const created = (await handlePost("/goals", {
      name: goal.name,
      target_amount: goal.target_amount,
      current_amount: 0,
      currency_code: goal.currency_code,
      deadline: goal.deadline,
    })) as { id: string };
    goalMap.set(oldId, created.id);
  }

  for (const rule of payload.recurring_rules ?? []) {
    const oldId = Number(rule.id);
    const categoryId = categoryMap.get(Number(rule.category_id));
    if (!categoryId) continue;
    const created = (await handlePost("/recurring", {
      amount: rule.amount,
      currency_code: rule.currency_code,
      category_id: categoryId,
      type: rule.type,
      cadence: rule.cadence,
      billing_day: rule.billing_day ?? 1,
      next_run_date: rule.next_run_date,
      note: rule.note,
      money_location: rule.money_location ?? "card",
    })) as { id: string };
    recurringMap.set(oldId, created.id);
  }

  for (const item of payload.credit_debts ?? []) {
    const oldId = Number(item.id);
    const created = (await handlePost("/credits-debts", {
      name: item.name,
      direction: item.direction,
      source: item.source,
      principal_cents: item.principal_cents,
      currency_code: item.currency_code,
      start_date: item.start_date,
      due_date: item.due_date,
      annual_rate_bps: item.annual_rate_bps,
      counterparty: item.counterparty,
      note: item.note,
    })) as { id: string };
    creditMap.set(oldId, created.id);
  }

  for (const deposit of payload.deposits ?? []) {
    await handlePost("/deposits", {
      name: deposit.name,
      type: deposit.type,
      principal_cents: deposit.principal_cents,
      currency_code: deposit.currency_code,
      start_date: deposit.start_date,
      end_date: deposit.end_date,
      annual_rate_bps: deposit.annual_rate_bps,
      counterparty: deposit.counterparty,
      note: deposit.note,
      money_location: deposit.money_location ?? "card",
    });
  }

  for (const budget of payload.budgets ?? []) {
    const categoryId = categoryMap.get(Number(budget.category_id));
    if (!categoryId) continue;
    try {
      await handlePost("/budgets", {
        category_id: categoryId,
        limit_cents: budget.limit_cents,
        currency_code: budget.currency_code,
      });
    } catch {
      /* unique constraint */
    }
  }

  for (const txn of payload.transactions ?? []) {
    const categoryId = categoryMap.get(Number(txn.category_id));
    if (!categoryId) continue;
    const recurringId = txn.recurring_id
      ? recurringMap.get(Number(txn.recurring_id))
      : null;
    const goalId = txn.goal_id ? goalMap.get(Number(txn.goal_id)) : null;
    const creditId = txn.credit_debt_id
      ? creditMap.get(Number(txn.credit_debt_id))
      : null;
    try {
      await handlePost("/transactions", {
        amount: txn.amount,
        currency_code: txn.currency_code,
        date: String(txn.date).slice(0, 10),
        type: txn.type,
        category_id: categoryId,
        money_location: txn.money_location ?? "card",
        note: txn.note ?? null,
        goal_id: goalId ?? null,
        credit_debt_id: creditId ?? null,
        recurring_id: recurringId ?? null,
      });
    } catch {
      /* skip invalid historical rows */
    }
  }
}
