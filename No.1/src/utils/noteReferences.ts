import {getMarkdownParser} from "./markdownNote.ts";
export interface ReferenceTarget {start:number;end:number;label:string;kind:"section"|"paragraph";anchor:string;line:number;}
export const anchorPattern=/^<!--\s*no1:anchor:([a-zA-Z0-9_-]+)\s*-->$/;
export async function referenceTargets(source:string):Promise<ReferenceTarget[]>{
  const nodes=(await getMarkdownParser()).parse(source).children;
  const text=(n:any):string=>typeof n.value==="string"?n.value:(n.children||[]).map(text).join(" ");
  return nodes.flatMap((n:any,i:number)=>{
    if(!["paragraph","heading","list","blockquote","table","math","code"].includes(n.type)||/^!\[\[/.test(source.slice(n.position.start.offset,n.position.end.offset)))return [];
    const prev=nodes[i-1],anchor=prev?.type==="html"?anchorPattern.exec(prev.value)?.[1]||"":"";
    let end=n.position.end.offset;
    if(n.type==="heading"){const next=nodes.slice(i+1).find((x:any)=>x.type==="heading"&&x.depth<=n.depth);end=next?next.position.start.offset:source.length;}
    return [{start:n.position.start.offset,end,label:text(n).slice(0,100)||n.type,kind:n.type==="heading"?"section":"paragraph",anchor,line:n.position.start.line}];
  });
}
export async function referenceExcerpt(source:string,heading:string){
  const targets=await referenceTargets(source);const target=heading.startsWith("^")?targets.find(t=>t.anchor===heading.slice(1)):targets.find(t=>t.kind==="section"&&(t.label===heading||t.label.toLowerCase().replace(/\s+/g,"-")===heading));
  if(!heading)return {source,line:1};if(!target||heading.startsWith("^")&&targets.filter(t=>t.anchor===heading.slice(1)).length!==1)return null;
  return {source:source.slice(target.start,target.end).replace(/<!--\s*no1:anchor:[a-zA-Z0-9_-]+\s*-->\s*/g,""),line:target.line};
}
export function planReference(destination:{path:string;source:string;offset:number},note:{path:string;source:string},target:ReferenceTarget,live:boolean){
  if(note.source.slice(target.start,target.end).length===0)throw new Error("引用目标已改变，请重新选择。");
  if(target.anchor&&[...note.source.matchAll(new RegExp("<!--\\s*no1:anchor:"+target.anchor+"\\s*-->","g"))].length!==1)throw new Error("来源包含重复或无效的定位标记，请先在源码中检查。 ");
  const id=target.anchor||"ref-"+crypto.randomUUID().slice(0,12),eol=note.source.includes("\r\n")?"\r\n":"\n";
  const label=target.label.replace(/[\[\]|\r\n]/g," "),link=(live?"!":"")+"[["+note.path+"#^"+id+"|"+label+"]]";
  const inserted="\n\n"+link+"\n\n";
  const anchor=target.anchor?"":"<!-- no1:anchor:"+id+" -->"+eol+eol;
  if(destination.path===note.path){if(destination.source!==note.source)throw new Error("笔记原文已改变，请重新打开引用面板。");let after=note.source;const edits=[{at:destination.offset,text:inserted},...(anchor?[{at:target.start,text:anchor}]:[])];for(const e of edits.sort((a,b)=>b.at-a.at))after=after.slice(0,e.at)+e.text+after.slice(e.at);return [{path:note.path,before:note.source,after}];}
  return [...(anchor?[{path:note.path,before:note.source,after:note.source.slice(0,target.start)+anchor+note.source.slice(target.start)}]:[]),{path:destination.path,before:destination.source,after:destination.source.slice(0,destination.offset)+inserted+destination.source.slice(destination.offset)}];
}
