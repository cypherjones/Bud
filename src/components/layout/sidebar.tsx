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
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/transactions", icon: ArrowLeftRight, label: "Transactions" },
  { href: "/debts", icon: CreditCard, label: "Debts" },
  { href: "/move-planner", icon: MapPin, label: "Move Planner" },
  { href: "/goals", icon: Target, label: "Goals" },
  { href: "/credit", icon: TrendingUp, label: "Credit" },
];

const bottomItems = [
  { href: "/chat", icon: MessageCircle, label: "Chat" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col items-center w-[72px] min-h-screen bg-card border-r border-border py-6 gap-2">
      {/* Logo */}
      <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center mb-6">
        <span className="text-primary-foreground font-bold text-lg">B</span>
      </div>

      {/* Main nav */}
      <nav className="flex flex-col items-center gap-1 flex-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                "hover:bg-accent",
                isActive && "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
              title={item.label}
            >
              <item.icon className="w-5 h-5" />
            </Link>
          );
        })}
      </nav>

      {/* Bottom nav */}
      <div className="flex flex-col items-center gap-1">
        {bottomItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                "hover:bg-accent",
                isActive && "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
              title={item.label}
            >
              <item.icon className="w-5 h-5" />
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
