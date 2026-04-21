"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChatStore } from "@/lib/store/chat";

interface RecallCard {
  id?: string;
  content: string;
  memory_type?: string;
  created_at?: string;
}

const SLASH_COMMANDS = [
  { command: "/recall", description: "Search NOUS memory" },
  { command: "/file", description: "Attach a file" },
  { command: "/personality", description: "Set active personality" },
  { command: "/dispatch", description: "Dispatch a task" },
  { command: "/new", description: "Start new thread" },
  { command: "/boardroom", description: "Open boardroom with topic" },
];

export function HybridComposer({
  onSend,
  onNewThread,
  isSheet = false,
}: {
  onSend: (message: string, opts?: { personality?: string }) => void;
  onNewThread?: () => void;
  isSheet?: boolean;
}) {
  const [value, setValue] = useState("");
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [recallCards, setRecallCards] = useState<RecallCard[]>([]);
  const [personalityBadge, setPersonalityBadge] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activePersonality = useChatStore((s) => s.activePersonality);
  const isStreaming = useChatStore((s) => s.isStreaming);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const lineHeight = 24;
    const maxHeight = lineHeight * 8;
    ta.style.height = Math.min(ta.scrollHeight, maxHeight) + "px";
    ta.style.overflowY = ta.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setValue(v);

    if (v.startsWith("/")) {
      setShowSlashMenu(true);
      setSlashFilter(v.split(" ")[0]);
    } else {
      setShowSlashMenu(false);
      setSlashFilter("");
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // ⌘↵ or Ctrl+↵ to send
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
        return;
      }

      // ⌘⇧↵ to fork
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        // Fork: signal parent to create new thread with context
        if (onNewThread) onNewThread();
        return;
      }

      // Enter for slash commands
      if (e.key === "Enter" && !e.shiftKey && value.startsWith("/")) {
        e.preventDefault();
        executeSlashCommand(value);
        return;
      }
    },
    [value] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming) return;

    onSend(trimmed, {
      personality: personalityBadge || activePersonality || undefined,
    });
    setValue("");
    setAttachments([]);
  }, [value, isStreaming, onSend, personalityBadge, activePersonality]);

  const executeSlashCommand = useCallback(
    async (input: string) => {
      const parts = input.split(" ");
      const cmd = parts[0];
      const args = parts.slice(1).join(" ");

      switch (cmd) {
        case "/recall": {
          if (!args) return;
          try {
            const resp = await fetch(`/api/recall?q=${encodeURIComponent(args)}`);
            const data = await resp.json();
            const memories = (data.memories || []).slice(0, 5);
            setRecallCards(memories);
          } catch {
            setRecallCards([]);
          }
          setValue("");
          break;
        }
        case "/personality": {
          if (!args) return;
          try {
            const resp = await fetch(`/api/recall?q=personality+${encodeURIComponent(args)}`);
            // Just set the personality badge — validation happens on send
            setPersonalityBadge(args.trim());
            useChatStore.getState().setActivePersonality(args.trim());
          } catch {
            // ignore
          }
          setValue("");
          break;
        }
        case "/new": {
          if (onNewThread) onNewThread();
          setValue("");
          break;
        }
        case "/boardroom": {
          if (args) {
            window.location.href = `/boardroom?topic=${encodeURIComponent(args)}`;
          }
          setValue("");
          break;
        }
        case "/dispatch": {
          // For dispatch, we just signal — the dispatch modal is handled by the parent
          // For now, just redirect to a dispatch flow
          if (args) {
            try {
              const resp = await fetch("/api/dispatch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  prompt: args,
                  project: "NOUS_Station",
                  brain_tag: "NST",
                  bible_clause: "NST.19.7",
                  reasoning: "Dispatched from Station UI",
                }),
              });
              const data = await resp.json();
              if (data.dispatch_id) {
                alert(`Dispatched → ${data.dispatch_id.slice(0, 8)}`);
              }
            } catch {
              // ignore
            }
          }
          setValue("");
          break;
        }
        case "/file": {
          const input = document.createElement("input");
          input.type = "file";
          input.onchange = () => {
            if (input.files) {
              setAttachments((prev) => [...prev, ...Array.from(input.files!)]);
            }
          };
          input.click();
          setValue("");
          break;
        }
        default:
          break;
      }

      setShowSlashMenu(false);
    },
    [onNewThread]
  );

  const filteredCommands = SLASH_COMMANDS.filter((c) =>
    c.command.startsWith(slashFilter || "/")
  );

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      setAttachments((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  }, []);

  return (
    <div
      className={`w-full ${isSheet ? "" : "border-t"}`}
      style={{ borderColor: "var(--bg-2)" }}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* Recall cards */}
      {recallCards.length > 0 && (
        <div className="p-3 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-xs" style={{ color: "var(--ink-1)" }}>
              Recall results
            </span>
            <button
              onClick={() => setRecallCards([])}
              className="text-xs hover:opacity-80"
              style={{ color: "var(--accent-teal)" }}
            >
              Dismiss all
            </button>
          </div>
          {recallCards.map((card, i) => (
            <div
              key={i}
              className="breathing rounded-lg p-3 text-sm relative"
              style={{ background: "var(--bg-2)", color: "var(--ink-0)" }}
            >
              <button
                onClick={() => setRecallCards((prev) => prev.filter((_, j) => j !== i))}
                className="absolute top-1 right-2 text-xs hover:opacity-80"
                style={{ color: "var(--ink-1)" }}
              >
                x
              </button>
              {card.memory_type && (
                <span
                  className="inline-block text-xs px-1.5 py-0.5 rounded mb-1 mr-2"
                  style={{ background: "var(--accent-teal-dim)", color: "var(--ink-0)" }}
                >
                  {card.memory_type}
                </span>
              )}
              <p className="line-clamp-3">{card.content}</p>
              {card.created_at && (
                <span className="text-xs mt-1 block" style={{ color: "var(--ink-1)" }}>
                  {new Date(card.created_at).toLocaleDateString()}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Attachments rail */}
      {attachments.length > 0 && (
        <div className="px-3 pt-2 flex gap-2 flex-wrap">
          {attachments.map((file, i) => (
            <div
              key={i}
              className="flex items-center gap-1 text-xs rounded px-2 py-1"
              style={{ background: "var(--bg-2)", color: "var(--ink-0)" }}
            >
              <span>{file.name}</span>
              <span style={{ color: "var(--ink-1)" }}>
                ({(file.size / 1024).toFixed(1)}KB)
              </span>
              <button
                onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                className="ml-1 hover:opacity-80"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Slash menu */}
      {showSlashMenu && (
        <div
          className="mx-3 mb-1 rounded-lg overflow-hidden border"
          style={{ background: "var(--bg-1)", borderColor: "var(--bg-2)" }}
        >
          {filteredCommands.map((cmd) => (
            <button
              key={cmd.command}
              onClick={() => {
                setValue(cmd.command + " ");
                setShowSlashMenu(false);
                textareaRef.current?.focus();
              }}
              className="w-full text-left px-3 py-2 text-sm hover:opacity-80 flex justify-between"
              style={{ color: "var(--ink-0)" }}
            >
              <span style={{ color: "var(--accent-teal)" }}>{cmd.command}</span>
              <span style={{ color: "var(--ink-1)" }}>{cmd.description}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 p-3">
        {/* Paperclip */}
        <button
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.onchange = () => {
              if (input.files) setAttachments((prev) => [...prev, ...Array.from(input.files!)]);
            };
            input.click();
          }}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded hover:opacity-80"
          style={{ color: "var(--ink-1)" }}
          title="Attach file"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M14 8l-6.5 6.5a3.5 3.5 0 01-5-5L9 3a2 2 0 013 3L5.5 12.5a.5.5 0 01-1-1L11 5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/* Personality badge */}
        {(personalityBadge || activePersonality) && (
          <div
            className="shrink-0 text-xs px-2 py-1 rounded-full flex items-center gap-1"
            style={{ background: "var(--bg-2)", color: "var(--ink-0)" }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: "var(--accent-teal)" }}
            />
            {personalityBadge || activePersonality}
            <button
              onClick={() => {
                setPersonalityBadge(null);
                useChatStore.getState().setActivePersonality(null);
              }}
              className="ml-1 hover:opacity-80"
            >
              x
            </button>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Message NOUS... (/ for commands)"
          rows={1}
          className="flex-1 resize-none rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            background: "var(--bg-2)",
            color: "var(--ink-0)",
            maxHeight: "192px",
          }}
        />

        <button
          onClick={handleSend}
          disabled={isStreaming || !value.trim()}
          className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-opacity ${
            !value.trim() ? "breathing" : ""
          }`}
          style={{
            background: "var(--accent-teal)",
            color: "var(--bg-0)",
            opacity: isStreaming || !value.trim() ? 0.5 : 1,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 14l12-6L2 2v5l8 1-8 1v5z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  );
}
