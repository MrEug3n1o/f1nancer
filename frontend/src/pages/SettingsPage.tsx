import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../api";
import { AppUpdatePanel } from "../components/AppUpdatePanel";
import { IconPencil, IconTrash } from "../components/NavIcons";
import { PillSelect } from "../components/PillSelect";
import { ErrorBanner, IconButton, SegmentedControl } from "../components/ui";
import { useApp } from "../context";
import { ISO_CURRENCY_CATALOG } from "../currencyCatalog";
import type {
  Category,
  CategoryType,
  Settings,
  ThemeMode,
} from "../types";
import { applyTheme } from "../utils";

export function SettingsPage() {
  const {
    settings,
    currencies,
    refreshSettings,
    refreshCurrencies,
  } = useApp();

  const [theme, setTheme] = useState<ThemeMode>("system");
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
        locale: "en-US",
      });
      applyTheme(updated.theme);
      await refreshSettings();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function changeDefaultCurrency(code: string) {
    const previous = defaultCurrency;
    setDefaultCurrency(code);
    setError(null);
    try {
      await api.patch<Settings>("/settings", { default_currency_code: code });
      await refreshSettings();
    } catch (err) {
      setDefaultCurrency(previous);
      setError(
        err instanceof Error ? err.message : "Could not update default currency",
      );
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

      <section className="section txn-composer">
        <div className="txn-composer-head">
          <div>
            <h2>Currencies</h2>
            <p className="muted">
              Enable the currencies you use. Forms only offer this list. You can add
              any ISO currency and remove unused ones.
            </p>
          </div>
        </div>
        <div className="txn-form">
          <label>
            Default currency
            <PillSelect
              className="pill-select-field wide"
              align="left"
              ariaLabel="Default currency"
              value={defaultCurrency}
              onChange={(code) => void changeDefaultCurrency(code)}
              options={currencies.map((c) => ({
                value: c.code,
                label: `${c.code} — ${c.name}`,
              }))}
            />
          </label>
        </div>
        <ul className="currency-list">
          {currencies.map((c) => (
            <li key={c.code} className="row-between">
              <span>
                <strong>{c.code}</strong> — {c.name}
                {c.code === defaultCurrency ? (
                  <span className="badge">default</span>
                ) : null}
              </span>
              <IconButton
                label="Remove"
                danger
                disabled={currencies.length <= 1 || c.code === defaultCurrency}
                onClick={() => void removeCurrency(c.code)}
                title={
                  c.code === defaultCurrency
                    ? "Change default currency first"
                    : "Remove"
                }
              >
                <IconTrash className="btn-icon" />
              </IconButton>
            </li>
          ))}
        </ul>
        <form className="txn-form" onSubmit={addCurrency}>
          <label>
            Search catalog
            <input
              value={catalogFilter}
              onChange={(e) => setCatalogFilter(e.target.value)}
              placeholder="Euro, UAH, yen…"
            />
          </label>
          <label>
            Add currency
            <PillSelect
              className="pill-select-field wide"
              align="left"
              ariaLabel="Add currency"
              value={addCode}
              onChange={setAddCode}
              options={[
                {
                  value: "",
                  label: addable.length ? "Select…" : "No matches",
                },
                ...addable.map((c) => ({
                  value: c.code,
                  label: `${c.code} — ${c.name}`,
                })),
              ]}
            />
          </label>
          <div className="form-actions txn-actions">
            <button type="submit" className="btn primary txn-submit" disabled={!addCode}>
              Add
            </button>
          </div>
        </form>
      </section>

      <section className="section txn-composer">
        <div className="txn-composer-head">
          <h2>Preferences</h2>
        </div>
        <form className="txn-form" onSubmit={savePrefs}>
          <div className="txn-goal-field">
            <span>Theme</span>
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
          </div>

          <div className="form-actions txn-actions">
            <button type="submit" className="btn primary txn-submit">
              Save preferences
            </button>
            {saved ? <span className="success-text">Saved</span> : null}
          </div>
        </form>
      </section>

      <section className={`section txn-composer txn-${catType}${editingCatId ? " is-editing" : ""}`}>
        <div className="txn-composer-head">
          <h2>{editingCatId ? "Edit category" : "Categories"}</h2>
          <SegmentedControl
            value={catType}
            onChange={setCatType}
            options={[
              { value: "expense", label: "Expense" },
              { value: "income", label: "Income" },
            ]}
          />
        </div>
        <form className="txn-form" onSubmit={saveCategory}>
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
            Color
            <input
              type="color"
              value={catColor}
              onChange={(e) => setCatColor(e.target.value)}
            />
          </label>
          <div className="form-actions txn-actions">
            <button type="submit" className="btn primary txn-submit">
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
                <IconButton label="Edit" edit onClick={() => startEditCategory(c)}>
                  <IconPencil className="btn-icon" />
                </IconButton>
                <IconButton
                  label="Delete"
                  danger
                  onClick={() => void deleteCategory(c.id)}
                >
                  <IconTrash className="btn-icon" />
                </IconButton>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <AppUpdatePanel onError={setError} />

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
