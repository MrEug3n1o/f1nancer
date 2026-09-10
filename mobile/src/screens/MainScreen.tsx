import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Alert, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, useColorScheme, View,
} from "react-native";
import type { Cadence, CategoryType, CreditDebt, Deposit, MoneyLocation, ThemeMode } from "@f1nancer/domain";
import { BackupCard } from "./BackupCard";
import { AppUpdateCard } from "./AppUpdateCard";
import { useAuth } from "../sync/AuthProvider";
import {
  addCurrency, completeDeposit, completeGoal, contributeGoal, createBudget, createCategory,
  createCreditDebt, createDeposit, createGoal, createRecurring, createTransaction,
  currentMonth, deleteCategory, deleteRecord, deleteTransaction, dollarsToCents, formatMoney,
  loadMobileData, payCreditDebt, processRecurring, saveSettings, todayISO, toggleRecurring,
  type MobileData,
} from "../data/queries";
import { colors, darkColors, type Palette } from "./theme";

type Tab = "dashboard" | "transactions" | "budgets" | "goals" | "bank" | "debts" | "subscriptions" | "settings" | "more";
type Form = Record<string, string>;

const TITLES: Record<Tab, string> = {
  dashboard: "Dashboard", transactions: "Transactions", budgets: "Budgets", goals: "Goals",
  bank: "Bank", debts: "Debts", subscriptions: "Subscriptions", settings: "Settings", more: "More",
};
const EMPTY: Form = { amount: "", name: "", note: "", date: todayISO(), end: todayISO(), due: "",
  rate: "", target: "", initial: "", currency: "USD", category: "", type: "expense", location: "card",
  cadence: "monthly", billingDay: String(new Date().getDate()), direction: "debt", instrument: "deposit",
  counterparty: "", nextRun: todayISO(), color: "#5B8C5A" };

