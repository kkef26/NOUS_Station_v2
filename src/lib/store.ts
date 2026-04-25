import { create } from "zustand"
import type { Chat } from "@/types"
import type { IntrospectError } from "./introspect-types"
import { stationClient } from "./station-client"
import type { User, Session } from "@supabase/supabase-js"

type Account = "c1" | "c2"
export type NavRailMode = "always-show" | "auto-hide" | "always-hide"

export type DrawerTab = "sandbox" | "build" | "fleet" | "dispatch" | "memory" | "usage" | "pipeline" | "boardroom" | "settings" | "chat-peek"
export type RailMode = "chats" | "boards" | "warrooms"

interface StationStore {
  // Active conversation
  activeChatId: string | null
  setActiveChatId: (id: string | null) => void

  // Account routing
  activeAccount: Account
  setActiveAccount: (account: Account) => void
  toggleAccount: () => void

  // Sidebar (legacy compat)
  sidebarCollapsed: boolean
  toggleSidebar: () => void

  // Sidebar refresh signal
  sidebarRefreshKey: number
  bumpSidebar: () => void

  // Right panel (legacy compat)
  rightPanelOpen: boolean
  rightPanelBuildId: string | null
  openRightPanel: (buildId: string) => void
  closeRightPanel: () => void

  // V3: Drawer
  drawerOpen: boolean
  activeDrawerTab: DrawerTab
  drawerWidth: number
  isDraggingDrawer: boolean
  openDrawer: (tab: DrawerTab) => void
  closeDrawer: () => void
  setDrawerTab: (tab: DrawerTab) => void
  setDrawerWidth: (width: number) => void
  setIsDraggingDrawer: (dragging: boolean) => void
  resetDrawerWidth: () => void

  // V3: Theme
  theme: "dark" | "light"
  toggleTheme: () => void

  // V3: Rail mode
  railMode: RailMode
  setRailMode: (mode: RailMode) => void
  railCollapsed: boolean
  toggleRail: () => void

  // V3: Context rail (right side)
  contextRailCollapsed: boolean
  toggleContextRail: () => void

  // V3: Nav rail auto-hide
  navRailMode: NavRailMode
  setNavRailMode: (mode: NavRailMode) => void

  // V3: Command palette
  commandPaletteOpen: boolean
  toggleCommandPalette: () => void
  setCommandPaletteOpen: (open: boolean) => void

  // Layout persistence
  layoutId: string | null
  setLayoutId: (id: string) => void
  saveLayout: () => Promise<void>
  loadLayout: () => Promise<void>

  // Navigation helper
  openChat: (chatId: string) => void
  createAndOpenChat: (projectTag?: string) => Promise<void>

  // Keyboard shortcut coordination refs
  _inputRef: { current: HTMLTextAreaElement | null } | null
  _abortRef: { current: boolean } | null
  _submitRef: { current: (() => void) | null } | null
  registerConversationRefs: (refs: {
    input: { current: HTMLTextAreaElement | null }
    abort: { current: boolean }
    submit: { current: (() => void) | null }
  }) => void

  // T3: Introspect observability
  errorLog: IntrospectError[]
  lastSnapshotAt: string | null
  logError: (error: IntrospectError) => void
  clearErrors: () => void
  setLastSnapshotAt: (ts: string) => void

  // Auth slice
  user: User | null
  session: Session | null
  authLoading: boolean
  setSession: (session: Session | null) => void
  signOut: () => Promise<void>

  // Chat tabs (Phase 3.3)
  chatTabsList: Chat[]
  setChatTabsList: (chats: Chat[]) => void

  // AC05: Chat-peek drawer
  peekChatId: string | null
  setPeekChatId: (id: string | null) => void
}

const DRAWER_WIDTH_KEY = "nous-station-drawer-width"
const DRAWER_DEFAULT = 500
const DRAWER_MIN = 320
const DRAWER_MAX_PCT = 0.6

