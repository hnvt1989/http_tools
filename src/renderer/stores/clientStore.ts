import { create } from 'zustand';
import type { ClientRequest, ClientResponse, SavedRequest, RequestFolder } from '../../shared/types';

interface ClientState {
  // Current request being edited
  currentRequest: ClientRequest;
  // Response from last request
  response: ClientResponse | null;
  // Is request in progress
  isLoading: boolean;
  // Error message
  error: string | null;
  // Saved requests
  savedRequests: SavedRequest[];
  // Folders
  folders: RequestFolder[];
  // Selected saved request
  selectedSavedId: string | null;
  // Request history
  history: ClientResponse[];

  // Actions
  setCurrentRequest: (request: Partial<ClientRequest>) => void;
  resetCurrentRequest: () => void;
  sendRequest: () => Promise<void>;
  cancelRequest: () => void;
  clearResponse: () => void;

  // Saved requests actions
  loadSavedRequests: () => Promise<void>;
  saveCurrentRequest: (name: string, folderId?: string) => Promise<void>;
  loadSavedRequest: (id: string) => void;
  deleteSavedRequest: (id: string) => Promise<void>;
  updateSavedRequest: (request: SavedRequest) => Promise<void>;

  // Folder actions
  createFolder: (name: string, parentId?: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
}

const defaultRequest: ClientRequest = {
  method: 'GET',
  url: '',
  headers: {},
  body: undefined,
  bodyType: 'none',
  timeout: 30000,
  followRedirects: true,
};

export const useClientStore = create<ClientState>((set, get) => ({
  currentRequest: { ...defaultRequest },
  response: null,
  isLoading: false,
  error: null,
  savedRequests: [],
  folders: [],
  selectedSavedId: null,
  history: [],

  setCurrentRequest: (request) =>
    set((state) => ({
      currentRequest: { ...state.currentRequest, ...request },
    })),

  resetCurrentRequest: () =>
    set({
      currentRequest: { ...defaultRequest },
      response: null,
      error: null,
      selectedSavedId: null,
    }),

  sendRequest: async () => {
    const { currentRequest } = get();

    if (!currentRequest.url) {
      set({ error: 'URL is required' });
      return;
    }

    set({ isLoading: true, error: null, response: null });

    try {
      const response = await window.electronAPI.client.send(currentRequest);
      set((state) => ({
        response,
        isLoading: false,
        history: [response, ...state.history].slice(0, 100), // Keep last 100
      }));
    } catch (err: any) {
      set({
        isLoading: false,
        error: err.message || 'Request failed',
      });
    }
  },

  cancelRequest: () => {
    const { response } = get();
    if (response?.id) {
      window.electronAPI.client.cancel(response.id);
    }
    set({ isLoading: false });
  },

  clearResponse: () => set({ response: null, error: null }),

  loadSavedRequests: async () => {
    try {
      const [savedRequests, folders] = await Promise.all([
        window.electronAPI.savedRequests.list(),
        window.electronAPI.savedRequests.folders.list(),
      ]);
      set({ savedRequests, folders });
    } catch (err: any) {
      set({ error: err.message || 'Failed to load saved requests' });
    }
  },

  saveCurrentRequest: async (name, folderId) => {
    const { currentRequest } = get();
    try {
      const saved = await window.electronAPI.savedRequests.save({
        ...currentRequest,
        name,
        folderId,
      });
      set((state) => ({
        savedRequests: [...state.savedRequests, saved],
        selectedSavedId: saved.id,
      }));
    } catch (err: any) {
      set({ error: err.message || 'Failed to save request' });
    }
  },

  loadSavedRequest: (id) => {
    const { savedRequests } = get();
    const saved = savedRequests.find((r) => r.id === id);
    if (saved) {
      set({
        currentRequest: {
          method: saved.method,
          url: saved.url,
          headers: saved.headers,
          body: saved.body,
          bodyType: saved.bodyType,
          timeout: saved.timeout,
          followRedirects: saved.followRedirects,
        },
        selectedSavedId: id,
        response: null,
        error: null,
      });
    }
  },

  deleteSavedRequest: async (id) => {
    try {
      await window.electronAPI.savedRequests.delete(id);
      set((state) => ({
        savedRequests: state.savedRequests.filter((r) => r.id !== id),
        selectedSavedId: state.selectedSavedId === id ? null : state.selectedSavedId,
      }));
    } catch (err: any) {
      set({ error: err.message || 'Failed to delete request' });
    }
  },

  updateSavedRequest: async (request) => {
    try {
      const updated = await window.electronAPI.savedRequests.update(request);
      set((state) => ({
        savedRequests: state.savedRequests.map((r) =>
          r.id === updated.id ? updated : r
        ),
      }));
    } catch (err: any) {
      set({ error: err.message || 'Failed to update request' });
    }
  },

  createFolder: async (name, parentId) => {
    try {
      const folder = await window.electronAPI.savedRequests.folders.create({
        name,
        parentId,
        order: get().folders.length,
      });
      set((state) => ({ folders: [...state.folders, folder] }));
    } catch (err: any) {
      set({ error: err.message || 'Failed to create folder' });
    }
  },

  deleteFolder: async (id) => {
    try {
      await window.electronAPI.savedRequests.folders.delete(id);
      set((state) => ({
        folders: state.folders.filter((f) => f.id !== id),
      }));
    } catch (err: any) {
      set({ error: err.message || 'Failed to delete folder' });
    }
  },
}));
