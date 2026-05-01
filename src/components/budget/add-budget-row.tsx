"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client/api";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

type Category = {
  id: string;
  name: string;
  color: string | null;
  groupName: string | null;
};

export function AddBudgetRow({ unbugdgetedCategories }: { unbugdgetedCategories: Category[] }) {
  const [open, setOpen] = useState(false);
  const [selectedCat, setSelectedCat] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const handleAdd = async () => {
    if (!selectedCat || !amount) return;
    const dollars = parseFloat(amount);
    if (isNaN(dollars) || dollars <= 0) return;

    setSaving(true);
    await apiFetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: selectedCat, amount: dollars }),
    });
    setSaving(false);
    setOpen(false);
    setSelectedCat("");
    setAmount("");
    router.refresh();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2 px-1"
      >
        <Plus className="w-3.5 h-3.5" />
        Add budget
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 py-2 px-1">
      <select
        value={selectedCat}
        onChange={(e) => setSelectedCat(e.target.value)}
        className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-sm"
      >
        <option value="">Select category...</option>
        {unbugdgetedCategories.map((cat) => (
          <option key={cat.id} value={cat.id}>
            {cat.groupName ? `${cat.groupName} → ` : ""}{cat.name}
          </option>
        ))}
      </select>
      <Input
        type="number"
        placeholder="$ amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-28"
        min={0}
        step={50}
      />
      <Button size="sm" onClick={handleAdd} disabled={saving || !selectedCat || !amount}>
        {saving ? "..." : "Add"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}
