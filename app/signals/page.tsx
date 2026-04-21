import { DeckShell } from "@/components/DeckShell";

export default function SignalsPage() {
  return (
    <DeckShell surfaceLabel="Signals">
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="text-center">
          <h1 className="text-lg font-medium mb-2" style={{ color: "var(--ink-0)" }}>
            Signals
          </h1>
          <p className="text-sm" style={{ color: "var(--ink-1)" }}>
            Full-page Signals view — wire-in pending.
          </p>
        </div>
      </div>
    </DeckShell>
  );
}
