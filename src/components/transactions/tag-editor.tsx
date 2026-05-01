"use client";

import { useState, useRef, useEffect } from "react";
import { apiFetch } from "@/lib/client/api";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

type Tag = {
  id: string;
  name: string;
  color: string;
};

export function TagEditor({
  transactionId,
  tags,
  allTags,
}: {
  transactionId: string;
  tags: Tag[];
  allTags: Tag[];
}) {
  const [open, setOpen] = useState(false);
  const [newTag, setNewTag] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setNewTag("");
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const addTag = async (tagName: string) => {
    await apiFetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId, tagName }),
    });
    setNewTag("");
    setOpen(false);
    router.refresh();
  };

  const removeTag = async (tagId: string) => {
    await apiFetch("/api/tags", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId, tagId }),
    });
    router.refresh();
  };

  const appliedIds = new Set(tags.map((t) => t.id));
  const available = allTags.filter((t) => !appliedIds.has(t.id));
  const filtered = newTag
    ? available.filter((t) => t.name.includes(newTag.toLowerCase()))
    : available;

  return (
    <div className="flex flex-wrap items-center gap-1" ref={ref}>
      {tags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            backgroundColor: `${tag.color}20`,
            color: tag.color,
          }}
        >
          #{tag.name}
          <button
            onClick={() => removeTag(tag.id)}
            className="ml-0.5 hover:opacity-70"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent transition-colors"
        >
          <Plus className="w-3 h-3" />
        </button>
        {open && (
          <div className="absolute z-50 top-full left-0 mt-1 w-44 bg-popover border border-border rounded-lg shadow-lg py-1 max-h-48 overflow-auto">
            <div className="px-2 py-1">
              <input
                ref={inputRef}
                type="text"
                placeholder="Add tag..."
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTag.trim()) addTag(newTag.trim());
                }}
                className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
              />
            </div>
            {filtered.map((tag) => (
              <button
                key={tag.id}
                onClick={() => addTag(tag.name)}
                className="w-full text-left px-3 py-1 text-xs hover:bg-accent transition-colors"
              >
                <span style={{ color: tag.color }}>#{tag.name}</span>
              </button>
            ))}
            {newTag.trim() && !allTags.some((t) => t.name === newTag.toLowerCase().replace(/^#/, "").trim()) && (
              <button
                onClick={() => addTag(newTag.trim())}
                className="w-full text-left px-3 py-1 text-xs hover:bg-accent transition-colors text-muted-foreground"
              >
                Create #{newTag.trim().toLowerCase()}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
