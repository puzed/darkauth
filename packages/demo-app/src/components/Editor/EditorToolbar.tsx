import React from "react";
import { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  Link2,
  Unlink,
  Heading1,
  Heading2,
  Heading3,
  Type,
} from "lucide-react";
import clsx from "clsx";

interface EditorToolbarProps {
  editor: Editor;
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  const setLink = () => {
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("Enter URL:", previousUrl);

    if (url === null) {
      return;
    }

    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url })
      .run();
  };

  return (
    <div className="flex items-center gap-1 p-2 flex-wrap">
      <div className="flex items-center gap-1 pr-2 border-r border-gray-200 dark:border-dark-700">
        <button
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className={clsx(
            "p-2 rounded hover:bg-gray-100 dark:hover:bg-dark-700",
            !editor.can().undo() && "opacity-50 cursor-not-allowed"
          )}
          title="Undo"
        >
          <Undo className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className={clsx(
            "p-2 rounded hover:bg-gray-100 dark:hover:bg-dark-700",
            !editor.can().redo() && "opacity-50 cursor-not-allowed"
          )}
          title="Redo"
        >
          <Redo className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-1 px-2 border-r border-gray-200 dark:border-dark-700">
        <button
          onClick={() => editor.chain().focus().setParagraph().run()}
          className={clsx(
            "p-2 rounded hover:bg-gray-100 dark:hover:bg-dark-700",
            editor.isActive("paragraph") && "bg-gray-100 dark:bg-dark-700"
          )}
          title="Paragraph"
        >
          <Type className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={clsx(
            "p-2 rounded hover:bg-gray-100 dark:hover:bg-dark-700",
            editor.isActive("heading", { level: 1 }) && "bg-gray-100 dark:bg-dark-700"
          )}
          title="Heading 1"
        >
          <Heading1 className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={clsx(
            "p-2 rounded hover:bg-gray-100 dark:hover:bg-dark-700",
            editor.isActive("heading", { level: 2 }) && "bg-gray-100 dark:bg-dark-700"
          )}
          title="Heading 2"
        >
          <Heading2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={clsx(
            "p-2 rounded hover:bg-gray-100 dark:hover:bg-dark-700",
            editor.isActive("heading", { level: 3 }) && "bg-gray-100 dark:bg-dark-700"
          )}
          title="Heading 3"
        >
          <Heading3 className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-1 px-2 border-r border-gray-200 dark:border-dark-700">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={clsx(
            "p-2 rounded hover:bg-gray-100 dark:hover:bg-dark-700",
            editor.isActive("bold") && "bg-gray-100 dark:bg-dark-700"
          )}
          title="Bold"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={clsx(
            "p-2 rounded hover:bg-gray-100 dark:hover:bg-dark-700",
            editor.isActive("italic") && "bg-gray-100 dark:bg-dark-700"
          )}
          title="Italic"
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={clsx(
            "p-2 rounded hover:bg-gray-100 dark:hover:bg-dark-700",
            editor.isActive("underline") && "bg-gray-100 dark:bg-dark-700"
          )}
          title="Underline"
        >
          <Underline className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={clsx(
            "p-2 rounded hover:bg-gray-100 dark:hover:bg-dark-700",
            editor.isActive("strike") && "bg-gray-100 dark:bg-dark-700"
          )}
          title="Strikethrough"
        >
          <Strikethrough className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={clsx(
            "p-2 rounded hover:bg-gray-100 dark:hover:bg-dark-700",
            editor.isActive("code") && "bg-gray-100 dark:bg-dark-700"
          )}
          title="Code"
        >
          <Code className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-1 px-2 border-r border-gray-200 dark:border-dark-700">
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={clsx(
            "p-2 rounded hover:bg-gray-100 dark:hover:bg-dark-700",
            editor.isActive("bulletList") && "bg-gray-100 dark:bg-dark-700"
          )}
          title="Bullet List"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={clsx(
            "p-2 rounded hover:bg-gray-100 dark:hover:bg-dark-700",
            editor.isActive("orderedList") && "bg-gray-100 dark:bg-dark-700"
          )}
          title="Ordered List"
        >
          <ListOrdered className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={clsx(
            "p-2 rounded hover:bg-gray-100 dark:hover:bg-dark-700",
            editor.isActive("blockquote") && "bg-gray-100 dark:bg-dark-700"
          )}
          title="Quote"
        >
          <Quote className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-1 pl-2">
        <button
          onClick={setLink}
          className={clsx(
            "p-2 rounded hover:bg-gray-100 dark:hover:bg-dark-700",
            editor.isActive("link") && "bg-gray-100 dark:bg-dark-700"
          )}
          title="Add Link"
        >
          <Link2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().unsetLink().run()}
          disabled={!editor.isActive("link")}
          className={clsx(
            "p-2 rounded hover:bg-gray-100 dark:hover:bg-dark-700",
            !editor.isActive("link") && "opacity-50 cursor-not-allowed"
          )}
          title="Remove Link"
        >
          <Unlink className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}