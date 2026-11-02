import {getMarkdownParser} from "./markdownNote.ts";
import {portableAssetPath} from "./assetLinks.ts";
import {destinationSpan,type KnowledgeNote} from "./knowledge.ts";
import type {NoteChange} from "./organizeNotes.ts";
export interface AssetReference{asset:string;note:string;line:number;url:string;start:number;end:number}
export async function assetReferences(notes:KnowledgeNote[]):Promise<AssetReference[]>{
  const parser=await getMarkdownParser(),references:AssetReference[]=[];
  for(const note of notes){const ast=parser.parse(note.source);const visit=(node:any)=>{
    if(typeof node.url==="string"){const asset=portableAssetPath(node.url);if(asset){const raw=note.source.slice(node.position.start.offset,node.position.end.offset),span=destinationSpan(raw,node.type==="definition");if(span)references.push({asset,note:note.path,line:node.position.start.line,url:node.url,start:node.position.start.offset+span.start,end:node.position.start.offset+span.end});}}
    node.children?.forEach(visit);
  };visit(ast);}
  return references;
}
export function assetRepairChanges(notes:KnowledgeNote[],references:AssetReference[],replacements:Record<string,string>):NoteChange[]{
  return notes.flatMap(note=>{let after=note.source;const edits=references.filter(r=>r.note===note.path&&replacements[r.asset]).sort((a,b)=>b.start-a.start);
    for(const edit of edits){const path=portableAssetPath(replacements[edit.asset]);if(!path)throw new Error("替换目标必须是笔记库附件。");after=after.slice(0,edit.start)+path.split("/").map(encodeURIComponent).join("/")+after.slice(edit.end);}
    return after===note.source?[]:[{path:note.path,before:note.source,after}];
  });
}
