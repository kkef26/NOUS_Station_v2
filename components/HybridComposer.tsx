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

/* ── List + indent helpers ────────────────────────────────────── */

const INDENT = "  "; // 2-space indent per level

// Matches: optional indent + (number. | letter. | roman. | bullet) + space
const LIST_RE = /^(\s*)((\d+)\.|([a-z])\.|([ivxlcdm]+)\.|([*\-+]))\s/i;

function getLineAt(text: string, pos: number) {
  const before = text.slice(0, pos);
  const lineStart = before.lastIndexOf("\n") + 1;
  const lineEnd = text.indexOf("\n", pos);
  return {
    lineStart,
    lineEnd: lineEnd === -1 ? text.length : lineEnd,
    line: text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd),
  };
}

function indentLevel(line: string): number {
  const m = line.match(/^(\s*)/);
  return m ? Math.floor(m[1].length / INDENT.length) : 0;
}

// Bullet markers cycle by depth: *, -, +
const BULLET_CYCLE = ["*", "-", "+"];

// Number sequences by depth: 1./2./3., a./b./c., i./ii./iii.
function nextNumbered(current: string, depth: number): string {
  if (depth % 3 === 0) {
    // Arabic numerals
    const n = parseInt(current, 10);
    return isNaN(n) ? "1" : String(n + 1);
  } else if (depth % 3 === 1) {
    // Lowercase letters
    if (/^[a-z]$/i.test(current)) {
      return String.fromCharCode(current.toLowerCase().charCodeAt(0) + 1);
    }
    return "a";
  } else {
    // Roman numerals (simple)
    const romans = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
    const idx = romans.indexOf(current.toLowerCase());
    return idx >= 0 && idx < romans.length - 1 ? romans[idx + 1] : "i";
  }
}

function firstForDepth(depth: number, isNumbered: boolean): string {
  if (!isNumbered) {
    return BULLET_CYCLE[depth % BULLET_CYCLE.length];
  }
  if (depth % 3 === 0) return "1";
  if (depth % 3 === 1) return "a";
  return "i";
}

function parseListItem(line: string) {
  const m = line.match(LIST_RE);
  if (!m) return null;
  const indent = m[1];
  const depth = Math.floor(indent.length / INDENT.length);
  const isNumbered = !m[6]; // m[6] is the bullet group
  const marker = m[3] || m[4] || m[5] || m[6]; // the actual marker text
  const fullPrefix = m[0]; // everything including trailing space
  const content = line.slice(fullPrefix.length);
  return { indent, depth, isNumbered, marker, fullPrefix, content };
}

function isEmptyListItem(line: string): boolean {
  const parsed = parseListItem(line);
  if (!parsed) return false;
  return parsed.content.trim() === "";
}

function nextListPrefix(line: string): string | null {
  const parsed = parseListItem(line);
  if (!parsed) return null;
  const { indent, depth, isNumbered, marker } = parsed;
  if (isNumbered) {
    return indent + nextNumbered(marker, depth) + ". ";
  }
  return indent + marker + " ";
}

// When Tab is pressed on a list item: increase indent + reset marker for new depth
function indentListItem(line: string): string {
  const parsed = parseListItem(line);
  if (!parsed) {
    // Not a list item — just indent the text
    return INDENT + line;
  }
  const newDepth = parsed.depth + 1;
  const newIndent = INDENT.repeat(newDepth);
  const newMarker = firstForDepth(newDepth, parsed.isNumbered);
  const suffix = parsed.isNumbered ? ". " : " ";
  return newIndent + newMarker + suffix + parsed.content;
}

