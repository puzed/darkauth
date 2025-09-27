import {
  decryptNote,
  decryptNoteWithDek,
  encryptNote,
  encryptNoteWithDek,
  resolveDek,
} from "@DarkAuth/client";
import { format } from "date-fns";
import { ArrowLeft, Clock, Save, Share2 } from "lucide-react";
import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../services/api";
import { useAuthStore } from "../../stores/authStore";
import { useNotesStore } from "../../stores/notesStore";
import { ShareModal } from "../Sharing/ShareModal";
import styles from "./NoteEditor.module.css";
import { RichTextEditor } from "./RichTextEditor";

export function NoteEditor() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const { session } = useAuthStore();
  const { notes } = useNotesStore();

  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [lastSaved, setLastSaved] = React.useState<Date | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [hasChanges, setHasChanges] = React.useState(false);
  const [showShare, setShowShare] = React.useState(false);

  const saveTimeoutRef = React.useRef<NodeJS.Timeout>();

  const loadNote = React.useCallback(async () => {
    if (!noteId || !session?.drk) return;

    setIsLoading(true);
    setError(null);

    try {
      const changes = await api.getNoteChanges(noteId, 0);

      if (changes.length > 0) {
        const lastChange = changes[changes.length - 1];
        const noteMeta = notes.find((n) => n.note_id === noteId);
        const isOwner = noteMeta
          ? noteMeta.owner_sub === (useAuthStore.getState().user?.sub || "")
          : true;
        const decryptedContent = isOwner
          ? await decryptNote(session.drk, noteId, lastChange.ciphertext_b64, lastChange.aad)
          : await (async () => {
              const dek = await resolveDek(noteId, false, session.drk);
              return decryptNoteWithDek(dek, noteId, lastChange.ciphertext_b64, lastChange.aad);
            })();

        const noteData = JSON.parse(decryptedContent) as unknown;
        if (
          typeof noteData === "object" &&
          noteData &&
          (noteData as { title?: string }).title !== undefined
        ) {
          setTitle((noteData as { title?: string }).title || "");
          setContent((noteData as { content?: string }).content || "");
        } else {
          setTitle("Untitled");
          setContent(decryptedContent);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load note");
    } finally {
      setIsLoading(false);
    }
  }, [noteId, session?.drk, notes]);

  React.useEffect(() => {
    if (noteId) {
      void loadNote();
    }
  }, [noteId, loadNote]);

  const saveNote = React.useCallback(async () => {
    if (!noteId || !session?.drk || !hasChanges) return;

    setIsSaving(true);
    setError(null);

    try {
      // Save both title and content as a structured object
      const noteData = JSON.stringify({
        title: title,
        content: content,
      });

      const noteMeta = notes.find((n) => n.note_id === noteId);
      const isOwner = noteMeta
        ? noteMeta.owner_sub === (useAuthStore.getState().user?.sub || "")
        : true;
      const encryptedContent = isOwner
        ? await encryptNote(session.drk, noteId, noteData)
        : await (async () => {
            const dek = await resolveDek(noteId, false, session.drk);
            return encryptNoteWithDek(dek, noteId, noteData);
          })();

      await api.appendNoteChange(noteId, encryptedContent, { note_id: noteId });

      setLastSaved(new Date());
      setHasChanges(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setIsSaving(false);
    }
  }, [noteId, session?.drk, hasChanges, title, content, notes]);

  React.useEffect(() => {
    if (hasChanges && (title || content)) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        void saveNote();
      }, 2000);
    }
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [title, content, hasChanges, saveNote]);

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    setHasChanges(true);
  };

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setHasChanges(true);
  };

  const handleManualSave = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveNote();
  };

  const handleShare = () => setShowShare(true);

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {/* Editor Header */}
      <div className={styles.header}>
        <div className={styles.headerRow}>
          <div className={styles.left}>
            <button
              type="button"
              onClick={() => navigate("/")}
              className={styles.iconBtn}
              title="Back to dashboard"
            >
              <ArrowLeft width={20} height={20} />
            </button>

            <div className={styles.meta}>
              {lastSaved && (
                <div className={styles.metaGroup}>
                  <Clock width={12} height={12} />
                  <span>Saved {format(lastSaved, "h:mm a")}</span>
                </div>
              )}
              {isSaving && <span>Saving...</span>}
              {hasChanges && !isSaving && <span>Unsaved changes</span>}
            </div>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              onClick={handleManualSave}
              disabled={!hasChanges || isSaving}
              className="btn-secondary"
            >
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <Save width={16} height={16} />
                <span>Save</span>
              </span>
            </button>

            <button type="button" onClick={handleShare} className="btn-primary">
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <Share2 width={16} height={16} />
                <span>Share</span>
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Editor Content */}
      <div className={styles.contentArea}>
        <div className={styles.contentInner}>
          {error && <div className={styles.error}>{error}</div>}

          {/* Title Input */}
          <div className={styles.titleWrap}>
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Untitled Note"
              className={styles.titleInput}
            />
          </div>

          {/* Rich Text Editor */}
          <RichTextEditor content={content} onChange={handleContentChange} />
        </div>
      </div>
      {showShare && noteId && <ShareModal noteId={noteId} onClose={() => setShowShare(false)} />}
    </div>
  );
}
