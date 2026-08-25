"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/money", label: "Money" },
  { href: "/products", label: "Products" },
  { href: "/alerts", label: "Alerts" },
  { href: "/audit-log", label: "Audit Log" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/login");
  }

  return (
    <nav className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold tracking-tight">Etsy AI Autopilot</span>
          <div className="flex gap-4 text-sm">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={
                  pathname === link.href ? "font-medium text-accent" : "text-stone-500 hover:text-ink"
                }
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <button onClick={logout} className="text-sm text-stone-500 hover:text-ink">
          Log out
        </button>
      </div>
    </nav>
  );
}
