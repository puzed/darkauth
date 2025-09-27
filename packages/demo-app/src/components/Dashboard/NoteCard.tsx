import { format } from "date-fns";
import { Clock, MoreVertical, Share2, Star, Trash2, User } from "lucide-react";
import React from "react";
import { Link } from "react-router-dom";
import styles from "./NoteCard.module.css";

interface NoteCardProps {
  noteId: string;
  title: string;
  preview: string;
  updatedAt: string;
  isStarred?: boolean;
  isShared?: boolean;
  ownerName?: string;
  onDelete?: () => void;
  onStar?: () => void;
  onShare?: () => void;
}

export function NoteCard({
  noteId,
  title,
  preview,
  updatedAt,
  isStarred = false,
  isShared = false,
  ownerName,
  onDelete,
  onStar,
  onShare,
}: NoteCardProps) {
  const [showMenu, setShowMenu] = React.useState(false);

  return (
    <div className={styles.card}>
      <Link to={`/notes/${noteId}`} className={styles.link}>
        <div className={styles.header}>
          <h3 className={styles.title}>{title || "Untitled Note"}</h3>
          <div className={styles.badges}>
            {isStarred && <Star width={16} height={16} />}
            {isShared && <Share2 width={16} height={16} />}
          </div>
        </div>

        <p className={styles.preview}>{preview || "No content yet..."}</p>

        <div className={styles.footer}>
          <div className={styles.footerGroup}>
            <Clock width={12} height={12} />
            <span>{format(new Date(updatedAt), "MMM d, yyyy")}</span>
          </div>

          {ownerName && (
            <div className={styles.footerGroup}>
              <User width={12} height={12} />
              <span>{ownerName}</span>
            </div>
          )}
        </div>
      </Link>

      <div className={styles.menu}>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            setShowMenu(!showMenu);
          }}
          className={styles.menuButton}
        >
          <MoreVertical width={16} height={16} />
        </button>

        {showMenu && (
          <div className={styles.menuPanel}>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onStar?.();
                setShowMenu(false);
              }}
              className={styles.menuItem}
            >
              <Star width={16} height={16} />
              <span>{isStarred ? "Unstar" : "Star"}</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onShare?.();
                setShowMenu(false);
              }}
              className={styles.menuItem}
            >
              <Share2 width={16} height={16} />
              <span>Share</span>
            </button>

            <hr className={styles.separator} />

            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  onDelete?.();
                  setShowMenu(false);
                }}
                className={`${styles.menuItem} ${styles.danger}`}
              >
                <Trash2 width={16} height={16} />
                <span>Delete</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
