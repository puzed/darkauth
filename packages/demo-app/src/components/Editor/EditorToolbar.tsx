import type { Editor } from "@tiptap/react";
import clsx from "clsx";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo,
  Strikethrough,
  Type,
  Underline,
  Undo,
  Unlink,
} from "lucide-react";
import styles from "./EditorToolbar.module.css";

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

    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className={styles.toolbar}>
      <div className={styles.group}>
        <button
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className={clsx(styles.btn, !editor.can().undo() && styles.disabled)}
          title="Undo"
        >
          <Undo width={16} height={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className={clsx(styles.btn, !editor.can().redo() && styles.disabled)}
          title="Redo"
        >
          <Redo width={16} height={16} />
        </button>
      </div>

      <div className={styles.group}>
        <button
          type="button"
          onClick={() => editor.chain().focus().setParagraph().run()}
          className={clsx(styles.btn, editor.isActive("paragraph") && styles.active)}
          title="Paragraph"
        >
          <Type width={16} height={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={clsx(styles.btn, editor.isActive("heading", { level: 1 }) && styles.active)}
          title="Heading 1"
        >
          <Heading1 width={16} height={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={clsx(styles.btn, editor.isActive("heading", { level: 2 }) && styles.active)}
          title="Heading 2"
        >
          <Heading2 width={16} height={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={clsx(styles.btn, editor.isActive("heading", { level: 3 }) && styles.active)}
          title="Heading 3"
        >
          <Heading3 width={16} height={16} />
        </button>
      </div>

      <div className={styles.group}>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={clsx(styles.btn, editor.isActive("bold") && styles.active)}
          title="Bold"
        >
          <Bold width={16} height={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={clsx(styles.btn, editor.isActive("italic") && styles.active)}
          title="Italic"
        >
          <Italic width={16} height={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={clsx(styles.btn, editor.isActive("underline") && styles.active)}
          title="Underline"
        >
          <Underline width={16} height={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={clsx(styles.btn, editor.isActive("strike") && styles.active)}
          title="Strikethrough"
        >
          <Strikethrough width={16} height={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={clsx(styles.btn, editor.isActive("code") && styles.active)}
          title="Code"
        >
          <Code width={16} height={16} />
        </button>
      </div>

      <div className={styles.group}>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={clsx(styles.btn, editor.isActive("bulletList") && styles.active)}
          title="Bullet List"
        >
          <List width={16} height={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={clsx(styles.btn, editor.isActive("orderedList") && styles.active)}
          title="Ordered List"
        >
          <ListOrdered width={16} height={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={clsx(styles.btn, editor.isActive("blockquote") && styles.active)}
          title="Quote"
        >
          <Quote width={16} height={16} />
        </button>
      </div>

      <div className={`${styles.group} ${styles.groupLast}`}>
        <button
          type="button"
          onClick={setLink}
          className={clsx(styles.btn, editor.isActive("link") && styles.active)}
          title="Add Link"
        >
          <Link2 width={16} height={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().unsetLink().run()}
          disabled={!editor.isActive("link")}
          className={clsx(styles.btn, !editor.isActive("link") && styles.disabled)}
          title="Remove Link"
        >
          <Unlink width={16} height={16} />
        </button>
      </div>
    </div>
  );
}
