import { useEffect, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ChangelogEntry {
  date: string;
  title: string;
  changes: string[];
  filename: string;
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
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("## ")) {
      if (currentUlItems.length > 0) {
        elements.push(
          <ul key={`ul-${index}-${i}`}>
            {currentUlItems.map((item) => (
              <li key={`${index}-${item.substring(0, 20)}`}>{parseInlineMarkdown(item)}</li>
            ))}
          </ul>
        );
        currentUlItems = [];
      }
      const headerText = line.substring(3);
      elements.push(<h3 key={`h3-${index}-${i}`} className="text-lg font-semibold">{parseInlineMarkdown(headerText)}</h3>);
    } else if (line.startsWith("- ")) {
      currentUlItems.push(line.substring(2));
    } else if (line && currentUlItems.length === 0) {
      elements.push(<p key={`p-${index}-${i}`}>{parseInlineMarkdown(line)}</p>);
    }
  }
  if (currentUlItems.length > 0) {
    elements.push(
      <ul key={`ul-${index}-final`}>
        {currentUlItems.map((item) => (
          <li key={`final-${index}-${item.substring(0, 20)}`}>{parseInlineMarkdown(item)}</li>
        ))}
      </ul>
    );
  }
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
        const es = data.entries || [];
        setEntries(es);
        if (es.length > 1) setCollapsedEntries(new Set(es.slice(1).map((e: ChangelogEntry) => e.filename)));
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
      <main className="container max-w-5xl py-12 space-y-6">
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

