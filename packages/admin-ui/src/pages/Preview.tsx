import { useMemo } from "react";
import styles from "./Preview.module.css";

export default function Preview() {
  const src = useMemo(() => {
    const url = new URL(`${window.location.origin}/branding/preview.html`);
    const current = new URL(window.location.href);
    for (const [k, v] of current.searchParams.entries()) url.searchParams.set(k, v);
    return url.toString();
  }, []);

  return (
    <div className={styles.previewPage}>
      <iframe className={styles.previewFrame} src={src} title="Branding Preview" />
    </div>
  );
}
