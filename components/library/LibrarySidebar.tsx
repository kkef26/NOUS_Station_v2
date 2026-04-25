"use client";

interface SidebarFilter {
  type: "all" | "pinned" | "recent" | "project" | "type" | "status";
  value?: string;
}

interface FacetCounts {
  total: number;
  pinned: number;
  recent_7d: number;
  by_project: Record<string, number>;
  by_type: Record<string, number>;
  by_status: Record<string, number>;
}

interface LibrarySidebarProps {
  facets: FacetCounts;
  active: SidebarFilter;
  onFilter: (f: SidebarFilter) => void;
  onClose?: () => void;
}

const PROJECT_COLORS: Record<string, string> = {
  "nous-station": "#3ad6c4",
  "axio": "#F97316",
  "grecian-gyro": "#E2B33F",
  "paideia": "#6EE7B7",
  "solid": "#94A3B8",
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

const STATUS_COLORS: Record<string, string> = {
  draft: "#94A3B8",
  review: "#f59e0b",
  approved: "#4ade80",
  archived: "#475569",
};

function NavItem({
  label,
  count,
  active,
  dot,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  dot?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-1.5 rounded text-xs text-left transition-colors"
      style={{
        background: active ? "var(--accent-teal-dim)" : "transparent",
        color: active ? "var(--ink-0)" : "var(--ink-1)",
      }}
    >
      {dot && (
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: dot }}
        />
      )}
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span
          className="text-xs tabular-nums"
          style={{ color: active ? "var(--ink-0)" : "var(--ink-1)", opacity: 0.7 }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div
        className="px-3 py-1 text-xs font-medium uppercase tracking-wider mb-1"
        style={{ color: "var(--ink-1)", opacity: 0.6 }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

export function LibrarySidebar({ facets, active, onFilter, onClose }: LibrarySidebarProps) {
  const isActive = (f: SidebarFilter) => {
    if (f.type !== active.type) return false;
    if (f.value !== active.value) return false;
    return true;
  };

  return (
    <div
      className="h-full flex flex-col py-3 overflow-y-auto"
      style={{ background: "var(--bg-1)" }}
    >
      {onClose && (
        <div className="flex items-center justify-between px-3 mb-3">
          <span className="text-xs font-medium" style={{ color: "var(--ink-0)" }}>Filter</span>
          <button
            onClick={onClose}
            className="text-xs px-2 py-1 rounded"
            style={{ color: "var(--ink-1)", background: "var(--bg-2)" }}
          >
            ✕
          </button>
        </div>
      )}

      <Section title="All">
        <NavItem
          label="Everything"
          count={facets.total}
          active={isActive({ type: "all" })}
          onClick={() => onFilter({ type: "all" })}
        />
        <NavItem
          label="Pinned to Home"
          count={facets.pinned}
          active={isActive({ type: "pinned" })}
          onClick={() => onFilter({ type: "pinned" })}
        />
        <NavItem
          label="Recent 7d"
          count={facets.recent_7d}
          active={isActive({ type: "recent" })}
          onClick={() => onFilter({ type: "recent" })}
        />
      </Section>

      {Object.keys(facets.by_project).length > 0 && (
        <Section title="By Project">
          {Object.entries(facets.by_project).map(([proj, count]) => (
            <NavItem
              key={proj}
              label={proj}
              count={count}
              dot={PROJECT_COLORS[proj] || "#94A3B8"}
              active={isActive({ type: "project", value: proj })}
              onClick={() => onFilter({ type: "project", value: proj })}
            />
          ))}
        </Section>
      )}

      {Object.keys(facets.by_type).length > 0 && (
        <Section title="By Type">
          {Object.entries(facets.by_type).map(([t, count]) => (
            <NavItem
              key={t}
              label={t}
              count={count}
              dot={TYPE_COLORS[t] || "#94A3B8"}
              active={isActive({ type: "type", value: t })}
              onClick={() => onFilter({ type: "type", value: t })}
            />
          ))}
        </Section>
      )}

      {Object.keys(facets.by_status).length > 0 && (
        <Section title="By Status">
          {Object.entries(facets.by_status).map(([s, count]) => (
            <NavItem
              key={s}
              label={s}
              count={count}
              dot={STATUS_COLORS[s] || "#94A3B8"}
              active={isActive({ type: "status", value: s })}
              onClick={() => onFilter({ type: "status", value: s })}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

export type { SidebarFilter, FacetCounts };
