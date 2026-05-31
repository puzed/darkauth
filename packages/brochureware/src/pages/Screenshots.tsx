import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { cleanShotTitle, getScreenshotUrl, SCREENSHOT_MANIFEST_URL, type ScreenshotManifest, type Shot } from "../lib/screenshots";
import { useBrochureTheme } from "../hooks/useBrochureTheme";
import styles from "./Screenshots.module.css";

const Screenshots = () => {
  const [shots, setShots] = useState<Shot[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<{ src: string; alt: string } | null>(null);
  const effective = useBrochureTheme();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoaded(false);
      const response = await fetch(SCREENSHOT_MANIFEST_URL, { cache: "no-store" });
      const payload: ScreenshotManifest = response.ok ? await response.json() : {};
      const themeShots = payload.themes?.[effective];
      if (!cancelled) {
        setShots(Array.isArray(themeShots) ? (themeShots as Shot[]) : []);
        setLoaded(true);
      }
    };
    load().catch(() => {
      if (!cancelled) {
        setShots([]);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [effective]);

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  return (
    <Layout>
      <section className={styles.page}>
        <div className="container">
          <div className={styles.hero}>
            <span className={styles.eyebrow}>Automated screenshots</span>
            <h1>Screenshots</h1>
            <p>Release-captured admin, user, auth, and demo flows. The gallery follows the current theme.</p>
          </div>
        {!loaded && (
            <div className={styles.status}>Loading...</div>
        )}
        {loaded && shots.length === 0 && (
            <div className={styles.status}>No screenshots found.</div>
        )}
        {shots.length > 0 && (
          <Groups theme={effective} shots={shots} onSelect={(src, alt) => setSelected({ src, alt })} />
        )}
        </div>
      </section>
      {selected && (
        <div
          className={styles.modal}
          onClick={() => setSelected(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className={styles.modalBody}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close"
              className={styles.close}
              onClick={() => setSelected(null)}
            >
              ×
            </button>
            <img
              src={selected.src}
              alt={selected.alt}
            />
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Screenshots;

function Groups({ theme, shots, onSelect }: { theme: "dark" | "light"; shots: Shot[]; onSelect: (src: string, alt: string) => void }) {
  const [sectionStates, setSectionStates] = useState<Record<string, number>>({});
  const groups = new Map<string, Map<string, Shot[]>>();
  for (const s of shots) {
    const g1 = s.group1 || "General";
    const g2 = s.group2 || "General";
    if (!groups.has(g1)) groups.set(g1, new Map());
    const sub = groups.get(g1)!;
    if (!sub.has(g2)) sub.set(g2, []);
    sub.get(g2)!.push(s);
  }
  const g1Keys = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));
  return (
    <div className={styles.groups}>
      {g1Keys.map((g1) => {
        const sub = groups.get(g1)!;
        const g2Keys = Array.from(sub.keys()).sort((a, b) => a.localeCompare(b));
        return (
          <section key={g1}>
            <h2 className={styles.groupTitle}>{g1}</h2>
            {g2Keys.map((g2) => {
              const sectionKey = `${g1}::${g2}`;
              const phase = sectionStates[sectionKey] ?? 0;
              const items = sub
                .get(g2)!
                .slice()
                .sort((a, b) => a.scenario.localeCompare(b.scenario) || a.step - b.step);
              const visible = phase === 0 ? items.slice(0, 3) : phase === 1 ? items : [];
              const nextLabel = phase === 0 ? "Show all screenshots" : phase === 1 ? "Hide all screenshots" : "Show 3 screenshots";
              const onToggle = () =>
                setSectionStates((prev) => ({ ...prev, [sectionKey]: ((phase + 1) % 3) }));
              return (
                <div key={`${g1}-${g2}`} className={styles.subgroup}>
                  <div className={styles.subgroupHead}>
                    <h3>{g2}</h3>
                    <button
                      type="button"
                      onClick={onToggle}
                      className={styles.toggle}
                    >
                      {nextLabel}
                    </button>
                  </div>
                  <div className={styles.grid}>
                    {visible.map((s) => (
                      <figure key={`${s.scenario}-${s.step}`} className={styles.figure}>
                        <BrowserThumb
                          src={getScreenshotUrl(theme, s.file)}
                          alt={s.title}
                          titleText={cleanShotTitle(s.title)}
                          onClick={() => onSelect(getScreenshotUrl(theme, s.file), s.title)}
                        />
                      </figure>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

function BrowserThumb({ src, alt, titleText, onClick }: { src: string; alt: string; titleText?: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className={styles.thumb}>
      <div className={styles.bar}>
        <span />
        <span />
        <span />
        <strong>
          {titleText || ""}
        </strong>
      </div>
      <img src={src} alt={alt} loading="lazy" />
    </button>
  );
}
