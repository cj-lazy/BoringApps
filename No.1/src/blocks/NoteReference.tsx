import {useEffect,useRef,useState} from "react";
import {createReactBlockSpec} from "@blocknote/react";
import {previewKnowledge,refreshKnowledge} from "../services/knowledgeService";
import {resolveNoteLink} from "../utils/knowledge";
import ReferencePreview from "../components/ReferencePreview";
import {referenceExcerpt} from "../utils/noteReferences";
export const NoteAnchor=createReactBlockSpec({type:"noteAnchor",propSchema:{identifier:{default:""}},content:"none"},{
  render:({block})=><span className="note-anchor muted" contentEditable={false} title="删除此标记会使指向它的引用失效">段落定位 · {block.props.identifier}</span>,
  toExternalHTML:({block})=><span data-note-anchor={block.props.identifier}/>,
});
export const NoteReference=createReactBlockSpec({type:"noteReference",propSchema:{target:{default:""},label:{default:""}},content:"none"},{
  render:({block})=>{
    const host=useRef<HTMLDivElement>(null),[excerpt,setExcerpt]=useState("正在读取引用…"),[error,setError]=useState("");
    useEffect(()=>{let active=true;let generation=0;const load=async(force=false)=>{const request=++generation;try{const notes=await (force?refreshKnowledge():previewKnowledge()),from=host.current?.closest<HTMLElement>("[data-editor-pane]")?.dataset.notePath||"";const to=resolveNoteLink(block.props.target,from,notes,true),note=notes.find(n=>n.path===to?.path);if(!note||!to)throw new Error("来源笔记不存在或名称不唯一。");const part=await referenceExcerpt(note.source,to.heading);if(!part)throw new Error("来源定位标记已删除，请重新插入引用。");if(active&&request===generation){setExcerpt(part.source);setError("");}}catch(e){if(active&&request===generation)setError(String(e));}};void load();const changed=()=>{void load(true);};window.addEventListener("no1:knowledge-changed",changed);window.addEventListener("focus",changed);return()=>{active=false;window.removeEventListener("no1:knowledge-changed",changed);window.removeEventListener("focus",changed);};},[block.props.target]);
    return <div ref={host} className="note-reference" contentEditable={false}><button className="note-link" onClick={()=>window.dispatchEvent(new CustomEvent("no1:open-link",{detail:{target:block.props.target,pane:host.current?.closest<HTMLElement>("[data-editor-pane]")?.dataset.editorPane}}))}>{block.props.label||block.props.target} ↗</button>{error?<p role="alert">{error}</p>:<ReferencePreview source={excerpt}/>}<small className="muted no-print">实时引用 · 保存来源后更新</small></div>;
  },
  toExternalHTML:({block})=><p>{"![["+block.props.target+(block.props.label?"|"+block.props.label:"")+"]]"}</p>,
});
