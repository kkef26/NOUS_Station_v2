"use client";

import { Suspense, useEffect, useCallback, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { DeckShell } from "@/components/DeckShell";
import { HybridComposer } from "@/components/HybridComposer";
import { ChatMessage } from "@/components/ChatMessage";
import { useChatStore } from "@/lib/store/chat";

const PROVIDERS = [
  { id: "anthropic", label: "Claude", model: "sonnet", color: "#cc785c" },
  { id: "openai", label: "ChatGPT", model: "gpt-4o", color: "#74aa9c" },
  { id: "google", label: "Gemini", model: "gemini-2.5-flash", color: "#4285f4" },
  { id: "xai", label: "Grok", model: "grok-3", color: "#e4e4e4" },
  { id: "deepseek", label: "DeepSeek", model: "deepseek-chat", color: "#5b6ee1" },
] as const;

interface Thread {
  id: string;
  title: string | null;
  message_count: number;
  last_message_at: string | null;
  pinned: boolean;
  created_at: string;
}

interface Message {
  id: string;
  thread_id: string;
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

export default function ChatPage() {
  return (
    <Suspense fallback={<DeckShell surfaceLabel="Chat"><div /></DeckShell>}>
      <ChatPageInner />
    </Suspense>
  );
}

function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const threadParam = searchParams.get("thread");

  const {
    activeThreadId,
    threads,
    messages,
    isStreaming,
    streamingContent,
    setActiveThread,
    setThreads,
    setMessages,
    addMessage,
    setStreaming,
    appendStreamContent,
  } = useChatStore();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("anthropic");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Responsive sidebar
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Load threads
  useEffect(() => {
    fetch("/api/chat/threads")
      .then((r) => r.json())
      .then((d) => setThreads(d.threads || []))
      .catch(() => {});
  }, [setThreads]);

  // Load thread from URL param
  useEffect(() => {
    if (threadParam && threadParam !== activeThreadId) {
      loadThread(threadParam);
    }
  }, [threadParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadThread = useCallback(
    async (id: string) => {
      setActiveThread(id);
      try {
        const resp = await fetch(`/api/chat/threads/${id}`);
        const data = await resp.json();
        setMessages(data.messages || []);
      } catch {
        setMessages([]);
      }
    },
    [setActiveThread, setMessages]
  );

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // Keyboard: N for new thread, J/K for prev/next
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey) return;

      switch (e.key) {
        case "n":
        case "N":
          e.preventDefault();
          handleNewThread();
          break;
        case "j":
        case "J": {
          e.preventDefault();
          const idx = threads.findIndex((t) => t.id === activeThreadId);
          if (idx < threads.length - 1) {
            const next = threads[idx + 1];
            router.push(`/chat?thread=${next.id}`);
            loadThread(next.id);
          }
          break;
        }
        case "k":
        case "K": {
          e.preventDefault();
          const idx = threads.findIndex((t) => t.id === activeThreadId);
          if (idx > 0) {
            const prev = threads[idx - 1];
            router.push(`/chat?thread=${prev.id}`);
            loadThread(prev.id);
          }
          break;
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeThreadId, threads, router, loadThread]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewThread = useCallback(() => {
    setActiveThread(null);
    setMessages([]);
    router.push("/chat");
  }, [setActiveThread, setMessages, router]);

  const handleSend = useCallback(
    async (message: string, opts?: { personality?: string }) => {
      if (isStreaming) return;

      const provider = PROVIDERS.find((p) => p.id === selectedProvider) || PROVIDERS[0];

      // Optimistic user message
      const tempUserMsg: Message = {
        id: `temp-${Date.now()}`,
        thread_id: activeThreadId || "",
        role: "user",
        content: message,
        created_at: new Date().toISOString(),
      };
      addMessage(tempUserMsg);
      setStreaming(true, "");

      try {
        const resp = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            thread_id: activeThreadId || undefined,
            message,
            personality: opts?.personality,
            provider: provider.id,
            model: provider.model,
          }),
        });

        const reader = resp.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let newThreadId = activeThreadId;
        let assistantMsgId = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          let currentEvent = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7);
            } else if (line.startsWith("data: ")) {
              const data = line.slice(6);
              try {
                const parsed = JSON.parse(data);

                switch (currentEvent) {
                  case "thread":
                    newThreadId = parsed.thread_id;
                    setActiveThread(newThreadId!);
                    router.push(`/chat?thread=${newThreadId}`);
                    break;
                  case "token":
                    appendStreamContent(parsed);
                    break;
                  case "done":
                    assistantMsgId = parsed.message_id;
                    break;
                  case "error":
                    console.error("Stream error:", parsed.message);
                    break;
                }
              } catch {
                // skip malformed
              }
            }
          }
        }

        // Add assistant message from accumulated stream
        const streamContent = useChatStore.getState().streamingContent;
        if (streamContent) {
          addMessage({
            id: assistantMsgId || `temp-asst-${Date.now()}`,
            thread_id: newThreadId || "",
            role: "assistant",
            content: streamContent,
            provider: provider.id,
            model: provider.model,
            created_at: new Date().toISOString(),
          });
        }

        // Refresh thread list
        const threadsResp = await fetch("/api/chat/threads");
        const threadsData = await threadsResp.json();
        setThreads(threadsData.threads || []);
      } catch (err) {
        console.error("Send error:", err);
      } finally {
        setStreaming(false);
      }
    },
    [
      activeThreadId,
      isStreaming,
      selectedProvider,
      addMessage,
      setStreaming,
      appendStreamContent,
      setActiveThread,
      setThreads,
      router,
    ]
  );

  const activeProviderInfo = PROVIDERS.find((p) => p.id === selectedProvider) || PROVIDERS[0];

  return (
    <DeckShell surfaceLabel="Chat">
      <div className="flex h-full" style={{ height: "calc(100vh - 56px - 24px - 24px)" }}>
        {/* Left rail */}
        {sidebarOpen && (
          <aside
            className="w-60 shrink-0 border-r overflow-y-auto"
            style={{ background: "var(--bg-1)", borderColor: "var(--bg-2)" }}
          >
            <div className="p-3">
              <button
                onClick={handleNewThread}
                className="w-full text-sm rounded-lg px-3 py-2 text-left hover:opacity-80"
                style={{ background: "var(--bg-2)", color: "var(--accent-teal)" }}
              >
                + New thread
              </button>
            </div>
            <div className="flex flex-col">
              {threads.map((t: Thread) => (
                <button
                  key={t.id}
                  onClick={() => {
                    router.push(`/chat?thread=${t.id}`);
                    loadThread(t.id);
                  }}
                  className="text-left px-3 py-2 text-sm hover:opacity-80 border-b"
                  style={{
                    background: t.id === activeThreadId ? "var(--bg-2)" : "transparent",
                    color: "var(--ink-0)",
                    borderColor: "var(--bg-2)",
                  }}
                >
                  <div className="truncate">{t.title || "Untitled"}</div>
                  <div className="text-xs" style={{ color: "var(--ink-1)" }}>
                    {t.message_count} messages
                  </div>
                </button>
              ))}
            </div>
          </aside>
        )}

        {/* Hamburger for mobile */}
        {isMobile && !sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="fixed top-16 left-2 z-30 w-8 h-8 flex items-center justify-center rounded"
            style={{ background: "var(--bg-1)", color: "var(--ink-1)" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        )}

        {/* Center column */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Provider selector bar */}
          <div
            className="flex items-center gap-1 px-4 py-2 border-b"
            style={{ borderColor: "var(--bg-2)" }}
          >
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedProvider(p.id)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                style={{
                  background: selectedProvider === p.id ? p.color + "22" : "transparent",
                  color: selectedProvider === p.id ? p.color : "var(--ink-1)",
                  border: selectedProvider === p.id
                    ? `1px solid ${p.color}55`
                    : "1px solid transparent",
                }}
              >
                {p.label}
              </button>
            ))}
            <span
              className="ml-auto text-xs"
              style={{ color: "var(--ink-2)" }}
            >
              {activeProviderInfo.model}
            </span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 && !isStreaming && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="breathing mb-4">
                    <svg
                      width="40"
                      height="40"
                      viewBox="0 0 28 28"
                      fill="none"
                      style={{ margin: "0 auto" }}
                    >
                      <circle cx="14" cy="14" r="12" stroke="var(--accent-teal)" strokeWidth="1.5" fill="none" />
                      <circle cx="14" cy="14" r="4" fill="var(--accent-teal)" />
                    </svg>
                  </div>
                  <p className="text-sm" style={{ color: "var(--ink-1)" }}>
                    Start a conversation or use / for commands
                  </p>
                </div>
              </div>
            )}

            {messages.map((msg: Message) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                onRegenerate={
                  msg.role === "assistant"
                    ? () => {
                        const idx = messages.findIndex((m: Message) => m.id === msg.id);
                        if (idx > 0) {
                          const prevUser = messages[idx - 1];
                          if (prevUser.role === "user") {
                            handleSend(prevUser.content);
                          }
                        }
                      }
                    : undefined
                }
              />
            ))}

            {/* Streaming message */}
            {isStreaming && streamingContent && (
              <ChatMessage
                message={{
                  id: "streaming",
                  role: "assistant",
                  content: streamingContent,
                  provider: selectedProvider,
                  created_at: new Date().toISOString(),
                }}
                isStreaming
              />
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          <HybridComposer onSend={handleSend} onNewThread={handleNewThread} />
        </div>
      </div>
    </DeckShell>
  );
}
