"use client";

import { useState, useCallback, useEffect } from "react";
import { apiFetch } from "@/lib/client/api";
import type { Attachment } from "@/components/chat/chat-input";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[]; // data URLs for display
  toolCalls?: unknown[];
};

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load chat history on mount
  useEffect(() => {
    apiFetch("/api/chat")
      .then((res) => res.json())
      .then((data) => {
        if (data.messages) {
          setMessages(
            data.messages.map((m: { id: string; role: string; content: string }) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  const sendMessage = useCallback(
    async (content: string, attachments?: Attachment[]) => {
      setError(null);

      const userMsg: Message = {
        id: Date.now().toString(),
        role: "user",
        content,
        images: attachments?.map((a) => a.dataUrl),
      };

      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setIsLoading(true);

      try {
        // Build the message payload — last 20 messages
        const apiMessages = updatedMessages.slice(-20).map((m) => {
          if (m.images && m.images.length > 0) {
            // Multimodal message with images and/or PDFs
            return {
              role: m.role,
              content: [
                ...m.images.map((dataUrl) => {
                  const [header, base64] = dataUrl.split(",");
                  const mediaType = header.match(/data:(.*?);/)?.[1] || "image/png";
                  if (mediaType === "application/pdf") {
                    return {
                      type: "document" as const,
                      source: {
                        type: "base64" as const,
                        media_type: "application/pdf" as const,
                        data: base64,
                      },
                    };
                  }
                  return {
                    type: "image" as const,
                    source: {
                      type: "base64" as const,
                      media_type: mediaType,
                      data: base64,
                    },
                  };
                }),
                { type: "text" as const, text: m.content },
              ],
            };
          }
          return { role: m.role, content: m.content };
        });

        const res = await apiFetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages }),
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

        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: "Something went wrong. Please try again.",
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
