"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  CreditCard,
  NotebookPen,
  Target,
  MessageCircle,
  Settings,
  TrendingUp,
  PiggyBank,
  FileBarChart,
  CalendarDays,
  CalendarClock,
  Landmark,
  Receipt,
  Scissors,
  Smartphone,
  Building2,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon?: LucideIcon; children?: Array<{ href: string; label: string }> };
type Section = { label?: string; items: Item[] };

const sections: Section[] = [
  {
    items: [
      { href: "/", icon: LayoutDashboard, label: "This month" },
      { href: "/next", icon: CalendarClock, label: "Next month" },
    ],
  },
  {
    label: "Our plan",
    items: [
      { href: "/plan", icon: NotebookPen, label: "Overview" },
      {
        href: "/budget",
        icon: PiggyBank,
        label: "Budget",
        children: [
          { href: "/plan/card", label: "April's card" },
          { href: "/plan/futures", label: "Three futures" },
          { href: "/plan/bonus", label: "The bonus" },
          { href: "/plan/cars", label: "The cars" },
          { href: "/plan/open", label: "Still open" },
        ],
      },
    ],
  },
  {
    label: "Business",
    items: [
      { href: "/plan/salon", icon: Scissors, label: "April's salon" },
      { href: "/plan/side-hustles", icon: Smartphone, label: "Side hustles" },
      { href: "/plan/meridian", icon: Building2, label: "Meridian" },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/balances", icon: Landmark, label: "Balances" },
      { href: "/transactions", icon: ArrowLeftRight, label: "Transactions" },
      { href: "/reports", icon: FileBarChart, label: "Reports" },
      { href: "/schedule", icon: CalendarDays, label: "Schedule" },
      { href: "/debts", icon: CreditCard, label: "Debts" },
      { href: "/tax", icon: Receipt, label: "Tax" },
      { href: "/goals", icon: Target, label: "Savings" },
      { href: "/credit", icon: TrendingUp, label: "Credit" },
    ],
  },
];

const bottomItems: Item[] = [
  { href: "/chat", icon: MessageCircle, label: "Chat" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

function NavLink({ item, active, onNavigate }: { item: Item; active: boolean; onNavigate: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {Icon && <Icon className="w-4 h-4 shrink-0" />}
      {item.label}
    </Link>
  );
}

function Nav({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  return (
    <>
      <nav className="flex flex-col gap-4 flex-1">
        {sections.map((section, i) => (
          <div key={section.label ?? i} className="flex flex-col gap-0.5">
            {section.label && (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{section.label}</p>
            )}
            {section.items.map((item) => (
              <div key={item.href}>
                <NavLink item={item} active={pathname === item.href} onNavigate={onNavigate} />
                {item.children && (
                  <div className="ml-5 mt-0.5 mb-1 flex flex-col border-l border-border pl-2">
                    {item.children.map((c) => {
                      const active = pathname === c.href;
                      return (
                        <Link
                          key={c.href}
                          href={c.href}
                          onClick={onNavigate}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "rounded-md px-2 py-1 text-[13px] transition-colors",
                            active ? "bg-accent text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
                          )}
                        >
                          {c.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-0.5 pt-4">
        {bottomItems.map((item) => (
          <NavLink key={item.href} item={item} active={pathname === item.href} onNavigate={onNavigate} />
        ))}
      </div>
    </>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
        <span className="text-primary-foreground font-bold text-sm">B</span>
      </div>
      <span className="font-semibold text-lg tracking-tight">Bud</span>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      {/* Phone: a top bar with a drawer */}
      <div className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border bg-card shrink-0">
        <Logo />
        <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="p-2 -mr-2 text-muted-foreground">
          <Menu className="w-5 h-5" />
        </button>
      </div>
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/50" onClick={close} />
          <aside className="relative flex flex-col w-[260px] max-w-[85vw] h-full bg-card border-r border-border py-4 px-3 overflow-y-auto">
            <div className="flex items-center justify-between px-2 mb-5">
              <Logo />
              <button type="button" onClick={close} aria-label="Close menu" className="p-2 text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <Nav pathname={pathname} onNavigate={close} />
          </aside>
        </div>
      )}

      {/* Desktop */}
      <aside className="hidden md:flex flex-col w-[216px] shrink-0 h-dvh overflow-y-auto bg-card border-r border-border py-6 px-3">
        <div className="px-2 mb-6">
          <Logo />
        </div>
        <Nav pathname={pathname} onNavigate={() => {}} />
      </aside>
    </>
  );
}
