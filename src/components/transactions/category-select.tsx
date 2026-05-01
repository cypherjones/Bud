"use client";

import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/client/api";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

type Category = {
  id: string;
  name: string;
  color: string | null;
  groupId?: string | null;
  groupName?: string | null;
  groupColor?: string | null;
  groupSort?: number | null;
};

export function CategorySelect({
  transactionId,
  currentCategory,
  categories,
}: {
  transactionId: string;
  currentCategory: { name: string | null; color: string | null; icon: string | null };
  categories: Category[];
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
        setNewName("");
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (creating && inputRef.current) inputRef.current.focus();
  }, [creating]);

  const handleSelect = async (categoryId: string) => {
    setSaving(true);
    setOpen(false);
    setCreating(false);
    await apiFetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: transactionId, categoryId }),
    });
    setSaving(false);
    router.refresh();
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);

    const res = await apiFetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
      }),
    });

    if (res.ok) {
      const cat = await res.json();
      await handleSelect(cat.id);
    } else {
      setSaving(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="cursor-pointer"
        disabled={saving}
      >
        {currentCategory.name ? (
          <Badge
            variant="secondary"
            className="text-xs hover:opacity-80 transition-opacity flex items-center gap-1.5"
            style={
              currentCategory.color
                ? {
                    backgroundColor: `${currentCategory.color}15`,
                    color: currentCategory.color,
                    borderColor: `${currentCategory.color}30`,
                  }
                : undefined
            }
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: currentCategory.color ?? "#6b7280" }}
            />
            {saving ? "..." : currentCategory.name}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            {saving ? "..." : "Uncategorized"}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-56 bg-popover border border-border rounded-lg shadow-lg py-1 max-h-72 overflow-auto">
          {(() => {
            // Group categories by parent
            const grouped = new Map<string, { groupName: string; groupColor: string; sort: number; cats: Category[] }>();
            const ungrouped: Category[] = [];

            for (const cat of categories) {
              if (cat.groupName) {
                const key = cat.groupName;
                if (!grouped.has(key)) {
                  grouped.set(key, { groupName: cat.groupName, groupColor: cat.groupColor ?? "#6b7280", sort: cat.groupSort ?? 99, cats: [] });
                }
                grouped.get(key)!.cats.push(cat);
              } else {
                ungrouped.push(cat);
              }
            }

            const sorted = [...grouped.values()].sort((a, b) => a.sort - b.sort);

            return (
              <>
                {sorted.map((group) => (
                  <div key={group.groupName}>
                    <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mt-1">
                      {group.groupName}
                    </div>
                    {group.cats.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => handleSelect(cat.id)}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors flex items-center gap-2 pl-5"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: cat.color ?? group.groupColor }}
                        />
                        <span>{cat.name}</span>
                      </button>
                    ))}
                  </div>
                ))}
                {ungrouped.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => handleSelect(cat.id)}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors flex items-center gap-2"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: cat.color ?? "#6b7280" }}
                    />
                    <span>{cat.name}</span>
                  </button>
                ))}
              </>
            );
          })()}

          <div className="border-t border-border mt-1 pt-1">
            {!creating ? (
              <button
                onClick={() => setCreating(true)}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors flex items-center gap-2 text-muted-foreground"
              >
                <Plus className="w-3.5 h-3.5" />
                New category
              </button>
            ) : (
              <div className="px-3 py-2 space-y-2">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Category name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
                />
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || saving}
                  className="w-full rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? "Creating..." : "Create & assign"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
