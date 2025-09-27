import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import React from "react";
import { EditorToolbar } from "./EditorToolbar";
import { StarterKit } from "./extensions";
import styles from "./RichTextEditor.module.css";

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
}

export function RichTextEditor({
  content,
  onChange,
  placeholder = "Start writing your note...",
  className = "",
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      ...StarterKit,
      Placeholder.configure({
        placeholder,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary-600 dark:text-primary-400 underline",
        },
      }),
      Underline,
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: styles.content,
      },
    },
  });

  React.useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className={`${styles.container} ${className}`}>
      <EditorToolbar editor={editor} />
      <div className={styles.divider}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
