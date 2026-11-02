import {getMarkdownParser} from "./markdownNote.ts";
import type {KnowledgeNote} from "./knowledge.ts";
export interface NoteTask {path:string;label:string;line:number;start:number;checked:boolean;source:string;tags:string[];}
export async function noteTasks(notes:KnowledgeNote[]):Promise<NoteTask[]>{
  const parser=await getMarkdownParser(),tasks:NoteTask[]=[];
  const text=(n:any):string=>typeof n.value==="string"?n.value:(n.children||[]).map(text).join(" ");
  for(const note of notes){const visit=(n:any)=>{if(n.type==="listItem"&&typeof n.checked==="boolean"){
    const start=n.position.start.offset,raw=note.source.slice(start,n.position.end.offset),m=/^(?:[-+*]|\d+[.)])[ \t]+\[([ xX])\]/.exec(raw);
    if(m)tasks.push({path:note.path,label:text(n.children[0]),line:n.position.start.line,start:start+m[0].length-2,checked:n.checked,source:note.source,tags:note.properties.tags});
  }n.children?.forEach(visit);};visit(parser.parse(note.source));}return tasks;
}
export function toggleTask(task:NoteTask){
  if(!/[ xX]/.test(task.source[task.start]||"")||task.source[task.start-1]!=="["||task.source[task.start+1]!=="]")throw new Error("任务原文已改变，请刷新后重试。");
  return {path:task.path,before:task.source,after:task.source.slice(0,task.start)+(task.checked?" ":"x")+task.source.slice(task.start+1)};
}
