import { DeckShell } from "@/components/DeckShell";

export default function FleetPage() {
  return (
    <DeckShell surfaceLabel="Fleet">
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="text-center">
          <h1 className="text-lg font-medium mb-2" style={{ color: "var(--ink-0)" }}>
            Fleet
          </h1>
          <p className="text-sm" style={{ color: "var(--ink-1)" }}>
            Full-page Fleet view — wire-in pending.
          </p>
        </div>
      </div>
    </DeckShell>
  );
}
