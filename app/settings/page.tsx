"use client";

import { useState } from "react";
import { DeckShell } from "@/components/DeckShell";

const SETTINGS_SECTIONS = [
  { id: "account", label: "Account", description: "Profile, authentication, workspace membership" },
  { id: "personalities", label: "Personalities", description: "Manage AI personality roster and hybrid compositions" },
  { id: "appearance", label: "Appearance", description: "Theme, density, layout preferences" },
  { id: "keyboard", label: "Keyboard Shortcuts", description: "View and customize key bindings" },
  { id: "api-keys", label: "API Keys", description: "Provider credentials and verification status" },
  { id: "boardroom-defaults", label: "Boardroom Defaults", description: "Default personalities, turn mode, chair" },
  { id: "data-privacy", label: "Data & Privacy", description: "Export, retention, and deletion controls" },
];

export default function SettingsPage() {
  const [composerModalOpen, setComposerModalOpen] = useState(false);

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
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-sm font-medium mb-1" style={{ color: "var(--ink-0)" }}>
                    {section.label}
                  </h2>
                  <p className="text-xs" style={{ color: "var(--ink-1)" }}>
                    {section.description}
                    {section.id !== "personalities" && " — wire-in pending."}
                  </p>
                </div>
                {section.id === "personalities" && (
                  <button
                    onClick={() => setComposerModalOpen(true)}
                    className="px-3 py-1.5 text-xs rounded-lg font-medium transition-colors shrink-0"
                    style={{
                      background: "var(--accent-teal)",
                      color: "var(--bg-0)",
                    }}
                    data-testid="compose-new-personality"
                  >
                    + Compose New
                  </button>
                )}
              </div>

              {/* Personalities section: show roster preview */}
              {section.id === "personalities" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {["JARVIS", "ATLAS", "SENTINEL", "LEDGER", "SCOUT", "FORGE", "TRIAGE"].map(
                    (name) => (
                      <span
                        key={name}
                        className="text-xs px-2 py-1 rounded"
                        style={{ background: "var(--bg-2)", color: "var(--ink-0)" }}
                      >
                        {name}
                      </span>
                    )
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Hybrid Composer Modal — NST.19.7 r3 Bite 2.8 */}
      {composerModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setComposerModalOpen(false)}
        >
          <div className="scrim absolute inset-0" />
          <div
            className="relative rounded-xl p-6 max-w-lg w-full mx-4"
            style={{ background: "var(--bg-1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              className="text-sm font-medium mb-2"
              style={{ color: "var(--accent-teal)" }}
            >
              Compose Hybrid Personality
            </h2>
            <p className="text-xs mb-4" style={{ color: "var(--ink-1)" }}>
              Select 2-3 personalities to merge. The synthesizer (Sonnet default,
              Opus opt-up) merges lineages, frameworks, and behavioral rules —
              flagging conflicts explicitly for you to resolve. No silent
              reconciliation.
            </p>

            <div className="rounded-lg p-4 mb-4" style={{ background: "var(--bg-2)" }}>
              <p className="text-xs text-center" style={{ color: "var(--ink-1)" }}>
                Full hybrid composition flow coming in v1.1.
              </p>
              <p className="text-xs text-center mt-2" style={{ color: "var(--ink-1)" }}>
                Synthesizer merges lineages + dedupes frameworks. Conflicts flagged
                explicitly — user resolves. Generates name + glyph. Writes to
                personalities/hybrids/ with parents:[A,B] frontmatter.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setComposerModalOpen(false)}
                className="px-3 py-1.5 text-xs rounded-lg"
                style={{ background: "var(--bg-2)", color: "var(--ink-0)" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </DeckShell>
  );
}
