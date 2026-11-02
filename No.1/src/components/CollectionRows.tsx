import {useEffect,useState} from "react";
import type {KnowledgeNote} from "../utils/knowledge";
import type {NoteChange} from "../utils/organizeNotes";
import {propertyChanges} from "../utils/organizeNotes";
function PropertyCell({note,field,onApply,disabled}:{note:KnowledgeNote;field:"type"|"status"|"tags";onApply:(changes:NoteChange[])=>Promise<void>;disabled:boolean}){
  const original=field==="tags"?note.properties.tags.join(", "):note.properties[field];const [value,setValue]=useState(original);
  useEffect(()=>setValue(original),[original]);
  return <input aria-label={note.title+"的"+({type:"类型",status:"状态",tags:"标签"}[field])} disabled={disabled||!!note.propertyError} value={value} onChange={e=>setValue(e.target.value)}
    onKeyDown={e=>{if(e.key==="Enter"&&!e.nativeEvent.isComposing)e.currentTarget.blur();if(e.key==="Escape"){setValue(original);e.currentTarget.value=original;e.currentTarget.blur();}}}
    onBlur={async e=>{const text=e.currentTarget.value;if(text===original)return;try{await onApply(propertyChanges([note],field==="tags"?{tags:[...new Set(text.split(/[,，]/).map(t=>t.trim().replace(/^#/,"")).filter(Boolean))]}:{[field]:text}));}catch{setValue(original);}}}/>;
}
export default function CollectionRows(p:{notes:KnowledgeNote[];limit:number;view:"list"|"table";selected:number;paths:Set<string>;groupBy:"none"|"type"|"status";busy:boolean;query:string;linkMode:boolean;onSelect:(i:number)=>void;onToggle:(path:string)=>void;onOpen:(n:KnowledgeNote)=>void;onHeading:(n:KnowledgeNote,heading:string)=>void;onApply:(changes:NoteChange[])=>Promise<void>}){
  const shown=p.notes.slice(0,p.limit),groups=new Map<string,KnowledgeNote[]>();for(const note of shown){const key=p.groupBy==="none"?"":note.properties[p.groupBy]||"未设置";groups.set(key,[...(groups.get(key)||[]),note]);}
  return <>{p.view==="table"&&<div className="collection-table-head"><span>选择</span><span>笔记</span><span>类型</span><span>状态</span><span>标签</span></div>}
    {[...groups].map(([group,notes])=><section className="collection-group" key={group}>{group&&<h3>{group} <small>{p.notes.filter(n=>(n.properties[p.groupBy as "type"|"status"]||"未设置")===group).length} 篇</small></h3>}
      {notes.map(note=>{const i=p.notes.indexOf(note);return <div key={note.path} role="listitem" className={"knowledge-entry "+p.view+(i===p.selected?" selected":"")+(p.view==="table"&&!p.linkMode?" editable-table":"")}>
        {!p.linkMode&&<input type="checkbox" aria-label={"选择笔记："+note.title} checked={p.paths.has(note.path)} disabled={p.busy} onChange={()=>p.onToggle(note.path)}/>}
        <button className="knowledge-row" disabled={p.busy} onMouseEnter={()=>p.onSelect(i)} onClick={()=>p.onOpen(note)} title={note.source.slice(0,450)}><strong>{note.title}</strong><small>{note.path}</small>{p.view==="list"&&p.query&&<small>{note.source.split(/\r?\n/).find(s=>s.toLowerCase().includes(p.query.toLowerCase()))?.slice(0,180)}</small>}</button>
        {p.view==="table"&&!p.linkMode?<><PropertyCell field="type" note={note} onApply={p.onApply} disabled={p.busy}/><PropertyCell field="status" note={note} onApply={p.onApply} disabled={p.busy}/><PropertyCell field="tags" note={note} onApply={p.onApply} disabled={p.busy}/></>:<><span>{note.properties.type}{note.properties.status&&" · "+note.properties.status}</span><span>{note.properties.tags.map(t=>"#"+t).join(" ")}</span><small>{new Date(note.modified_ms).toLocaleDateString()}</small></>}
        {p.linkMode&&note.headings.length>0&&<select aria-label={note.title+"的标题引用"} value="" disabled={p.busy} onChange={e=>{if(e.target.value)p.onHeading(note,e.target.value);}}><option value="">引用具体标题…</option>{note.headings.map((h,j)=><option key={j} value={h.text}>{h.text}</option>)}</select>}
      </div>;})}
    </section>)}
  </>;
}
