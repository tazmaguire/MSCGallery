"use client";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

/**
 * Global light/dark toggle. Light is the default. Persists to a cookie (so the
 * server can render the right theme and avoid a flash) and localStorage.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const cur = (document.documentElement.getAttribute("data-theme") as any) || "light";
    setTheme(cur);
  }, []);
  const flip = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    document.cookie = `pr_theme=${next}; path=/; max-age=31536000; samesite=lax`;
    try { localStorage.setItem("pr_theme", next); } catch {}
  };
  return (
    <button onClick={flip} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      className="grid h-8 w-8 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] transition hover:text-[var(--text)]">
      {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  );
}
