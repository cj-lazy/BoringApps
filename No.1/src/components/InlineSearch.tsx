import { useEffect, useState } from "react";
import type { DocumentIndex } from "../utils/documentIndex";
export default function InlineSearch({index,revision,source,onJump,onClose}:{index:DocumentIndex;revision:number;source:string|null;onJump:(id:string,query:string)=>void;onClose:()=>void}) {
  const [query,setQuery]=useState("");const [results,setResults]=useState<{blockId:string;text:string}[]>([]);const [selected,setSelected]=useState(0);
  useEffect(()=>{const timer=setTimeout(()=>{
    let found:{blockId:string;text:string}[]=[];
    if(source!==null&&query){const lower=source.toLowerCase(),needle=query.toLowerCase();let at=0;while(found.length<200&&(at=lower.indexOf(needle,at))>=0){found.push({blockId:"source:"+at,text:query});at+=needle.length;}}
    else found=index.search(query);
    setResults(found);setSelected(0);if(found[0])onJump(found[0].blockId,query);
  },120);return()=>clearTimeout(timer);},[query,index,revision,source]);
  const jump=(step:number)=>{if(!results.length)return;const next=(selected+step+results.length)%results.length;setSelected(next);onJump(results[next].blockId,query);};
  return <div className="inline-search no-print" onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();onClose();}if(e.key==="Enter"){e.preventDefault();jump(e.shiftKey?-1:1);}}}>
    <input id="inline-search-input" autoFocus placeholder="笔记内搜索…" value={query} onChange={e=>setQuery(e.target.value)}/>
    <small>{query?(results.length?`${selected+1}/${results.length}${results.length===200?"+":""}`:"无匹配"):"输入关键词"}</small>
    <button aria-label="上一个匹配" onClick={()=>jump(-1)}>↑</button><button aria-label="下一个匹配" onClick={()=>jump(1)}>↓</button><button aria-label="关闭笔记内搜索" onClick={onClose}>×</button>
  </div>;
}
