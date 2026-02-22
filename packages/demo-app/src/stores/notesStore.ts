import { create } from "zustand";
import type { Note } from "../services/api";

interface NotesStore {
  notes: Note[];
  selectedNoteId: string | null;
  selectedTag: string | null;
  searchQuery: string;
  isLoading: boolean;
  error: string | null;

  setNotes: (notes: Note[]) => void;
  addNote: (note: Note) => void;
  removeNote: (noteId: string) => void;
  updateNote: (noteId: string, updates: Partial<Note>) => void;
  selectNote: (noteId: string | null) => void;
  setSelectedTag: (tag: string | null) => void;
  setSearchQuery: (query: string) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useNotesStore = create<NotesStore>((set) => ({
  notes: [],
  selectedNoteId: null,
  selectedTag: null,
  searchQuery: "",
  isLoading: false,
  error: null,

  setNotes: (notes) => set({ notes }),

  addNote: (note) =>
    set((state) => ({
      notes: [note, ...state.notes],
    })),

  removeNote: (noteId) =>
    set((state) => ({
      notes: state.notes.filter((n) => n.note_id !== noteId),
      selectedNoteId: state.selectedNoteId === noteId ? null : state.selectedNoteId,
    })),

  updateNote: (noteId, updates) =>
    set((state) => ({
      notes: state.notes.map((n) => (n.note_id === noteId ? { ...n, ...updates } : n)),
    })),

  selectNote: (noteId) => set({ selectedNoteId: noteId }),

  setSelectedTag: (tag) => set({ selectedTag: tag }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),
}));
