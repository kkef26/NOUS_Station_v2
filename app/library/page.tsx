"use client";

import { DeckShell } from "@/components/DeckShell";
import { LibraryShell } from "@/components/library/LibraryShell";

export default function LibraryPage() {
  return (
    <DeckShell surfaceLabel="Library">
      <LibraryShell />
    </DeckShell>
  );
}
