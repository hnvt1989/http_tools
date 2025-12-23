import { create } from 'zustand';
import type { Rule } from '../../shared/types';

interface RulesState {
  rules: Rule[];
  selectedId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setRules: (rules: Rule[]) => void;
  selectRule: (id: string | null) => void;
  loadRules: () => Promise<void>;
  addRule: (rule: Omit<Rule, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Rule>;
  updateRule: (rule: Rule) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
  toggleRule: (id: string) => Promise<void>;
  reorderRules: (ids: string[]) => Promise<void>;
  importRules: (data: string) => Promise<void>;
  exportRules: () => Promise<string>;

  // Computed
  getSelectedRule: () => Rule | undefined;
  getEnabledRules: () => Rule[];
}

export const useRulesStore = create<RulesState>((set, get) => ({
  rules: [],
  selectedId: null,
  isLoading: false,
  error: null,

  setRules: (rules) => set({ rules }),

  selectRule: (id) => set({ selectedId: id }),

  loadRules: async () => {
    set({ isLoading: true, error: null });
    try {
      const rules = await window.electronAPI.rules.list();
      set({ rules, isLoading: false });
    } catch (err: any) {
      set({
        isLoading: false,
        error: err.message || 'Failed to load rules',
      });
    }
  },

  addRule: async (rule) => {
    try {
      const newRule = await window.electronAPI.rules.add(rule);
      set((state) => ({ rules: [...state.rules, newRule] }));
      return newRule;
    } catch (err: any) {
      set({ error: err.message || 'Failed to add rule' });
      throw err;
    }
  },

  updateRule: async (rule) => {
    try {
      const updated = await window.electronAPI.rules.update(rule);
      set((state) => ({
        rules: state.rules.map((r) => (r.id === updated.id ? updated : r)),
      }));
    } catch (err: any) {
      set({ error: err.message || 'Failed to update rule' });
      throw err;
    }
  },

  deleteRule: async (id) => {
    try {
      await window.electronAPI.rules.delete(id);
      set((state) => ({
        rules: state.rules.filter((r) => r.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId,
      }));
    } catch (err: any) {
      set({ error: err.message || 'Failed to delete rule' });
      throw err;
    }
  },

  toggleRule: async (id) => {
    try {
      const updated = await window.electronAPI.rules.toggle(id);
      set((state) => ({
        rules: state.rules.map((r) => (r.id === updated.id ? updated : r)),
      }));
    } catch (err: any) {
      set({ error: err.message || 'Failed to toggle rule' });
      throw err;
    }
  },

  reorderRules: async (ids) => {
    try {
      await window.electronAPI.rules.reorder(ids);
      const rules = await window.electronAPI.rules.list();
      set({ rules });
    } catch (err: any) {
      set({ error: err.message || 'Failed to reorder rules' });
      throw err;
    }
  },

  importRules: async (data) => {
    try {
      const imported = await window.electronAPI.rules.import(data);
      set((state) => ({ rules: [...state.rules, ...imported] }));
    } catch (err: any) {
      set({ error: err.message || 'Failed to import rules' });
      throw err;
    }
  },

  exportRules: async () => {
    try {
      return await window.electronAPI.rules.export();
    } catch (err: any) {
      set({ error: err.message || 'Failed to export rules' });
      throw err;
    }
  },

  getSelectedRule: () => {
    const { rules, selectedId } = get();
    return rules.find((r) => r.id === selectedId);
  },

  getEnabledRules: () => {
    return get().rules.filter((r) => r.enabled);
  },
}));
