import { useState } from "react";
import styles from "./CodeBlock.module.css";

interface CodeBlockProps {
  code: string;
  lang?: string;
}

export default function CodeBlock({ code, lang }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className={styles.wrapper}>
      {lang && <span className={styles.lang}>{lang}</span>}
      <pre className={styles.pre}>
        <code>{code}</code>
      </pre>
      <button
        className={`${styles.copyBtn}${copied ? ` ${styles.copied}` : ""}`}
        onClick={handleCopy}
        aria-label="Copy code to clipboard"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
