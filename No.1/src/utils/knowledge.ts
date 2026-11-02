import { getMarkdownParser } from "./markdownNote.ts";
import { readProperties, type NoteProperties } from "./noteProperties.ts";
import { wikiLinks } from "./wikiLinks.ts";
import { mathSpans } from "./mathSyntax.ts";

export interface NoteHeading { text: string; line: number; }
export interface NoteLink { target: string; label: string; line: number; start: number; end: number; wiki: boolean; }
export interface KnowledgeNote { path: string; source: string; stamp: string; modified_ms: number; title: string; properties: NoteProperties; headings: NoteHeading[]; links: NoteLink[]; lower: string; propertyError?: string; }
export interface NoteFilter { query: string; folder: string; tag: string; type: string; status: string; after: string; before: string; }
export interface Collection { id: string; name: string; filter: NoteFilter;pinned?:boolean;view?:"list"|"table";sort?:"relevance"|"title"|"modified"|"created"|"type"|"status";descending?:boolean;groupBy?:"none"|"type"|"status"; }
export const emptyFilter = (): NoteFilter => ({ query: "", folder: "", tag: "", type: "", status: "", after: "", before: "" });
const textOf = (node: any): string => typeof node.value === "string" ? node.value : (node.children || []).map(textOf).join("");
export function destinationSpan(raw: string, definition: boolean): {start:number;end:number}|null {
  let start=0;
  if(definition){const match=/^\s*\[(?:\\.|[^\]\\])+\]:\s*/.exec(raw);if(!match)return null;start=match[0].length;}
  else {
    let depth=0,found=false;
    for(let i=0;i<raw.length;i++){if(raw[i]==="\\"){i++;continue;}if(raw[i]==="[")depth++;else if(raw[i]==="]"&&--depth===0){if(raw[i+1]!=="(")return null;start=i+2;found=true;break;}}
    if(!found)return null;
    while(/\s/.test(raw[start]||"")&&start<raw.length)start++;
  }
  if(raw[start]==="<"){const begin=++start;for(let i=start;i<raw.length;i++){if(raw[i]==="\\"){i++;continue;}if(raw[i]===">")return{start:begin,end:i};}return null;}
  let depth=0,end=start;
  for(;end<raw.length;end++){if(raw[end]==="\\"){end++;continue;}if(/\s/.test(raw[end]))break;if(raw[end]==="(")depth++;if(raw[end]===")"){if(!depth)break;depth--;}}
  return{start,end};
}
export async function indexNote(record: {path: string; source: string; stamp: string; modified_ms: number}): Promise<KnowledgeNote> {
  const ast = (await getMarkdownParser()).parse(record.source); const headings: NoteHeading[] = [], links: NoteLink[] = [];
  const definitions = new Map<string, any>();
  const mathRanges = mathSpans(record.source);
  const collect = (node: any) => { if (node.type === "definition") definitions.set(node.identifier, node); node.children?.forEach(collect); }; collect(ast);
  const visit = (node: any) => {
    if (["code", "inlineCode", "html", "yaml", "toml", "math", "inlineMath"].includes(node.type)) return;
    if (["link", "definition", "linkReference", "text"].includes(node.type) && mathRanges.some(r => r.start <= node.position.start.offset && r.end >= node.position.end.offset)) return;
    if (node.type === "heading") headings.push({ text: textOf(node), line: node.position.start.line });
    if (node.type === "link" || node.type === "definition") {
      const raw = record.source.slice(node.position.start.offset, node.position.end.offset);
      const span = destinationSpan(raw,node.type==="definition");
      if (span) links.push({ target: node.url, label: textOf(node), line: node.position.start.line, start: node.position.start.offset + span.start, end: node.position.start.offset + span.end, wiki: false });
    }
    if (node.type === "linkReference") {
      const def = definitions.get(node.identifier); if (def) links.push({ target: def.url, label: textOf(node), line: node.position.start.line, start: -1, end: -1, wiki: false });
    }
    if (node.type === "text") {
      const raw = record.source.slice(node.position.start.offset, node.position.end.offset);
      const excluded=mathRanges.map(r=>({start:r.start-node.position.start.offset,end:r.end-node.position.start.offset}));
      for (const link of wikiLinks(raw,excluded,true)) links.push({ target: link.target, label: link.label, line: record.source.slice(0, node.position.start.offset + link.start).split("\n").length, start: node.position.start.offset + link.start, end: node.position.start.offset + link.end, wiki: true });
    }
    if (node.type !== "link" && node.type !== "linkReference") node.children?.forEach(visit);
  }; visit(ast);
  const { properties, error } = readProperties(record.source);
  const title = properties.title || headings[0]?.text || record.path.split("/").pop()!;
  return { ...record, title, properties, propertyError: error, headings, links, lower: [title, record.path, ...properties.tags, record.source].join("\n").toLowerCase() };
}
const decode = (text: string) => { try { return decodeURIComponent(text); } catch { return text; } };
export function resolveNoteLink(target: string, from: string, notes: Pick<KnowledgeNote, "path" | "title">[], wiki = false): {path: string; heading: string} | null {
  if (/^[a-z][a-z\d+.-]*:/i.test(target) || /^[\\/]/.test(target) || target.startsWith("assets/")) return null;
  const hash = target.indexOf("#"), heading = decode(hash < 0 ? "" : target.slice(hash + 1));
  const supplied = decode(hash < 0 ? target : target.slice(0, hash));
  if (!supplied) return {path: from, heading};
  if (!wiki && !/\.md$/i.test(supplied)) return null;
  const name = supplied.replace(/\.md$/i, "");
  const normalize = (value: string) => {
    const parts: string[] = []; for (const part of value.split("/")) { if (!part || part === ".") continue; if (part === "..") { if (!parts.length) return null; parts.pop(); } else { if (/[\\:\x00-\x1f]/.test(part)) return null; parts.push(part); } }
    return parts.join("/");
  };
  const parent = from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "";
  const relative = normalize(parent + name), rootPath = normalize(name);
  const find = (path: string | null) => notes.find(n => path !== null && n.path.toLowerCase() === path.toLowerCase());
  const exact = wiki ? find(rootPath) || find(relative) : find(relative);
  if (exact) return {path: exact.path, heading};
  if (wiki && !name.includes("/")) {
    const matches = notes.filter(n => n.path.split("/").pop()!.toLowerCase() === name.toLowerCase() || n.title.toLowerCase() === name.toLowerCase());
    if (matches.length === 1) return {path: matches[0].path, heading};
  }
  return null;
}
export function relativeNoteUrl(from: string, to: string, heading = "") {
  const a = from.split("/").slice(0, -1), b = to.split("/");
  while (a.length && b.length && a[0] === b[0]) { a.shift(); b.shift(); }
  return [...a.map(() => ".."), ...b].map(encodeURIComponent).join("/") + ".md" + (heading ? "#" + encodeURIComponent(heading) : "");
}
export function filteredNotes(notes: KnowledgeNote[], filter: NoteFilter, recent: string[] = []) {
  const query = filter.query.trim().toLowerCase();
  return notes.filter(n => (!query || n.lower.includes(query)) && (!filter.folder || n.path.startsWith(filter.folder.replace(/\/$/, "") + "/")) && (!filter.tag || n.properties.tags.some(t => t.toLowerCase() === filter.tag.toLowerCase())) && (!filter.type || n.properties.type === filter.type) && (!filter.status || n.properties.status === filter.status) && (!filter.after || n.modified_ms >= new Date(filter.after + "T00:00:00").getTime()) && (!filter.before || n.modified_ms < new Date(filter.before + "T23:59:59.999").getTime()))
    .sort((a, b) => {
      const rank = (n: KnowledgeNote) => query ? (n.title.toLowerCase() === query ? 0 : n.title.toLowerCase().includes(query) ? 1 : n.path.toLowerCase().includes(query) ? 2 : 3) : recent.includes(n.path) ? recent.indexOf(n.path) - recent.length : 0;
      return rank(a) - rank(b) || b.modified_ms - a.modified_ms || a.path.localeCompare(b.path);
    });
}
export function remapPath(path: string, oldPath: string, newPath: string, directory: boolean) { return path === oldPath || (directory && path.startsWith(oldPath + "/")) ? newPath + path.slice(oldPath.length) : path; }
export function planLinkRename(notes: KnowledgeNote[], oldPath: string, newPath: string, directory: boolean) {
  const paths = notes.map(n => ({path: n.path, title: n.title})); const changes: {path: string; before: string; after: string}[] = [];
  for (const note of notes) {
    const fromAfter = remapPath(note.path, oldPath, newPath, directory);
    const edits: {start: number; end: number; text: string}[] = [];
    for (const link of note.links) {
      if (link.start < 0) continue;
      const resolved = resolveNoteLink(link.target, note.path, paths, link.wiki); if (!resolved) continue;
      const toAfter = remapPath(resolved.path, oldPath, newPath, directory);
      if (toAfter === resolved.path && fromAfter === note.path) continue;
      let text: string;
      if (link.wiki) { const target = toAfter + (resolved.heading ? "#" + resolved.heading : ""); text = "[[" + target + (link.label === link.target ? "" : "|" + link.label) + "]]"; }
      else text = relativeNoteUrl(fromAfter, toAfter, resolved.heading);
      edits.push({start: link.start, end: link.end, text});
    }
    let after = note.source; for (const edit of edits.sort((a, b) => b.start - a.start)) after = after.slice(0, edit.start) + edit.text + after.slice(edit.end);
    if (after !== note.source) changes.push({path: note.path, before: note.source, after});
  }
  return changes;
}
