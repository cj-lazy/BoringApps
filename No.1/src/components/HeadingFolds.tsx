import {useEffect,useState} from "react";
import {createPortal} from "react-dom";
import {foldedBlockIds} from "../utils/editorComfort";
export default function HeadingFolds({editor,pane,revision}:{editor:any;pane:"left"|"right";revision:number}){
  const [collapsed,setCollapsed]=useState(new Set<string>()),[positions,setPositions]=useState<{id:string;label:string;left:number;top:number}[]>([]);
  const hidden=foldedBlockIds(editor.document,collapsed);
  useEffect(()=>{
    let frame=0;const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
      const host=document.querySelector<HTMLElement>(`[data-editor-pane="${pane}"]`);if(!host)return;const box=host.getBoundingClientRect();
      const headingIds=new Map<string,string>(editor.document.filter((b:any)=>b.type==="heading").map((b:any)=>[b.id,(b.content||[]).map((i:any)=>i.text||i.props?.label||"").join("")]));
      const found:{id:string;label:string;left:number;top:number}[]=[];
      host.querySelectorAll<HTMLElement>('[data-content-type="heading"]').forEach(el=>{const id=el.closest<HTMLElement>('[data-id]')?.dataset.id;if(!id||!headingIds.has(id)||!el.getClientRects().length)return;const r=el.getBoundingClientRect();if(r.bottom>=box.top&&r.top<box.bottom)found.push({id,label:headingIds.get(id)||"章节",left:Math.max(box.left+1,r.left-24),top:r.top+2});});setPositions(found);
    });};
    const reveal=(event:Event)=>{const d=(event as CustomEvent).detail;if(d?.pane===pane)setCollapsed(new Set());};
    update();window.addEventListener("scroll",update,true);window.addEventListener("resize",update);window.addEventListener("no1:reveal-block",reveal);
    return()=>{cancelAnimationFrame(frame);window.removeEventListener("scroll",update,true);window.removeEventListener("resize",update);window.removeEventListener("no1:reveal-block",reveal);};
  },[editor,pane,revision,collapsed]);
  return <><style>{"@media screen {"+hidden.map(id=>`[data-editor-pane="${pane}"] [data-id="${CSS.escape(id)}"]{display:none!important;}`).join("")+"}"}</style>
    {createPortal(<div className="heading-folds no-print">{positions.map(p=><button key={p.id} style={{left:p.left,top:p.top}} aria-expanded={!collapsed.has(p.id)} aria-label={(collapsed.has(p.id)?"展开章节：":"折叠章节：")+p.label} title={collapsed.has(p.id)?"展开章节":"折叠章节"} onMouseDown={e=>e.preventDefault()} onClick={()=>setCollapsed(old=>{const next=new Set(old);if(next.has(p.id))next.delete(p.id);else next.add(p.id);return next;})}>{collapsed.has(p.id)?"▸":"▾"}</button>)}</div>,document.body)}</>;
}
