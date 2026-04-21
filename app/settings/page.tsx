import { DeckShell } from "@/components/DeckShell";

const SETTINGS_SECTIONS = [
  { id: "account", label: "Account", description: "Profile, authentication, workspace membership" },
  { id: "appearance", label: "Appearance", description: "Theme, density, layout preferences" },
  { id: "keyboard", label: "Keyboard Shortcuts", description: "View and customize key bindings" },
  { id: "api-keys", label: "API Keys", description: "Provider credentials and verification status" },
  { id: "boardroom-defaults", label: "Boardroom Defaults", description: "Default personalities, turn mode, chair" },
  { id: "data-privacy", label: "Data & Privacy", description: "Export, retention, and deletion controls" },
];

export default function SettingsPage() {
  return (
    <DeckShell surfaceLabel="Settings">
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-lg font-medium mb-6" style={{ color: "var(--ink-0)" }}>
          Settings
        </h1>
        <div className="space-y-3">
          {SETTINGS_SECTIONS.map((section) => (
            <div
              key={section.id}
              className="rounded-lg p-4 border"
              style={{
                background: "var(--bg-1)",
                borderColor: "var(--bg-2)",
              }}
            >
              <h2 className="text-sm font-medium mb-1" style={{ color: "var(--ink-0)" }}>
                {section.label}
              </h2>
              <p className="text-xs" style={{ color: "var(--ink-1)" }}>
                {section.description} — wire-in pending.
              </p>
            </div>
          ))}
        </div>
      </div>
    </DeckShell>
  );
}
