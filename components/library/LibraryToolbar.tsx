"use client";

import { useEffect, useRef } from "react";

interface LibraryToolbarProps {
  totalCount: number;
  projectCount: number;
  searchQuery: string;
  onSearch: (q: string) => void;
  viewMode: "grid" | "list";
  onViewMode: (v: "grid" | "list") => void;
}

export function LibraryToolbar({
  totalCount,
  projectCount,
  searchQuery,
  onSearch,
  viewMode,
  onViewMode,
}: LibraryToolbarProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearch(val), 200);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 border-b shrink-0"
      style={{ borderColor: "var(--bg-2)" }}
    >
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium" style={{ color: "var(--ink-0)" }}>
          Library
        </span>
        <span className="ml-2 text-xs" style={{ color: "var(--ink-1)" }}>
          {totalCount} artifact{totalCount !== 1 ? "s" : ""} across {projectCount} project{projectCount !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="relative">
        <input
          type="text"
          placeholder="Search…"
          defaultValue={searchQuery}
          onChange={handleInput}
          className="text-sm rounded px-3 py-1.5 outline-none w-48"
          style={{
            background: "var(--bg-2)",
            color: "var(--ink-0)",
            border: "1px solid transparent",
          }}
          onFocus={(e) => (e.target.style.borderColor = "var(--accent-teal)")}
          onBlur={(e) => (e.target.style.borderColor = "transparent")}
        />
      </div>

      <div className="flex gap-1 shrink-0">
        <button
          onClick={() => onViewMode("grid")}
          className="px-2 py-1.5 rounded text-xs transition-colors"
          style={{
            background: viewMode === "grid" ? "var(--accent-teal)" : "var(--bg-2)",
            color: viewMode === "grid" ? "var(--bg-0)" : "var(--ink-1)",
          }}
          title="Grid view"
        >
          ⊞
        </button>
        <button
          onClick={() => onViewMode("list")}
          className="px-2 py-1.5 rounded text-xs transition-colors"
          style={{
            background: viewMode === "list" ? "var(--accent-teal)" : "var(--bg-2)",
            color: viewMode === "list" ? "var(--bg-0)" : "var(--ink-1)",
          }}
          title="List view"
        >
          ☰
        </button>
      </div>
    </div>
  );
}
