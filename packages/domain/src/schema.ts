/**
 * Portable PowerSync table definitions. Clients pass their SDK's
 * `column` / `Table` / `Schema` constructors so web and React Native share one map.
 */
export function createAppSchema(ps: {
  column: {
    text: unknown;
    integer: unknown;
    real: unknown;
  };
  Table: new (columns: Record<string, unknown>, options?: { indexes?: Record<string, string[]> }) => unknown;
  Schema: new (tables: any) => unknown;
}): unknown {
  const { column, Table, Schema } = ps;
  const text = column.text;
  const integer = column.integer;

  const profiles = new Table({
    username: text,
    created_at: text,
    updated_at: text,
  });

  const currencies = new Table(
    {
      user_id: text,
      code: text,
      name: text,
      created_at: text,
      updated_at: text,
    },
    { indexes: { user: ["user_id"] } },
  );

  const categories = new Table(
    {
      user_id: text,
      name: text,
      type: text,
      color: text,
      created_at: text,
      updated_at: text,
    },
    { indexes: { user: ["user_id"] } },
  );

  const transactions = new Table(
    {
      user_id: text,
      amount: integer,
      currency_code: text,
      date: text,
      type: text,
      category_id: text,
      note: text,
      recurring_id: text,
      goal_id: text,
      credit_debt_id: text,
      money_location: text,
      created_at: text,
      updated_at: text,
    },
    { indexes: { user: ["user_id"], date: ["date"], category: ["category_id"] } },
  );

  const budgets = new Table(
    {
      user_id: text,
      category_id: text,
      limit_cents: integer,
      currency_code: text,
      created_at: text,
      updated_at: text,
    },
    { indexes: { user: ["user_id"] } },
  );

  const goals = new Table(
    {
      user_id: text,
      name: text,
      target_amount: integer,
      current_amount: integer,
      currency_code: text,
      deadline: text,
      status: text,
      created_at: text,
      updated_at: text,
    },
    { indexes: { user: ["user_id"] } },
  );

  const deposits = new Table(
    {
      user_id: text,
      name: text,
      type: text,
      principal_cents: integer,
      currency_code: text,
      start_date: text,
      end_date: text,
      annual_rate_bps: integer,
      counterparty: text,
      note: text,
      status: text,
      money_location: text,
      created_at: text,
      updated_at: text,
    },
    { indexes: { user: ["user_id"] } },
  );

  const credit_debts = new Table(
    {
      user_id: text,
      name: text,
      direction: text,
      source: text,
      principal_cents: integer,
      currency_code: text,
      start_date: text,
      due_date: text,
      annual_rate_bps: integer,
      counterparty: text,
      note: text,
      status: text,
      created_at: text,
      updated_at: text,
    },
    { indexes: { user: ["user_id"] } },
  );

  const recurring_rules = new Table(
    {
      user_id: text,
      amount: integer,
      currency_code: text,
      category_id: text,
      type: text,
      cadence: text,
      billing_day: integer,
      next_run_date: text,
      note: text,
      active: integer,
      money_location: text,
      created_at: text,
      updated_at: text,
    },
    { indexes: { user: ["user_id"] } },
  );

  const settings = new Table(
    {
      user_id: text,
      default_currency_code: text,
      theme: text,
      locale: text,
      dashboard_widgets: text,
      stats_charts: text,
      dashboard_widget_views: text,
      dashboard_widget_layout: text,
      created_at: text,
      updated_at: text,
    },
    { indexes: { user: ["user_id"] } },
  );

  return new Schema({
    profiles,
    currencies,
    categories,
    transactions,
    budgets,
    goals,
    deposits,
    credit_debts,
    recurring_rules,
    settings,
  });
}
