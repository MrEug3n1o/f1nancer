import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import logoMark from "../assets/logo-mark-light.png";
import { useApp } from "../context";
import { formatMonthLabel, shiftMonth } from "../utils";

const links = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/transactions", label: "Transactions" },
  { to: "/budgets", label: "Budgets" },
  { to: "/goals", label: "Goals" },
  { to: "/subscriptions", label: "Subscriptions" },
  { to: "/settings", label: "Settings" },
];

export function Layout({ children }: { children: ReactNode }) {
  const { month, setMonth } = useApp();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src={logoMark} alt="" width={40} height={40} />
          <span className="brand-name" aria-label="f1nancer">
            f<span className="brand-accent">1</span>nancer
          </span>
        </div>
        <nav className="nav">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="month-nav">
            <button
              type="button"
              className="btn ghost"
              aria-label="Previous month"
              onClick={() => setMonth(shiftMonth(month, -1))}
            >
              ‹
            </button>
            <h1>{formatMonthLabel(month)}</h1>
            <button
              type="button"
              className="btn ghost"
              aria-label="Next month"
              onClick={() => setMonth(shiftMonth(month, 1))}
            >
              ›
            </button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
