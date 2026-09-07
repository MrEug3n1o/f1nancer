-- PostgREST uses the authenticated role. RLS policies alone are not enough
-- when table privileges were revoked from PUBLIC (Supabase default).
grant select, insert, update, delete on table
  public.profiles,
  public.currencies,
  public.categories,
  public.settings,
  public.goals,
  public.deposits,
  public.credit_debts,
  public.recurring_rules,
  public.budgets,
  public.transactions
to authenticated;

grant usage on all sequences in schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
