export interface MathSpan { start: number; end: number; tex: string; display: boolean; }
const escaped = (source: string, index: number) => {
  let count = 0;
  while (index > 0 && source[--index] === "\\") count++;
  return count % 2 === 1;
};
export const decodeMath = (value: string) => { try { return decodeURIComponent(value); } catch { return value; } };

export function decodeMarkdownEntities(source: string): string {
  return source.replace(/&#(x[0-9a-f]+|\d+);/gi, (entity, code: string) => {
    const point = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code);
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : entity;
  }).replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&apos;/gi, "'");
}

function repairLegacyMath(source: string): string {
  // Only used for the damaged [\ + HTML-space form, never for valid TeX.
  // In ordinary TeX, \_ (literal underscore) and \\ (matrix row break) are significant.
  return decodeMarkdownEntities(source)
    .replace(/(?<!\\)\\[ \t]*(?=\r?\n|$)/g, "").replace(/\\_/g, "_").trim();
}

// Recognize delimiters before Markdown consumes their backslashes. Code spans
// and caller-provided code/HTML ranges are deliberately excluded.
export function mathSpans(source: string, excluded: { start: number; end: number }[] = []): MathSpan[] {
  const result: MathSpan[] = [];
  let excludedIndex = 0;
  for (let index = 0; index < source.length;) {
    while (excludedIndex < excluded.length && excluded[excludedIndex].end <= index) excludedIndex++;
    const ignored = excluded[excludedIndex];
    if (ignored && index >= ignored.start) { index = ignored.end; continue; }
    if (source[index] === "`" && !escaped(source, index)) {
      const length = /^`+/.exec(source.slice(index))![0].length;
      let end = index + length;
      while ((end = source.indexOf("`".repeat(length), end)) >= 0) {
        if (source[end - 1] !== "`" && source[end + length] !== "`") break;
        end += length;
      }
      if (end >= 0) { index = end + length; continue; }
    }
    if (escaped(source, index)) { index++; continue; }
    const legacy = source.slice(index).match(/^\[\\[ \t]*\r?\n/);
    if (legacy) {
      const rest = source.slice(index + legacy[0].length);
      const close = /^(?:[ \t]|&#x20;|&#32;|&nbsp;)*\\?\][ \t]*(?=[\s，。,.!?;：:]|$)/mi.exec(rest);
      if (close) {
        const body = rest.slice(0, close.index);
        if (/\\[a-zA-Z]+/.test(body)) {
          const end = index + legacy[0].length + close.index + close[0].length;
          result.push({ start: index, end, tex: repairLegacyMath(body), display: true });
          index = end; continue;
        }
      }
    }
    let open = "", close = "", display = false;
    if (source.startsWith("\\[", index)) { open = "\\["; close = "\\]"; display = true; }
    else if (source.startsWith("\\(", index)) { open = "\\("; close = "\\)"; }
    else if (source.startsWith("$$", index)) { open = close = "$$"; display = true; }
    else if (source[index] === "$" && !/\s/.test(source[index + 1] || " ")) { open = close = "$"; }
    if (!open) { index++; continue; }
    let end = index + open.length;
    while ((end = source.indexOf(close, end)) >= 0) {
      if (!escaped(source, end) && (open !== "$" || (!/\s/.test(source[end - 1]) && !/\d/.test(source[end + 1] || "")))) break;
      end += close.length;
    }
    if (end >= 0) {
      const tex = source.slice(index + open.length, end).trim();
      const crossesExcluded = excluded.some(range => range.start < end + close.length && range.end > index);
      if (tex && !crossesExcluded && (open !== "$" || !tex.includes("\n"))) {
        result.push({ start: index, end: end + close.length, tex, display });
        index = end + close.length; continue;
      }
    }
    index += open.length;
  }
  return result;
}

export function maskBracketDisplay(source: string, ast: any): string {
  const excluded: { start: number; end: number }[] = [];
  const visit = (node: any) => {
    if (["code", "inlineCode", "html", "math", "inlineMath"].includes(node.type)) {
      excluded.push({ start: node.position.start.offset, end: node.position.end.offset });
    } else node.children?.forEach(visit);
  };
  visit(ast);
  const characters = source.split("");
  for (const span of mathSpans(source, excluded)) {
    if (!source.startsWith("\\[", span.start)) continue;
    const before = source.slice(source.lastIndexOf("\n", span.start - 1) + 1, span.start);
    const nextNewline = source.indexOf("\n", span.end);
    const after = source.slice(span.end, nextNewline < 0 ? source.length : nextNewline);
    // Equal-length masking preserves every source offset, including CRLF/BOM.
    if (/^[ \t]{0,3}$/.test(before) && /^[ \t\r]*$/.test(after) && source.slice(span.start, span.end).includes("\n")) {
      characters[span.start] = characters[span.start + 1] = "$";
      characters[span.end - 2] = characters[span.end - 1] = "$";
    }
  }
  return characters.join("");
}

export function excludedInlineMathRanges(node: any, offset: number): { start: number; end: number }[] {
  if (["inlineCode", "html", "link", "image", "linkReference", "imageReference"].includes(node.type)) {
    return [{ start: node.position.start.offset - offset, end: node.position.end.offset - offset }];
  }
  return (node.children || []).flatMap((child: any) => excludedInlineMathRanges(child, offset));
}

export function protectInlineMath(source: string, tokens: Map<string, MathSpan>, excluded: { start: number; end: number }[] = []): string {
  let output = "", cursor = 0;
  for (const span of mathSpans(source, excluded)) {
    const marker = "BNMATH" + crypto.randomUUID().replace(/-/g, "");
    tokens.set(marker, span);
    output += source.slice(cursor, span.start) + marker;
    cursor = span.end;
  }
  return output + source.slice(cursor);
}

export function restoreInlineMath(block: any, tokens: Map<string, MathSpan>): any {
  const visit = (value: any): any => {
    if (Array.isArray(value)) return value.flatMap(item => item?.type === "text" ? visit(item) : [visit(item)]);
    if (!value || typeof value !== "object") return value;
    if (value.type === "text" && typeof value.text === "string") {
      return value.text.split(/(BNMATH[a-f0-9]{32})/g).filter(Boolean).map((text: string) => {
        const math = tokens.get(text);
        return math ? { type: "inlineMath", props: { text: encodeURIComponent(math.tex), display: math.display } } : { ...value, text: decodeMarkdownEntities(text) };
      });
    }
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, visit(child)]));
  };
  return visit(block);
}

export async function serializeWithInlineMath(blocks: any[], convert: (blocks: any[]) => string | Promise<string>): Promise<string> {
  const replacements = new Map<string, string>();
  const visit = (value: any): any => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    if (value.type === "inlineMath") {
      const marker = "BNMATH" + crypto.randomUUID().replace(/-/g, "");
      const tex = decodeMath(value.props.text);
      replacements.set(marker, value.props.display ? "\\[" + tex + "\\]" : "\\(" + tex + "\\)");
      return { type: "text", text: marker, styles: {} };
    }
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, visit(child)]));
  };
  let output = await convert(visit(blocks));
  for (const [marker, source] of replacements) output = output.split(marker).join(source);
  return output;
}
