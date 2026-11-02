import { encodeSpacesInBlocks } from "./encode.ts";
import { mathSpans, maskBracketDisplay, protectInlineMath, restoreInlineMath, serializeWithInlineMath, excludedInlineMathRanges } from "./mathSyntax.ts";
import type { MathSpan } from "./mathSyntax.ts";
import { legacyMathParts } from "./legacyMath.ts";
import { resolveBlockAssets, storedAssetUrl } from "./assetLinks.ts";
import { protectWiki, restoreWiki, type WikiLink } from "./wikiLinks.ts";

interface MarkdownEditor {
  schema?: any;
  blocksToMarkdownLossy: (blocks: any[]) => string | Promise<string>;
  tryParseMarkdownToBlocks: (content: string) => any[] | Promise<any[]>;
}
interface SourceGroup { ids: string[]; snapshots: string[]; raw: string; }
interface SourceDocument { groups: SourceGroup[]; prefix: string; tail: string; eol: string; }
const parsedSources = new WeakMap<any[], SourceDocument>();
const installedSources = new WeakMap<object, SourceDocument>();
const signature = (block: any) => JSON.stringify(block);
let parserPromise: Promise<any> | undefined;
export const getMarkdownParser = () => parserPromise ??= Promise.all([
  import("unified"), import("remark-parse"), import("remark-gfm"),
  import("remark-math"), import("remark-frontmatter"),
]).then(([{ unified }, parse, gfm, math, frontmatter]) =>
  unified().use(parse.default).use(gfm.default).use(math.default).use(frontmatter.default, ["yaml", "toml"]));

const decode = (text = "") => { try { return decodeURIComponent(text); } catch { return text; } };
const rawBlock = (source: string) => ({
  id: crypto.randomUUID(), type: "rawMarkdown", props: { source: encodeURIComponent(source) },
});
const inlineTypes = new Set(["text", "emphasis", "strong", "delete", "link", "inlineCode", "inlineMath", "break", "footnoteReference"]);
function supportedInline(node: any): boolean {
  return inlineTypes.has(node.type) && (!node.children || node.children.every(supportedInline));
}
function isVisual(node: any): boolean {
  if (["paragraph", "heading"].includes(node.type)) return node.children.every(supportedInline);
  if (node.type === "table") return node.children.every((row: any) =>
    row.children.every((cell: any) => cell.children.every(supportedInline)));
  // BlockNote preserves positive starts via numberedListItem.props.start.
  // Its indexing plugin treats 0 as 1, so retain zero-based lists as source.
  if (node.type === "list" && (!node.ordered || node.start >= 1)) {
    return node.children.every((item: any) =>
      item.children[0]?.type === "paragraph" && item.children.every(isVisual));
  }
  if(node.type === "blockquote")return node.children.every(isVisual);
  return node.type === "thematicBreak";
}
function customBlock(node: any, raw: string): any | undefined {
  const id = crypto.randomUUID();
  const value = typeof node.value === "string" ? node.value.replace(/\r\n?/g, "\n") : "";
  if (node.type === "yaml") return {id, type: "noteProperties", props: {source: encodeURIComponent(raw)}};
  if (node.type === "code" && !node.meta) {
    const info = /^(.*?)(?:\|w=(\d+|100%)\|h=(\d+))?$/.exec(node.lang || "text")!;
    const [, language, width, height] = info;
    if (language === "mermaid") return {
      id, type: "mermaid", props: { code: value, width: Number(width) || 500, height: Number(height) || 300 },
    };
    return { id, type: "codeBlock", props: {
      text: encodeURIComponent(value), language, width: width || "100%", height: Number(height) || 300,
    } };
  }
  if (node.type === "math") return legacyMathParts(raw)
    ? { id, type: "legacyMath", props: { source: encodeURIComponent(raw) } }
    : { id, type: "latex", props: { text: encodeURIComponent(value) } };
  if (node.type === "paragraph") {
    const spans = mathSpans(raw);
    if (spans.length === 1 && spans[0].display && !raw.slice(0, spans[0].start).trim() && !raw.slice(spans[0].end).trim()) {
      return { id, type: "latex", props: { text: encodeURIComponent(spans[0].tex) } };
    }
  }
  const child = node.type === "paragraph" && node.children.length === 1 ? node.children[0] : null;
  if (child?.type === "image" && !child.title) {
    const alt = /^(.*?)(?:\|w=(\d+))?$/.exec(child.alt || "image")!;
    return { id, type: "image", props: { name: alt[1], url: child.url, width: Number(alt[2]) || 500 } };
  }
  if (child?.type === "link" && !child.title && child.children.length === 1
    && child.children[0].type === "text" && child.children[0].value.startsWith("FILE:")) {
    return { id, type: "file", props: { name: child.children[0].value.slice(5), url: child.url } };
  }
  // Unknown/complex syntax is edited as source, never flattened or rendered as HTML.
  if (!isVisual(node)) return rawBlock(raw);
}

