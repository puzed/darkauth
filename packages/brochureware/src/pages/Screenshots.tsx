import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useTheme } from "next-themes";

type Shot = {
  file: string;
  scenario: string;
  step: number;
  title: string;
  group1?: string;
  group2?: string;
  feature?: string;
};

const Screenshots = () => {
  const [shots, setShots] = useState<Shot[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<{ src: string; alt: string } | null>(null);
  const { theme, resolvedTheme } = useTheme();
  const effective = useMemo(() => (theme === "system" ? resolvedTheme : theme) || "light", [theme, resolvedTheme]);
  const basePath = useMemo(() => `/test-screenshots/${effective}`, [effective]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const themed = await fetch(`${basePath}/index.json`, { cache: "no-store" });
      const raw: unknown = themed.ok ? await themed.json() : [];
      if (!cancelled) {
        setShots(Array.isArray(raw) ? (raw as Shot[]) : []);
        setLoaded(true);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [basePath]);

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-7xl px-4 md:px-6 py-10">
        <h1 className="text-3xl font-bold mb-6">Screenshots</h1>
        {!loaded && (
          <div className="text-muted-foreground">Loading…</div>
        )}
        {loaded && shots.length === 0 && (
          <div className="text-muted-foreground">No screenshots found.</div>
        )}
        {shots.length > 0 && (
          <Groups basePath={basePath} shots={shots} onSelect={(src, alt) => setSelected({ src, alt })} />
        )}
      </main>
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelected(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative max-w-6xl w-full max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close"
              className="absolute -top-3 -right-3 bg-card text-foreground border border-border rounded-full w-8 h-8 grid place-items-center shadow"
              onClick={() => setSelected(null)}
            >
              ×
            </button>
            <img
              src={selected.src}
              alt={selected.alt}
              className="w-full h-auto object-contain rounded-md shadow"
              style={{ maxHeight: '90vh' }}
            />
          </div>
        </div>
      )}
      <Footer />
    </div>
  );
};

export default Screenshots;

function Groups({ basePath, shots, onSelect }: { basePath: string; shots: Shot[]; onSelect: (src: string, alt: string) => void }) {
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
    <div className="space-y-10">
      {g1Keys.map((g1) => {
        const sub = groups.get(g1)!;
        const g2Keys = Array.from(sub.keys()).sort((a, b) => a.localeCompare(b));
        return (
          <section key={g1} className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">{g1}</h2>
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
                <div key={`${g1}-${g2}`} className="mb-8">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-medium">{g2}</h3>
                    <button
                      type="button"
                      onClick={onToggle}
                      className="text-sm px-3 py-1.5 rounded-md border hover:bg-muted/50 transition-smooth"
                    >
                      {nextLabel}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {visible.map((s) => (
                      <figure key={`${s.scenario}-${s.step}`} className="rounded-lg bg-card">
                        <BrowserThumb
                          src={`${basePath}/${s.file}`}
                          alt={s.title}
                          titleText={s.title.replace(/\s#\d+$/, "")}
                          onClick={() => onSelect(`${basePath}/${s.file}`, s.title)}
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
    <button type="button" onClick={onClick} className="rounded-md overflow-hidden bg-background border text-left w-full cursor-pointer">
      <div className="h-7 px-2 flex items-center gap-1 bg-muted/50">
        <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
        <span className="inline-block h-2 w-2 rounded-full bg-yellow-400" />
        <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
        <div className="ml-2 h-4 flex-1 rounded bg-muted/70 flex items-center px-2 text-[10px] leading-none text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">
          {titleText || ""}
        </div>
      </div>
      <img src={src} alt={alt} className="w-full h-auto block" loading="lazy" />
    </button>
  );
}
