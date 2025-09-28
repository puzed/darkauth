import { useEffect, useState, createElement } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ChangelogEntry {
  date: string;
  title: string;
  changes: string[];
  filename: string;
}

const headingTags: Record<number, keyof JSX.IntrinsicElements> = {
  2: "h2",
  3: "h3",
  4: "h4",
};

const headingClasses: Record<number, string> = {
  2: "text-2xl font-semibold tracking-tight",
  3: "text-xl font-semibold",
  4: "text-lg font-semibold",
};

function parseVersionParts(value: string) {
  return value
    .replace(/\.md$/, "")
    .replace(/^v/, "")
    .split(".")
    .map((part) => Number(part) || 0);
}

function compareChangelogEntries(left: ChangelogEntry, right: ChangelogEntry) {
  const leftParts = parseVersionParts(left.filename);
  const rightParts = parseVersionParts(right.filename);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (rightParts[index] || 0) - (leftParts[index] || 0);
    if (diff !== 0) return diff;
  }
  return right.filename.localeCompare(left.filename);
}

function parseInlineMarkdown(text: string) {
  const parts: (string | JSX.Element)[] = [];
  let current = text;
  let keyIndex = 0;
  while (current.length > 0) {
    const boldMatch = current.match(/\*\*([^*]+)\*\*/);
    if (boldMatch) {
      const beforeBold = current.substring(0, boldMatch.index);
      if (beforeBold) parts.push(beforeBold);
      parts.push(<strong key={`bold-${keyIndex++}`}>{boldMatch[1]}</strong>);
      current = current.substring((boldMatch.index || 0) + boldMatch[0].length);
      continue;
    }
    const codeMatch = current.match(/`([^`]+)`/);
    if (codeMatch) {
      const beforeCode = current.substring(0, codeMatch.index);
      if (beforeCode) parts.push(beforeCode);
      parts.push(<code key={`code-${keyIndex++}`}>{codeMatch[1]}</code>);
      current = current.substring((codeMatch.index || 0) + codeMatch[0].length);
      continue;
    }
    parts.push(current);
    break;
  }
  return parts;
}

function convertMarkdownToComponents(markdown: string, index: number) {
  const lines = markdown.split("\n");
  const elements: JSX.Element[] = [];
  let currentUlItems: string[] = [];
  const flushList = (keySuffix: string) => {
    if (currentUlItems.length === 0) return;
    elements.push(
      <ul key={`ul-${index}-${keySuffix}`} className="list-disc pl-6 space-y-1">
        {currentUlItems.map((item) => (
          <li key={`${index}-${item.substring(0, 20)}`}>{parseInlineMarkdown(item)}</li>
        ))}
      </ul>
    );
    currentUlItems = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/^\u00A0+/, "").trim();
    if (!line) {
      flushList(String(i));
      continue;
    }
    const headingMatch = line.match(/^(#{2,4})\s+(.*)$/);
    if (headingMatch) {
      flushList(String(i));
      const level = Math.min(4, headingMatch[1].length);
      const tag = headingTags[level] ?? "h4";
      const className = headingClasses[level] ?? headingClasses[4];
      elements.push(
        createElement(tag, { key: `h${level}-${index}-${i}`, className }, parseInlineMarkdown(headingMatch[2]))
      );
      continue;
    }
    const liMatch = line.match(/^(?:[-*\u2022\u2013\u2014])\s+(.*)$/);
    if (liMatch) {
      currentUlItems.push(liMatch[1]);
    } else if (line && currentUlItems.length === 0) {
      elements.push(<p key={`p-${index}-${i}`}>{parseInlineMarkdown(line)}</p>);
    }
  }
  flushList("final");
  return <div className="space-y-2">{elements}</div>;
}

const Changelog = () => {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsedEntries, setCollapsedEntries] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadChangelog = async () => {
      try {
        const response = await fetch("/changelog.json");
        if (!response.ok) throw new Error(String(response.status));
        const data = await response.json();
        const es = Array.isArray(data.entries) ? data.entries : [];
        const sorted = [...es].sort(compareChangelogEntries);
        setEntries(sorted);
        if (sorted.length > 1) setCollapsedEntries(new Set(sorted.slice(1).map((e: ChangelogEntry) => e.filename)));
        setLoading(false);
      } catch {
        setError("Failed to load changelog");
        setLoading(false);
      }
    };
    loadChangelog();
  }, []);

  const toggleCollapse = (filename: string) => {
    setCollapsedEntries((prev) => {
      const ns = new Set(prev);
      if (ns.has(filename)) ns.delete(filename);
      else ns.add(filename);
      return ns;
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-6xl lg:max-w-7xl px-4 md:px-6 py-12 space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Changelog</h1>
          <p className="text-muted-foreground">Recent changes and improvements</p>
        </div>
        {loading && <div className="p-4">Loading changelog...</div>}
        {error && <div className="p-4 text-destructive">Error: {error}</div>}
        {!loading && !error && (
          <div className="grid gap-4">
            {entries.map((entry) => {
              const isCollapsed = collapsedEntries.has(entry.filename);
              return (
                <Card key={entry.filename}>
                  <CardHeader>
                    <button
                      type="button"
                      onClick={() => toggleCollapse(entry.filename)}
                      className="w-full text-left"
                    >
                      <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                        <CardTitle>{entry.title}</CardTitle>
                        <span className="text-xs text-muted-foreground">{entry.date}</span>
                      </div>
                    </button>
                  </CardHeader>
                  {!isCollapsed && (
                    <CardContent>
                      <div className="grid gap-3">
                        {entry.changes.map((change, idx) => (
                          <div key={`${entry.filename}-${idx}`}>{convertMarkdownToComponents(change, idx)}</div>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Changelog;
