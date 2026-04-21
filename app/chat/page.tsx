import { DeckShell } from "@/components/DeckShell";

export default function ChatPage() {
  return (
    <DeckShell surfaceLabel="Chat">
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="text-center">
          <h1 className="text-lg font-medium mb-2" style={{ color: "var(--ink-0)" }}>
            Chat
          </h1>
          <p className="text-sm" style={{ color: "var(--ink-1)" }}>
            Primary surface — wire-in pending.
          </p>
        </div>
      </div>
    </DeckShell>
  );
}
