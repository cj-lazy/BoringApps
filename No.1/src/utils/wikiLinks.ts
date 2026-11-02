export interface WikiLink { target: string; label: string; raw: string; start: number; end: number }
export function wikiLinks(source: string, excluded: {start: number; end: number}[] = [],includeEmbeds=false): WikiLink[] {
  const links: WikiLink[] = [];
  for (const match of source.matchAll(/\[\[([^\[\]\r\n]+)\]\]/g)) {
    const start = match.index!;
    let slashes = 0; for (let i = start - 1; i >= 0 && source[i] === "\\"; i--) slashes++;
    if (slashes % 2 || (!includeEmbeds&&source[start - 1] === "!") || excluded.some(r => r.start < start + match[0].length && r.end > start)) continue;
    const [target, ...alias] = match[1].split("|");
    if (!target.trim()) continue;
    links.push({ target: target.trim(), label: alias.join("|").trim() || target.trim(), raw: match[0], start, end: start + match[0].length });
  }
  return links;
}
export function protectWiki(source: string, tokens: Map<string, WikiLink>, excluded: {start: number; end: number}[]) {
  let text = source;
  for (const link of wikiLinks(source, excluded).reverse()) {
    const token = "BNWIKI" + crypto.randomUUID().replace(/-/g, ""); tokens.set(token, link);
    text = text.slice(0, link.start) + token + text.slice(link.end);
  }
  return text;
}
export function restoreWiki(value: any, tokens: Map<string, WikiLink>): any {
  if (Array.isArray(value)) return value.flatMap(item => item?.type === "text" ? restoreWiki(item, tokens) : [restoreWiki(item, tokens)]);
  if (!value || typeof value !== "object") return value;
  if (value.type === "text" && typeof value.text === "string") return value.text.split(/(BNWIKI[a-f0-9]{32})/).filter(Boolean).map((part: string) => {
    const link = tokens.get(part);
    return link ? { type: "noteLink", props: { target: link.target, label: link.label } } : { ...value, text: part };
  });
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, restoreWiki(child, tokens)]));
}