// Parse once in remark and once in BlockNote; marker paragraphs delimit source
// groups without doing one editor conversion per paragraph (important for big notes).
export async function parseNote(editor: MarkdownEditor, source: string): Promise<any[]> {
  const parser = await getMarkdownParser();
  const bomOffset = source.startsWith("\uFEFF") ? 1 : 0;
  const body = source.slice(bomOffset);
  let ast = parser.parse(body);
  const masked = maskBracketDisplay(body, ast);
  if (masked !== body) ast = parser.parse(masked);
  const nodes: any[] = ast.children.map((node: any) => ({ ...node, position: {
    start: { ...node.position.start, offset: node.position.start.offset + bomOffset },
    end: { ...node.position.end, offset: node.position.end.offset + bomOffset },
  } }));
  if (!nodes.length) {
    const blocks = [{ id: crypto.randomUUID(), type: "paragraph", content: [] }];
    parsedSources.set(blocks, { groups: [{ ids: [blocks[0].id], snapshots: blocks.map(signature), raw: source.slice(bomOffset) }], prefix: source.slice(0, bomOffset), tail: "", eol: source.includes("\r\n") ? "\r\n" : "\n" });
    return blocks;
  }
  const markerPrefix = "BNBOUNDARY" + crypto.randomUUID().replace(/-/g, "");
  const markers = new Map<string, number>();
  const mathTokens = new Map<string, MathSpan>();
  const wikiTokens = new Map<string, WikiLink>();
  const footnoteTokens=new Map<string,string>();
  const footnoteDefinitions=nodes.filter(n=>n.type==="footnoteDefinition").map(n=>"[^"+n.identifier+"]: placeholder").join("\n\n");
  const footnotesSupported=!!editor.schema?.inlineContentSchema?.footnoteRef;
  const restoreFootnotes=(value:any):any=>{
    if(Array.isArray(value))return value.flatMap(restoreFootnotes);
    if(!value||typeof value!=="object")return value;
    if(value.type==="text"&&typeof value.text==="string")return value.text.split(/(BNFOOT[a-f0-9]{32})/).filter(Boolean).map((text:string)=>footnoteTokens.has(text)?{type:"footnoteRef",props:{identifier:footnoteTokens.get(text)}}:{...value,text});
    return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,restoreFootnotes(v)]));
  };
  const protect = (raw: string, node: any, offset: number) => {
    let maths = protectInlineMath(raw, mathTokens, excludedInlineMathRanges(node, offset));
    if(footnotesSupported&&maths.includes("[^")){
      const edits:{start:number;end:number;token:string}[]=[];
      const visit=(n:any)=>{if(n.type==="footnoteReference"&&n.position.end.offset<=maths.length){const token="BNFOOT"+crypto.randomUUID().replace(/-/g,"");footnoteTokens.set(token,n.identifier);edits.push({start:n.position.start.offset,end:n.position.end.offset,token});}n.children?.forEach(visit);};visit(parser.parse(maths+"\n\n"+footnoteDefinitions));
      for(const e of edits.sort((a,b)=>b.start-a.start))maths=maths.slice(0,e.start)+e.token+maths.slice(e.end);
    }
    if (!maths.includes("[[")) return maths;
    const reparsed = parser.parse(maths);
    const excluded = reparsed.children.flatMap((n: any) => excludedInlineMathRanges(n, 0));
    return protectWiki(maths, wikiTokens, excluded);
  };
  const restore = (block: any) => restoreFootnotes(restoreWiki(restoreInlineMath(block, mathTokens), wikiTokens));
  const structured=async(nodes:any[],src:string):Promise<any[]>=>{
    const out:any[]=[];
    for(const n of nodes){const raw=src.slice(n.position.start.offset,n.position.end.offset);
      if(n.type==="list"){
        for(const [i,item] of n.children.entries()){const first=(await structured([item.children[0]],src))[0];out.push({id:crypto.randomUUID(),type:typeof item.checked==="boolean"?"checkListItem":n.ordered?"numberedListItem":"bulletListItem",props:typeof item.checked==="boolean"?{checked:item.checked}:n.ordered?{start:(n.start||1)+i}:{},content:first?.content||[],children:await structured(item.children.slice(1),src)});}
      }else if(n.type==="blockquote"||n.type==="footnoteDefinition"){
        const first=n.children[0]?.type==="paragraph"?(await structured([n.children[0]],src))[0]:null;
        out.push({id:crypto.randomUUID(),type:n.type==="blockquote"?"quote":"footnote",props:n.type==="footnoteDefinition"?{identifier:n.identifier}:{},content:first?.content||[],children:await structured(n.children.slice(first?1:0),src)});
      }else{const custom=customBlock(n,raw);if(custom)out.push(custom);else out.push(...(await editor.tryParseMarkdownToBlocks(protect(raw,n,n.position.start.offset))).map(restore));}
    }return out;
  };
  const groups: any[][] = nodes.map(() => []);
  const rawSlices: string[] = [];
  let tagged = "";
  let cursor = bomOffset;
  for (const [index, node] of nodes.entries()) {
    const start = node.position.start.offset;
    const end = node.position.end.offset;
    const raw = source.slice(start, end);
    rawSlices.push(source.slice(cursor, end));
    cursor = end;
    let custom = customBlock(node, raw);
    const anchor=/^<!--\s*no1:anchor:([a-zA-Z0-9_-]+)\s*-->$/.exec(raw);
    const reference=/^!\[\[([^\]\r\n|]+)(?:\|([^\]\r\n]*))?\]\]$/.exec(raw);
    if(anchor)custom={id:crypto.randomUUID(),type:"noteAnchor",props:{identifier:anchor[1]}};
    if(reference)custom={id:crypto.randomUUID(),type:"noteReference",props:{target:reference[1],label:reference[2]||""}};
    if(!footnotesSupported&&raw.includes("[^"))custom=rawBlock(raw);
    const alert = node.type === "blockquote" && /^>\s*\[!(INFO|NOTE|WARNING|CAUTION|ERROR|TIP|IMPORTANT)\](?:[ \t]+([^\r\n]*))?(?:\r?\n|$)/i.exec(raw);
    if (alert) {
      custom=rawBlock(raw);
      const body = raw.slice(alert[0].length).split(/\r?\n/).map((line: string) => line.replace(/^>[ \t]?/, "")).join("\n");
      const bodyAst = parser.parse(body);
      // Inline callouts cannot represent nested blocks; retain complex alerts verbatim.
      if (bodyAst.children.length <= 1 && (!bodyAst.children.length || (bodyAst.children[0].type === "paragraph" && isVisual(bodyAst.children[0])))) {
        const parsed = body ? await editor.tryParseMarkdownToBlocks(protect(body, bodyAst, 0)) : [];
        const first = parsed[0] ? restore(parsed[0]) : null;
        const type = alert[1].toLowerCase();
        custom = { id: crypto.randomUUID(), type: "callout", props: {
          calloutType: ["warning", "caution"].includes(type) ? "warning" : type === "error" ? "error" : ["tip", "important"].includes(type) ? "tip" : "info",
          title: alert[2] || "",
        }, content: first?.content || [] };
      }
    }
    if((node.type==="list"&&isVisual(node))||(node.type==="blockquote"&&!alert&&isVisual(node))||(node.type==="footnoteDefinition"&&footnotesSupported))groups[index]=await structured(parser.parse(raw).children,raw);
    else if (custom) groups[index] = [custom];
    else {
      const marker = markerPrefix + index;
      markers.set(marker, index);
      tagged += marker + "\n\n" + protect(raw, node, start) + "\n\n";
    }
  }
  if (tagged) {
    // BlockNote misreads list items when CRLF source is mixed with LF markers.
    // Normalize only its conversion input; raw slices retain the original bytes.
    const parsed = await editor.tryParseMarkdownToBlocks(tagged.replace(/\r\n?/g, "\n"));
    let groupIndex = -1;
    for (const block of parsed) {
      const marker = block.type === "paragraph" && Array.isArray(block.content) && block.content.length === 1
        ? block.content[0].text : null;
      if (markers.has(marker)) groupIndex = markers.get(marker)!;
      else if (groupIndex >= 0) groups[groupIndex].push(restore(block));
    }
  }
  groups.forEach((blocks, index) => {
    if (!blocks.length) groups[index] = [rawBlock(source.slice(nodes[index].position.start.offset, nodes[index].position.end.offset))];
  });
  const blocks = resolveBlockAssets(groups.flat());
  parsedSources.set(blocks, {
    groups: groups.map((group, index) => ({ ids: group.map(block => block.id), snapshots: group.map(signature), raw: rawSlices[index] })),
    prefix: source.slice(0, bomOffset),
    tail: source.slice(cursor), eol: source.includes("\r\n") ? "\r\n" : "\n",
  });
  return blocks;
}

