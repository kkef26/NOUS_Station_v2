"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  provider?: string;
  model?: string;
  personality?: string;
  tokens_in?: number;
  tokens_out?: number;
  latency_ms?: number;
  created_at: string;
}

export function ChatMessage({
  message,
  colorAccent = "var(--accent-teal)",
  isStreaming = false,
  onRegenerate,
}: {
  message: Message;
  colorAccent?: string;
  isStreaming?: boolean;
  onRegenerate?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isUser = message.role === "user";

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={`${isUser ? "max-w-[75%]" : "max-w-[85%]"} relative`}
        style={
          isUser
            ? {
                background: "var(--bg-1)",
                color: "var(--ink-0)",
                borderRadius: "12px",
                padding: "10px 14px",
              }
            : {
                color: "var(--ink-0)",
                borderLeft: `2px solid ${colorAccent}`,
                paddingLeft: "12px",
                paddingTop: "4px",
                paddingBottom: "4px",
                ...(isStreaming
                  ? { animation: "streaming-breath 1.2s ease-in-out infinite" }
                  : {}),
              }
        }
      >
        <div className="text-sm prose prose-sm prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {message.content}
          </ReactMarkdown>
        </div>

        {/* Footer on hover */}
        {hovered && !isUser && (
          <div
            className="flex items-center gap-2 mt-2 text-xs"
            style={{ color: "var(--ink-1)" }}
          >
            {message.provider && <span>{message.provider}</span>}
            {message.model && <span>{message.model}</span>}
            {message.tokens_in != null && message.tokens_out != null && (
              <span>
                {message.tokens_in}→{message.tokens_out}
              </span>
            )}
            {message.latency_ms != null && <span>{message.latency_ms}ms</span>}
            <button
              onClick={() => navigator.clipboard.writeText(message.content)}
              className="hover:opacity-80"
              style={{ color: "var(--accent-teal)" }}
            >
              Copy
            </button>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="hover:opacity-80"
                style={{ color: "var(--accent-teal)" }}
              >
                Regenerate
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
