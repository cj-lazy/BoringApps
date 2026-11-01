import { getMarkdownParser } from "./markdownNote.ts";
import { portableAssetPath, storedAssetUrl } from "./assetLinks.ts";
export interface AssetRewrite { source: string; replacements: number; assets: string[]; unresolved: string[]; }
export async function portableMarkdown(source: string): Promise<AssetRewrite> {
  const parser = await getMarkdownParser(); const ast = parser.parse(source);
  const edits: {start:number;end:number;text:string}[] = []; const assets = new Set<string>(); const unresolved = new Set<string>();
  const visit = (node: any) => {
    if (typeof node.url === "string") {
      const path = portableAssetPath(node.url);
      if (path) {
        assets.add(path);
        const target = storedAssetUrl(node.url);
        if (target !== node.url) {
          const start = node.position.start.offset; const end = node.position.end.offset;
          const raw = source.slice(start,end); const at = raw.indexOf(node.url);
          if (at >= 0) edits.push({start:start+at,end:start+at+node.url.length,text:target});
          else unresolved.add(node.url);
        }
      } else if (/asset:|asset\.localhost|^[a-z]:[\\/]/i.test(node.url)) unresolved.add(node.url);
    }
    node.children?.forEach(visit);
  }; ast.children.forEach(visit);
  let result = source;
  for (const edit of edits.sort((a,b)=>b.start-a.start)) result = result.slice(0,edit.start) + edit.text + result.slice(edit.end);
  return {source:result,replacements:edits.length,assets:[...assets],unresolved:[...unresolved]};
}
