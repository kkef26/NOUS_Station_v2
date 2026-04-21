import { create } from "zustand";

interface Thread {
  id: string;
  title: string | null;
  summary: string | null;
  message_count: number;
  last_message_at: string | null;
  pinned: boolean;
  archived: boolean;
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

interface ChatStore {
  activeThreadId: string | null;
  threads: Thread[];
  messages: Message[];
  draft: string;
  activePersonality: string | null;
  streamingContent: string;
  isStreaming: boolean;
  setActiveThread: (id: string | null) => void;
  setThreads: (threads: Thread[]) => void;
  setMessages: (messages: Message[]) => void;
  setDraft: (draft: string) => void;
  setActivePersonality: (slug: string | null) => void;
  addMessage: (msg: Message) => void;
  setStreaming: (streaming: boolean, content?: string) => void;
  appendStreamContent: (text: string) => void;
  updateThread: (id: string, updates: Partial<Thread>) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  activeThreadId: null,
  threads: [],
  messages: [],
  draft: "",
  activePersonality: null,
  streamingContent: "",
  isStreaming: false,
  setActiveThread: (id) => set({ activeThreadId: id }),
  setThreads: (threads) => set({ threads }),
  setMessages: (messages) => set({ messages }),
  setDraft: (draft) => set({ draft }),
  setActivePersonality: (slug) => set({ activePersonality: slug }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setStreaming: (isStreaming, content) =>
    set({ isStreaming, streamingContent: content ?? "" }),
  appendStreamContent: (text) =>
    set((s) => ({ streamingContent: s.streamingContent + text })),
  updateThread: (id, updates) =>
    set((s) => ({
      threads: s.threads.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
}));
