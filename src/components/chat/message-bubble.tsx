"use client";

import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[];
};

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl px-5 py-3 text-sm leading-relaxed bg-primary text-primary-foreground">
          {message.images && message.images.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-2">
              {message.images.map((src, i) =>
                src.startsWith("data:application/pdf") ? (
                  <div key={i} className="flex items-center gap-1.5 bg-primary-foreground/20 rounded px-2 py-1 text-xs">
                    <span>PDF attached</span>
                  </div>
                ) : (
                  <img key={i} src={src} alt="attachment" className="max-h-40 rounded-lg" />
                )
              )}
            </div>
          )}
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] text-sm leading-relaxed">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            table: ({ children }) => (
              <div className="overflow-x-auto my-3">
                <table className="w-full text-xs border-collapse">{children}</table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="border-b-2 border-border">{children}</thead>
            ),
            th: ({ children }) => (
              <th className="text-left font-semibold px-3 py-1.5 text-muted-foreground">{children}</th>
            ),
            td: ({ children }) => (
              <td className="px-3 py-1.5 border-b border-border/40">{children}</td>
            ),
            tr: ({ children }) => (
              <tr className="hover:bg-accent/30">{children}</tr>
            ),
            h1: ({ children }) => (
              <h1 className="text-lg font-bold mt-4 mb-2">{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-base font-bold mt-3 mb-1.5">{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-sm font-bold mt-2.5 mb-1">{children}</h3>
            ),
            p: ({ children }) => (
              <p className="my-1.5">{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="my-1.5 ml-4 list-disc space-y-0.5">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="my-1.5 ml-4 list-decimal space-y-0.5">{children}</ol>
            ),
            li: ({ children }) => (
              <li className="pl-1">{children}</li>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold">{children}</strong>
            ),
            hr: () => <hr className="my-3 border-border" />,
            code: ({ children, className }) => {
              const isBlock = className?.includes("language-");
              if (isBlock) {
                return (
                  <code className="block bg-muted rounded-lg p-3 my-2 text-xs overflow-x-auto">
                    {children}
                  </code>
                );
              }
              return (
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                  {children}
                </code>
              );
            },
          }}
        >
          {message.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
