"use client";

interface Artifact {
  id: string;
  workspace_id: string;
  project: string;
  type: string;
  title: string;
  content: string;
  content_ref: string | null;
  source_agent: string | null;
  source_session: string | null;
  created_at: string;
  pinned: boolean;
  tags: string[] | null;
  status: string;
  owner: string;
  bible_clause: string | null;
}

interface ArtifactCardProps {
  artifact: Artifact;
  onClick: () => void;
  viewMode: "grid" | "list";
}

const TYPE_COLORS: Record<string, string> = {
  mockup: "#3ad6c4",
  doc: "#22d3ee",
  chart: "#f59e0b",
  diff: "#94A3B8",
  form: "#4ade80",
  preview: "#a78bfa",
  screenshot: "#c084fc",
};

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  review: { bg: "rgba(245,158,11,0.14)", color: "#f59e0b" },
  approved: { bg: "rgba(74,222,128,0.14)", color: "#4ade80" },
  draft: { bg: "var(--bg-2)", color: "var(--ink-1)" },
  archived: { bg: "rgba(71,85,105,0.3)", color: "#64748b" },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function ArtifactCard({ artifact, onClick, viewMode }: ArtifactCardProps) {
  const typeColor = TYPE_COLORS[artifact.type] || "#94A3B8";
  const statusStyle = STATUS_STYLES[artifact.status] || STATUS_STYLES.draft;
  const tags = artifact.tags || [];

  if (viewMode === "list") {
    return (
      <button
        onClick={onClick}
        className="w-full text-left rounded flex items-center gap-0 hover:brightness-110 transition-all"
        style={{ background: "var(--bg-1)", overflow: "hidden" }}
      >
        {/* Type bar */}
        <div className="shrink-0" style={{ width: 4, alignSelf: "stretch", background: typeColor }} />

        {/* Content */}
        <div className="flex-1 min-w-0 px-3 py-2">
          <div className="flex items-center gap-2">
            {artifact.pinned && <span title="Pinned" style={{ color: "#f59e0b", fontSize: 11 }}>📌</span>}
            <span className="text-sm font-medium truncate" style={{ color: "var(--ink-0)" }}>
              {artifact.title}
            </span>
          </div>
          <div className="text-xs truncate mt-0.5" style={{ color: "var(--ink-1)" }}>
            {artifact.project}
            {tags.length > 0 && (
              <span className="ml-2">{tags.slice(0, 3).join(", ")}</span>
            )}
          </div>
        </div>

        {/* Meta */}
        <div className="shrink-0 px-3 py-2 w-36 text-right hidden md:block">
          {artifact.bible_clause && (
            <span
              className="inline-block px-1.5 py-0.5 rounded text-xs mb-1"
              style={{ background: "var(--accent-teal-dim)", color: "var(--ink-0)" }}
            >
              {artifact.bible_clause}
            </span>
          )}
          <div
            className="text-xs font-mono"
            style={{ color: "var(--ink-1)", fontSize: 11 }}
          >
            {relativeTime(artifact.created_at)}
          </div>
        </div>

        {/* Action */}
        <div className="shrink-0 px-3 py-2 w-36 text-right hidden md:block">
          <span
            className="inline-block px-1.5 py-0.5 rounded text-xs uppercase font-mono"
            style={{ color: "var(--ink-1)", opacity: 0.7, fontSize: 10 }}
          >
            {artifact.owner}
          </span>
          <div className="mt-1">
            <span
              className="inline-block px-2 py-0.5 rounded text-xs"
              style={{ background: statusStyle.bg, color: statusStyle.color }}
            >
              {artifact.status}
            </span>
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded flex items-stretch hover:brightness-110 transition-all"
      style={{ background: "var(--bg-1)", overflow: "hidden", minHeight: 96 }}
    >
      {/* Type bar — 4px vertical */}
      <div className="shrink-0" style={{ width: 4, background: typeColor }} />

      {/* Content — 1fr */}
      <div className="flex-1 min-w-0 p-3">
        <div className="flex items-start gap-1 mb-1">
          {artifact.pinned && (
            <span title="Pinned" style={{ color: "#f59e0b", fontSize: 11, lineHeight: "20px" }}>📌</span>
          )}
          <span
            className="text-sm font-medium leading-5"
            style={{ color: "var(--ink-0)", wordBreak: "break-word" }}
          >
            {artifact.title}
          </span>
        </div>
        <div className="text-xs mb-2" style={{ color: "var(--ink-1)" }}>
          {artifact.project}
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="inline-block px-1.5 py-0.5 rounded text-xs"
                style={{ background: "var(--bg-2)", color: "var(--ink-1)" }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Meta — ~120px */}
      <div className="shrink-0 p-3 flex flex-col items-end justify-between" style={{ width: 120 }}>
        <div className="flex flex-col items-end gap-1">
          {artifact.bible_clause && (
            <span
              className="inline-block px-1.5 py-0.5 rounded text-xs"
              style={{ background: "var(--accent-teal-dim)", color: "var(--ink-0)", fontSize: 10 }}
            >
              {artifact.bible_clause}
            </span>
          )}
          <span
            className="inline-block px-2 py-0.5 rounded text-xs capitalize"
            style={{ background: "var(--bg-2)", color: typeColor, fontSize: 10 }}
          >
            {artifact.type}
          </span>
          <span
            className="font-mono"
            style={{ color: "var(--ink-1)", fontSize: 10 }}
          >
            {relativeTime(artifact.created_at)}
          </span>
        </div>

        {/* Footer */}
        <div className="flex flex-col items-end gap-1 mt-2">
          <span
            className="uppercase font-mono"
            style={{ color: "var(--ink-1)", opacity: 0.6, fontSize: 10 }}
          >
            {artifact.owner}
          </span>
          <span
            className="inline-block px-2 py-0.5 rounded text-xs"
            style={{ background: statusStyle.bg, color: statusStyle.color, fontSize: 10 }}
          >
            {artifact.status}
          </span>
        </div>
      </div>
    </button>
  );
}

export type { Artifact };
