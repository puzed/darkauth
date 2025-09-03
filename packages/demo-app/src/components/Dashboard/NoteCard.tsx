import React from "react";
import { Link } from "react-router-dom";
import { MoreVertical, Star, Share2, Trash2, Clock, User } from "lucide-react";
import { format } from "date-fns";
import clsx from "clsx";

interface NoteCardProps {
  noteId: string;
  title: string;
  preview: string;
  updatedAt: string;
  isStarred?: boolean;
  isShared?: boolean;
  ownerName?: string;
  color?: string;
  onDelete?: () => void;
  onStar?: () => void;
  onShare?: () => void;
}

const noteColors = {
  default: "bg-white dark:bg-dark-800",
  blue: "bg-blue-50 dark:bg-blue-900/20",
  green: "bg-green-50 dark:bg-green-900/20",
  yellow: "bg-yellow-50 dark:bg-yellow-900/20",
  purple: "bg-purple-50 dark:bg-purple-900/20",
  pink: "bg-pink-50 dark:bg-pink-900/20",
};

export function NoteCard({
  noteId,
  title,
  preview,
  updatedAt,
  isStarred = false,
  isShared = false,
  ownerName,
  color = "default",
  onDelete,
  onStar,
  onShare,
}: NoteCardProps) {
  const [showMenu, setShowMenu] = React.useState(false);

  return (
    <div
      className={clsx(
        "relative group rounded-xl shadow-sm hover:shadow-md border border-gray-200 dark:border-dark-700",
        noteColors[color as keyof typeof noteColors] || noteColors.default
      )}
    >
      <Link to={`/notes/${noteId}`} className="block p-5">
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 line-clamp-1">
            {title || "Untitled Note"}
          </h3>
          
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
            {isStarred && (
              <Star className="w-4 h-4 text-yellow-500 fill-current" />
            )}
            {isShared && (
              <Share2 className="w-4 h-4 text-blue-500" />
            )}
          </div>
        </div>
        
        <p className="text-gray-600 dark:text-gray-400 line-clamp-3 text-sm mb-4">
          {preview || "No content yet..."}
        </p>
        
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-500">
          <div className="flex items-center gap-2">
            <Clock className="w-3 h-3" />
            <span>{format(new Date(updatedAt), "MMM d, yyyy")}</span>
          </div>
          
          {ownerName && (
            <div className="flex items-center gap-1">
              <User className="w-3 h-3" />
              <span>{ownerName}</span>
            </div>
          )}
        </div>
      </Link>
      
      <div className="absolute top-4 right-4">
        <button
          onClick={(e) => {
            e.preventDefault();
            setShowMenu(!showMenu);
          }}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-700 opacity-0 group-hover:opacity-100"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
        
        {showMenu && (
          <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-dark-800 rounded-lg shadow-lg border border-gray-200 dark:border-dark-700 py-1 z-10">
            <button
              onClick={(e) => {
                e.preventDefault();
                onStar?.();
                setShowMenu(false);
              }}
              className="flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-dark-700 w-full text-left text-sm"
            >
              <Star className="w-4 h-4" />
              <span>{isStarred ? "Unstar" : "Star"}</span>
            </button>
            
            <button
              onClick={(e) => {
                e.preventDefault();
                onShare?.();
                setShowMenu(false);
              }}
              className="flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-dark-700 w-full text-left text-sm"
            >
              <Share2 className="w-4 h-4" />
              <span>Share</span>
            </button>
            
            <hr className="my-1 border-gray-200 dark:border-dark-700" />
            
            {onDelete && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onDelete?.();
                  setShowMenu(false);
                }}
                className="flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-dark-700 w-full text-left text-sm text-red-600 dark:text-red-400"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
