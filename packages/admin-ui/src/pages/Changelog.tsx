import type React from "react";
import { useEffect, useState } from "react";
import changelogStyles from "@/components/changelog.module.css";
import PageHeader from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ChangelogEntry {
  date: string;
  title: string;
  changes: string[];
  filename: string;
}

function parseInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
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

function convertMarkdownToComponents(markdown: string, index: number): JSX.Element {
  const lines = markdown.split("\n");
  const elements: JSX.Element[] = [];
  let currentUlItems: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/^\u00A0+/, "").trim();
    const liMatch = line.match(/^(?:[-*\u2022\u2013\u2014])\s+(.*)$/);
    if (!line) {
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
      continue;
    }
    if (line.startsWith("## ") || line.startsWith("### ")) {
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
      const headerText = line.replace(/^###?\s+/, "");
      elements.push(<h3 key={`h3-${index}-${i}`}>{parseInlineMarkdown(headerText)}</h3>);
    } else if (liMatch) {
      currentUlItems.push(liMatch[1]);
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
  return <div className={changelogStyles.changelog}>{elements}</div>;
}

const Changelog: React.FC = () => {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsedEntries, setCollapsedEntries] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadChangelog = async () => {
      try {
        const response = await fetch("https://darkauth.com/changelog.json");
        if (!response.ok) throw new Error(`Failed to fetch changelog: ${response.status}`);
        const data = await response.json();
        const es = data.entries || [];
        setEntries(es);
        if (es.length > 1)
          setCollapsedEntries(new Set(es.slice(1).map((e: ChangelogEntry) => e.filename)));
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
    <div>
      <PageHeader title="Changelog" subtitle="Recent changes and improvements" />
      {loading && <div style={{ padding: 16 }}>Loading changelog...</div>}
      {error && <div style={{ padding: 16, color: "hsl(var(--destructive))" }}>Error: {error}</div>}
      {!loading && !error && (
        <div style={{ display: "grid", gap: 12 }}>
          {entries.map((entry) => {
            const isCollapsed = collapsedEntries.has(entry.filename);
            return (
              <Card key={entry.filename}>
                <CardHeader>
                  <button
                    type="button"
                    onClick={() => toggleCollapse(entry.filename)}
                    style={{
                      cursor: "pointer",
                      display: "block",
                      width: "100%",
                      background: "none",
                      border: "none",
                      padding: 0,
                      textAlign: "inherit",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <CardTitle>{entry.title}</CardTitle>
                      <span style={{ color: "hsl(var(--muted-foreground))", fontSize: 12 }}>
                        {entry.date}
                      </span>
                    </div>
                  </button>
                </CardHeader>
                {!isCollapsed && (
                  <CardContent>
                    <div className={changelogStyles.changelog} style={{ display: "grid", gap: 8 }}>
                      {entry.changes.map((change, idx) => (
                        <div key={`${entry.filename}-${idx}`}>
                          {convertMarkdownToComponents(change, idx)}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Changelog;
