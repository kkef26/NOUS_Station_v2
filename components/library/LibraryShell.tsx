"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { LibrarySidebar } from "./LibrarySidebar";
import { LibraryToolbar } from "./LibraryToolbar";
import { LibraryFilters } from "./LibraryFilters";
import { ArtifactCard } from "./ArtifactCard";
import { ArtifactDetail } from "./ArtifactDetail";
import type { SidebarFilter, FacetCounts } from "./LibrarySidebar";
import type { Artifact } from "./ArtifactCard";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const EMPTY_FACETS: FacetCounts = {
  total: 0,
  pinned: 0,
  recent_7d: 0,
  by_project: {},
  by_type: {},
  by_status: {},
};

export function LibraryShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>({ type: "all" });
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [activeType, setActiveType] = useState("");
  const [activeSince, setActiveSince] = useState("");
  const [hasClause, setHasClause] = useState(false);
  const [showPinned, setShowPinned] = useState(false);
  const [sort, setSort] = useState("created_at");
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);

  // Build query URL
  const params = new URLSearchParams();
  if (activeType) params.set("type", activeType);
  if (activeSince) params.set("since", activeSince);
  if (hasClause) params.set("has_clause", "true");
  if (showPinned) params.set("pinned", "true");
  if (searchQuery) params.set("search", searchQuery);
  if (sort) params.set("sort", sort);

  // Apply sidebar filter to API params
  if (sidebarFilter.type === "pinned") params.set("pinned", "true");
  if (sidebarFilter.type === "recent") params.set("since", "7");
  if (sidebarFilter.type === "project" && sidebarFilter.value) params.set("project", sidebarFilter.value);
  if (sidebarFilter.type === "type" && sidebarFilter.value) params.set("type", sidebarFilter.value);
  if (sidebarFilter.type === "status" && sidebarFilter.value) params.set("status", sidebarFilter.value);

  const { data, mutate } = useSWR(
    `/api/library?${params.toString()}`,
    fetcher,
    { refreshInterval: 30000 }
  );

  const artifacts: Artifact[] = data?.artifacts || [];
  const facets: FacetCounts = data?.facet_counts || EMPTY_FACETS;
  const projectCount = Object.keys(facets.by_project).length;

  function handleUpdate(updated: Artifact) {
    mutate();
    if (selectedArtifact?.id === updated.id) {
      setSelectedArtifact(updated);
    }
  }

  return (
    <div
      className="lib-wrap flex h-full"
      style={{ height: "calc(100vh - 56px - 48px)", minHeight: 0 }}
    >
      {/* Sidebar — desktop always visible, mobile overlay */}
      <div
        className="hidden md:flex shrink-0 flex-col border-r overflow-hidden"
        style={{ width: 220, borderColor: "var(--bg-2)" }}
      >
        <LibrarySidebar
          facets={facets}
          active={sidebarFilter}
          onFilter={setSidebarFilter}
        />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 flex"
          onClick={() => setSidebarOpen(false)}
        >
          <div className="absolute inset-0" style={{ background: "rgba(10,26,47,0.6)" }} />
          <div
            className="relative w-64 h-full overflow-y-auto"
            style={{ background: "var(--bg-1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <LibrarySidebar
              facets={facets}
              active={sidebarFilter}
              onFilter={(f) => {
                setSidebarFilter(f);
                setSidebarOpen(false);
              }}
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main body */}
      <div className="lib-body flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile sidebar toggle */}
        <div className="md:hidden flex items-center px-3 py-1.5 border-b" style={{ borderColor: "var(--bg-2)" }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-xs px-2 py-1 rounded"
            style={{ background: "var(--bg-2)", color: "var(--ink-1)" }}
          >
            ☰ Filter
          </button>
        </div>

        <LibraryToolbar
          totalCount={artifacts.length}
          projectCount={projectCount}
          searchQuery={searchQuery}
          onSearch={setSearchQuery}
          viewMode={viewMode}
          onViewMode={setViewMode}
        />

        <LibraryFilters
          activeType={activeType}
          onType={setActiveType}
          activeSince={activeSince}
          onSince={setActiveSince}
          hasClause={hasClause}
          onHasClause={setHasClause}
          showPinned={showPinned}
          onPinned={setShowPinned}
          sort={sort}
          onSort={setSort}
        />

        {/* Card grid / list */}
        <div className="flex-1 overflow-y-auto p-4">
          {artifacts.length === 0 ? (
            <div
              className="flex items-center justify-center h-32 text-sm"
              style={{ color: "var(--ink-1)" }}
            >
              No artifacts found.
            </div>
          ) : viewMode === "grid" ? (
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              }}
            >
              {artifacts.map((a) => (
                <ArtifactCard
                  key={a.id}
                  artifact={a}
                  viewMode="grid"
                  onClick={() => setSelectedArtifact(a)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {artifacts.map((a) => (
                <ArtifactCard
                  key={a.id}
                  artifact={a}
                  viewMode="list"
                  onClick={() => setSelectedArtifact(a)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail modal */}
      {selectedArtifact && (
        <ArtifactDetail
          artifact={selectedArtifact}
          onClose={() => setSelectedArtifact(null)}
          onUpdate={handleUpdate}
        />
      )}
    </div>
  );
}
