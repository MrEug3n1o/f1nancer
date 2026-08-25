import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../api";
import { ErrorBanner, SegmentedControl, Select } from "../components/ui";
import { useApp } from "../context";
import { ISO_CURRENCY_CATALOG } from "../currencyCatalog";
import type {
  Category,
  CategoryType,
  Settings,
  ThemeMode,
} from "../types";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { normalizeLocale } from "../locales";
import { applyTheme } from "../utils";

export function SettingsPage() {
  const {
    settings,
    currencies,
    refreshSettings,
    refreshCurrencies,
  } = useApp();

  const [theme, setTheme] = useState<ThemeMode>("system");
  const [locale, setLocale] = useState("");
  const [firstDay, setFirstDay] = useState<"monday" | "sunday">("monday");
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [addCode, setAddCode] = useState("");
  const [catalogFilter, setCatalogFilter] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [catName, setCatName] = useState("");
  const [catType, setCatType] = useState<CategoryType>("expense");
  const [catColor, setCatColor] = useState("#5B8C5A");
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setTheme(settings.theme);
    setLocale(normalizeLocale(settings.locale));
    setFirstDay(settings.first_day_of_week);
    setDefaultCurrency(settings.default_currency_code);
  }, [settings]);

  useEffect(() => {
    void api
      .get<Category[]>("/categories")
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  const enabledCodes = useMemo(
    () => new Set(currencies.map((c) => c.code)),
    [currencies],
  );

  const addable = useMemo(() => {
    const q = catalogFilter.trim().toLowerCase();
    return ISO_CURRENCY_CATALOG.filter((c) => {
      if (enabledCodes.has(c.code)) return false;
      if (!q) return true;
      return (
        c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
      );
    }).slice(0, 80);
  }, [enabledCodes, catalogFilter]);

  async function savePrefs(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      const updated = await api.patch<Settings>("/settings", {
        theme,
        locale: normalizeLocale(locale),
        first_day_of_week: firstDay,
        default_currency_code: defaultCurrency,
      });
      applyTheme(updated.theme);
      await refreshSettings();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function addCurrency(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const code = (addCode || "").trim().toUpperCase();
      if (!code) throw new Error("Select a currency to add");
      await api.post("/currencies", { code });
      setAddCode("");
      setCatalogFilter("");
      await refreshCurrencies();
      await refreshSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add currency");
    }
  }

  async function removeCurrency(code: string) {
    if (!confirm(`Remove ${code} from your currency list?`)) return;
    setError(null);
    try {
      await api.delete(`/currencies/${code}`);
      await refreshCurrencies();
      await refreshSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove currency");
    }
  }

  async function saveCategory(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editingCatId) {
        await api.patch(`/categories/${editingCatId}`, {
          name: catName.trim(),
          type: catType,
          color: catColor,
        });
      } else {
        await api.post("/categories", {
          name: catName.trim(),
          type: catType,
          color: catColor,
        });
      }
      setCatName("");
      setCatColor("#5B8C5A");
      setEditingCatId(null);
      setCategories(await api.get<Category[]>("/categories"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Category save failed");
    }
  }

  function startEditCategory(c: Category) {
    setEditingCatId(c.id);
    setCatName(c.name);
    setCatType(c.type);
    setCatColor(c.color);
  }

  async function deleteCategory(id: number) {
    if (!confirm("Delete this category?")) return;
    setError(null);
    try {
      await api.delete(`/categories/${id}`);
      if (editingCatId === id) {
        setEditingCatId(null);
        setCatName("");
      }
      setCategories(await api.get<Category[]>("/categories"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="stack">
      <ErrorBanner message={error} />

      <section className="section">
        <h2>Currencies</h2>
        <p className="muted">
          Enable the currencies you use. Forms only offer this list. You can add
          any ISO currency and remove unused ones.
        </p>
        <ul className="currency-list">
          {currencies.map((c) => (
            <li key={c.code} className="row-between">
              <span>
                <strong>{c.code}</strong> — {c.name}
                {c.code === defaultCurrency ? (
                  <span className="badge">default</span>
                ) : null}
              </span>
              <button
                type="button"
                className="btn ghost small danger-text"
                disabled={currencies.length <= 1 || c.code === defaultCurrency}
                onClick={() => void removeCurrency(c.code)}
                title={
                  c.code === defaultCurrency
                    ? "Change default currency first"
                    : undefined
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <form className="form-grid" onSubmit={addCurrency}>
          <label className="span-2">
            Search catalog
            <input
              value={catalogFilter}
              onChange={(e) => setCatalogFilter(e.target.value)}
              placeholder="Euro, UAH, yen…"
            />
          </label>
          <label className="span-2">
            Add currency
            <Select
              wide
              value={addCode}
              onChange={(e) => setAddCode(e.target.value)}
            >
              <option value="">Select…</option>
              {addable.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
          </label>
          <div className="form-actions">
            <button type="submit" className="btn primary" disabled={!addCode}>
              Add
            </button>
          </div>
        </form>
      </section>

      <section className="section">
        <h2>Preferences</h2>
        <form className="form-grid" onSubmit={savePrefs}>
          <label>
            Default currency
            <Select
              value={defaultCurrency}
              onChange={(e) => setDefaultCurrency(e.target.value)}
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
          </label>
          <label>
            Theme
            <SegmentedControl
              value={theme}
              onChange={(next) => {
                setTheme(next);
                applyTheme(next);
              }}
              options={[
                { value: "system", label: "System" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
          </label>
          <label className="span-2">
            Language
            <LanguageSwitcher value={locale} onChange={setLocale} />
          </label>
          <label>
            First day of week
            <SegmentedControl
              value={firstDay}
              onChange={setFirstDay}
              options={[
                { value: "monday", label: "Monday" },
                { value: "sunday", label: "Sunday" },
              ]}
            />
          </label>

          <div className="form-actions span-2">
            <button type="submit" className="btn primary">
              Save preferences
            </button>
            {saved ? <span className="success-text">Saved</span> : null}
          </div>
        </form>
      </section>

      <section className="section">
        <h2>Categories</h2>
        <form className="form-grid" onSubmit={saveCategory}>
          <label>
            Name
            <input
              required
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="Category name"
            />
          </label>
          <label>
            Type
            <SegmentedControl
              value={catType}
              onChange={setCatType}
              options={[
                { value: "expense", label: "Expense" },
                { value: "income", label: "Income" },
              ]}
            />
          </label>
          <label>
            Color
            <input
              type="color"
              value={catColor}
              onChange={(e) => setCatColor(e.target.value)}
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn primary">
              {editingCatId ? "Update" : "Add category"}
            </button>
            {editingCatId ? (
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setEditingCatId(null);
                  setCatName("");
                  setCatColor("#5B8C5A");
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
        <ul className="category-manage-list">
          {categories.map((c) => (
            <li key={c.id} className="row-between">
              <span>
                <span className="swatch inline" style={{ background: c.color }} />
                {c.name}{" "}
                <span className="muted small">({c.type})</span>
              </span>
              <span className="actions">
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => startEditCategory(c)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn ghost small danger-text"
                  onClick={() => void deleteCategory(c.id)}
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <h2>Data</h2>
        <p className="muted">
          Data stays on this machine in a local SQLite file. Backup by copying
          the F1nancer database from Application Support.
        </p>
      </section>
    </div>
  );
}
