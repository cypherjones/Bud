"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Copy, Download, Share } from "lucide-react";

/**
 * Hand the budget to Apple Notes. On an iPhone or a Mac in Safari, "Send to
 * Notes" opens the share sheet (pick Notes). Copy puts rich text with tables
 * on the clipboard for pasting into a note; Download is the plain-text file.
 */
export function NotesExport({ build }: { build: () => { title: string; text: string; html: string } }) {
  const copy = async () => {
    const { text, html } = build();
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
    } catch {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        toast.error("Couldn't reach the clipboard — use Download instead");
        return;
      }
    }
    toast.success("Copied — paste it into a note");
  };

  const share = async () => {
    const { title, text } = build();
    if (typeof navigator.share !== "function") return copy();
    try {
      await navigator.share({ title, text });
    } catch (e) {
      if ((e as Error).name !== "AbortError") await copy();
    }
  };

  const download = () => {
    const { title, text } = build();
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^\w ]+/g, "").replace(/\s+/g, " ").trim()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button size="sm" className="h-8 text-xs" onClick={share}>
        <Share className="w-3.5 h-3.5 mr-1" /> Send to Notes
      </Button>
      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={copy} aria-label="Copy the budget">
        <Copy className="w-3.5 h-3.5" />
      </Button>
      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={download} aria-label="Download the budget as text">
        <Download className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
