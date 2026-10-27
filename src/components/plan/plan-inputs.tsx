"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import type { LineOwner } from "@/lib/household/calc";

/** Number input with a unit prefix ("$", "%", "#"). Emits 0 for empty. */
export function NumberField({
  id,
  label,
  hint,
  value,
  onChange,
  unit = "$",
  step = 1,
  className,
}: {
  id: string;
  label?: string;
  hint?: React.ReactNode;
  value: number;
  onChange: (n: number) => void;
  unit?: string;
  step?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1 min-w-0", className)}>
      {label && (
        <label htmlFor={id} className="text-xs font-medium text-foreground/80">
          {label}
        </label>
      )}
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {unit}
        </span>
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          value={Number.isFinite(value) ? String(value) : ""}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          className="pl-6 font-mono tabular-nums"
        />
      </div>
      {hint && <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

export const OWNER_LABEL: Record<LineOwner, string> = { his: "His", hers: "Hers", both: "Both" };

export const OWNER_TONE: Record<LineOwner, string> = {
  his: "bg-blue-500/15 text-blue-400",
  hers: "bg-pink-500/15 text-pink-400",
  both: "bg-emerald-500/15 text-emerald-400",
};

export const OWNER_TEXT: Record<LineOwner, string> = {
  his: "text-blue-400",
  hers: "text-pink-400",
  both: "text-emerald-400",
};

/** His / Hers / Both segmented control. */
export function OwnerToggle({ value, onChange }: { value: LineOwner; onChange: (o: LineOwner) => void }) {
  return (
    <span className="inline-flex overflow-hidden rounded-md border border-border">
      {(["his", "hers", "both"] as const).map((o, i) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={cn(
            "px-2 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors",
            i > 0 && "border-l border-border",
            value === o ? OWNER_TONE[o] : "text-muted-foreground hover:text-foreground",
          )}
        >
          {OWNER_LABEL[o]}
        </button>
      ))}
    </span>
  );
}

/**
 * Debounced fire-and-forget saver keyed by string, so typing in several
 * fields at once saves each one independently. Flushes on unmount.
 */
export function useDebouncedSaver(delayMs = 600) {
  const timers = useRef(new Map<string, { t: ReturnType<typeof setTimeout>; fn: () => void }>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const { t, fn } of pending.values()) {
        clearTimeout(t);
        fn();
      }
      pending.clear();
    };
  }, []);

  return useCallback(
    (key: string, fn: () => void) => {
      const existing = timers.current.get(key);
      if (existing) clearTimeout(existing.t);
      const t = setTimeout(() => {
        timers.current.delete(key);
        fn();
      }, delayMs);
      timers.current.set(key, { t, fn });
    },
    [delayMs],
  );
}

export type SaveState = "idle" | "saving" | "error";

/**
 * Save plumbing shared by every plan editor: a debounced scheduler plus a
 * JSON sender that tracks whether anything is still in flight or failed.
 */
export function usePlanSaver() {
  const [state, setState] = useState<SaveState>("idle");
  const inFlight = useRef(0);
  const schedule = useDebouncedSaver();

  const send = useCallback(async (url: string, method: string, body: unknown) => {
    inFlight.current++;
    setState("saving");
    try {
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(String(res.status));
      inFlight.current--;
      if (inFlight.current === 0) setState("idle");
      return res;
    } catch {
      inFlight.current--;
      setState("error");
      return null;
    }
  }, []);

  return { state, send, schedule };
}

export function SaveIndicator({ state }: { state: SaveState }) {
  return (
    <span className="text-xs h-4" aria-live="polite">
      {state === "saving" && <span className="text-muted-foreground">Saving…</span>}
      {state === "error" && <span className="text-red-400">Couldn&apos;t save — check the connection and try again</span>}
    </span>
  );
}
