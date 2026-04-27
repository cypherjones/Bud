"use client";

import { useState, useCallback, useEffect } from "react";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: unknown[];
};

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load chat history on mount
  useEffect(() => {
    fetch("/api/chat")
      .then((res) => res.json())
      .then((data) => {
        if (data.messages) {
          setMessages(
            data.messages.map((m: { id: string; role: string; content: string; tool_calls?: string }) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
            }))
          );
        }
      })
      .catch(() => {
        // Silently fail on history load
      });
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      setError(null);

      const userMsg: Message = {
        id: Date.now().toString(),
        role: "user",
        content,
      };

      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setIsLoading(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: updatedMessages.slice(-20).map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Chat request failed");
        }

        const data = await res.json();

        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.content,
          toolCalls: data.tool_calls,
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong";
        setError(message);

        // Add error as assistant message
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: `Error: ${message}. Make sure your ANTHROPIC_API_KEY is set in .env.local.`,
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages]
  );

  return { messages, isLoading, error, sendMessage };
}
