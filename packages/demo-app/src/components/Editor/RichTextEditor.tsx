import React from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "./extensions";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { EditorToolbar } from "./EditorToolbar";

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
        class: "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[400px] px-4 py-3",
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
    <div className={`bg-white dark:bg-dark-800 rounded-lg border border-gray-200 dark:border-dark-700 ${className}`}>
      <EditorToolbar editor={editor} />
      <div className="border-t border-gray-200 dark:border-dark-700">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}