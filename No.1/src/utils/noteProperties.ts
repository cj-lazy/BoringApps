import { isMap, parseDocument } from "yaml";

export interface NoteProperties { title: string; tags: string[]; type: string; status: string; source: string; created: string; }
export const emptyProperties = (): NoteProperties => ({ title: "", tags: [], type: "", status: "", source: "", created: "" });
export function frontmatter(source: string) {
  const match = /^(\uFEFF)?---[ \t]*\r?\n([\s\S]*?)(?:\r?\n)(---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(source);
  return match ? { raw: match[0], yaml: match[2], bom: match[1] || "", end: match[0].length, eol: source.includes("\r\n") ? "\r\n" : "\n" } : null;
}
export function readProperties(source: string): { properties: NoteProperties; error?: string } {
  const fm = frontmatter(source); const properties = emptyProperties();
  if (!fm) return { properties };
  try {
    const doc = parseDocument(fm.yaml, { uniqueKeys: true });
    if (doc.errors.length || (doc.contents && !isMap(doc.contents))) throw new Error(doc.errors[0]?.message || "属性区必须是键值列表");
    const value = doc.toJS({ maxAliasCount: 50 }) || {};
    for (const key of ["title", "type", "status", "source", "created"] as const) if (typeof value[key] === "string" || typeof value[key] === "number") properties[key] = String(value[key]);
    const tags: unknown[] = Array.isArray(value.tags) ? value.tags : typeof value.tags === "string" ? value.tags.split(/[,，]/) : [];
    properties.tags = [...new Set(tags.filter((v): v is string => typeof v === "string").map(s => s.trim().replace(/^#/, "")).filter(Boolean))];
    return { properties };
  } catch (error) { return { properties, error: "属性区无法安全解析，请在源码中修正后重试：" + String(error) }; }
}
export function writeProperties(source: string, properties: NoteProperties): string {
  const current = readProperties(source); if (current.error) throw new Error(current.error);
  const fm = frontmatter(source), eol = fm?.eol || (source.includes("\r\n") ? "\r\n" : "\n");
  const doc = parseDocument(fm?.yaml || "");
  for (const key of Object.keys(properties) as (keyof NoteProperties)[]) {
    const value = properties[key];
    if (JSON.stringify(current.properties[key]) === JSON.stringify(value)) continue;
    if (Array.isArray(value) ? value.length : value) doc.set(key, value); else doc.delete(key);
  }
  if (JSON.stringify(current.properties) === JSON.stringify(properties)) return source;
  const yaml = doc.toString({ lineWidth: 0 }).replace(/\r?\n/g, eol).trimEnd();
  const bom = fm?.bom || (source.startsWith("\uFEFF") ? "\uFEFF" : "");
  return bom + "---" + eol + yaml + eol + "---" + eol + (fm ? source.slice(fm.end) : eol + source.slice(bom.length));
}
