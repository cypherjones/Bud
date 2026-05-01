"use client";

import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, ImagePlus, X, FileText } from "lucide-react";

export type Attachment = {
  name: string;
  type: string;
  dataUrl: string; // base64 data URL
};

export function ChatInput({
  onSend,
  disabled,
}: {
  onSend: (message: string, attachments?: Attachment[]) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0) || disabled) return;
    onSend(trimmed || "What's in this image?", attachments.length > 0 ? attachments : undefined);
    setValue("");
    setAttachments([]);
    inputRef.current?.focus();
  };

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/") && file.type !== "application/pdf") return;
      const reader = new FileReader();
      reader.onload = () => {
        setAttachments((prev) => [
          ...prev,
          { name: file.name, type: file.type, dataUrl: reader.result as string },
        ]);
      };
      reader.readAsDataURL(file);
    });

    // Reset file input
    e.target.value = "";
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {attachments.map((att, i) => (
            <div key={i} className="relative group">
              {att.type === "application/pdf" ? (
                <div className="h-16 px-3 rounded-lg border border-border bg-muted flex items-center gap-2">
                  <FileText className="w-5 h-5 text-red-500" />
                  <span className="text-xs text-muted-foreground max-w-[120px] truncate">{att.name}</span>
                </div>
              ) : (
                <img
                  src={att.dataUrl}
                  alt={att.name}
                  className="h-16 w-auto rounded-lg border border-border object-cover"
                />
              )}
              <button
                onClick={() => removeAttachment(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={handleFiles}
          className="hidden"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          className="shrink-0 text-muted-foreground"
          title="Attach image"
        >
          <ImagePlus className="w-4 h-4" />
        </Button>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={attachments.length > 0 ? "Add a message about the image..." : "Ask Bud anything..."}
          disabled={disabled}
          className="flex-1"
        />
        <Button
          onClick={handleSubmit}
          disabled={disabled || (!value.trim() && attachments.length === 0)}
          size="icon"
          className="shrink-0"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
