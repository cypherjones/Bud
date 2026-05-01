"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  CreditCard,
  MapPin,
  Target,
  MessageCircle,
  Settings,
  TrendingUp,
  PiggyBank,
  FileBarChart,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/budget", icon: PiggyBank, label: "Budget" },
  { href: "/transactions", icon: ArrowLeftRight, label: "Transactions" },
  { href: "/reports", icon: FileBarChart, label: "Reports" },
  { href: "/schedule", icon: CalendarDays, label: "Schedule" },
  { href: "/debts", icon: CreditCard, label: "Debts" },
  { href: "/move-planner", icon: MapPin, label: "Move Planner" },
  { href: "/goals", icon: Target, label: "Savings" },
  { href: "/credit", icon: TrendingUp, label: "Credit" },
];

const bottomItems = [
  { href: "/chat", icon: MessageCircle, label: "Chat" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col w-[200px] min-h-screen bg-card border-r border-border py-6 px-3 gap-2">
      {/* Logo */}
      <div className="flex items-center gap-2 px-2 mb-6">
        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-base">B</span>
        </div>
        <span className="font-semibold text-lg tracking-tight">Bud</span>
      </div>

      {/* Main nav */}
      <nav className="flex flex-col gap-0.5 flex-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                "hover:bg-accent",
                isActive
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "text-muted-foreground"
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom nav */}
      <div className="flex flex-col gap-0.5">
        {bottomItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                "hover:bg-accent",
                isActive
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "text-muted-foreground"
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
