import { useMemo } from "react";
import { lineDiff } from "../utils/textDiff";
export default function DiffPreview({before,after}:{before:string;after:string}) {
  const diff=useMemo(()=>lineDiff(before,after),[before,after]);
  const shown=diff.length>1200?diff.filter((line,index)=>line.kind!=="same"||diff.slice(Math.max(0,index-2),index+3).some(item=>item.kind!=="same")).slice(0,1200):diff;
  return <pre className="diff-preview" aria-label="内容差异">{shown.map((line,index)=><span key={index} className={"diff-"+line.kind}>{line.kind==="add"?"+ ":line.kind==="remove"?"− ":"  "}{line.text+"\n"}</span>)}
    {shown.length<diff.length&&<span>…较长的相同内容已折叠；最多预览 1200 行。</span>}</pre>;
}