// When Shift+Tab is pressed on a list item: decrease indent + reset marker for new depth
function unindentListItem(line: string): string {
  const parsed = parseListItem(line);
  if (!parsed) {
    // Not a list item — just remove leading indent
    if (line.startsWith(INDENT)) return line.slice(INDENT.length);
    if (line.startsWith("\t")) return line.slice(1);
    return line;
  }
  if (parsed.depth === 0) return line; // Already at root
  const newDepth = parsed.depth - 1;
  const newIndent = INDENT.repeat(newDepth);
  const newMarker = firstForDepth(newDepth, parsed.isNumbered);
  const suffix = parsed.isNumbered ? ". " : " ";
  return newIndent + newMarker + suffix + parsed.content;
}

/* ── Component ────────────────────────────────────────────────── */

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

  /* ── Programmatic textarea splice (preserves cursor) ──────── */
  const splice = useCallback(
    (start: number, end: number, insert: string) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const next = value.slice(0, start) + insert + value.slice(end);
      setValue(next);
      requestAnimationFrame(() => {
        const cursor = start + insert.length;
        ta.selectionStart = ta.selectionEnd = cursor;
        ta.focus();
      });
    },
    [value]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const pos = ta.selectionStart;

      /* ── Enter (no modifier) → SEND ──────────────────────── */
      if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        // Slash commands: execute instead of send
        if (value.startsWith("/")) {
          e.preventDefault();
          executeSlashCommand(value);
          return;
        }
        e.preventDefault();
        handleSend();
        return;
      }

      /* ── ⌘↵ / Ctrl+↵ → also send (power-user shortcut) ── */
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
        return;
      }

      /* ── ⌘⇧↵ → fork thread ─────────────────────────────── */
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        if (onNewThread) onNewThread();
        return;
      }

      /* ── Shift+Enter → newline + auto-continue lists ────── */
      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        const { line, lineStart, lineEnd } = getLineAt(value, pos);

        // If current line is an empty list item, break out of the list
        if (isEmptyListItem(line)) {
          splice(lineStart, lineEnd, "");
          return;
        }

        // Auto-continue numbered/bullet list
        const prefix = nextListPrefix(line);
        if (prefix) {
          splice(pos, pos, "\n" + prefix);
        } else {
          splice(pos, pos, "\n");
        }
        return;
      }

      /* ── Tab → indent / nest list item ──────────────────── */
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        const { lineStart, lineEnd, line } = getLineAt(value, pos);
        const newLine = indentListItem(line);
        splice(lineStart, lineEnd, newLine);
        return;
      }

      /* ── Shift+Tab → unindent / un-nest list item ──────── */
      if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        const { lineStart, lineEnd, line } = getLineAt(value, pos);
        const newLine = unindentListItem(line);
        splice(lineStart, lineEnd, newLine);
        return;
      }
    },
    [value, splice] // eslint-disable-line react-hooks/exhaustive-deps
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
            const resp = await fetch(\`/api/recall?q=\${encodeURIComponent(args)}\`);
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
            const resp = await fetch(\`/api/recall?q=personality+\${encodeURIComponent(args)}\`);
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
            window.location.href = \`/boardroom?topic=\${encodeURIComponent(args)}\`;
          }
          setValue("");
          break;
        }
        case "/dispatch": {
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
                alert(\`Dispatched → \${data.dispatch_id.slice(0, 8)}\`);
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
      className={\`w-full \${isSheet ? "" : "border-t"}\`}
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

      {/* Keyboard hint */}
      <div className="px-3 pt-1 flex gap-3">
        <span className="text-[10px]" style={{ color: "var(--ink-1)", opacity: 0.5 }}>
          ↵ send · ⇧↵ new line · Tab nest · ⇧Tab un-nest
        </span>
      </div>

      {/* Input area */}
      <div className="flex items-end gap-2 p-3 pt-1">
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
          className="flex-1 resize-none rounded-lg px-3 py-2 text-sm outline-none font-mono"
          style={{
            background: "var(--bg-2)",
            color: "var(--ink-0)",
            maxHeight: "192px",
            tabSize: 2,
          }}
        />

        <button
          onClick={handleSend}
          disabled={isStreaming || !value.trim()}
          className={\`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-opacity \${
            !value.trim() ? "breathing" : ""
          }\`}
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
