import { createReactInlineContentSpec } from "@blocknote/react";
import { useRef, useState } from "react";
import { previewKnowledge } from "../services/knowledgeService";
import { resolveNoteLink } from "../utils/knowledge";
export const NoteLink = createReactInlineContentSpec({ type: "noteLink", propSchema: { target: {default: ""}, label: {default: ""} }, content: "none" }, {
  render: ({inlineContent}) => {
    const [preview,setPreview]=useState<string|null>(null);const hover=useRef(0);
    return <span className="note-link-container" contentEditable={false} onMouseLeave={()=>{hover.current++;setPreview(null);}}><a className="note-link" href="#" title={inlineContent.props.target}
      onMouseEnter={event=>{const from=event.currentTarget.closest<HTMLElement>("[data-editor-pane]")?.dataset.notePath;if(!from)return;const id=++hover.current;
        void previewKnowledge().then(notes=>{if(id!==hover.current)return;const to=resolveNoteLink(inlineContent.props.target,from,notes,true),note=notes.find(n=>n.path===to?.path);setPreview(note?note.title+"\n"+note.source.split(/\r?\n/).slice(Math.max(0,(note.headings.find(h=>h.text===to?.heading)?.line||1)-1)).join("\n").slice(0,350):"目标不存在或存在同名笔记。");}).catch(()=>{if(id===hover.current)setPreview("暂时无法读取预览。");});}}
      onClick={event => { event.preventDefault(); const pane = event.currentTarget.closest<HTMLElement>("[data-editor-pane]")?.dataset.editorPane; window.dispatchEvent(new CustomEvent("no1:open-link", {detail: {target: inlineContent.props.target, pane}})); }}>{inlineContent.props.label || inlineContent.props.target}</a>
      {preview&&<span role="tooltip" className="note-link-preview">{preview}</span>}</span>;
  },
  toExternalHTML: ({inlineContent}) => <span>{"[[" + inlineContent.props.target + (inlineContent.props.label !== inlineContent.props.target ? "|" + inlineContent.props.label : "") + "]]"}</span>,
});
