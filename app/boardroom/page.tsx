"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { DeckShell } from "@/components/DeckShell";
import { useBoardroomStore } from "@/lib/store/boardroom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

export default function BoardroomPage() {
  return (
    <Suspense fallback={<DeckShell surfaceLabel="Boardroom"><div /></DeckShell>}>
      <BoardroomPageInner />
    </Suspense>
  );
}

function BoardroomPageInner() {
  const searchParams = useSearchParams();
  const topicParam = searchParams.get("topic");

  const {
    activeThreadId,
    topic,
    seats,
    turns,
    turnMode,
    chair,
    isStreaming,
    streamingContent,
    activeSpeaker,
    setActiveThread,
    setTopic,
    setSeats,
    setTurns,
    addTurn,
    setTurnMode,
    setChair,
    setStreaming,
    appendStreamContent,
    setActiveSpeaker,
  } = useBoardroomStore();

  const [topicInput, setTopicInput] = useState(topicParam || "");
  const [synthesisText, setSynthesisText] = useState("");
  const [showSynthesis, setShowSynthesis] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Auto-submit if topic param provided
  useEffect(() => {
    if (topicParam && !activeThreadId) {
      handleSubmitTopic(topicParam);
    }
  }, [topicParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll transcript
  useEffect(() => {
    transcriptRef.current?.scrollTo(0, transcriptRef.current.scrollHeight);
  }, [turns, streamingContent]);

  const handleSubmitTopic = useCallback(
    async (t: string) => {
      if (!t.trim()) return;
      setTopic(t);

      try {
        const resp = await fetch("/api/boardroom/threads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic: t }),
        });
        const data = await resp.json();

        setActiveThread(data.thread.id);
        setSeats(data.seats);
        setTurnMode(data.turn_mode);
        setChair(data.chair);
        setTurns([]);
      } catch (err) {
        console.error("Failed to create boardroom thread:", err);
      }
    },
    [setTopic, setActiveThread, setSeats, setTurnMode, setChair, setTurns]
  );

  const handleAdvanceTurn = useCallback(async () => {
    if (!activeThreadId || isStreaming) return;

    setStreaming(true, "");

    try {
      const resp = await fetch(`/api/boardroom/threads/${activeThreadId}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const reader = resp.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";
      let turnContent = "";
      let turnId = "";
      let silent = false;

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
            try {
              const parsed = JSON.parse(line.slice(6));
              switch (currentEvent) {
                case "token":
                  turnContent += parsed;
                  appendStreamContent(parsed);
                  break;
                case "done":
                  turnId = parsed.turn_id;
                  break;
                case "silence":
                  silent = true;
                  setActiveSpeaker(parsed.seat);
                  break;
              }
            } catch {
              // skip
            }
          }
        }
      }

      // Refresh turns
      const turnsResp = await fetch(`/api/boardroom/threads/${activeThreadId}`);
      const turnsData = await turnsResp.json();
      setTurns(turnsData.turns || []);
    } catch (err) {
      console.error("Turn error:", err);
    } finally {
      setStreaming(false);
      setActiveSpeaker(null);
    }
  }, [activeThreadId, isStreaming, setStreaming, appendStreamContent, setTurns, setActiveSpeaker]);

  const handleEndRound = useCallback(async () => {
    if (!activeThreadId || isStreaming) return;
    setStreaming(true, "");
    setSynthesisText("");

    try {
      const resp = await fetch(`/api/boardroom/threads/${activeThreadId}/synthesis`, {
        method: "POST",
      });

      const reader = resp.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";
      let content = "";

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
            try {
              const parsed = JSON.parse(line.slice(6));
              if (currentEvent === "token") {
                content += parsed;
                setSynthesisText(content);
              }
            } catch {
              // skip
            }
          }
        }
      }

      setShowSynthesis(true);
    } catch (err) {
      console.error("Synthesis error:", err);
    } finally {
      setStreaming(false);
    }
  }, [activeThreadId, isStreaming, setStreaming]);

  const handleAttachToChat = useCallback(async () => {
    if (!activeThreadId) return;
    try {
      const resp = await fetch(`/api/boardroom/threads/${activeThreadId}/handoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "attach" }),
      });
      const data = await resp.json();
      if (data.thread_id) {
        window.location.href = `/chat?thread=${data.thread_id}`;
      }
    } catch (err) {
      console.error("Handoff error:", err);
    }
  }, [activeThreadId]);

  // Color helpers
  const seatColor = (idx: number) => {
    const colors = ["#3ad6c4", "#ff6b5a", "#f0c040", "#7c4dff", "#4caf50", "#ff9800", "#e91e63", "#00bcd4"];
    return colors[idx % colors.length];
  };

  const seatInitials = (name: string) =>
    name.slice(0, 2).toUpperCase();

  return (
    <DeckShell surfaceLabel="Boardroom">
      <div className="flex flex-col h-full" style={{ height: "calc(100vh - 56px - 24px - 24px)" }}>
        {/* Topic input */}
        {!activeThreadId && (
          <div className="flex items-center justify-center flex-1">
            <div className="w-full max-w-lg p-6">
              <h2 className="text-lg font-medium mb-4 text-center" style={{ color: "var(--ink-0)" }}>
                Boardroom
              </h2>
              <div className="flex gap-2">
                <input
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSubmitTopic(topicInput);
                  }}
                  placeholder="Enter a topic for the council..."
                  className="flex-1 rounded-lg px-4 py-2 text-sm outline-none"
                  style={{ background: "var(--bg-2)", color: "var(--ink-0)" }}
                  autoFocus
                />
                <button
                  onClick={() => handleSubmitTopic(topicInput)}
                  className="px-4 py-2 rounded-lg text-sm"
                  style={{ background: "var(--accent-teal)", color: "var(--bg-0)" }}
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Active session */}
        {activeThreadId && (
          <div className="flex flex-1 overflow-hidden">
            {/* Left: round table + controls */}
            <div className="flex-1 flex flex-col">
              {/* Seat chips */}
              <div className="flex gap-2 p-3 flex-wrap border-b" style={{ borderColor: "var(--bg-2)" }}>
                {seats.map((s: SeatInfo, i: number) => (
                  <div
                    key={s.personality}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${
                      activeSpeaker === s.personality ? "pulse" : ""
                    }`}
                    style={{
                      background: "var(--bg-2)",
                      color: "var(--ink-0)",
                      borderLeft: `3px solid ${seatColor(i)}`,
                      opacity: activeSpeaker && activeSpeaker !== s.personality ? 0.5 : 1,
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: seatColor(i) }}
                    />
                    {s.personality}
                    <span style={{ color: "var(--ink-1)" }}>{s.provider}</span>
                  </div>
                ))}
              </div>

              {/* Round table visual */}
              <div className="flex-1 flex items-center justify-center p-4">
                <div className="relative" style={{ width: 300, height: 300 }}>
                  {/* Center circle */}
                  <div
                    className="absolute rounded-full"
                    style={{
                      width: 80,
                      height: 80,
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                      background: "var(--bg-2)",
                      border: "1px solid var(--accent-teal-dim)",
                    }}
                  />

                  {/* Seats arranged in circle */}
                  {seats.slice(0, 8).map((s: SeatInfo, i: number) => {
                    const angle = (i * 360) / Math.min(seats.length, 8) - 90;
                    const rad = (angle * Math.PI) / 180;
                    const x = 150 + 120 * Math.cos(rad) - 20;
                    const y = 150 + 120 * Math.sin(rad) - 20;
                    const isActive = activeSpeaker === s.personality;

                    return (
                      <div
                        key={s.personality}
                        className={`absolute flex items-center justify-center rounded-full text-xs font-medium ${
                          isActive ? "pulse" : ""
                        }`}
                        style={{
                          width: 40,
                          height: 40,
                          left: x,
                          top: y,
                          background: seatColor(i),
                          color: "#000",
                          opacity: isActive || !activeSpeaker ? 1 : 0.5,
                          boxShadow: isActive ? `0 0 12px ${seatColor(i)}` : "none",
                        }}
                        title={s.personality}
                      >
                        {seatInitials(s.personality)}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Controls */}
              <div className="p-3 flex gap-2 items-center border-t" style={{ borderColor: "var(--bg-2)" }}>
                <select
                  value={turnMode}
                  onChange={(e) => setTurnMode(e.target.value as typeof turnMode)}
                  className="text-xs rounded px-2 py-1 outline-none"
                  style={{ background: "var(--bg-2)", color: "var(--ink-0)" }}
                >
                  <option value="round_robin">Round Robin</option>
                  <option value="mention">Mention</option>
                  <option value="everyone">Everyone</option>
                  <option value="consensus">Consensus</option>
                  <option value="chair">Chair</option>
                </select>

                <button
                  onClick={handleAdvanceTurn}
                  disabled={isStreaming}
                  className="px-3 py-1 rounded text-xs"
                  style={{
                    background: "var(--accent-teal)",
                    color: "var(--bg-0)",
                    opacity: isStreaming ? 0.5 : 1,
                  }}
                >
                  Next Turn
                </button>

                <button
                  onClick={handleEndRound}
                  disabled={isStreaming || turns.length === 0}
                  className="px-3 py-1 rounded text-xs"
                  style={{
                    background: "var(--bg-2)",
                    color: "var(--accent-teal)",
                    opacity: isStreaming || turns.length === 0 ? 0.5 : 1,
                  }}
                >
                  End Round
                </button>
              </div>
            </div>

            {/* Right rail: transcript */}
            <aside
              ref={transcriptRef}
              className="w-80 shrink-0 border-l overflow-y-auto p-3"
              style={{ background: "var(--bg-1)", borderColor: "var(--bg-2)" }}
            >
              <h3 className="text-xs font-medium mb-3" style={{ color: "var(--ink-1)" }}>
                Transcript
              </h3>

              {turns.map((t: Turn, i: number) => {
                const seatIdx = seats.findIndex((s) => s.personality === t.seat_personality);

                if (t.silence) {
                  return (
                    <div
                      key={t.id || i}
                      className="mb-2 text-xs italic"
                      style={{ color: "var(--ink-1)", fontSize: "0.75rem" }}
                    >
                      {t.seat_personality} listened
                    </div>
                  );
                }

                return (
                  <div
                    key={t.id || i}
                    className="mb-3"
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span
                        className="w-3 h-3 rounded-full text-[8px] flex items-center justify-center"
                        style={{ background: seatColor(seatIdx >= 0 ? seatIdx : 0), color: "#000" }}
                      >
                        {seatInitials(t.seat_personality)}
                      </span>
                      <span className="text-xs font-medium" style={{ color: "var(--ink-0)" }}>
                        {t.seat_personality}
                      </span>
                    </div>
                    <div className="text-sm prose prose-sm prose-invert max-w-none pl-4" style={{ borderLeft: `2px solid ${seatColor(seatIdx >= 0 ? seatIdx : 0)}` }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {t.content || ""}
                      </ReactMarkdown>
                    </div>
                    {hovered === i && (
                      <div className="text-xs mt-1 pl-4" style={{ color: "var(--ink-1)" }}>
                        {t.provider} · {t.model} · {t.tokens_in}→{t.tokens_out} · {t.latency_ms}ms
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Streaming turn */}
              {isStreaming && streamingContent && (
                <div className="mb-3">
                  <div
                    className="text-sm pl-4"
                    style={{
                      color: "var(--ink-0)",
                      borderLeft: "2px solid var(--accent-teal)",
                      animation: "streaming-breath 1.2s ease-in-out infinite",
                    }}
                  >
                    {streamingContent}
                  </div>
                </div>
              )}
            </aside>
          </div>
        )}

        {/* Synthesis sheet */}
        {showSynthesis && (
          <div className="fixed inset-0 z-50 flex items-end">
            <div className="scrim absolute inset-0" onClick={() => setShowSynthesis(false)} />
            <div
              className="relative w-full drawer-bottom-enter rounded-t-xl p-6"
              style={{ background: "var(--bg-1)", maxHeight: "60vh", overflowY: "auto" }}
            >
              <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "var(--bg-2)" }} />
              <h3 className="text-sm font-medium mb-3" style={{ color: "var(--accent-teal)" }}>
                Synthesis
              </h3>
              <div className="text-sm prose prose-sm prose-invert max-w-none mb-4">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{synthesisText}</ReactMarkdown>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAttachToChat}
                  className="px-3 py-1.5 rounded text-sm"
                  style={{ background: "var(--accent-teal)", color: "var(--bg-0)" }}
                >
                  Attach to Chat
                </button>
                <button
                  onClick={() => navigator.clipboard.writeText(synthesisText)}
                  className="px-3 py-1.5 rounded text-sm"
                  style={{ background: "var(--bg-2)", color: "var(--ink-0)" }}
                >
                  Copy reference
                </button>
                <button
                  onClick={() => alert("Minting arrives in Bite 3")}
                  className="px-3 py-1.5 rounded text-sm"
                  style={{ background: "var(--bg-2)", color: "var(--ink-1)" }}
                >
                  Mint artifact
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DeckShell>
  );
}
