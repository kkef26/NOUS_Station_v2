import { create } from "zustand";

type Density = "global" | "compact";
type Theme = "dark" | "light";
type DrawerName = "pulse" | "factory" | "fleet" | "signals" | null;

interface UIStore {
  density: Density;
  theme: Theme;
  openDrawer: DrawerName;
  composerOpen: boolean;
  helpModalOpen: boolean;
  setDensity: (d: Density) => void;
  setTheme: (t: Theme) => void;
  setOpenDrawer: (d: DrawerName) => void;
  toggleDrawer: (d: Exclude<DrawerName, null>) => void;
  setComposerOpen: (open: boolean) => void;
  setHelpModalOpen: (open: boolean) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  density:
    (typeof window !== "undefined"
      ? (localStorage.getItem("nst_density") as Density)
      : null) || "global",
  theme:
    (typeof window !== "undefined"
      ? localStorage.getItem("nous-theme") === "light"
        ? "light"
        : "dark"
      : "dark") as Theme,
  openDrawer: null,
  composerOpen: false,
  helpModalOpen: false,
  setDensity: (density) => {
    if (typeof window !== "undefined") localStorage.setItem("nst_density", density);
    set({ density });
  },
  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      if (theme === "light") {
        document.documentElement.setAttribute("data-theme", "light");
        localStorage.setItem("nous-theme", "light");
      } else {
        document.documentElement.removeAttribute("data-theme");
        localStorage.removeItem("nous-theme");
      }
    }
    set({ theme });
  },
  setOpenDrawer: (d) => set({ openDrawer: d }),
  toggleDrawer: (d) => set((s) => ({ openDrawer: s.openDrawer === d ? null : d })),
  setComposerOpen: (composerOpen) => set({ composerOpen }),
  setHelpModalOpen: (helpModalOpen) => set({ helpModalOpen }),
}));