function clampDrawerWidth(w: number): number {
  const maxPx = typeof window !== "undefined"
    ? Math.min(window.innerWidth * DRAWER_MAX_PCT, 900)
    : 900
  return Math.max(DRAWER_MIN, Math.min(w, maxPx))
}

function loadDrawerWidth(): number {
  if (typeof window === "undefined") return DRAWER_DEFAULT
  try {
    const stored = localStorage.getItem(DRAWER_WIDTH_KEY)
    if (stored) {
      const n = parseInt(stored, 10)
      if (!isNaN(n)) return clampDrawerWidth(n)
    }
  } catch {}
  return DRAWER_DEFAULT
}

export const useStore = create<StationStore>((set, get) => ({
  activeChatId: null,
  setActiveChatId: (id) => {
    set({ activeChatId: id })
    setTimeout(() => get().saveLayout(), 500)
  },

  activeAccount: "c1",
  setActiveAccount: (account) => set({ activeAccount: account }),
  toggleAccount: () => set((s) => ({ activeAccount: s.activeAccount === "c1" ? "c2" : "c1" })),

  sidebarCollapsed: false,
  toggleSidebar: () => {
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed, railCollapsed: !s.railCollapsed }))
    setTimeout(() => get().saveLayout(), 500)
  },

  sidebarRefreshKey: 0,
  bumpSidebar: () => set((s) => ({ sidebarRefreshKey: s.sidebarRefreshKey + 1 })),

  rightPanelOpen: false,
  rightPanelBuildId: null,
  openRightPanel: (buildId) => set({
    rightPanelOpen: true,
    rightPanelBuildId: buildId,
    drawerOpen: true,
    activeDrawerTab: "build",
  }),
  closeRightPanel: () => set({
    rightPanelOpen: false,
    rightPanelBuildId: null,
    drawerOpen: false,
  }),

  // V3: Drawer
  drawerOpen: false,
  activeDrawerTab: "fleet",
  drawerWidth: DRAWER_DEFAULT,
  isDraggingDrawer: false,
  openDrawer: (tab) => set({ drawerOpen: true, activeDrawerTab: tab }),
  closeDrawer: () => set({ drawerOpen: false }),
  setDrawerTab: (tab) => set({ activeDrawerTab: tab }),
  setDrawerWidth: (width) => {
    const clamped = clampDrawerWidth(width)
    set({ drawerWidth: clamped })
    try { localStorage.setItem(DRAWER_WIDTH_KEY, String(clamped)) } catch {}
  },
  setIsDraggingDrawer: (dragging) => set({ isDraggingDrawer: dragging }),
  resetDrawerWidth: () => {
    set({ drawerWidth: DRAWER_DEFAULT })
    try { localStorage.setItem(DRAWER_WIDTH_KEY, String(DRAWER_DEFAULT)) } catch {}
  },

  // V3: Theme
  theme: "dark",
  toggleTheme: () => {
    const next = get().theme === "dark" ? "light" : "dark"
    set({ theme: next })
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", next)
    }
  },

  // V3: Rail
  railMode: "chats",
  setRailMode: (mode) => set({ railMode: mode }),
  railCollapsed: false,
  toggleRail: () => {
    set((s) => ({ railCollapsed: !s.railCollapsed, sidebarCollapsed: !s.sidebarCollapsed }))
    setTimeout(() => get().saveLayout(), 500)
  },

  // Context rail (right side)
  contextRailCollapsed: false,
  toggleContextRail: () => {
    set((s) => ({ contextRailCollapsed: !s.contextRailCollapsed }))
    setTimeout(() => get().saveLayout(), 500)
  },

  // Nav rail auto-hide
  navRailMode: (() => {
    if (typeof window === "undefined") return "always-show" as NavRailMode
    try {
      const stored = localStorage.getItem("nous-station-nav-rail-mode")
      if (stored === "auto-hide" || stored === "always-hide") return stored as NavRailMode
    } catch {}
    return "always-show" as NavRailMode
  })(),
  setNavRailMode: (mode) => {
    set({ navRailMode: mode })
    try { localStorage.setItem("nous-station-nav-rail-mode", mode) } catch {}
  },

  // V3: Command palette
  commandPaletteOpen: false,
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  layoutId: null,
  setLayoutId: (id) => set({ layoutId: id }),

  openChat: (chatId) => {
    set({ activeChatId: chatId })
    setTimeout(() => get().saveLayout(), 500)
  },

  createAndOpenChat: async (projectTag) => {
    try {
      const chat = await stationClient.createChat({
        title: "New Chat",
        project_tag: projectTag,
      })
      set({ activeChatId: chat.id })
      setTimeout(() => get().saveLayout(), 500)
      setTimeout(() => get().bumpSidebar(), 100)
    } catch (e) {
      console.error("Failed to create chat:", e)
    }
  },

  saveLayout: async () => {
    const { layoutId, activeChatId, sidebarCollapsed, rightPanelOpen, rightPanelBuildId } = get()
    if (!layoutId) return
    try {
      await stationClient.updateLayout(layoutId, {
        tabs: [],
        sidebar_collapsed: sidebarCollapsed,
        right_panel_open: rightPanelOpen,
        right_panel_artifact_id: rightPanelBuildId,
        active_tab_id: activeChatId,
      })
    } catch (e) {
      console.warn("Layout save failed:", e)
    }
  },

  loadLayout: async () => {
    try {
      const layout = await stationClient.getLayout("main")
      if (!layout) return
      set({
        layoutId: layout.id,
        activeChatId: layout.active_tab_id && layout.active_tab_id.includes("-") && layout.active_tab_id.length > 20
          ? layout.active_tab_id
          : null,
        sidebarCollapsed: layout.sidebar_collapsed ?? false,
        railCollapsed: layout.sidebar_collapsed ?? false,
        rightPanelOpen: layout.right_panel_open ?? false,
        rightPanelBuildId: layout.right_panel_artifact_id ?? null,
        drawerWidth: loadDrawerWidth(),
      })
    } catch (e) {
      console.warn("Layout load failed:", e)
    }
  },

  _inputRef: null,
  _abortRef: null,
  _submitRef: null,
  registerConversationRefs: ({ input, abort, submit }) =>
    set({ _inputRef: input, _abortRef: abort, _submitRef: submit }),

  // T3: Introspect observability
  errorLog: [],
  lastSnapshotAt: null,
  logError: (error) =>
    set((s) => {
      const now = Date.now()
      const existing = s.errorLog.find(
        (e) =>
          e.message === error.message &&
          (now - new Date(e.timestamp).getTime()) < 60000
      )
      if (existing) {
        return {
          errorLog: s.errorLog.map((e) =>
            e === existing ? { ...e, count: e.count + 1 } : e
          ),
        }
      }
      return { errorLog: [...s.errorLog.slice(-49), { ...error, count: 1, timestamp: new Date().toISOString() }] }
    }),
  clearErrors: () => set({ errorLog: [] }),
  setLastSnapshotAt: (ts) => set({ lastSnapshotAt: ts }),

  // Auth slice
  user: null,
  session: null,
  authLoading: true,
  setSession: (session) => set({
    session,
    user: session?.user ?? null,
    authLoading: false,
  }),
  signOut: async () => {
    const { supabase } = await import("@/lib/supabase")
    await supabase.auth.signOut()
    set({ user: null, session: null, authLoading: false })
    if (typeof window !== "undefined") {
      window.location.href = "/login"
    }
  },

  // Chat tabs slice (Phase 3.3)
  chatTabsList: [],
  setChatTabsList: (chats) => set({ chatTabsList: chats }),

  // AC05: Chat-peek drawer
  peekChatId: null,
  setPeekChatId: (id) => set({ peekChatId: id }),
}))