// BlockNote fills defaults and IDs on installation. Bind those exact snapshots,
// and only after installation succeeds (a failed load/save must not change it).
export function bindNoteSource(editor: object, parsed: any[], installed: any[]): void {
  const source = parsedSources.get(parsed);
  if (!source) { installedSources.delete(editor); return; }
  const byId = new Map(installed.map(block => [block.id, block]));
  installedSources.set(editor, {
    ...source,
    groups: source.groups.map(group => ({ ...group,
      snapshots: group.ids.map((id, index) => byId.has(id) ? signature(byId.get(id)) : group.snapshots[index]),
    })),
  });
}

export function blockAtSourceLine(editor: object, line: number): string | undefined {
  const source=installedSources.get(editor);if(!source)return;
  let cursor=1;
  for(const group of source.groups){const end=cursor+(group.raw.match(/\n/g)?.length||0);if(line<=end)return group.ids[0];cursor=end;}
  return source.groups[source.groups.length-1]?.ids[0];
}

const escapeLabel = (text: string) => text.replace(/[\\[\]]/g, "\\$&").replace(/\r?\n/g, " ");
const destination = (url: string) => "<" + url.replace(/[<>\r\n\\]/g, character => encodeURIComponent(character)) + ">";
const fenceFor = (text: string) => {
  const ticks = String.fromCharCode(96);
  const runs = text.match(new RegExp(ticks + "+", "g")) || [];
  return ticks.repeat(Math.max(3, ...runs.map(run => run.length + 1)));
};
const customTypes = new Set(["rawMarkdown", "legacyMath", "latex", "mermaid", "file", "image", "codeBlock", "callout", "noteProperties", "footnote", "noteAnchor", "noteReference", "quote"]);
const containsCustom = (blocks: any[]): boolean => blocks.some(block => customTypes.has(block.type) || containsCustom(block.children || []));
async function serializeFresh(editor: MarkdownEditor, blocks: any[]): Promise<string> {
  let result = "";
  let buffer: any[] = [];
  const append = (text: string) => { if (result && !result.endsWith("\n\n")) result += "\n\n"; result += text; };
  const flush = async () => {
    if (buffer.length) { append(await serializeWithInlineMath(buffer, blocks => editor.blocksToMarkdownLossy(encodeSpacesInBlocks(blocks)))); buffer = []; }
  };
  for (const block of blocks) {
    const props = block.props || {};
    let text: string | undefined;
    if (block.type === "rawMarkdown" || block.type === "legacyMath" || block.type === "noteProperties") text = decode(props.source);
    if(block.type==="noteAnchor")text="<!-- no1:anchor:"+String(props.identifier).replace(/[^a-zA-Z0-9_-]/g,"")+" -->";
    if(block.type==="noteReference")text="![["+String(props.target).replace(/[\[\]\r\n|]/g,"")+(props.label?"|"+String(props.label).replace(/[\[\]\r\n]/g,""):"")+"]]";
    if(block.type==="quote"||block.type==="footnote"){
      const own=await serializeWithInlineMath([{...block,type:"paragraph",children:[]}],blocks=>editor.blocksToMarkdownLossy(encodeSpacesInBlocks(blocks)));
      const body=own.trimEnd()+(block.children?.length?"\n\n"+await serializeFresh(editor,block.children):"");
      text=block.type==="quote"?body.split(/\r?\n/).map(line=>"> "+line).join("\n"):"[^"+props.identifier+"]: "+body.split(/\r?\n/).map((line,i)=>i?"    "+line:line).join("\n");
    }
    if(["bulletListItem","numberedListItem","checkListItem"].includes(block.type)&&block.children?.length){
      const own=await serializeWithInlineMath([{...block,type:"paragraph",children:[]}],blocks=>editor.blocksToMarkdownLossy(encodeSpacesInBlocks(blocks)));
      const marker=block.type==="numberedListItem"?(props.start||1)+". ":block.type==="checkListItem"?"- ["+(props.checked?"x":" ")+"] ":"- ";
      text=marker+own.trimEnd()+"\n\n"+(await serializeFresh(editor,block.children)).split(/\r?\n/).map(line=>"    "+line).join("\n");
    }
    if (block.type === "latex") text = "$$\n" + decode(props.text) + "\n$$";
    if (block.type === "codeBlock" || block.type === "mermaid") {
      const code = block.type === "mermaid" ? props.code || "" : decode(props.text);
      const language = block.type === "mermaid" ? "mermaid" : props.language || "text";
      const fence = fenceFor(code);
      text = fence + language.replace(/[\r\n]/g, "") + "|w=" + (props.width || "100%") + "|h=" + (props.height || 300)
        + "\n" + code + "\n" + fence;
    }
    if (block.type === "file") text = "[FILE:" + escapeLabel(props.name || "") + "](" + destination(storedAssetUrl(props.url || "")) + ")";
    if (block.type === "image") text = "![" + escapeLabel(props.name || "image") + "|w=" + (props.width || 500) + "](" + destination(storedAssetUrl(props.url || "")) + ")";
    if (block.type === "callout") {
      const body = await serializeWithInlineMath([{ ...block, type: "paragraph", children: [] }], blocks => editor.blocksToMarkdownLossy(encodeSpacesInBlocks(blocks)));
      text = "> [!" + String(props.calloutType || "info").toUpperCase() + "]" + (props.title ? " " + props.title.replace(/[\r\n]/g, " ") : "")
        + "\n" + body.trimEnd().split(/\r?\n/).map(line => "> " + line).join("\n");
    }
    if (text !== undefined) {
      await flush();
      if (block.children?.length&&!(["quote","footnote","bulletListItem","numberedListItem","checkListItem"].includes(block.type))) text += "\n\n" + (await serializeFresh(editor, block.children)).split("\n").map(line => "    " + line).join("\n");
      append(text);
    } else {
      // Do not silently discard unsupported custom descendants.
      if (containsCustom(block.children || [])) {
        await flush();
        const own = await serializeWithInlineMath([{ ...block, children: [] }], blocks => editor.blocksToMarkdownLossy(encodeSpacesInBlocks(blocks)));
        append(own.trimEnd() + "\n\n" + (await serializeFresh(editor, block.children)).split("\n").map(line => "    " + line).join("\n"));
      } else buffer.push(block);
    }
  }
  await flush();
  return result;
}

