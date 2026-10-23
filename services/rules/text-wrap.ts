// Word-wrapping for text placed by Oppllo One on boards (Stage 13.1). Pure.

/** Word-wraps for a sticky (Excalidraw draws stored lines as they are; it re-wraps once someone edits). */
export function wrap(text: string, width: number, fontSize: number): string {
  const max = Math.max(4, Math.floor(width / (fontSize * 0.6)));
  return text
    .split("\n")
    .flatMap((para) => {
      const lines: string[] = [];
      let line = "";
      for (const word of para.split(/\s+/)) {
        if (line && (line + " " + word).length > max) {
          lines.push(line);
          line = word;
        } else line = line ? `${line} ${word}` : word;
      }
      return [...lines, line];
    })
    .join("\n");
}
