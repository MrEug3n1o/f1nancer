import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { api } from "../api";
import { AppUpdatePanel } from "../components/AppUpdatePanel";
import { IconPencil, IconTrash } from "../components/NavIcons";
import { PillSelect } from "../components/PillSelect";
import { ErrorBanner, IconButton, SegmentedControl } from "../components/ui";
import { useApp } from "../context";
import { ISO_CURRENCY_CATALOG, POPULAR_CURRENCY_CODES } from "../currencyCatalog";
import {
  cloudLooksEmpty,
  fetchLocalExport,
  importLocalPayload,
} from "../data/importLocal";
import { useAuth } from "../sync/AuthProvider";
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
  const { username, signOut } = useAuth();
  const [importing, setImporting] = useState(false);
  const [hasLocalExport, setHasLocalExport] = useState(false);

  const [theme, setTheme] = useState<ThemeMode>("system");
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [catalogFilter, setCatalogFilter] = useState("");
  const [addingCode, setAddingCode] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [catName, setCatName] = useState("");
  const [catType, setCatType] = useState<CategoryType>("expense");
  const [catColor, setCatColor] = useState("#5B8C5A");
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currencySearchRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    void fetchLocalExport().then((payload) => {
      setHasLocalExport(
        Boolean(payload?.categories?.length || payload?.transactions?.length),
      );
    });
  }, []);

  const enabledCodes = useMemo(
    () => new Set(currencies.map((c) => c.code)),
    [currencies],
  );

  const catalogQuery = catalogFilter.trim().toLowerCase();

  const addable = useMemo(() => {
    if (catalogQuery) {
      return ISO_CURRENCY_CATALOG.filter((c) => {
        if (enabledCodes.has(c.code)) return false;
        return (
          c.code.toLowerCase().includes(catalogQuery) ||
          c.name.toLowerCase().includes(catalogQuery)
        );
      }).slice(0, 40);
    }

    const byCode = new Map(ISO_CURRENCY_CATALOG.map((c) => [c.code, c]));
    return POPULAR_CURRENCY_CODES.filter((code) => !enabledCodes.has(code))
      .map((code) => byCode.get(code))
      .filter((c): c is { code: string; name: string } => Boolean(c))
      .slice(0, 15);
  }, [enabledCodes, catalogQuery]);

  async function changeTheme(next: ThemeMode) {
    const previous = theme;
    setTheme(next);
    applyTheme(next);
    setError(null);
    try {
      await api.patch<Settings>("/settings", {
        theme: next,
        locale: "en-US",
      });
      await refreshSettings();
    } catch (err) {
      setTheme(previous);
      applyTheme(previous);
      setError(err instanceof Error ? err.message : "Could not update theme");
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

  async function addCurrency(code: string) {
    const next = code.trim().toUpperCase();
    if (!next || addingCode) return;
    setError(null);
    setAddingCode(next);
    try {
      await api.post("/currencies", {
        code: next,
        name: ISO_CURRENCY_CATALOG.find((c) => c.code === next)?.name ?? next,
      });
      setCatalogFilter("");
      await refreshCurrencies();
      await refreshSettings();
      currencySearchRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add currency");
    } finally {
      setAddingCode(null);
    }
  }

  function onCurrencySearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const top = addable[0];
    if (top) void addCurrency(top.code);
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

  async function deleteCategory(id: string) {
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

  async function importLegacyData() {
    setError(null);
    setImporting(true);
    try {
      const payload = await fetchLocalExport();
      if (!payload) throw new Error("No local desktop database found to import");
      if (!(await cloudLooksEmpty())) {
        if (
          !confirm(
            "This account already has data. Import anyway? Duplicates may appear.",
          )
        ) {
          return;
        }
      }
      await importLocalPayload(payload);
      setCategories(await api.get<Category[]>("/categories"));
      await refreshCurrencies();
      await refreshSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="stack">
      <ErrorBanner message={error} />

      <section className="section account-section">
        <div className="account-row">
          <div>
            <h2>Account</h2>
            <p className="muted account-meta">
              Signed in as <strong>{username ?? "unknown"}</strong>
            </p>
          </div>
          <button
            type="button"
            className="btn sign-out"
            onClick={() => {
              if (
                confirm(
                  "Sign out and clear local data on this device? Your cloud account stays intact.",
                )
              ) {
                void signOut();
              }
            }}
          >
            Sign out
          </button>
        </div>
        <p className="muted small account-hint">
          Same username works on desktop and mobile. Signing out wipes this
          device’s local copy; last write wins if both devices edit offline.
        </p>
      </section>

      <section className="section settings-theme-bar">
        <span className="settings-theme-label">Theme</span>
        <SegmentedControl
          compact
          ariaLabel="Theme"
          value={theme}
          onChange={(next) => void changeTheme(next)}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </section>

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
        <div className="currency-add">
          <label className="currency-add-label" htmlFor="currency-search">
            Add currency
          </label>
          <input
            id="currency-search"
            ref={currencySearchRef}
            value={catalogFilter}
            onChange={(e) => setCatalogFilter(e.target.value)}
            onKeyDown={onCurrencySearchKeyDown}
            placeholder="Search by name or code…"
            autoComplete="off"
            spellCheck={false}
          />
          <ul className="currency-picker" role="listbox" aria-label="Currency catalog">
            {addable.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  className="currency-picker-item"
                  role="option"
                  disabled={addingCode === c.code}
                  onClick={() => void addCurrency(c.code)}
                >
                  <span>
                    <strong>{c.code}</strong>
                    <span className="muted"> — {c.name}</span>
                  </span>
                  <span className="currency-picker-action">
                    {addingCode === c.code ? "Adding…" : "Add"}
                  </span>
                </button>
              </li>
            ))}
            {!addable.length ? (
              <li className="currency-picker-empty muted">
                {catalogQuery
                  ? "No matching currencies"
                  : "All catalog currencies are already enabled"}
              </li>
            ) : null}
          </ul>
          {addable.length ? (
            <p className="muted small currency-add-hint">
              {catalogQuery
                ? `${addable.length} match${addable.length === 1 ? "" : "es"} — press Enter to add the first.`
                : "Popular currencies — type a name or code to find others. Press Enter to add the first match."}
            </p>
          ) : null}
        </div>
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
        <h2>Data & sync</h2>
        <p className="muted">
          Finance data lives in a local SQLite database on this device and syncs
          through your F1nancer account when you are online. Signing out wipes
          the local copy on this machine; your cloud account keeps the source of
          truth.
        </p>
        {hasLocalExport ? (
          <div className="form-actions">
            <button
              type="button"
              className="btn"
              disabled={importing}
              onClick={() => void importLegacyData()}
            >
              {importing ? "Importing…" : "Import old local database"}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
