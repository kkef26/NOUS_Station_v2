"use client";

interface LibraryFiltersProps {
  activeType: string;
  onType: (t: string) => void;
  activeSince: string;
  onSince: (s: string) => void;
  hasClause: boolean;
  onHasClause: (v: boolean) => void;
  showPinned: boolean;
  onPinned: (v: boolean) => void;
  sort: string;
  onSort: (s: string) => void;
}

const TYPE_CHIPS = [
  { label: "All", value: "" },
  { label: "Mockups", value: "mockup" },
  { label: "Docs", value: "doc" },
  { label: "Charts", value: "chart" },
  { label: "Diffs", value: "diff" },
];

const TIME_PILLS = [
  { label: "All time", value: "" },
  { label: "7d", value: "7" },
  { label: "30d", value: "30" },
];

const SORT_OPTIONS = [
  { label: "Last edited", value: "created_at" },
  { label: "Title A–Z", value: "title" },
];

export function LibraryFilters({
  activeType,
  onType,
  activeSince,
  onSince,
  hasClause,
  onHasClause,
  showPinned,
  onPinned,
  sort,
  onSort,
}: LibraryFiltersProps) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2 border-b shrink-0 flex-wrap"
      style={{ borderColor: "var(--bg-2)" }}
    >
      {/* Type chips */}
      <div className="flex gap-1">
        {TYPE_CHIPS.map((c) => (
          <button
            key={c.value}
            onClick={() => onType(c.value)}
            className="px-2.5 py-1 rounded-full text-xs transition-colors"
            style={{
              background: activeType === c.value ? "var(--accent-teal)" : "var(--bg-2)",
              color: activeType === c.value ? "var(--bg-0)" : "var(--ink-1)",
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div style={{ width: 1, height: 16, background: "var(--bg-2)" }} />

      {/* Time pills */}
      <div className="flex gap-1">
        {TIME_PILLS.map((p) => (
          <button
            key={p.value}
            onClick={() => onSince(p.value)}
            className="px-2.5 py-1 rounded-full text-xs transition-colors"
            style={{
              background: activeSince === p.value ? "var(--accent-teal-dim)" : "var(--bg-2)",
              color: activeSince === p.value ? "var(--ink-0)" : "var(--ink-1)",
              border: activeSince === p.value ? "1px solid var(--accent-teal)" : "1px solid transparent",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ width: 1, height: 16, background: "var(--bg-2)" }} />

      {/* Attribute chips */}
      <button
        onClick={() => onHasClause(!hasClause)}
        className="px-2.5 py-1 rounded-full text-xs transition-colors"
        style={{
          background: hasClause ? "var(--accent-teal-dim)" : "var(--bg-2)",
          color: hasClause ? "var(--ink-0)" : "var(--ink-1)",
          border: hasClause ? "1px solid var(--accent-teal)" : "1px solid transparent",
        }}
      >
        Has clause
      </button>

      <button
        onClick={() => onPinned(!showPinned)}
        className="px-2.5 py-1 rounded-full text-xs transition-colors"
        style={{
          background: showPinned ? "var(--accent-teal-dim)" : "var(--bg-2)",
          color: showPinned ? "var(--ink-0)" : "var(--ink-1)",
          border: showPinned ? "1px solid var(--accent-teal)" : "1px solid transparent",
        }}
      >
        📌 Pinned
      </button>

      <div className="ml-auto">
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value)}
          className="text-xs rounded px-2 py-1 outline-none"
          style={{ background: "var(--bg-2)", color: "var(--ink-1)", border: "none" }}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
