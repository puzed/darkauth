import { decryptNote, decryptNoteWithDek, resolveDek } from "@DarkAuth/client";
import { Plus } from "lucide-react";
import React from "react";
import { api } from "../../services/api";
import { logger } from "../../services/logger";
import { useAuthStore } from "../../stores/authStore";
import { useNotesStore } from "../../stores/notesStore";
import styles from "./Dashboard.module.css";
import { NoteCard } from "./NoteCard";

export function Dashboard() {
  const { notes, setNotes, removeNote, isLoading, setLoading, setError } = useNotesStore();
  const { session } = useAuthStore();
  const [decryptedNotes, setDecryptedNotes] = React.useState<
    Map<string, { title: string; preview: string }>
  >(new Map());
  const [decryptFailed, setDecryptFailed] = React.useState(false);
  const [wiping, setWiping] = React.useState(false);

  const loadNotes = React.useCallback(async () => {
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
              if (typeof noteData === "object" && noteData.title !== undefined) {
                const title = noteData.title || "Untitled";
                // Strip HTML tags from content for preview
                const plainContent = noteData.content
                  .replace(/<[^>]*>/g, "")
                  .replace(/\s+/g, " ")
                  .trim();
                const preview = plainContent.substring(0, 150);
                decrypted.set(note.note_id, { title, preview });
              } else {
                throw new Error("Old format");
              }
            } catch {
              // Fallback for old format or plain text
              const lines = decryptedContent.split("\n");
              const title = lines[0]?.replace(/^#\s+/, "").replace(/<[^>]*>/g, "") || "Untitled";
              const preview = lines.slice(1).join(" ").substring(0, 150);
              decrypted.set(note.note_id, { title, preview });
            }
          }
        } catch (error) {
          logger.error({ noteId: note.note_id, error }, "Failed to decrypt note");
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
  }, [session?.drk, setLoading, setNotes, setError]);

  React.useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

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
        try {
          await api.deleteNote(n.note_id);
        } catch {}
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
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {decryptFailed && (
        <div className={styles.alert}>
          <div className={styles.alertHeader}>
            <div>
              <h2 className={styles.alertTitle}>Decryption failed</h2>
              <p className={styles.alertText}>
                Your encryption key does not match older notes. The only safe option is to wipe your
                notes and start fresh.
              </p>
            </div>
            <button
              type="button"
              onClick={handleWipeAll}
              disabled={wiping}
              className={styles.dangerButton}
            >
              {wiping ? "Wiping..." : "Wipe All Notes"}
            </button>
          </div>
        </div>
      )}
      <div className={styles.heading}>
        <h1 className={styles.title}>Welcome back!</h1>
        <p className={styles.subtitle}>
          You have {notes.length} {notes.length === 1 ? "note" : "notes"}
        </p>
      </div>

      <div className={styles.grid}>
        {notes.map((note) => {
          const decrypted = decryptedNotes.get(note.note_id);
          const canDelete =
            note.owner_sub && session?.drk && useAuthStore.getState().user?.sub === note.owner_sub;
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

        <button type="button" onClick={handleCreateNote} className={styles.newCard}>
          <div className={styles.newIcon}>
            <Plus width={24} height={24} />
          </div>
          <span className={styles.newText}>Create New Note</span>
        </button>
      </div>
    </div>
  );
}