function shiftMonth(month: string, delta: number) {
  const [year, value] = month.split("-").map(Number); const next = new Date(year, value - 1 + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(month: string) {
  const [year, value] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(year, value - 1, 1));
}

export function MainScreen() {
  const { session, username, signOut, dataRevision, syncInfo } = useAuth();
  const userId = session!.user.id;
  const systemDark = useColorScheme() === "dark";
  const [tab, setTab] = useState<Tab>("dashboard");
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<MobileData | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [composer, setComposer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [payment, setPayment] = useState<{ item: CreditDebt; amount: string } | null>(null);
  const [contribution, setContribution] = useState<{ id: string; currency: string; amount: string } | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryType, setCategoryType] = useState<CategoryType>("expense");
  const [newCurrency, setNewCurrency] = useState("");

  const theme = data?.settings.theme ?? "system";
  const palette = theme === "dark" || (theme === "system" && systemDark) ? darkColors : colors;
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const defaultCurrency = data?.settings.default_currency_code || "USD";

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setError(null);
    try { setData(await loadMobileData(userId, month)); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load your data"); }
  }, [month, userId]);

  useEffect(() => { void load(); }, [load, dataRevision]);
  useEffect(() => {
    if (data && form.currency === "USD" && defaultCurrency !== "USD") setForm((prev) => ({ ...prev, currency: defaultCurrency }));
  }, [data?.settings.id, defaultCurrency]);

  async function run(action: () => Promise<unknown>, success?: string, close = true) {
    setBusy(true); setError(null); setNotice(null);
    try {
      await action(); await load(true);
      if (success) setNotice(success);
      if (close) { setComposer(false); setForm((prev) => ({ ...EMPTY, currency: prev.currency || defaultCurrency })); }
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setBusy(false); }
  }

  function changeTab(next: Tab) {
    setTab(next); setComposer(false); setError(null); setNotice(null);
    setForm((prev) => ({ ...EMPTY, currency: prev.currency || defaultCurrency, instrument: next === "debts" ? "credit" : "deposit" }));
  }
  function update(key: string, value: string) { setForm((prev) => ({ ...prev, [key]: value })); }
  function confirm(label: string, action: () => Promise<unknown>) {
    Alert.alert(label, "This cannot be undone on synced devices.", [
      { text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => void run(action, undefined, false) },
    ]);
  }

  const type = form.type as CategoryType;
  const matchingCategories = data?.categories.filter((item) => item.type === type) ?? [];
  const selectedCategory = matchingCategories.some((item) => item.id === form.category) ? form.category : matchingCategories[0]?.id ?? "";

  const Section = useMemo(() => function Section({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
    return <View style={styles.section}>{title || action ? <View style={styles.sectionHead}>{title ? <Text style={styles.sectionTitle}>{title}</Text> : <View />}{action}</View> : null}{children}</View>;
  }, [styles]);
  const Card = useMemo(() => function Card({ children, tone }: { children: ReactNode; tone?: "accent" | "danger" }) {
    return <View style={[styles.card, tone === "accent" && styles.cardAccent, tone === "danger" && styles.cardDanger]}>{children}</View>;
  }, [styles]);
  function Pill({ label, active, onPress, danger }: { label: string; active?: boolean; onPress: () => void; danger?: boolean }) {
    return <Pressable onPress={onPress} style={({ pressed }) => [styles.pill, active && styles.pillActive, danger && styles.pillDanger, pressed && styles.pressed]}>
      <Text style={[styles.pillText, active && styles.pillTextActive, danger && styles.dangerText]}>{label}</Text>
    </Pressable>;
  }
  const Input = useMemo(() => function Input({ value, onChange, placeholder, numeric, multiline }: { value: string; onChange: (value: string) => void; placeholder: string; numeric?: boolean; multiline?: boolean }) {
    return <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={palette.muted}
      keyboardType={numeric ? "decimal-pad" : "default"} multiline={multiline}
      style={[styles.input, multiline && styles.inputMulti]} />;
  }, [palette.muted, styles]);
  function Choice({ label, value, options, onChange }: { label: string; value: string; options: { id: string; label: string }[]; onChange?: (value: string) => void }) {
    return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
      {options.map((item) => <Pill key={item.id} label={item.label} active={value === item.id} onPress={() => onChange ? onChange(item.id) : update(label === "Category" ? "category" : label.toLowerCase().replace(" ", ""), item.id)} />)}
    </ScrollView></View>;
  }
  function Progress({ value, color = palette.accent }: { value: number; color?: string }) {
    return <View style={styles.progress}><View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }]} /></View>;
  }
  function Empty({ text }: { text: string }) { return <Text style={styles.empty}>{text}</Text>; }
  function DeleteButton({ onPress }: { onPress: () => void }) { return <Pressable onPress={onPress} hitSlop={8}><Text style={styles.delete}>Delete</Text></Pressable>; }
  function Amount({ cents, currency, kind }: { cents: number; currency: string; kind?: CategoryType }) {
    return <Text style={[styles.amount, kind === "income" && styles.income, kind === "expense" && styles.expense]}>{kind === "income" ? "+" : kind === "expense" ? "−" : ""}{formatMoney(cents, currency)}</Text>;
  }

  function Composer() {
    if (!composer || !data) return null;
    if (tab === "transactions") return <Section><Choice label="Type" value={type} options={[{ id: "expense", label: "Expense" }, { id: "income", label: "Income" }]} />
      <View style={styles.twoCol}><Input value={form.amount} onChange={(v) => update("amount", v)} placeholder="Amount" numeric /><Input value={form.currency} onChange={(v) => update("currency", v.toUpperCase())} placeholder="USD" /></View>
      <Input value={form.date} onChange={(v) => update("date", v)} placeholder="YYYY-MM-DD" />
      <Choice label="Location" value={form.location} options={[{ id: "card", label: "Card" }, { id: "cash", label: "Cash" }]} />
      <View style={styles.field}><Text style={styles.fieldLabel}>Category</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>{matchingCategories.map((item) => <Pill key={item.id} label={item.name} active={selectedCategory === item.id} onPress={() => update("category", item.id)} />)}</ScrollView></View>
      <Input value={form.note} onChange={(v) => update("note", v)} placeholder="Note (optional)" />
      <Primary label="Save transaction" onPress={() => run(() => createTransaction(userId, { amount: dollarsToCents(form.amount), currency_code: form.currency, date: form.date, type, category_id: selectedCategory, money_location: form.location as MoneyLocation, note: form.note }), "Transaction saved")} />
    </Section>;
    if (tab === "budgets") return <Section><Input value={form.amount} onChange={(v) => update("amount", v)} placeholder="Monthly limit" numeric />
      <Input value={form.currency} onChange={(v) => update("currency", v.toUpperCase())} placeholder="Currency" />
      <View style={styles.field}><Text style={styles.fieldLabel}>Expense category</Text><View style={styles.wrap}>{data.categories.filter((item) => item.type === "expense").map((item) => <Pill key={item.id} label={item.name} active={(form.category || data.categories.find((c) => c.type === "expense")?.id) === item.id} onPress={() => update("category", item.id)} />)}</View></View>
      <Primary label="Create budget" onPress={() => run(() => createBudget(userId, form.category || data.categories.find((item) => item.type === "expense")?.id || "", dollarsToCents(form.amount), form.currency), "Budget created")} />
    </Section>;
    if (tab === "goals") return <Section><Input value={form.name} onChange={(v) => update("name", v)} placeholder="Goal name" />
      <View style={styles.twoCol}><Input value={form.target} onChange={(v) => update("target", v)} placeholder="Target" numeric /><Input value={form.currency} onChange={(v) => update("currency", v.toUpperCase())} placeholder="Currency" /></View>
      <Input value={form.initial} onChange={(v) => update("initial", v)} placeholder="Already saved (optional)" numeric /><Input value={form.due} onChange={(v) => update("due", v)} placeholder="Deadline YYYY-MM-DD (optional)" />
      <Primary label="Create goal" onPress={() => run(() => createGoal(userId, form.name, dollarsToCents(form.target), form.currency, form.due || undefined, form.initial ? dollarsToCents(form.initial) : 0), "Goal created")} />
    </Section>;
    if (tab === "bank" || tab === "debts") return FinanceComposer();
    if (tab === "subscriptions") return <Section><Choice label="Type" value={type} options={[{ id: "expense", label: "Expense" }, { id: "income", label: "Income" }]} />
      <View style={styles.twoCol}><Input value={form.amount} onChange={(v) => update("amount", v)} placeholder="Amount" numeric /><Input value={form.currency} onChange={(v) => update("currency", v.toUpperCase())} placeholder="Currency" /></View>
      <Choice label="Cadence" value={form.cadence} options={[{ id: "weekly", label: "Weekly" }, { id: "monthly", label: "Monthly" }, { id: "yearly", label: "Yearly" }]} />
      <Input value={form.nextRun} onChange={(v) => update("nextRun", v)} placeholder="Next date YYYY-MM-DD" />
      <View style={styles.field}><Text style={styles.fieldLabel}>Category</Text><View style={styles.wrap}>{matchingCategories.map((item) => <Pill key={item.id} label={item.name} active={selectedCategory === item.id} onPress={() => update("category", item.id)} />)}</View></View>
      <Input value={form.note} onChange={(v) => update("note", v)} placeholder="Name or note" />
      <Primary label="Create subscription" onPress={() => run(() => createRecurring(userId, { amount: dollarsToCents(form.amount), currency: form.currency, categoryId: selectedCategory, type, cadence: form.cadence as Cadence, billingDay: Number(form.billingDay) || 1, nextRun: form.nextRun, note: form.note }), "Subscription created")} />
    </Section>;
    return null;
  }

  function FinanceComposer() {
    const rental = tab === "debts" && form.instrument === "rental";
    const isDeposit = form.instrument === "deposit" || rental;
    return <Section><Choice label="Instrument" value={form.instrument} options={tab === "bank"
      ? [{ id: "deposit", label: "Deposit" }, { id: "credit", label: "Credit" }, { id: "debt", label: "Debt" }]
      : [{ id: "credit", label: "Money lent" }, { id: "debt", label: "Money borrowed" }, { id: "rental", label: "Rental deposit" }]} />
      <Input value={form.name} onChange={(v) => update("name", v)} placeholder={isDeposit ? "Deposit name" : "Credit or debt name"} />
      <View style={styles.twoCol}><Input value={form.amount} onChange={(v) => update("amount", v)} placeholder="Amount" numeric /><Input value={form.currency} onChange={(v) => update("currency", v.toUpperCase())} placeholder="Currency" /></View>
      <Input value={form.date} onChange={(v) => update("date", v)} placeholder="Start YYYY-MM-DD" />
      <Input value={isDeposit ? form.end : form.due} onChange={(v) => update(isDeposit ? "end" : "due", v)} placeholder={`${isDeposit ? "End" : "Due"} YYYY-MM-DD${isDeposit ? "" : " (optional)"}`} />
      <Input value={form.rate} onChange={(v) => update("rate", v)} placeholder="Annual interest % (optional)" numeric />
      <Input value={form.counterparty} onChange={(v) => update("counterparty", v)} placeholder="Bank, person, or landlord (optional)" />
      <Primary label="Save" onPress={() => run(() => isDeposit
        ? createDeposit(userId, { name: form.name, type: rental ? "rental" : "bank", principal: dollarsToCents(form.amount), currency: form.currency, start: form.date, end: form.end, rateBps: form.rate ? Math.round(Number(form.rate) * 100) : null, counterparty: form.counterparty, note: form.note })
        : createCreditDebt(userId, { name: form.name, direction: form.instrument as CreditDebt["direction"], source: tab === "bank" ? "bank" : "informal", principal: dollarsToCents(form.amount), currency: form.currency, start: form.date, due: form.due, rateBps: form.rate ? Math.round(Number(form.rate) * 100) : null, counterparty: form.counterparty, note: form.note }), "Saved")} />
    </Section>;
  }

  function Primary({ label, onPress }: { label: string; onPress: () => void }) {
    return <Pressable disabled={busy} onPress={onPress} style={({ pressed }) => [styles.primary, (busy || pressed) && styles.pressed]}><Text style={styles.primaryText}>{busy ? "Saving…" : label}</Text></Pressable>;
  }

  function Dashboard() {
    if (!data) return null;
    const pocket = data.pocket.currencies;
    const monthly = data.month.currencies;
    return <View style={styles.stack}>
      <Card tone="accent"><Text style={styles.heroLabel}>MY POCKET</Text>{pocket.length ? pocket.map((item) => <View key={item.currency_code} style={styles.heroRow}><Text style={styles.heroValue}>{formatMoney(item.net_cents, item.currency_code)}</Text><Text style={styles.heroCurrency}>{item.currency_code}</Text></View>) : <Text style={styles.heroValue}>No activity yet</Text>}</Card>
      <Section title="This month"><View style={styles.summaryGrid}>{monthly.length ? monthly.map((item) => <View key={item.currency_code} style={styles.summaryBlock}><Text style={styles.summaryLabel}>Income</Text><Text style={[styles.summaryValue, styles.income]}>{formatMoney(item.income_cents, item.currency_code)}</Text><Text style={styles.summaryLabel}>Expenses</Text><Text style={[styles.summaryValue, styles.expense]}>{formatMoney(item.expense_cents, item.currency_code)}</Text><View style={styles.rule} /><Text style={styles.summaryLabel}>Net</Text><Text style={styles.summaryValue}>{formatMoney(item.net_cents, item.currency_code)}</Text></View>) : <Empty text="No activity this month" />}</View></Section>
      <Section title="Spending by category">{data.spending.length ? data.spending.slice(0, 6).map((item) => { const total = data.spending.filter((x) => x.currency_code === item.currency_code).reduce((sum, x) => sum + x.total_cents, 0); return <View key={`${item.category_id}-${item.currency_code}`} style={styles.metric}><View style={styles.between}><Text style={styles.itemTitle}>{item.category_name}</Text><Amount cents={item.total_cents} currency={item.currency_code} /></View><Progress value={total ? item.total_cents / total * 100 : 0} color={item.color} /></View>; }) : <Empty text="Expense categories will appear here" />}</Section>
      <Section title="Goals">{data.goals.filter((g) => g.status === "active").slice(0, 3).map((goal) => <View key={goal.id} style={styles.metric}><View style={styles.between}><Text style={styles.itemTitle}>{goal.name}</Text><Text style={styles.meta}>{goal.progress_pct}%</Text></View><Progress value={goal.progress_pct} /><Text style={styles.meta}>{formatMoney(goal.current_amount, goal.currency_code)} of {formatMoney(goal.target_amount, goal.currency_code)}</Text></View>)}{!data.goals.some((g) => g.status === "active") && <Empty text="Create a goal to track progress" />}</Section>
      <Section title="Recent transactions" action={<Pressable onPress={() => changeTab("transactions")}><Text style={styles.link}>View all</Text></Pressable>}>{data.transactions.slice(0, 5).map(TransactionRow)}{!data.transactions.length && <Empty text="Your latest transactions will appear here" />}</Section>
    </View>;
  }

  function TransactionRow(item: MobileData["transactions"][number]) {
    return <View key={item.id} style={styles.listRow}><View style={[styles.categoryDot, { backgroundColor: item.category?.color || palette.muted }]} /><View style={styles.listMain}><Text style={styles.itemTitle}>{item.note || item.category?.name || "Transaction"}</Text><Text style={styles.meta}>{item.date} · {item.money_location === "cash" ? "Cash" : "Card"}</Text></View><View style={styles.alignEnd}><Amount cents={item.amount} currency={item.currency_code} kind={item.type} />{tab === "transactions" && <DeleteButton onPress={() => confirm("Delete transaction?", () => deleteTransaction(userId, item.id))} />}</View></View>;
  }

  function Transactions() {
    if (!data) return null;
    return <Section>{data.transactions.map(TransactionRow)}{!data.transactions.length && <Empty text="No transactions yet" />}</Section>;
  }
  function Budgets() {
    if (!data) return null;
    return <View style={styles.stack}>{data.budgets.map((item) => { const pct = item.limit_cents ? item.spent_cents / item.limit_cents * 100 : 0; return <Card key={item.id}><View style={styles.between}><View><Text style={styles.itemTitle}>{item.category?.name || "Budget"}</Text><Text style={styles.meta}>{formatMoney(item.spent_cents, item.currency_code)} spent</Text></View><DeleteButton onPress={() => confirm("Delete budget?", () => deleteRecord(userId, "budgets", item.id))} /></View><Progress value={pct} color={pct > 100 ? palette.expense : palette.accent} /><View style={styles.between}><Text style={styles.meta}>{Math.round(pct)}%</Text><Text style={styles.itemTitle}>{formatMoney(item.limit_cents, item.currency_code)}</Text></View></Card>; })}{!data.budgets.length && <Section><Empty text="Set a monthly limit for an expense category" /></Section>}</View>;
  }
  function Goals() {
    if (!data) return null;
    return <View style={styles.stack}>{data.goals.map((goal) => <Card key={goal.id}><View style={styles.between}><View style={styles.listMain}><Text style={styles.itemTitle}>{goal.name}</Text><Text style={styles.meta}>{goal.status}{goal.deadline ? ` · due ${goal.deadline}` : ""}</Text></View><DeleteButton onPress={() => confirm("Delete goal?", () => deleteRecord(userId, "goals", goal.id))} /></View><Text style={styles.cardValue}>{formatMoney(goal.current_amount, goal.currency_code)}</Text><Text style={styles.meta}>of {formatMoney(goal.target_amount, goal.currency_code)}</Text><Progress value={goal.progress_pct} /><View style={styles.actionRow}>{goal.status === "active" && <Pill label="Add money" onPress={() => setContribution({ id: goal.id, currency: goal.currency_code, amount: "" })} />}{goal.status === "active" && <Pill label="Complete" onPress={() => void run(() => completeGoal(userId, goal.id), "Goal completed", false)} />}</View>{contribution?.id === goal.id && <View style={styles.inlineForm}><Input value={contribution.amount} onChange={(amount) => setContribution({ ...contribution, amount })} placeholder="Amount" numeric /><Primary label="Add contribution" onPress={() => run(() => contributeGoal(userId, goal.id, dollarsToCents(contribution.amount), goal.currency_code), "Contribution added", false).then(() => setContribution(null))} /></View>}</Card>)}{!data.goals.length && <Section><Empty text="No goals yet" /></Section>}</View>;
  }

  function FinancialList({ source }: { source: "bank" | "informal" }) {
    if (!data) return null;
    const deposits = data.deposits.filter((item) => source === "bank" ? item.type === "bank" : item.type === "rental");
    const credits = data.creditDebts.filter((item) => item.source === source);
    return <View style={styles.stack}>
      {deposits.map((item) => <Card key={item.id}><View style={styles.between}><View><Text style={styles.itemTitle}>{item.name}</Text><Text style={styles.meta}>{item.type === "bank" ? "Deposit" : "Rental deposit"} · {item.status}</Text></View><DeleteButton onPress={() => confirm("Delete deposit?", () => deleteRecord(userId, "deposits", item.id))} /></View><Text style={styles.cardValue}>{formatMoney(item.current_value_cents, item.currency_code)}</Text><Text style={styles.meta}>{item.days_remaining > 0 ? `${item.days_remaining} days remaining` : "End date reached"}</Text><Progress value={item.term_progress_pct} />{item.status === "active" && <View style={styles.actionRow}><Pill label={item.type === "bank" ? "Mark matured" : "Return deposit"} onPress={() => void run(() => completeDeposit(userId, item), "Deposit completed", false)} /></View>}</Card>)}
      {credits.map((item) => <Card key={item.id} tone={item.direction === "debt" ? "danger" : undefined}><View style={styles.between}><View style={styles.listMain}><Text style={styles.itemTitle}>{item.name}</Text><Text style={styles.meta}>{item.direction === "credit" ? "Money lent" : "Money owed"} · {item.status}</Text></View><DeleteButton onPress={() => confirm("Delete this record?", () => deleteRecord(userId, "credit_debts", item.id))} /></View><Text style={styles.cardValue}>{formatMoney(item.remaining_cents, item.currency_code)}</Text><Text style={styles.meta}>{formatMoney(item.paid_cents, item.currency_code)} repaid</Text><Progress value={item.progress_pct} color={item.direction === "debt" ? palette.expense : palette.accent} />{item.status === "active" && <View style={styles.actionRow}><Pill label="Record payment" onPress={() => setPayment({ item, amount: "" })} /></View>}{payment?.item.id === item.id && <View style={styles.inlineForm}><Input value={payment.amount} onChange={(amount) => setPayment({ ...payment, amount })} placeholder="Payment amount" numeric /><Primary label="Save payment" onPress={() => run(() => payCreditDebt(userId, item, dollarsToCents(payment.amount)), "Payment recorded", false).then(() => setPayment(null))} /></View>}</Card>)}
      {!deposits.length && !credits.length && <Section><Empty text={source === "bank" ? "Add a deposit, bank credit, or bank debt" : "Track money between you and other people"} /></Section>}
    </View>;
  }

  function Subscriptions() {
    if (!data) return null;
    return <View style={styles.stack}><Section><Pressable onPress={() => void run(async () => { const count = await processRecurring(userId); setNotice(count ? `${count} due transaction${count === 1 ? "" : "s"} created` : "Everything is up to date"); }, undefined, false)} style={styles.secondary}><Text style={styles.secondaryText}>Process due subscriptions</Text></Pressable></Section>
      {data.recurring.map((item) => <Card key={item.id}><View style={styles.between}><View style={styles.listMain}><Text style={styles.itemTitle}>{item.note || item.category?.name || "Subscription"}</Text><Text style={styles.meta}>{item.cadence} · next {item.next_run_date}</Text></View><Amount cents={item.amount} currency={item.currency_code} kind={item.type} /></View><View style={styles.actionRow}><Pill label={item.active ? "Pause" : "Resume"} onPress={() => void run(() => toggleRecurring(userId, item.id, !item.active), item.active ? "Paused" : "Resumed", false)} /><DeleteButton onPress={() => confirm("Delete subscription?", () => deleteRecord(userId, "recurring_rules", item.id))} /></View></Card>)}{!data.recurring.length && <Section><Empty text="Recurring income and expenses appear here" /></Section>}</View>;
  }

  function More() {
    const items: { id: Tab; icon: string; label: string; detail: string }[] = [
      { id: "budgets", icon: "▤", label: "Budgets", detail: "Monthly limits" }, { id: "bank", icon: "▥", label: "Bank", detail: "Deposits & loans" },
      { id: "debts", icon: "⇄", label: "Debts", detail: "People & rentals" }, { id: "subscriptions", icon: "↻", label: "Subscriptions", detail: "Recurring money" },
      { id: "settings", icon: "⚙", label: "Settings", detail: "Account & data" },
    ];
    return <View style={styles.menuGrid}>{items.map((item) => <Pressable key={item.id} onPress={() => changeTab(item.id)} style={({ pressed }) => [styles.menuCard, pressed && styles.pressed]}><Text style={styles.menuIcon}>{item.icon}</Text><Text style={styles.menuLabel}>{item.label}</Text><Text style={styles.meta}>{item.detail}</Text></Pressable>)}</View>;
  }

  function Settings() {
    if (!data) return null;
    return <View style={styles.stack}>
      <Section title="Appearance"><Choice label="Theme" value={form.theme || data.settings.theme} options={[{ id: "light", label: "Light" }, { id: "dark", label: "Dark" }, { id: "system", label: "System" }]} /><Primary label="Apply theme" onPress={() => run(() => saveSettings(userId, data.settings, { theme: form.theme as ThemeMode || data.settings.theme }), "Theme updated", false)} /></Section>
      <Section title="Default currency"><View style={styles.wrap}>{[...new Set(["USD", "EUR", "GBP", ...data.currencies.map((item) => item.code)])].map((item) => <Pill key={item} label={item} active={data.settings.default_currency_code === item} onPress={() => void run(() => saveSettings(userId, data.settings, { default_currency_code: item }), "Default currency updated", false)} />)}</View><View style={styles.inlineForm}><Input value={newCurrency} onChange={(v) => setNewCurrency(v.toUpperCase())} placeholder="Add code, e.g. CAD" /><Primary label="Add currency" onPress={() => run(() => addCurrency(userId, newCurrency), "Currency added", false).then(() => setNewCurrency(""))} /></View></Section>
      <Section title="Categories"><Choice label="Type" value={categoryType} onChange={(value) => setCategoryType(value as CategoryType)} options={[{ id: "expense", label: "Expense" }, { id: "income", label: "Income" }]} /><View style={styles.inlineForm}><Input value={categoryName} onChange={setCategoryName} placeholder="Category name" /><Primary label="Add category" onPress={() => run(() => createCategory(userId, categoryName, categoryType, categoryType === "expense" ? "#BC4749" : "#2D6A4F"), "Category added", false).then(() => setCategoryName(""))} /></View>{data.categories.map((item) => <View key={item.id} style={styles.listRow}><View style={[styles.categoryDot, { backgroundColor: item.color }]} /><View style={styles.listMain}><Text style={styles.itemTitle}>{item.name}</Text><Text style={styles.meta}>{item.type}</Text></View><DeleteButton onPress={() => confirm("Delete category?", () => deleteCategory(userId, item.id))} /></View>)}</Section>
      <Section title="Data & sync"><View style={styles.statusRow}><View style={[styles.statusDot, { backgroundColor: syncInfo.connected ? palette.income : palette.expense }]} /><View><Text style={styles.itemTitle}>{syncInfo.connected ? "Cloud connected" : "Offline — local data available"}</Text><Text style={styles.meta}>{syncInfo.pendingUploads} changes waiting to upload</Text></View></View><BackupCard palette={palette} /></Section>
      <AppUpdateCard active={tab === "settings"} palette={palette} />
      <Section title="Account"><Text style={styles.itemTitle}>Signed in as {username}</Text><Pressable onPress={() => void signOut().catch((e) => setError(String(e)))} style={styles.signOut}><Text style={styles.signOutText}>Sign out and keep local data</Text></Pressable></Section>
    </View>;
  }

  const screen = tab === "dashboard" ? Dashboard() : tab === "transactions" ? Transactions() : tab === "budgets" ? Budgets() : tab === "goals" ? Goals() : tab === "bank" ? FinancialList({ source: "bank" }) : tab === "debts" ? FinancialList({ source: "informal" }) : tab === "subscriptions" ? Subscriptions() : tab === "settings" ? Settings() : More();
  const canAdd = ["transactions", "budgets", "goals", "bank", "debts", "subscriptions"].includes(tab);
  const mainTabs: { id: Tab; label: string; icon: string }[] = [
    { id: "dashboard", label: "Dashboard", icon: "⌂" }, { id: "transactions", label: "Transactions", icon: "☷" },
    { id: "goals", label: "Goals", icon: "◎" }, { id: "more", label: "More", icon: "•••" },
  ];

  return <KeyboardAvoidingView style={styles.shell} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <View style={styles.header}><View style={styles.brandRow}><View style={styles.coin}><Text style={styles.coinText}>¢</Text></View><Text style={styles.brand}>f<Text style={styles.brandAccent}>1</Text>nancer</Text></View>
      <View style={styles.titleRow}><View style={styles.listMain}>{(tab === "dashboard" || tab === "budgets") ? <View style={styles.monthRow}><Pressable onPress={() => setMonth(shiftMonth(month, -1))}><Text style={styles.headerAction}>‹</Text></Pressable><Text style={styles.pageTitle}>{monthLabel(month)}</Text><Pressable onPress={() => setMonth(shiftMonth(month, 1))}><Text style={styles.headerAction}>›</Text></Pressable></View> : <Text style={styles.pageTitle}>{TITLES[tab]}</Text>}</View>
        {canAdd && <Pressable onPress={() => setComposer((value) => !value)}><Text style={styles.addText}>{composer ? "Cancel" : "Add"}</Text></Pressable>}</View>
    </View>
    {error && <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => setError(null)}><Text style={styles.errorText}>×</Text></Pressable></View>}
    {notice && <View style={styles.noticeBanner}><Text style={styles.noticeText}>{notice}</Text><Pressable onPress={() => setNotice(null)}><Text style={styles.noticeText}>×</Text></Pressable></View>}
    <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} tintColor={palette.accent} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />}>
      {Composer()}{data ? screen : <View style={styles.loading}><Text style={styles.meta}>Loading your finances…</Text></View>}
    </ScrollView>
    <View style={styles.tabs}>{mainTabs.map((item) => { const active = tab === item.id || (item.id === "more" && !["dashboard", "transactions", "goals"].includes(tab)); return <Pressable key={item.id} onPress={() => changeTab(item.id)} style={styles.tab}><Text style={[styles.tabIcon, active && styles.tabOn]}>{item.icon}</Text><Text style={[styles.tabText, active && styles.tabOn]}>{item.label}</Text></Pressable>; })}</View>
  </KeyboardAvoidingView>;
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    shell: { flex: 1, backgroundColor: c.bg }, scroll: { flex: 1 }, body: { padding: 16, paddingBottom: 32, gap: 14 },
    header: { backgroundColor: c.sidebar, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14, gap: 14 },
    brandRow: { flexDirection: "row", alignItems: "center", gap: 9 }, coin: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" },
    coinText: { color: "#fff", fontWeight: "800", fontSize: 18 }, brand: { color: c.sidebarText, fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 21, fontWeight: "600", letterSpacing: .4 }, brandAccent: { color: c.accentBright },
    titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, pageTitle: { color: c.sidebarText, fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 25, fontWeight: "600" },
    monthRow: { flexDirection: "row", alignItems: "center", gap: 12 }, headerAction: { color: c.sidebarText, fontSize: 32, lineHeight: 32 }, addText: { color: c.accentBright, fontWeight: "700", fontSize: 16, padding: 6 },
    stack: { gap: 14 }, section: { backgroundColor: c.elevated, borderWidth: 1, borderColor: c.line, borderRadius: 15, padding: 16, gap: 13, shadowColor: c.shadow, shadowOpacity: .08, shadowRadius: 15, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
    sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, sectionTitle: { color: c.ink, fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 20, fontWeight: "600" },
    card: { backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: 15, padding: 16, gap: 9 }, cardAccent: { backgroundColor: c.sidebar, borderColor: c.sidebar }, cardDanger: { borderColor: c.dangerSoft, backgroundColor: c.dangerBg },
    heroLabel: { color: c.sidebarMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 }, heroRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }, heroValue: { color: c.sidebarText, fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 31, fontWeight: "600" }, heroCurrency: { color: c.sidebarMuted, fontWeight: "700" },
    summaryGrid: { gap: 14 }, summaryBlock: { gap: 5 }, summaryLabel: { color: c.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: .7 }, summaryValue: { color: c.ink, fontSize: 20, fontWeight: "700" }, rule: { height: 1, backgroundColor: c.line, marginVertical: 5 },
    field: { gap: 7 }, fieldLabel: { color: c.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: .6 }, input: { flex: 1, minHeight: 46, borderWidth: 1, borderColor: c.line, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 10, color: c.ink, backgroundColor: c.input, fontSize: 15 }, inputMulti: { minHeight: 88, textAlignVertical: "top" },
    twoCol: { flexDirection: "row", gap: 9 }, pillRow: { paddingRight: 8, gap: 7 }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, pill: { borderWidth: 1, borderColor: c.line, backgroundColor: c.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }, pillActive: { borderColor: c.accent, backgroundColor: c.accentSoft }, pillDanger: { borderColor: c.dangerSoft, backgroundColor: c.dangerBg }, pillText: { color: c.muted, fontWeight: "600", fontSize: 13 }, pillTextActive: { color: c.accent },
    primary: { backgroundColor: c.accent, borderRadius: 11, minHeight: 47, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" }, primaryText: { color: "#fff", fontSize: 15, fontWeight: "700" }, secondary: { borderWidth: 1, borderColor: c.accent, borderRadius: 11, padding: 13, alignItems: "center" }, secondaryText: { color: c.accent, fontWeight: "700" }, pressed: { opacity: .58 },
    listRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }, listMain: { flex: 1, minWidth: 0 }, itemTitle: { color: c.ink, fontSize: 15, fontWeight: "700" }, meta: { color: c.muted, fontSize: 12, lineHeight: 18 }, amount: { color: c.ink, fontWeight: "700", fontSize: 14 }, income: { color: c.income }, expense: { color: c.expense }, alignEnd: { alignItems: "flex-end", gap: 3 }, categoryDot: { width: 9, height: 9, borderRadius: 5 },
    between: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }, metric: { gap: 7 }, progress: { height: 7, backgroundColor: c.track, borderRadius: 99, overflow: "hidden" }, progressFill: { height: "100%", borderRadius: 99 }, cardValue: { color: c.ink, fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 27, fontWeight: "600" },
    actionRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 3 }, inlineForm: { gap: 9, marginTop: 7 }, link: { color: c.accent, fontWeight: "700" }, delete: { color: c.expense, fontSize: 12, fontWeight: "700", paddingVertical: 3 }, dangerText: { color: c.expense }, empty: { color: c.muted, textAlign: "center", paddingVertical: 18, lineHeight: 20 }, loading: { paddingVertical: 60, alignItems: "center" },
    menuGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 }, menuCard: { width: "48%", minHeight: 132, backgroundColor: c.elevated, borderWidth: 1, borderColor: c.line, borderRadius: 15, padding: 16, justifyContent: "flex-end", gap: 5 }, menuIcon: { color: c.accent, fontSize: 28, fontWeight: "600", marginBottom: 10 }, menuLabel: { color: c.ink, fontSize: 17, fontWeight: "700" },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 10 }, statusDot: { width: 10, height: 10, borderRadius: 5 }, signOut: { borderWidth: 1, borderColor: c.dangerSoft, backgroundColor: c.dangerBg, padding: 13, borderRadius: 11, alignItems: "center" }, signOutText: { color: c.expense, fontWeight: "700" },
    errorBanner: { flexDirection: "row", justifyContent: "space-between", gap: 10, backgroundColor: c.dangerBg, borderBottomWidth: 1, borderBottomColor: c.dangerSoft, paddingHorizontal: 16, paddingVertical: 10 }, errorText: { color: c.expense, fontWeight: "600" }, noticeBanner: { flexDirection: "row", justifyContent: "space-between", gap: 10, backgroundColor: c.accentSoft, paddingHorizontal: 16, paddingVertical: 10 }, noticeText: { color: c.accent, fontWeight: "600" },
    tabs: { flexDirection: "row", backgroundColor: c.sidebar, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.sidebarLine, paddingTop: 5, paddingBottom: Platform.OS === "ios" ? 18 : 7 }, tab: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 50, gap: 1 }, tabIcon: { color: c.sidebarMuted, fontSize: 21, fontWeight: "600" }, tabText: { color: c.sidebarMuted, fontSize: 10, fontWeight: "700" }, tabOn: { color: c.accentBright },
  });
}
