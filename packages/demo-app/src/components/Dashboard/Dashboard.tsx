import React from "react";
import { Plus } from "lucide-react";
import { NoteCard } from "./NoteCard";
import { useNotesStore } from "../../stores/notesStore";
import { useAuthStore } from "../../stores/authStore";
import { api } from "../../services/api";
import { decryptNote, decryptNoteWithDek, resolveDek } from "@DarkAuth/client";

export function Dashboard() {
  const { notes, setNotes, removeNote, isLoading, setLoading, setError } = useNotesStore();
  const { session } = useAuthStore();
  const [decryptedNotes, setDecryptedNotes] = React.useState<Map<string, { title: string; preview: string }>>(new Map());
  const [decryptFailed, setDecryptFailed] = React.useState(false);
  const [wiping, setWiping] = React.useState(false);

  React.useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    if (!session?.drk) return;
    
    setLoading(true);
    try {
      const notesList = await api.listNotes();
      setNotes(notesList);
      
      // Decrypt note content for previews
      const decrypted = new Map();
      let anyFailed = false;
      for (const note of notesList) {
        try {
          const changes = await api.getNoteChanges(note.note_id, 0);
          if (changes.length > 0) {
            const lastChange = changes[changes.length - 1];
            const isOwner = note.owner_sub === useAuthStore.getState().user?.sub;
            let decryptedContent: string;
            if (isOwner) {
              decryptedContent = await decryptNote(
                session.drk,
                note.note_id,
                lastChange.ciphertext_b64,
                lastChange.aad
              );
            } else {
              const dek = await resolveDek(note.note_id, false, session.drk);
              decryptedContent = await decryptNoteWithDek(
                dek,
                note.note_id,
                lastChange.ciphertext_b64,
                lastChange.aad
              );
            }
            
            try {
              // Try to parse as JSON (new format)
              const noteData = JSON.parse(decryptedContent);
              if (typeof noteData === 'object' && noteData.title !== undefined) {
                const title = noteData.title || "Untitled";
                // Strip HTML tags from content for preview
                const plainContent = noteData.content
                  .replace(/<[^>]*>/g, '')
                  .replace(/\s+/g, ' ')
                  .trim();
                const preview = plainContent.substring(0, 150);
                decrypted.set(note.note_id, { title, preview });
              } else {
                throw new Error("Old format");
              }
            } catch {
              // Fallback for old format or plain text
              const lines = decryptedContent.split("\n");
              const title = lines[0]?.replace(/^#\s+/, "").replace(/<[^>]*>/g, '') || "Untitled";
              const preview = lines.slice(1).join(" ").substring(0, 150);
              decrypted.set(note.note_id, { title, preview });
            }
          }
        } catch (error) {
          console.error(`Failed to decrypt note ${note.note_id}:`, error);
          anyFailed = true;
        }
      }
      setDecryptedNotes(decrypted);
      setDecryptFailed(anyFailed);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to load notes");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNote = async () => {
    try {
      const noteId = await api.createNote();
      await loadNotes();
      window.location.href = `/notes/${noteId}`;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to create note");
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm("Are you sure you want to delete this note?")) return;
    
    try {
      await api.deleteNote(noteId);
      removeNote(noteId);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to delete note");
    }
  };

  const handleWipeAll = async () => {
    if (!confirm("This will permanently delete all your notes. Continue?")) return;
    setWiping(true);
    try {
      const list = await api.listNotes();
      for (const n of list) {
        try { await api.deleteNote(n.note_id); } catch {}
      }
      setNotes([]);
      setDecryptedNotes(new Map());
      setDecryptFailed(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to wipe notes");
    } finally {
      setWiping(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {decryptFailed && (
        <div className="mb-6 p-4 border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-red-800 dark:text-red-300 mb-1">Decryption failed</h2>
              <p className="text-sm text-red-700 dark:text-red-400">Your encryption key does not match older notes. The only safe option is to wipe your notes and start fresh.</p>
            </div>
            <button onClick={handleWipeAll} disabled={wiping} className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white font-medium">
              {wiping ? "Wiping..." : "Wipe All Notes"}
            </button>
          </div>
        </div>
      )}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Welcome back!
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          You have {notes.length} {notes.length === 1 ? "note" : "notes"}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {notes.map((note) => {
          const decrypted = decryptedNotes.get(note.note_id);
          const canDelete = note.owner_sub && session?.drk && useAuthStore.getState().user?.sub === note.owner_sub;
          return (
            <NoteCard
              key={note.note_id}
              noteId={note.note_id}
              title={decrypted?.title || "Untitled"}
              preview={decrypted?.preview || ""}
              updatedAt={note.updated_at}
              onDelete={canDelete ? () => handleDeleteNote(note.note_id) : undefined}
            />
          );
        })}

        <button
          onClick={handleCreateNote}
          className="w-full h-full p-5 rounded-xl border-2 border-dashed border-gray-300 dark:border-dark-600 hover:border-primary-500 dark:hover:border-primary-500 flex flex-col items-center justify-center gap-3 group"
        >
          <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-dark-700 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/20 flex items-center justify-center">
            <Plus className="w-6 h-6 text-gray-600 dark:text-gray-400 group-hover:text-primary-600 dark:group-hover:text-primary-400" />
          </div>
          <span className="text-gray-600 dark:text-gray-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 font-medium">
            Create New Note
          </span>
        </button>
      </div>
    </div>
  );
}
