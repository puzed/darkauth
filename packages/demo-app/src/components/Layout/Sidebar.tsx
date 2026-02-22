import { decryptNote, decryptNoteWithDek, resolveDek } from "@DarkAuth/client";
import clsx from "clsx";
import { ChevronDown, ChevronRight, FileText, Hash, Users } from "lucide-react";
import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import { logger } from "../../services/logger";
import { useAuthStore } from "../../stores/authStore";
import { useNotesStore } from "../../stores/notesStore";
import { parseDecryptedNoteContent } from "../../utils/noteContent";
import styles from "./Sidebar.module.css";

interface SidebarProps {
  isOpen: boolean;
}

export function Sidebar({ isOpen }: SidebarProps) {
  const navigate = useNavigate();
  const { notes, setNotes, selectedTag, setSelectedTag } = useNotesStore();
  const { session } = useAuthStore();
  const [tagCounts, setTagCounts] = React.useState<Array<{ tag: string; count: number }>>([]);
  const [expandedSections, setExpandedSections] = React.useState({
    personal: true,
    shared: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const loadTagCounts = React.useCallback(async () => {
    if (!session?.drk) {
      setTagCounts([]);
      return;
    }

    let notesToProcess = notes;
    if (notesToProcess.length === 0) {
      try {
        notesToProcess = await api.listNotes();
        setNotes(notesToProcess);
      } catch {
        setTagCounts([]);
        return;
      }
    }

    const counts = new Map<string, number>();
    for (const note of notesToProcess) {
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
          counts.set(tag, (counts.get(tag) || 0) + 1);
        }
      } catch (error) {
        logger.error({ noteId: note.note_id, error }, "Failed to load tags from note");
      }
    }

    const sorted = [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((first, second) => {
        if (second.count !== first.count) {
          return second.count - first.count;
        }
        return first.tag.localeCompare(second.tag);
      });
    setTagCounts(sorted);
  }, [notes, session?.drk, setNotes]);

  React.useEffect(() => {
    void loadTagCounts();
  }, [loadTagCounts]);

  return (
    <aside className={clsx(styles.aside, isOpen ? styles.asideOpen : styles.asideClosed)}>
      <div className={styles.section}>
        {/* Personal Section */}
        <div className="mb-6">
          <button
            type="button"
            onClick={() => toggleSection("personal")}
            className={styles.sectionTitle}
          >
            <span>Personal</span>
            {expandedSections.personal ? (
              <ChevronDown width={16} height={16} />
            ) : (
              <ChevronRight width={16} height={16} />
            )}
          </button>

          {expandedSections.personal && (
            <div>
              <NavLink
                to="/"
                className={({ isActive }) =>
                  clsx(styles.navLink, isActive && selectedTag === null && styles.navLinkActive)
                }
                onClick={() => setSelectedTag(null)}
              >
                <FileText width={16} height={16} />
                <span>All Notes</span>
              </NavLink>
              {tagCounts.map((item) => (
                <button
                  key={item.tag}
                  type="button"
                  className={clsx(
                    styles.buttonLikeLink,
                    selectedTag === item.tag && styles.navLinkActive
                  )}
                  onClick={() => {
                    setSelectedTag(item.tag);
                    navigate("/");
                  }}
                >
                  <Hash width={16} height={16} />
                  <span>{item.tag}</span>
                  <span className={styles.count}>{item.count}</span>
                </button>
              ))}
              {tagCounts.length === 0 && <p className={styles.emptyState}>No tags yet</p>}
            </div>
          )}
        </div>

        {/* Shared Section */}
        <div className="mb-6">
          <button
            type="button"
            onClick={() => toggleSection("shared")}
            className={styles.sectionTitle}
          >
            <span>Shared</span>
            {expandedSections.shared ? (
              <ChevronDown width={16} height={16} />
            ) : (
              <ChevronRight width={16} height={16} />
            )}
          </button>

          {expandedSections.shared && (
            <div>
              <NavLink
                to="/shared/with-me"
                className={({ isActive }) => clsx(styles.navLink, isActive && styles.navLinkActive)}
              >
                <Users width={16} height={16} />
                <span>Shared with Me</span>
              </NavLink>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
