import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Dataset, Finding } from "@/types";
import { datasetsApi } from "@/services/api";

interface AppState {
  // Dataset list — authoritative source is the API, not localStorage
  datasets: Dataset[];
  activeDatasetId: number | null;
  datasetsLoaded: boolean; // true once first API fetch completes for this session

  setDatasets: (datasets: Dataset[]) => void;
  setActiveDataset: (id: number | null) => void;
  addDataset: (dataset: Dataset) => void;
  removeDataset: (id: number) => void;

  /**
   * Fetch datasets from the API for the authenticated user.
   * - Replaces the local cache entirely (never merges with stale data).
   * - Auto-selects the first ready dataset if nothing is active yet.
   * - Clears activeDatasetId if it no longer exists for this user.
   */
  refreshDatasets: () => Promise<void>;

  /**
   * Called on logout — wipes all user-specific state so the next
   * user starts with a clean slate.
   */
  clearUserData: () => void;

  // Evidence panel
  selectedFinding: Finding | null;
  isEvidencePanelOpen: boolean;
  openEvidencePanel: (finding: Finding) => void;
  closeEvidencePanel: () => void;

  // Sidebar
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Notifications
  unreadNotifications: number;
  setUnreadNotifications: (count: number) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      datasets: [],
      activeDatasetId: null,
      datasetsLoaded: false,

      setDatasets: (datasets) => set({ datasets, datasetsLoaded: true }),

      setActiveDataset: (id) => set({ activeDatasetId: id }),

      addDataset: (dataset) =>
        set((state) => ({
          datasets: [dataset, ...state.datasets],
          // auto-activate the freshly uploaded dataset
          activeDatasetId: dataset.id,
        })),

      removeDataset: (id) =>
        set((state) => {
          const remaining = state.datasets.filter((d) => d.id !== id);
          const newActive =
            state.activeDatasetId === id
              ? remaining.find((d) => d.status === "ready")?.id ?? null
              : state.activeDatasetId;
          return { datasets: remaining, activeDatasetId: newActive };
        }),

      refreshDatasets: async () => {
        try {
          const datasets = await datasetsApi.list();
          const state = get();

          // Validate that the current activeDatasetId still belongs to this user
          const activeStillValid =
            state.activeDatasetId !== null &&
            datasets.some((d) => d.id === state.activeDatasetId);

          const newActiveId = activeStillValid
            ? state.activeDatasetId
            : datasets.find((d) => d.status === "ready")?.id ?? null;

          set({ datasets, activeDatasetId: newActiveId, datasetsLoaded: true });
        } catch (err) {
          console.error("Failed to refresh datasets:", err);
          // Always mark as loaded even on error — dashboard must not spin forever
          set({ datasetsLoaded: true });
        }
      },

      clearUserData: () =>
        set({
          datasets: [],
          activeDatasetId: null,
          datasetsLoaded: false,
          selectedFinding: null,
          isEvidencePanelOpen: false,
        }),

      // Evidence panel
      selectedFinding: null,
      isEvidencePanelOpen: false,
      openEvidencePanel: (finding) =>
        set({ selectedFinding: finding, isEvidencePanelOpen: true }),
      closeEvidencePanel: () =>
        set({ isEvidencePanelOpen: false, selectedFinding: null }),

      // Sidebar
      isSidebarCollapsed: false,
      toggleSidebar: () =>
        set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),

      // Notifications
      unreadNotifications: 0,
      setUnreadNotifications: (count) => set({ unreadNotifications: count }),
    }),
    {
      name: "app-store",
      // Only persist UI preferences — NEVER persist dataset content in localStorage.
      // Dataset list is always re-fetched from the API on session start.
      partialize: (state) => ({
        activeDatasetId: state.activeDatasetId,
        isSidebarCollapsed: state.isSidebarCollapsed,
      }),
    }
  )
);
