import { getMarkdownParser } from "./markdownNote.ts";
import { mathSpans } from "./mathSyntax.ts";
export interface ReplaceOptions { code: boolean; math: boolean; links: boolean; }
export const safeReplaceOptions: ReplaceOptions = { code: false, math: false, links: false };
export interface TextChange { start: number; end: number; before: string; after: string; line: number; }
export async function planReplacement(source: string, query: string, replacement: string, options = safeReplaceOptions) {
  if (!query) return { content: source, changes: [] as TextChange[] };
  const parser = await getMarkdownParser(); const ast = parser.parse(source);
  const excluded: { start: number; end: number }[] = [];
  const visit = (node: any) => {
    const start = node.position?.start.offset; const end = node.position?.end.offset;
    if (start === undefined || end === undefined) return;
    if ((!options.code && ["code", "inlineCode", "html"].includes(node.type)) || (!options.math && ["math", "inlineMath"].includes(node.type))) {
      excluded.push({start,end}); return;
    }
    if (!options.links && typeof node.url === "string") {
      const raw = source.slice(start,end); const position = raw.indexOf(node.url);
      // If escapes obscure the destination, keep the whole construct untouched.
      excluded.push(position >= 0 ? {start:start+position,end:start+position+node.url.length} : {start,end});
    }
    node.children?.forEach(visit);
  };
  ast.children.forEach(visit);
  if (!options.math) excluded.push(...mathSpans(source).map(span => ({start:span.start,end:span.end})));
  const matcher = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  const changes: TextChange[] = [];
  for (const match of source.matchAll(matcher)) {
    const start = match.index!; const end = start + match[0].length;
    if (excluded.some(range => start < range.end && end > range.start)) continue;
    changes.push({start,end,before:match[0],after:replacement,line:source.slice(0,start).split(/\r?\n/).length});
  }
  let content = source;
  for (const change of [...changes].reverse()) content = content.slice(0,change.start) + change.after + content.slice(change.end);
  return {content,changes};
}
