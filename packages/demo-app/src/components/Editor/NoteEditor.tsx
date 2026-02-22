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
import { normalizeTags, parseDecryptedNoteContent } from "../../utils/noteContent";
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
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState("");
  const [knownTags, setKnownTags] = React.useState<string[]>([]);
  const [lastSaved, setLastSaved] = React.useState<Date | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [hasChanges, setHasChanges] = React.useState(false);
  const [showShare, setShowShare] = React.useState(false);

  const saveTimeoutRef = React.useRef<NodeJS.Timeout>();

  const removeTag = (tagToRemove: string) => {
    setTags((previous) => previous.filter((tag) => tag !== tagToRemove));
    setHasChanges(true);
  };

  const addTag = (value: string) => {
    const nextTags = normalizeTags([...tags, value]);
    if (nextTags.length === tags.length) {
      setTagInput("");
      return;
    }
    setTags(nextTags);
    setTagInput("");
    setHasChanges(true);
  };

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

        const parsedNote = parseDecryptedNoteContent(decryptedContent);
        setTitle(parsedNote.title);
        setContent(parsedNote.content);
        setTags(parsedNote.tags);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load note");
    } finally {
      setIsLoading(false);
    }
  }, [noteId, session?.drk, notes]);

  const loadKnownTags = React.useCallback(async () => {
    if (!session?.drk || notes.length === 0) return;

    const tagSet = new Set<string>();
    for (const note of notes) {
      try {
        const changes = await api.getNoteChanges(note.note_id, 0);
        if (changes.length === 0) {
          continue;
        }
        const lastChange = changes[changes.length - 1];
        const isOwner = note.owner_sub === (useAuthStore.getState().user?.sub || "");
        const decryptedContent = isOwner
          ? await decryptNote(session.drk, note.note_id, lastChange.ciphertext_b64, lastChange.aad)
          : await (async () => {
              const dek = await resolveDek(note.note_id, false, session.drk);
              return decryptNoteWithDek(
                dek,
                note.note_id,
                lastChange.ciphertext_b64,
                lastChange.aad
              );
            })();
        const parsedNote = parseDecryptedNoteContent(decryptedContent);
        for (const tag of parsedNote.tags) {
          tagSet.add(tag);
        }
      } catch {}
    }

    setKnownTags([...tagSet].sort((first, second) => first.localeCompare(second)));
  }, [session?.drk, notes]);

  React.useEffect(() => {
    if (noteId) {
      void loadNote();
    }
  }, [noteId, loadNote]);

  React.useEffect(() => {
    void loadKnownTags();
  }, [loadKnownTags]);

  const saveNote = React.useCallback(async () => {
    if (!noteId || !session?.drk || !hasChanges) return;

    setIsSaving(true);
    setError(null);

    try {
      // Save both title and content as a structured object
      const noteData = JSON.stringify({
        title: title,
        content: content,
        tags: tags,
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
  }, [noteId, session?.drk, hasChanges, title, content, tags, notes]);

  React.useEffect(() => {
    if (hasChanges && (title || content || tags.length > 0)) {
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
  }, [title, content, tags, hasChanges, saveNote]);

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    setHasChanges(true);
  };

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setHasChanges(true);
  };

  const filteredTagSuggestions = React.useMemo(() => {
    const query = tagInput.trim().toLowerCase();
    if (!query) {
      return [];
    }
    return knownTags.filter((tag) => tag.includes(query) && !tags.includes(tag)).slice(0, 6);
  }, [knownTags, tagInput, tags]);

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

          <div className={styles.tagsWrap}>
            <div className={styles.tagsInputContainer}>
              {tags.map((tag) => (
                <span key={tag} className={styles.tagPill}>
                  <span>#{tag}</span>
                  <button
                    type="button"
                    className={styles.tagRemove}
                    onClick={() => removeTag(tag)}
                    aria-label={`Remove ${tag} tag`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === "," || event.key === "Tab") {
                    const value = tagInput.trim();
                    if (!value) {
                      return;
                    }
                    event.preventDefault();
                    addTag(value);
                  }
                  if (event.key === "Backspace" && tagInput.length === 0 && tags.length > 0) {
                    event.preventDefault();
                    const lastTag = tags[tags.length - 1];
                    removeTag(lastTag);
                  }
                }}
                onBlur={() => {
                  const value = tagInput.trim();
                  if (value) {
                    addTag(value);
                  }
                }}
                placeholder={tags.length === 0 ? "Add tags..." : "Add another tag..."}
                className={styles.tagsInput}
              />
            </div>
            {filteredTagSuggestions.length > 0 && (
              <div className={styles.tagSuggestions}>
                {filteredTagSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className={styles.tagSuggestion}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      addTag(suggestion);
                    }}
                  >
                    #{suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Rich Text Editor */}
          <RichTextEditor
            content={content}
            onChange={handleContentChange}
            className={styles.editor}
          />
        </div>
      </div>
      {showShare && noteId && <ShareModal noteId={noteId} onClose={() => setShowShare(false)} />}
    </div>
  );
}
