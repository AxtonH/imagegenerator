"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { History, ImagePlus, LayoutDashboard, LogOut } from "lucide-react";
import { clearToken } from "@/lib/api";

const nav = [
  { href: "/generate", label: "Generate", icon: ImagePlus },
  { href: "/history", label: "History", icon: History },
  { href: "/admin", label: "Admin", icon: LayoutDashboard }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand">Prezlab</div>
          <div className="brand-sub">Image generation</div>
        </div>
        <nav className="nav">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <Link className={pathname === item.href ? "nav-item active" : "nav-item"} href={item.href} key={item.href}>
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          className="ghost-button"
          onClick={() => {
            clearToken();
            router.push("/login");
          }}
        >
          <LogOut size={18} />
          Sign out
        </button>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
