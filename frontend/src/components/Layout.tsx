import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import logoMark from "../assets/logo-mark-light.png";
import { useApp } from "../context";
import { formatMonthLabel, shiftMonth } from "../utils";
import {
  IconChevronLeft,
  IconChevronRight,
  IconDeposit,
  IconGear,
  IconHome,
  IconList,
  IconRefresh,
  IconScale,
  IconTarget,
  IconWallet,
} from "./NavIcons";

const SIDEBAR_COLLAPSED_KEY = "f1nancer.sidebarCollapsed";

const LIST_COMPOSER_ROUTES = new Set([
  "/transactions",
  "/budgets",
  "/goals",
  "/bank",
  "/credits-debts",
  "/subscriptions",
]);

const links: {
  to: string;
  label: string;
  end?: boolean;
  icon: ComponentType<{ className?: string }>;
}[] = [
  { to: "/", label: "Dashboard", end: true, icon: IconHome },
  { to: "/transactions", label: "Transactions", icon: IconList },
  { to: "/budgets", label: "Budgets", icon: IconWallet },
  { to: "/goals", label: "Goals", icon: IconTarget },
  { to: "/bank", label: "Bank", icon: IconDeposit },
  { to: "/credits-debts", label: "Debts", icon: IconScale },
  { to: "/subscriptions", label: "Subscriptions", icon: IconRefresh },
  { to: "/settings", label: "Settings", icon: IconGear },
];

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isDashboard = location.pathname === "/";
  const isListComposerPage = LIST_COMPOSER_ROUTES.has(location.pathname);
  const {
    month,
    setMonth,
    locale,
    dashboardCustomizing,
    setDashboardCustomizing,
    dashboardCustomizeSession,
    pageComposerSession,
    registerPageComposer,
  } = useApp();
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    if (!isDashboard && dashboardCustomizing) {
      dashboardCustomizeSession?.onCancel();
      setDashboardCustomizing(false);
    }
  }, [isDashboard, dashboardCustomizing, dashboardCustomizeSession, setDashboardCustomizing]);

  useEffect(() => {
    if (!isListComposerPage) {
      registerPageComposer(null);
    }
  }, [isListComposerPage, registerPageComposer]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        /* ignore quota / private mode */
      }
      return next;
    });
  }

  return (
    <div className={`shell${collapsed ? " sidebar-collapsed" : ""}`}>
      <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
        <div className="brand">
          <img className="brand-mark" src={logoMark} alt="" width={40} height={40} />
          <span className="brand-name" aria-label="f1nancer">
            f<span className="brand-accent">1</span>nancer
          </span>
        </div>
        <nav className="nav">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                title={link.label}
                aria-label={link.label}
                className={({ isActive }) =>
                  isActive ? "nav-link active" : "nav-link"
                }
              >
                <Icon className="nav-link-icon" />
                <span className="nav-link-label">{link.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <button
          type="button"
          className="sidebar-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={toggleCollapsed}
        >
          {collapsed ? (
            <IconChevronRight className="sidebar-toggle-icon" />
          ) : (
            <IconChevronLeft className="sidebar-toggle-icon" />
          )}
          <span className="nav-link-label">Collapse</span>
        </button>
      </aside>
      <div className="main">
        <header className="topbar">
          {isDashboard ? (
            <div className="month-nav">
              <button
                type="button"
                className="widget-icon-btn"
                aria-label="Previous month"
                onClick={() => setMonth(shiftMonth(month, -1))}
              >
                <IconChevronLeft className="widget-menu-icon" />
              </button>
              <h1>{formatMonthLabel(month, locale || undefined)}</h1>
              <button
                type="button"
                className="widget-icon-btn"
                aria-label="Next month"
                onClick={() => setMonth(shiftMonth(month, 1))}
              >
                <IconChevronRight className="widget-menu-icon" />
              </button>
            </div>
          ) : (
            <div />
          )}
          {isDashboard ? (
            dashboardCustomizing ? (
              <div className="topbar-actions">
                <button
                  type="button"
                  className="topbar-text-btn"
                  disabled={dashboardCustomizeSession?.saving}
                  onClick={() => {
                    dashboardCustomizeSession?.onCancel();
                    setDashboardCustomizing(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="topbar-text-btn accent"
                  disabled={dashboardCustomizeSession?.saving}
                  onClick={() => {
                    void (async () => {
                      try {
                        await dashboardCustomizeSession?.onDone();
                        setDashboardCustomizing(false);
                      } catch {
                        /* stay in customize; page shows the error */
                      }
                    })();
                  }}
                >
                  {dashboardCustomizeSession?.saving ? "Saving…" : "Done"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="topbar-text-btn"
                onClick={() => setDashboardCustomizing(true)}
              >
                Customize
              </button>
            )
          ) : isListComposerPage ? (
            pageComposerSession?.active ? (
              <button
                type="button"
                className="topbar-text-btn"
                onClick={() => pageComposerSession.onCancel()}
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                className="topbar-text-btn"
                onClick={() => pageComposerSession?.onAdd()}
              >
                Add
              </button>
            )
          ) : null}
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
