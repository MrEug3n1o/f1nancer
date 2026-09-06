import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { currentMonth, dollarsToCents, type Category, type CategoryType, type Transaction } from "@f1nancer/domain";
import {
  createCategory,
  createTransaction,
  formatMoney,
  loadDashboard,
  todayISO,
} from "../data/queries";
import { useAuth } from "../sync/AuthProvider";
import { colors } from "./theme";

type Tab = "home" | "txns" | "cats" | "account";

export function MainScreen() {
  const { session, username, signOut } = useAuth();
  const userId = session!.user.id;
  const [tab, setTab] = useState<Tab>("home");
  const [error, setError] = useState<string | null>(null);
  const [pocket, setPocket] = useState<string>("—");
  const [monthNet, setMonthNet] = useState<string>("—");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [type, setType] = useState<CategoryType>("expense");
  const [categoryId, setCategoryId] = useState("");
  const [catName, setCatName] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const month = currentMonth();
      const data = await loadDashboard(userId, month);
      setTransactions(data.transactions);
      setCategories(data.categories);
      const pocketRow = data.pocket.currencies[0];
      const monthRow = data.month.currencies[0];
      setPocket(
        pocketRow
          ? formatMoney(pocketRow.net_cents, pocketRow.currency_code)
          : "No activity yet",
      );
      setMonthNet(
        monthRow
          ? formatMoney(monthRow.net_cents, monthRow.currency_code)
          : "No activity this month",
      );
      const typed = data.categories.filter((c) => c.type === type);
      if (typed.length && !typed.some((c) => c.id === categoryId)) {
        setCategoryId(typed[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [type, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addTransaction() {
    try {
      if (!categoryId) throw new Error("Add a category first");
      await createTransaction(userId, {
        amount: dollarsToCents(amount),
        currency_code: "USD",
        date: todayISO(),
        type,
        category_id: categoryId,
        money_location: "card",
        note: note.trim() || null,
      });
      setAmount("");
      setNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  }

  async function addCategory() {
    try {
      await createCategory(userId, catName, type, type === "income" ? "#2D6A4F" : "#BC4749");
      setCatName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  }

  const typedCats = categories.filter((c) => c.type === type);

  return (
    <View style={styles.shell}>
      <Text style={styles.brand}>F1nancer</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <ScrollView contentContainerStyle={styles.body}>
        {tab === "home" ? (
          <View style={styles.stack}>
            <View style={styles.card}>
              <Text style={styles.label}>My pocket</Text>
              <Text style={styles.hero}>{pocket}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.label}>This month</Text>
              <Text style={styles.hero}>{monthNet}</Text>
            </View>
            <Text style={styles.muted}>
              Airplane mode works. Come back online and this device syncs with desktop.
            </Text>
          </View>
        ) : null}
        {tab === "txns" ? (
          <View style={styles.stack}>
            <View style={styles.row}>
              <Pressable
                style={[styles.chip, type === "expense" && styles.chipOn]}
                onPress={() => setType("expense")}
              >
                <Text style={styles.chipText}>Expense</Text>
              </Pressable>
              <Pressable
                style={[styles.chip, type === "income" && styles.chipOn]}
                onPress={() => setType("income")}
              >
                <Text style={styles.chipText}>Income</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              placeholder="Amount"
              value={amount}
              onChangeText={setAmount}
            />
            <TextInput
              style={styles.input}
              placeholder="Note"
              value={note}
              onChangeText={setNote}
            />
            <ScrollView horizontal>
              {typedCats.map((c) => (
                <Pressable
                  key={c.id}
                  style={[styles.chip, categoryId === c.id && styles.chipOn]}
                  onPress={() => setCategoryId(c.id)}
                >
                  <Text style={styles.chipText}>{c.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.button} onPress={() => void addTransaction()}>
              <Text style={styles.buttonText}>Add transaction</Text>
            </Pressable>
            {transactions.slice(0, 30).map((t) => (
              <View key={t.id} style={styles.rowItem}>
                <Text style={styles.ink}>
                  {t.date} · {categories.find((c) => c.id === t.category_id)?.name ?? "—"}
                </Text>
                <Text style={{ color: t.type === "income" ? colors.income : colors.expense }}>
                  {t.type === "income" ? "+" : "−"}
                  {formatMoney(t.amount, t.currency_code)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {tab === "cats" ? (
          <View style={styles.stack}>
            <View style={styles.row}>
              <Pressable
                style={[styles.chip, type === "expense" && styles.chipOn]}
                onPress={() => setType("expense")}
              >
                <Text style={styles.chipText}>Expense</Text>
              </Pressable>
              <Pressable
                style={[styles.chip, type === "income" && styles.chipOn]}
                onPress={() => setType("income")}
              >
                <Text style={styles.chipText}>Income</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Category name"
              value={catName}
              onChangeText={setCatName}
            />
            <Pressable style={styles.button} onPress={() => void addCategory()}>
              <Text style={styles.buttonText}>Add category</Text>
            </Pressable>
            {typedCats.map((c) => (
              <Text key={c.id} style={styles.rowItem}>
                {c.name}
              </Text>
            ))}
          </View>
        ) : null}
        {tab === "account" ? (
          <View style={styles.stack}>
            <Text style={styles.ink}>Signed in as {username}</Text>
            <Text style={styles.muted}>
              Last write wins if this phone and desktop edit the same row offline.
            </Text>
            <Pressable style={styles.button} onPress={() => void signOut()}>
              <Text style={styles.buttonText}>Sign out and clear this device</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.tabs}>
        {(["home", "txns", "cats", "account"] as Tab[]).map((id) => (
          <Pressable key={id} style={styles.tab} onPress={() => setTab(id)}>
            <Text style={[styles.tabText, tab === id && styles.tabOn]}>
              {id === "txns" ? "Money" : id[0].toUpperCase() + id.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.bg, paddingTop: 56 },
  brand: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.ink,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  error: { color: colors.danger, paddingHorizontal: 20, marginBottom: 8 },
  body: { padding: 20, paddingBottom: 40, gap: 12 },
  stack: { gap: 12 },
  card: {
    backgroundColor: colors.elevated,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  label: { color: colors.muted, marginBottom: 4 },
  hero: { fontSize: 28, fontWeight: "700", color: colors.ink },
  muted: { color: colors.muted, lineHeight: 20 },
  ink: { color: colors.ink },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    padding: 12,
    backgroundColor: colors.input,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "600" },
  row: { flexDirection: "row", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  chipOn: { backgroundColor: "#dcefe4", borderColor: colors.accent },
  chipText: { color: colors.ink },
  rowItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  tabs: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.elevated,
  },
  tab: { flex: 1, padding: 14, alignItems: "center" },
  tabText: { color: colors.muted, fontWeight: "600" },
  tabOn: { color: colors.accent },
});
