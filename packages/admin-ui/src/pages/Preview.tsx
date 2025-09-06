import { useEffect, useMemo, useRef } from "react";
import styles from "./Preview.module.css";

type ThemeMessage = { type: "da:theme"; theme: "light" | "dark" };
const isThemeMessage = (v: unknown): v is ThemeMessage => {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as { type?: unknown; theme?: unknown };
  return obj.type === "da:theme" && (obj.theme === "light" || obj.theme === "dark");
};

export default function Preview() {
  const innerRef = useRef<HTMLIFrameElement | null>(null);
  const src = useMemo(() => {
    const url = new URL(`${window.location.origin}/branding/preview.html`);
    const current = new URL(window.location.href);
    for (const [k, v] of current.searchParams.entries()) url.searchParams.set(k, v);
    return url.toString();
  }, []);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const data: unknown = e.data;
      if (!isThemeMessage(data)) return;
      try {
        innerRef.current?.contentWindow?.postMessage(data, window.location.origin);
      } catch {}
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  return (
    <div className={styles.previewPage}>
      <iframe ref={innerRef} className={styles.previewFrame} src={src} title="Branding Preview" />
    </div>
  );
}
