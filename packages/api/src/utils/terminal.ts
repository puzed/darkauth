function stripAnsi(input: string): string {
  let result = "";
  const len = input.length;
  for (let i = 0; i < len; i++) {
    const ch = input[i];
    if (ch === "\x1b" && i + 1 < len && input[i + 1] === "[") {
      i += 2;
      while (i < len && /[0-9;]/.test(input[i] || "")) i++;
      if (i < len && (input[i] || "") === "m") continue;
      // If not a valid sequence, fall through to append characters
    }
    result += ch;
  }
  return result;
}

function stringWidth(input: string): number {
  return Array.from(stripAnsi(input)).length;
}

export function printBox(lines: string[]): void {
  const content = [...lines];
  const width = Math.max(...content.map((l) => stringWidth(l)));
  const top = `╔${"═".repeat(width + 2)}╗`;
  const bottom = `╚${"═".repeat(width + 2)}╝`;
  console.log(top);
  for (const line of content) {
    const pad = width - stringWidth(line);
    console.log(`║ ${line}${" ".repeat(pad)} ║`);
  }
  console.log(bottom);
}

export function printInfoTable(title: string, rows: [string, string][]): void {
  const labelWidth = Math.max(...rows.map(([l]) => stringWidth(l)));
  const colored = rows.map(([l, v]) => {
    const padded = l.padEnd(labelWidth);
    const coloredLabel = `\x1b[96m${padded}\x1b[0m`;
    return `${coloredLabel}  ${v}`;
  });
  const contentWidth = Math.max(stringWidth(title), ...colored.map((l) => stringWidth(l)));
  const left = Math.max(0, Math.floor((contentWidth - stringWidth(title)) / 2));
  const centeredTitle = `${" ".repeat(left)}${title}`;
  const divider = "─".repeat(contentWidth);
  printBox([centeredTitle, divider, ...colored]);
}
