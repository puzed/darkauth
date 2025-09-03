import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Save, Share2, ArrowLeft, Clock } from "lucide-react";
import { RichTextEditor } from "./RichTextEditor";
import { useAuthStore } from "../../stores/authStore";
import { api } from "../../services/api";
import { encryptNote, decryptNote, decryptNoteWithDek, encryptNoteWithDek, resolveDek } from "@DarkAuth/client";
import { useNotesStore } from "../../stores/notesStore";
import { format } from "date-fns";
import { ShareModal } from "../Sharing/ShareModal";

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

  React.useEffect(() => {
    if (noteId) {
      loadNote();
    }
  }, [noteId]);

  React.useEffect(() => {
    // Autosave with debounce
    if (hasChanges && (title || content)) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      saveTimeoutRef.current = setTimeout(() => {
        saveNote();
      }, 2000);
    }
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [title, content, hasChanges]);

  const loadNote = async () => {
    if (!noteId || !session?.drk) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const changes = await api.getNoteChanges(noteId, 0);
      
      if (changes.length > 0) {
        const lastChange = changes[changes.length - 1];
        const noteMeta = notes.find(n => n.note_id === noteId);
        const isOwner = noteMeta ? noteMeta.owner_sub === (useAuthStore.getState().user?.sub || "") : true;
        const decryptedContent = isOwner
          ? await decryptNote(session.drk, noteId, lastChange.ciphertext_b64, lastChange.aad)
          : await (async () => {
              const dek = await resolveDek(noteId, false, session.drk);
              return decryptNoteWithDek(dek, noteId, lastChange.ciphertext_b64, lastChange.aad);
            })();
        
        // Parse the note structure (title and content separated by a special marker)
        const noteData = JSON.parse(decryptedContent);
        if (typeof noteData === 'object' && noteData.title !== undefined) {
          setTitle(noteData.title || "");
          setContent(noteData.content || "");
        } else {
          // Fallback for old format
          setTitle("Untitled");
          setContent(decryptedContent);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load note");
    } finally {
      setIsLoading(false);
    }
  };

  const saveNote = async () => {
    if (!noteId || !session?.drk || !hasChanges) return;
    
    setIsSaving(true);
    setError(null);
    
    try {
      // Save both title and content as a structured object
      const noteData = JSON.stringify({
        title: title,
        content: content
      });
      
      const noteMeta = notes.find(n => n.note_id === noteId);
      const isOwner = noteMeta ? noteMeta.owner_sub === (useAuthStore.getState().user?.sub || "") : true;
      const encryptedContent = isOwner
        ? await encryptNote(session.drk, noteId, noteData)
        : await (async () => {
            const dek = await resolveDek(noteId, false, session.drk);
            return encryptNoteWithDek(dek, noteId, noteData);
          })();
      
      await api.appendNoteChange(
        noteId,
        encryptedContent,
        { note_id: noteId }
      );
      
      setLastSaved(new Date());
      setHasChanges(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setIsSaving(false);
    }
  };

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
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Editor Header */}
      <div className="bg-white dark:bg-dark-800 border-b border-gray-200 dark:border-dark-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="p-2 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg"
              title="Back to dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
              {lastSaved && (
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Saved {format(lastSaved, "h:mm a")}</span>
                </div>
              )}
              {isSaving && (
                <span className="text-primary-600 dark:text-primary-400">
                  Saving...
                </span>
              )}
              {hasChanges && !isSaving && (
                <span className="text-yellow-600 dark:text-yellow-400">
                  Unsaved changes
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleManualSave}
              disabled={!hasChanges || isSaving}
              className="btn-secondary flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span className="hidden sm:inline">Save</span>
            </button>
            
            <button
              onClick={handleShare}
              className="btn-primary flex items-center gap-2"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Share</span>
            </button>
          </div>
        </div>
      </div>
      
      {/* Editor Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-dark-900">
        <div className="max-w-4xl mx-auto">
          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
              {error}
            </div>
          )}
          
          {/* Title Input */}
          <div className="mb-6">
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Untitled Note"
              className="w-full text-3xl font-bold bg-transparent border-none outline-none placeholder-gray-400 dark:placeholder-gray-600 text-gray-900 dark:text-white"
            />
          </div>
          
          {/* Rich Text Editor */}
          <RichTextEditor
            content={content}
            onChange={handleContentChange}
            className="shadow-sm"
          />
        </div>
      </div>
      {showShare && noteId && (
        <ShareModal noteId={noteId} onClose={() => setShowShare(false)} />
      )}
    </div>
  );
}
