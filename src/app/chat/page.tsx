"use client";

import { useRef, useEffect } from "react";
import { ChatInput } from "@/components/chat/chat-input";
import { MessageBubble } from "@/components/chat/message-bubble";
import { useChat } from "@/hooks/use-chat";

export default function ChatPage() {
  const { messages, isLoading, sendMessage } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  return (
    <div className="flex flex-col h-full">
      <header className="px-8 py-6 border-b border-border bg-card/50 shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Chat with Bud</h1>
        <p className="text-sm text-muted-foreground">
          Your financial strategist
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && !isLoading && (
            <div className="text-center py-20 text-muted-foreground">
              <p className="text-lg font-medium mb-2">What do you need?</p>
              <div className="space-y-1 text-sm">
                <p>&quot;Where does November stand?&quot;</p>
                <p>&quot;What would close the monthly gap?&quot;</p>
                <p>&quot;My Experian score is 540 today&quot;</p>
                <p>&quot;Which subscriptions should go first?&quot;</p>
                <p>&quot;What should I focus on this week?&quot;</p>
              </div>
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
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-border bg-card px-4 sm:px-8 py-4 shrink-0">
        <div className="max-w-3xl mx-auto">
          <ChatInput onSend={(msg, attachments) => sendMessage(msg, attachments)} disabled={isLoading} />
        </div>
      </div>
    </div>
  );
}
