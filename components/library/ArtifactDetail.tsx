"use client";

import { useState } from "react";
import type { Artifact } from "./ArtifactCard";

interface ArtifactDetailProps {
  artifact: Artifact;
  onClose: () => void;
  onUpdate: (updated: Artifact) => void;
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  review: { bg: "rgba(245,158,11,0.14)", color: "#f59e0b" },
  approved: { bg: "rgba(74,222,128,0.14)", color: "#4ade80" },
  draft: { bg: "var(--bg-2)", color: "var(--ink-1)" },
  archived: { bg: "rgba(71,85,105,0.3)", color: "#64748b" },
};

const TYPE_COLORS: Record<string, string> = {
  mockup: "#3ad6c4",
  doc: "#22d3ee",
  chart: "#f59e0b",
  diff: "#94A3B8",
  form: "#4ade80",
  preview: "#a78bfa",
  screenshot: "#c084fc",
};

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5" style={{ borderBottom: "1px solid var(--bg-2)" }}>
      <span className="text-xs w-20 shrink-0" style={{ color: "var(--ink-1)" }}>{label}</span>
      <div className="flex-1 text-xs" style={{ color: "var(--ink-0)" }}>{children}</div>
    </div>
  );
}

export function ArtifactDetail({ artifact, onClose, onUpdate }: ArtifactDetailProps) {
  const [pinning, setPinning] = useState(false);
  const typeColor = TYPE_COLORS[artifact.type] || "#94A3B8";
  const statusStyle = STATUS_STYLES[artifact.status] || STATUS_STYLES.draft;
  const tags = artifact.tags || [];

  async function togglePin() {
    if (pinning) return;
    setPinning(true);
    try {
      const res = await fetch(`/api/library/${artifact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !artifact.pinned }),
      });
      const json = await res.json();
      if (json.artifact) onUpdate(json.artifact);
    } finally {
      setPinning(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="absolute inset-0"
        style={{ background: "rgba(10,26,47,0.7)" }}
      />
      <div
        className="relative w-full max-w-2xl mx-4 rounded-xl overflow-hidden flex flex-col"
        style={{
          background: "var(--bg-1)",
          maxHeight: "85vh",
          border: "1px solid var(--bg-2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b shrink-0"
          style={{ borderColor: "var(--bg-2)" }}
        >
          <div
            className="w-3 h-3 rounded shrink-0"
            style={{ background: typeColor }}
          />
          <span className="flex-1 text-sm font-medium" style={{ color: "var(--ink-0)" }}>
            {artifact.title}
          </span>
          <button
            onClick={togglePin}
            className="text-sm px-2 py-1 rounded transition-colors"
            style={{
              background: artifact.pinned ? "rgba(245,158,11,0.14)" : "var(--bg-2)",
              color: artifact.pinned ? "#f59e0b" : "var(--ink-1)",
            }}
            title={artifact.pinned ? "Unpin" : "Pin"}
          >
            {pinning ? "…" : artifact.pinned ? "📌 Pinned" : "Pin"}
          </button>
          <button
            onClick={onClose}
            className="text-sm px-2 py-1 rounded"
            style={{ background: "var(--bg-2)", color: "var(--ink-1)" }}
          >
            ✕
          </button>
        </div>

        {/* Meta */}
        <div className="px-4 py-2 shrink-0">
          <MetaRow label="Project">{artifact.project}</MetaRow>
          <MetaRow label="Type">
            <span style={{ color: typeColor }}>{artifact.type}</span>
          </MetaRow>
          <MetaRow label="Status">
            <span
              className="inline-block px-2 py-0.5 rounded text-xs"
              style={{ background: statusStyle.bg, color: statusStyle.color }}
            >
              {artifact.status}
            </span>
          </MetaRow>
          <MetaRow label="Owner">
            <span className="uppercase font-mono" style={{ fontSize: 11 }}>{artifact.owner}</span>
          </MetaRow>
          {artifact.bible_clause && (
            <MetaRow label="Bible clause">
              <span
                className="inline-block px-2 py-0.5 rounded text-xs"
                style={{ background: "var(--accent-teal-dim)", color: "var(--ink-0)" }}
              >
                {artifact.bible_clause}
              </span>
            </MetaRow>
          )}
          {tags.length > 0 && (
            <MetaRow label="Tags">
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-block px-1.5 py-0.5 rounded text-xs"
                    style={{ background: "var(--bg-2)", color: "var(--ink-1)" }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </MetaRow>
          )}
          <MetaRow label="Created">
            <span style={{ fontFamily: "monospace", fontSize: 11 }}>
              {new Date(artifact.created_at).toLocaleString()}
            </span>
          </MetaRow>
          {artifact.source_agent && (
            <MetaRow label="Agent">
              <span className="font-mono" style={{ fontSize: 11 }}>{artifact.source_agent}</span>
            </MetaRow>
          )}
        </div>

        {/* Content */}
        {artifact.content && (
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <div
              className="text-xs mb-1 uppercase font-medium"
              style={{ color: "var(--ink-1)", opacity: 0.6 }}
            >
              Content
            </div>
            <pre
              className="text-sm whitespace-pre-wrap break-words rounded p-3"
              style={{
                background: "var(--bg-2)",
                color: "var(--ink-0)",
                fontFamily: "monospace",
                fontSize: 12,
              }}
            >
              {artifact.content}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
