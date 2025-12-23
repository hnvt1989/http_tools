import Store from 'electron-store';
import { v4 as uuid } from 'uuid';
import type { SavedRequest, RequestFolder } from '../../shared/types';

interface SavedRequestsData {
  requests: SavedRequest[];
  folders: RequestFolder[];
}

export class SavedRequestsStore {
  private store: Store<SavedRequestsData>;

  constructor() {
    this.store = new Store<SavedRequestsData>({
      name: 'saved-requests',
      defaults: {
        requests: [],
        folders: [],
      },
    });
  }

  // Requests

  listRequests(): SavedRequest[] {
    return this.store.get('requests', []);
  }

  saveRequest(
    request: Omit<SavedRequest, 'id' | 'createdAt' | 'updatedAt'>
  ): SavedRequest {
    const requests = this.store.get('requests', []);
    const now = Date.now();

    const newRequest: SavedRequest = {
      ...request,
      id: uuid(),
      createdAt: now,
      updatedAt: now,
    };

    requests.push(newRequest);
    this.store.set('requests', requests);

    return newRequest;
  }

  updateRequest(request: SavedRequest): SavedRequest {
    const requests = this.store.get('requests', []);
    const index = requests.findIndex((r) => r.id === request.id);

    if (index === -1) {
      throw new Error(`Request not found: ${request.id}`);
    }

    const updatedRequest: SavedRequest = {
      ...request,
      updatedAt: Date.now(),
    };

    requests[index] = updatedRequest;
    this.store.set('requests', requests);

    return updatedRequest;
  }

  deleteRequest(id: string): void {
    const requests = this.store.get('requests', []);
    const filtered = requests.filter((r) => r.id !== id);
    this.store.set('requests', filtered);
  }

  getRequestsByFolder(folderId?: string): SavedRequest[] {
    const requests = this.store.get('requests', []);
    return requests.filter((r) => r.folderId === folderId);
  }

  // Folders

  listFolders(): RequestFolder[] {
    return this.store.get('folders', []);
  }

  createFolder(folder: Omit<RequestFolder, 'id'>): RequestFolder {
    const folders = this.store.get('folders', []);

    const newFolder: RequestFolder = {
      ...folder,
      id: uuid(),
    };

    folders.push(newFolder);
    this.store.set('folders', folders);

    return newFolder;
  }

  updateFolder(folder: RequestFolder): RequestFolder {
    const folders = this.store.get('folders', []);
    const index = folders.findIndex((f) => f.id === folder.id);

    if (index === -1) {
      throw new Error(`Folder not found: ${folder.id}`);
    }

    folders[index] = folder;
    this.store.set('folders', folders);

    return folder;
  }

  deleteFolder(id: string): void {
    const folders = this.store.get('folders', []);
    const requests = this.store.get('requests', []);

    // Delete folder
    const filteredFolders = folders.filter((f) => f.id !== id);
    this.store.set('folders', filteredFolders);

    // Move requests in this folder to root
    const updatedRequests = requests.map((r) =>
      r.folderId === id ? { ...r, folderId: undefined } : r
    );
    this.store.set('requests', updatedRequests);
  }

  // Import/Export

  exportAll(): string {
    return JSON.stringify({
      requests: this.store.get('requests', []),
      folders: this.store.get('folders', []),
    }, null, 2);
  }

  importAll(data: string): void {
    try {
      const imported = JSON.parse(data) as SavedRequestsData;
      const now = Date.now();

      // Create ID mapping for folders
      const folderIdMap = new Map<string, string>();

      // Import folders with new IDs
      const newFolders = (imported.folders || []).map((folder) => {
        const newId = uuid();
        folderIdMap.set(folder.id, newId);
        return {
          ...folder,
          id: newId,
        };
      });

      // Import requests with new IDs and updated folder references
      const newRequests = (imported.requests || []).map((request) => ({
        ...request,
        id: uuid(),
        folderId: request.folderId
          ? folderIdMap.get(request.folderId)
          : undefined,
        createdAt: now,
        updatedAt: now,
      }));

      // Append to existing data
      const existingFolders = this.store.get('folders', []);
      const existingRequests = this.store.get('requests', []);

      this.store.set('folders', [...existingFolders, ...newFolders]);
      this.store.set('requests', [...existingRequests, ...newRequests]);
    } catch {
      throw new Error('Invalid data format');
    }
  }
}
