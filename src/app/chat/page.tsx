"use client";

import { useRef, useEffect } from "react";
import { ChatInput } from "@/components/chat/chat-input";
import { MessageBubble } from "@/components/chat/message-bubble";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChat } from "@/hooks/use-chat";

export default function ChatPage() {
  const { messages, isLoading, sendMessage } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  return (
    <div className="flex flex-col h-screen">
      <header className="px-8 py-6 border-b border-border bg-card/50">
        <h1 className="text-2xl font-bold tracking-tight">Chat with Bud</h1>
        <p className="text-sm text-muted-foreground">
          Your financial strategist
        </p>
      </header>

      <ScrollArea className="flex-1 px-8 py-4" ref={scrollRef}>
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && !isLoading && (
            <div className="text-center py-20 text-muted-foreground">
              <p className="text-lg font-medium mb-2">What do you need?</p>
              <div className="space-y-1 text-sm">
                <p>&quot;Let&apos;s plan my Houston move&quot;</p>
                <p>&quot;I owe $5,000 to the IRS for 2024&quot;</p>
                <p>&quot;My credit score is 645 from Credit Karma&quot;</p>
                <p>&quot;I have $3,200 on my Chase Visa at 21.99%&quot;</p>
                <p>&quot;What should I focus on this month?&quot;</p>
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
        </div>
      </ScrollArea>

      <div className="border-t border-border bg-card px-8 py-4">
        <div className="max-w-3xl mx-auto">
          <ChatInput onSend={sendMessage} disabled={isLoading} />
        </div>
      </div>
    </div>
  );
}
