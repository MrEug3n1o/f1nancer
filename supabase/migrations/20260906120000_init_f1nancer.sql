-- F1nancer cloud schema: UUID PKs, per-user rows, RLS, PowerSync publication.

create extension if not exists citext;
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username citext not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.currencies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, code)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  color text not null default '#5B8C5A',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  default_currency_code text not null default 'USD',
  theme text not null default 'system',
  locale text not null default 'en-US',
  dashboard_widgets text not null default '["pocket","overview","money_location","spend_by_category","budgets","goals","deposits","credits_debts"]',
  stats_charts text not null default '["trends","spend_by_category","by_currency"]',
  dashboard_widget_views text not null default '{}',
  dashboard_widget_layout text not null default '[{"id":"pocket","span":2,"col":0},{"id":"overview","span":1,"col":0},{"id":"money_location","span":1,"col":1},{"id":"spend_by_category","span":1,"col":0},{"id":"budgets","span":1,"col":1},{"id":"category_table","span":2,"col":0},{"id":"goals","span":2,"col":0},{"id":"deposits","span":2,"col":0},{"id":"credits_debts","span":2,"col":0}]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  target_amount integer not null,
  current_amount integer not null default 0,
  currency_code text not null default 'USD',
  deadline date,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('bank', 'rental')),
  principal_cents integer not null,
  currency_code text not null default 'USD',
  start_date date not null,
  end_date date not null,
  annual_rate_bps integer,
  counterparty text,
  note text,
  status text not null default 'active' check (status in ('active', 'matured', 'returned', 'cancelled')),
  money_location text not null default 'card' check (money_location in ('cash', 'card')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.credit_debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  direction text not null check (direction in ('credit', 'debt')),
  source text not null check (source in ('bank', 'informal')),
  principal_cents integer not null,
  currency_code text not null default 'USD',
  start_date date not null,
  due_date date,
  annual_rate_bps integer,
  counterparty text,
  note text,
  status text not null default 'active' check (status in ('active', 'paid', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null,
  currency_code text not null default 'USD',
  category_id uuid not null references public.categories (id),
  type text not null check (type in ('income', 'expense')),
  cadence text not null check (cadence in ('weekly', 'monthly', 'yearly')),
  billing_day integer not null default 1,
  next_run_date date not null,
  note text,
  active boolean not null default true,
  money_location text not null default 'card' check (money_location in ('cash', 'card')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id),
  limit_cents integer not null,
  currency_code text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, currency_code)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null,
  currency_code text not null default 'USD',
  date date not null,
  type text not null check (type in ('income', 'expense')),
  category_id uuid not null references public.categories (id),
  note text,
  recurring_id uuid references public.recurring_rules (id) on delete set null,
  goal_id uuid references public.goals (id) on delete set null,
  credit_debt_id uuid references public.credit_debts (id) on delete set null,
  money_location text not null default 'card' check (money_location in ('cash', 'card')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.auth_rate_limits (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  attempted_at timestamptz not null default now()
);

create index auth_rate_limits_key_ts on public.auth_rate_limits (key, attempted_at desc);
create index categories_user_id on public.categories (user_id);
create index transactions_user_date on public.transactions (user_id, date desc);
create index transactions_goal on public.transactions (goal_id);
create index transactions_credit_debt on public.transactions (credit_debt_id);
create index budgets_user_id on public.budgets (user_id);
create index goals_user_id on public.goals (user_id);
create index deposits_user_id on public.deposits (user_id);
create index credit_debts_user_id on public.credit_debts (user_id);
create index recurring_rules_due on public.recurring_rules (active, next_run_date);

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
drop trigger if exists trg_currencies_updated on public.currencies;
create trigger trg_currencies_updated before update on public.currencies
  for each row execute function public.set_updated_at();
drop trigger if exists trg_categories_updated on public.categories;
create trigger trg_categories_updated before update on public.categories
  for each row execute function public.set_updated_at();
drop trigger if exists trg_settings_updated on public.settings;
create trigger trg_settings_updated before update on public.settings
  for each row execute function public.set_updated_at();
drop trigger if exists trg_goals_updated on public.goals;
create trigger trg_goals_updated before update on public.goals
  for each row execute function public.set_updated_at();
drop trigger if exists trg_deposits_updated on public.deposits;
create trigger trg_deposits_updated before update on public.deposits
  for each row execute function public.set_updated_at();
drop trigger if exists trg_credit_debts_updated on public.credit_debts;
create trigger trg_credit_debts_updated before update on public.credit_debts
  for each row execute function public.set_updated_at();
drop trigger if exists trg_recurring_updated on public.recurring_rules;
create trigger trg_recurring_updated before update on public.recurring_rules
  for each row execute function public.set_updated_at();
drop trigger if exists trg_budgets_updated on public.budgets;
create trigger trg_budgets_updated before update on public.budgets
  for each row execute function public.set_updated_at();
drop trigger if exists trg_transactions_updated on public.transactions;
create trigger trg_transactions_updated before update on public.transactions
  for each row execute function public.set_updated_at();

alter table public.profiles replica identity full;
alter table public.currencies replica identity full;
alter table public.categories replica identity full;
alter table public.settings replica identity full;
alter table public.goals replica identity full;
alter table public.deposits replica identity full;
alter table public.credit_debts replica identity full;
alter table public.recurring_rules replica identity full;
alter table public.budgets replica identity full;
alter table public.transactions replica identity full;

alter table public.profiles enable row level security;
alter table public.currencies enable row level security;
alter table public.categories enable row level security;
alter table public.settings enable row level security;
alter table public.goals enable row level security;
alter table public.deposits enable row level security;
alter table public.credit_debts enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.budgets enable row level security;
alter table public.transactions enable row level security;
alter table public.auth_rate_limits enable row level security;

create policy "profiles_own" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "currencies_own" on public.currencies
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "categories_own" on public.categories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "settings_own" on public.settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "goals_own" on public.goals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "deposits_own" on public.deposits
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "credit_debts_own" on public.credit_debts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "recurring_own" on public.recurring_rules
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "budgets_own" on public.budgets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "transactions_own" on public.transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.seed_user_defaults(p_user_id uuid, p_username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (p_user_id, p_username)
  on conflict (id) do nothing;

  insert into public.settings (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  insert into public.currencies (user_id, code, name)
  values (p_user_id, 'USD', 'US Dollar')
  on conflict (user_id, code) do nothing;

  insert into public.categories (user_id, name, type, color)
  select p_user_id, x.name, x.type, x.color
  from (
    values
      ('Salary', 'income', '#2D6A4F'),
      ('Freelance', 'income', '#40916C'),
      ('Other Income', 'income', '#52B788'),
      ('Deposit return', 'income', '#2D6A4F'),
      ('Borrowed', 'income', '#40916C'),
      ('Credit repayment', 'income', '#2D6A4F'),
      ('Groceries', 'expense', '#BC4749'),
      ('Rent', 'expense', '#A4161A'),
      ('Utilities', 'expense', '#E09F3E'),
      ('Transport', 'expense', '#335C81'),
      ('Dining', 'expense', '#C1666B'),
      ('Entertainment', 'expense', '#7B2D8E'),
      ('Health', 'expense', '#1B998B'),
      ('Shopping', 'expense', '#D4A373'),
      ('Goals', 'expense', '#5B8C5A'),
      ('Lent', 'expense', '#335C81'),
      ('Debt payment', 'expense', '#A4161A'),
      ('Other Expense', 'expense', '#495057')
  ) as x(name, type, color)
  where not exists (
    select 1 from public.categories c
    where c.user_id = p_user_id and c.name = x.name and c.type = x.type
  );
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uname text;
begin
  uname := lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  perform public.seed_user_defaults(new.id, uname);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.billing_date_in_month(y integer, m integer, billing_day integer)
returns date
language plpgsql
immutable
as $$
declare
  last_day integer;
begin
  last_day := extract(day from (make_date(y, m, 1) + interval '1 month' - interval '1 day'))::integer;
  return make_date(y, m, least(billing_day, last_day));
end;
$$;

create or replace function public.advance_run_date(current date, cadence text, billing_day integer)
returns date
language plpgsql
immutable
as $$
declare
  nxt date;
begin
  if cadence = 'weekly' then
    return current + 7;
  elsif cadence = 'yearly' then
    return current + interval '1 year';
  else
    nxt := (date_trunc('month', current) + interval '1 month')::date;
    return public.billing_date_in_month(
      extract(year from nxt)::integer,
      extract(month from nxt)::integer,
      billing_day
    );
  end if;
end;
$$;

create or replace function public.process_due_recurring_rules()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  run_date date;
  created integer := 0;
  uid uuid := auth.uid();
begin
  for r in
    select * from public.recurring_rules
    where active is true
      and next_run_date <= current_date
      and (uid is null or user_id = uid)
  loop
    run_date := r.next_run_date;
    while run_date <= current_date loop
      insert into public.transactions (
        user_id, amount, currency_code, date, type, category_id, note,
        recurring_id, money_location
      ) values (
        r.user_id, r.amount, r.currency_code, run_date, r.type, r.category_id, r.note,
        r.id, r.money_location
      );
      created := created + 1;
      run_date := public.advance_run_date(run_date, r.cadence, r.billing_day);
    end loop;
    update public.recurring_rules
      set next_run_date = run_date, updated_at = now()
      where id = r.id;
  end loop;
  return created;
end;
$$;

grant execute on function public.process_due_recurring_rules() to service_role, authenticated;
grant execute on function public.seed_user_defaults(uuid, text) to service_role;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'powersync') then
    execute 'create publication powersync for table public.profiles, public.currencies, public.categories, public.settings, public.goals, public.deposits, public.credit_debts, public.recurring_rules, public.budgets, public.transactions';
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'f1nancer-process-recurring',
      '15 6 * * *',
      'select public.process_due_recurring_rules()'
    );
  end if;
exception when others then
  null;
end $$;
