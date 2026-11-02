import {writeProperties,type NoteProperties} from "./noteProperties.ts";
import type {KnowledgeNote} from "./knowledge.ts";
export interface NoteChange{path:string;before:string;after:string}
export interface PropertyPatch{type?:string;status?:string;tags?:string[];addTags?:string[];removeTags?:string[]}
export function propertyChanges(notes:KnowledgeNote[],patch:PropertyPatch):NoteChange[]{
  return notes.flatMap(note=>{
    const properties:NoteProperties={...note.properties,tags:[...note.properties.tags]};
    if(patch.type!==undefined)properties.type=patch.type;if(patch.status!==undefined)properties.status=patch.status;
    const remove=new Set((patch.removeTags||[]).map(t=>t.toLowerCase()));
    properties.tags=(patch.tags??properties.tags).filter(t=>!remove.has(t.toLowerCase()));
    for(const tag of patch.addTags||[])if(tag&&!properties.tags.some(t=>t.toLowerCase()===tag.toLowerCase()))properties.tags.push(tag);
    const after=writeProperties(note.source,properties);return after===note.source?[]:[{path:note.path,before:note.source,after}];
  });
}
export function mergeTagChanges(notes:KnowledgeNote[],from:string,to:string):NoteChange[]{
  if(!from.trim()||!to.trim())throw new Error("请填写原标签和新标签。");
  return propertyChanges(notes.filter(n=>n.properties.tags.some(t=>t.toLowerCase()===from.toLowerCase())),{removeTags:[from],addTags:[to]});
}
export type SortField="relevance"|"title"|"modified"|"created"|"type"|"status";
export function sortNotes(notes:KnowledgeNote[],field:SortField,descending:boolean):KnowledgeNote[]{
  if(field==="relevance")return notes;
  return [...notes].sort((a,b)=>{const value=(n:KnowledgeNote):string|number=>field==="modified"?n.modified_ms:field==="title"?n.title:n.properties[field];const av=value(a),bv=value(b);const compare=typeof av==="number"&&typeof bv==="number"?av-bv:String(av).localeCompare(String(bv),"zh-CN",{numeric:true});return (descending?-compare:compare)||a.path.localeCompare(b.path);});
}
