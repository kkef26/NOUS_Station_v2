import { DeckShell } from "@/components/DeckShell";

export default function FactoryPage() {
  return (
    <DeckShell surfaceLabel="Factory">
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="text-center">
          <h1 className="text-lg font-medium mb-2" style={{ color: "var(--ink-0)" }}>
            Factory
          </h1>
          <p className="text-sm" style={{ color: "var(--ink-1)" }}>
            Full-page Factory view — wire-in pending.
          </p>
        </div>
      </div>
    </DeckShell>
  );
}
