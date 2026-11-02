import {createReactBlockSpec,createReactInlineContentSpec} from "@blocknote/react";
const clean=(s:string)=>s.replace(/[^\p{L}\p{N}_-]/gu,"");
export const FootnoteRef=createReactInlineContentSpec({type:"footnoteRef",propSchema:{identifier:{default:"1"}},content:"none"},{
  render:({inlineContent})=><sup contentEditable={false} title={"脚注 "+inlineContent.props.identifier}>[{inlineContent.props.identifier}]</sup>,
  toExternalHTML:({inlineContent})=><sup>{"[^"+inlineContent.props.identifier+"]"}</sup>,
});
export const FootnoteBlock=createReactBlockSpec({type:"footnote",propSchema:{identifier:{default:"1"}},content:"inline"},{
  render:({block,editor,contentRef})=><div className="footnote-block"><label contentEditable={false}>脚注 <input aria-label="脚注标识" value={block.props.identifier} readOnly={!editor.isEditable} onChange={e=>{const id=clean(e.target.value);if(!id)return;const old=block.props.identifier;editor.updateBlock(block,{props:{identifier:id}});const walk=(blocks:any[])=>{for(const b of blocks){if(Array.isArray(b.content)&&b.content.some((c:any)=>c.type==="footnoteRef"&&c.props.identifier===old))editor.updateBlock(b,{content:b.content.map((c:any)=>c.type==="footnoteRef"&&c.props.identifier===old?{...c,props:{...c.props,identifier:id}}:c)});walk(b.children||[]);}};walk(editor.document);}}/></label><div ref={contentRef}/></div>,
  toExternalHTML:({block,contentRef})=><aside data-footnote={block.props.identifier}><span>{block.props.identifier}</span><div ref={contentRef}/></aside>,
});
