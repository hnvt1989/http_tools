import { create } from 'zustand';
import type { TrafficEntry, TrafficFilter } from '../../shared/types';

interface TrafficState {
  entries: TrafficEntry[];
  selectedId: string | null;
  filter: TrafficFilter;
  isRecording: boolean;
  maxEntries: number;

  // Actions
  addEntry: (entry: TrafficEntry) => void;
  updateEntry: (entry: TrafficEntry) => void;
  selectEntry: (id: string | null) => void;
  setFilter: (filter: Partial<TrafficFilter>) => void;
  clearFilter: () => void;
  clearEntries: () => void;
  toggleRecording: () => void;
  setMaxEntries: (max: number) => void;
  deleteEntry: (id: string) => void;

  // Computed
  getFilteredEntries: () => TrafficEntry[];
  getSelectedEntry: () => TrafficEntry | undefined;
  getStats: () => {
    total: number;
    pending: number;
    complete: number;
    errors: number;
    mocked: number;
  };
}

export const useTrafficStore = create<TrafficState>((set, get) => ({
  entries: [],
  selectedId: null,
  filter: {},
  isRecording: true,
  maxEntries: 10000,

  addEntry: (entry) => {
    if (!get().isRecording) return;

    set((state) => {
      const newEntries = [...state.entries, entry];
      // Trim if exceeds max
      if (newEntries.length > state.maxEntries) {
        return { entries: newEntries.slice(-state.maxEntries) };
      }
      return { entries: newEntries };
    });
  },

  updateEntry: (entry) => {
    set((state) => ({
      entries: state.entries.map((e) => (e.id === entry.id ? entry : e)),
    }));
  },

  selectEntry: (id) => set({ selectedId: id }),

  setFilter: (filter) =>
    set((state) => ({
      filter: { ...state.filter, ...filter },
    })),

  clearFilter: () => set({ filter: {} }),

  clearEntries: () => set({ entries: [], selectedId: null }),

  toggleRecording: () => set((state) => ({ isRecording: !state.isRecording })),

  setMaxEntries: (max) => set({ maxEntries: max }),

  deleteEntry: (id) =>
    set((state) => ({
      entries: state.entries.filter((e) => e.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    })),

  getFilteredEntries: () => {
    const { entries, filter } = get();

    return entries.filter((entry) => {
      // Method filter
      if (filter.methods?.length) {
        if (!filter.methods.includes(entry.request.method)) {
          return false;
        }
      }

      // Status code filter
      if (filter.statusCodes?.length && entry.response) {
        const statusGroup = `${Math.floor(entry.response.statusCode / 100)}xx`;
        if (!filter.statusCodes.includes(statusGroup)) {
          return false;
        }
      }

      // Content type filter
      if (filter.contentTypes?.length && entry.response) {
        const contentType = entry.response.headers['content-type'];
        if (contentType) {
          const ct = String(contentType).split(';')[0].trim();
          const matches = filter.contentTypes.some((f) => ct.includes(f));
          if (!matches) return false;
        }
      }

      // Host filter
      if (filter.hosts?.length) {
        try {
          const url = new URL(entry.request.url);
          if (!filter.hosts.includes(url.host)) {
            return false;
          }
        } catch {
          return false;
        }
      }

      // Search filter
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        const url = entry.request.url.toLowerCase();
        const method = entry.request.method.toLowerCase();
        if (!url.includes(searchLower) && !method.includes(searchLower)) {
          return false;
        }
      }

      // Show only errors
      if (filter.showOnlyErrors) {
        if (entry.status !== 'error') return false;
      }

      // Show only mocked
      if (filter.showOnlyMocked) {
        if (entry.status !== 'mocked') return false;
      }

      return true;
    });
  },

  getSelectedEntry: () => {
    const { entries, selectedId } = get();
    return entries.find((e) => e.id === selectedId);
  },

  getStats: () => {
    const entries = get().entries;
    return {
      total: entries.length,
      pending: entries.filter((e) => e.status === 'pending' || e.status === 'active').length,
      complete: entries.filter((e) => e.status === 'complete').length,
      errors: entries.filter((e) => e.status === 'error').length,
      mocked: entries.filter((e) => e.status === 'mocked').length,
    };
  },
}));
