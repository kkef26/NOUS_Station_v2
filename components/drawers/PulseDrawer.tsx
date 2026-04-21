"use client";

export function PulseDrawer({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start" onClick={onClose}>
      <div className="scrim absolute inset-0" />
      <div
        className="relative w-full drawer-top-enter rounded-b-xl p-6 mt-14"
        style={{ background: "var(--bg-1)", maxHeight: "60vh", overflow: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "var(--bg-2)" }} />
        <h3 className="text-sm font-medium mb-2" style={{ color: "var(--accent-teal)" }}>
          Pulse
        </h3>
        <p className="text-sm" style={{ color: "var(--ink-1)" }}>
          Wire-in pending — top drawer. ⌘P to toggle, Esc to close.
        </p>
      </div>
    </div>
  );
}
