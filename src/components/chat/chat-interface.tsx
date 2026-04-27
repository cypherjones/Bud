"use client";

import { useState, useRef, useEffect } from "react";
import { ChatInput } from "./chat-input";
import { MessageBubble } from "./message-bubble";
import { ChevronUp, ChevronDown, MessageCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChat } from "@/hooks/use-chat";

export function ChatPanel() {
  const [expanded, setExpanded] = useState(false);
  const { messages, isLoading, sendMessage } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async (content: string) => {
    setExpanded(true);
    await sendMessage(content);
  };

  return (
    <div className="border-t border-border bg-card">
      {/* Toggle bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-8 py-3 hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <MessageCircle className="w-4 h-4 text-primary" />
          Chat with Bud
          {messages.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({messages.length} messages)
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {/* Chat content */}
      {expanded && (
        <div className="px-8 pb-4">
          <ScrollArea className="h-80 mb-3" ref={scrollRef}>
            <div className="space-y-3 pr-4">
              {messages.length === 0 && !isLoading && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <p className="font-medium">What do you need?</p>
                  <p className="mt-1">
                    Ask about your spending, debts, Houston move plan, credit
                    score, or taxes.
                  </p>
                </div>
              )}
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {isLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" />
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0.1s]" />
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0.2s]" />
                  </div>
                  Thinking...
                </div>
              )}
            </div>
          </ScrollArea>
          <ChatInput onSend={handleSend} disabled={isLoading} />
        </div>
      )}
    </div>
  );
}
