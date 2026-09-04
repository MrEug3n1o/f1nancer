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
  IconTarget,
  IconWallet,
} from "./NavIcons";

const SIDEBAR_COLLAPSED_KEY = "f1nancer.sidebarCollapsed";

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
  { to: "/deposits", label: "Deposits", icon: IconDeposit },
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
  const {
    month,
    setMonth,
    locale,
    dashboardCustomizing,
    setDashboardCustomizing,
  } = useApp();
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    if (!isDashboard) {
      setDashboardCustomizing(false);
    }
  }, [isDashboard, setDashboardCustomizing]);

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
                className="btn ghost"
                aria-label="Previous month"
                onClick={() => setMonth(shiftMonth(month, -1))}
              >
                ‹
              </button>
              <h1>{formatMonthLabel(month, locale || undefined)}</h1>
              <button
                type="button"
                className="btn ghost"
                aria-label="Next month"
                onClick={() => setMonth(shiftMonth(month, 1))}
              >
                ›
              </button>
            </div>
          ) : (
            <div />
          )}
          {isDashboard ? (
            <button
              type="button"
              className="btn ghost"
              onClick={() => setDashboardCustomizing((v) => !v)}
            >
              {dashboardCustomizing ? "Done" : "Customize widgets"}
            </button>
          ) : null}
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