export async function serializeNote(editor: MarkdownEditor, currentBlocks: any[]): Promise<string> {
  const source = parsedSources.get(currentBlocks) || installedSources.get(editor);
  if (!source) return serializeFresh(editor, currentBlocks);
  const byFirstId = new Map(source.groups.map(group => [group.ids[0], group]));
  let result = "";
  let pending: any[] = [];
  const flush = async () => {
    if (!pending.length) return;
    const text = (await serializeFresh(editor, pending)).replace(/\r?\n/g, source.eol);
    if (result && !result.endsWith(source.eol + source.eol)) result += source.eol + source.eol;
    result += text;
    pending = [];
  };
  for (let index = 0; index < currentBlocks.length;) {
    const group = byFirstId.get(currentBlocks[index].id);
    if (group && group.ids.every((id, offset) => {
      const block = currentBlocks[index + offset];
      return block?.id === id && signature(block) === group.snapshots[offset];
    })) {
      await flush();
      // Original whitespace belongs to this source group. Only add a separator
      // when a newly inserted/changed predecessor would otherwise merge with it.
      if (result && !/[\r\n]$/.test(result) && !/^[\r\n]/.test(group.raw)) result += source.eol + source.eol;
      result += group.raw;
      index += group.ids.length;
    } else pending.push(currentBlocks[index++]);
  }
  await flush();
  return source.prefix + result + source.tail;
}

export async function sourcePositionForBlock(editor:MarkdownEditor & {document?:any[]},id:string){
  const source=installedSources.get(editor),blocks=editor.document;if(!source||!blocks)return null;
  const contains=(block:any):boolean=>block.id===id||(block.children||[]).some(contains);
  let index=blocks.findIndex(contains);if(index<0)return null;
  const group=source.groups.find(g=>g.ids.includes(blocks[index].id));
  if(group){const last=blocks.findIndex(b=>b.id===group.ids[group.ids.length-1]);index=Math.max(index,last);}
  const serialized=await serializeNote(editor,blocks.slice(0,index+1));return {end:serialized.length-source.tail.length};
}
