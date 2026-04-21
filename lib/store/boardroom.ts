import { create } from "zustand";

interface SeatInfo {
  personality: string;
  provider: string;
  model: string;
}

interface Turn {
  id: string;
  seat_personality: string;
  content: string | null;
  silence: boolean;
  turn_index: number;
  provider?: string;
  model?: string;
  tokens_in?: number;
  tokens_out?: number;
  latency_ms?: number;
  created_at: string;
}

type TurnMode = "mention" | "round_robin" | "everyone" | "consensus" | "chair";

interface BoardroomStore {
  activeThreadId: string | null;
  topic: string;
  seats: SeatInfo[];
  turns: Turn[];
  turnMode: TurnMode;
  chair: string;
  isStreaming: boolean;
  streamingContent: string;
  activeSpeaker: string | null;
  setActiveThread: (id: string | null) => void;
  setTopic: (topic: string) => void;
  setSeats: (seats: SeatInfo[]) => void;
  setTurns: (turns: Turn[]) => void;
  addTurn: (turn: Turn) => void;
  setTurnMode: (mode: TurnMode) => void;
  setChair: (chair: string) => void;
  setStreaming: (streaming: boolean, content?: string) => void;
  appendStreamContent: (text: string) => void;
  setActiveSpeaker: (seat: string | null) => void;
}

export const useBoardroomStore = create<BoardroomStore>((set) => ({
  activeThreadId: null,
  topic: "",
  seats: [],
  turns: [],
  turnMode: "round_robin",
  chair: "default",
  isStreaming: false,
  streamingContent: "",
  activeSpeaker: null,
  setActiveThread: (id) => set({ activeThreadId: id }),
  setTopic: (topic) => set({ topic }),
  setSeats: (seats) => set({ seats }),
  setTurns: (turns) => set({ turns }),
  addTurn: (turn) => set((s) => ({ turns: [...s.turns, turn] })),
  setTurnMode: (turnMode) => set({ turnMode }),
  setChair: (chair) => set({ chair }),
  setStreaming: (isStreaming, content) =>
    set({ isStreaming, streamingContent: content ?? "" }),
  appendStreamContent: (text) =>
    set((s) => ({ streamingContent: s.streamingContent + text })),
  setActiveSpeaker: (seat) => set({ activeSpeaker: seat }),
}));
