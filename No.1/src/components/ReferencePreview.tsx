import {useEffect,useState,type ReactNode} from "react";
import {getMarkdownParser} from "../utils/markdownNote";
import MathPreview from "./MathPreview";
export default function ReferencePreview({source}:{source:string}){
  const [tree,setTree]=useState<any>(null);
  useEffect(()=>{let active=true;void getMarkdownParser().then(p=>{if(active)setTree(p.parse(source));});return()=>{active=false;};},[source]);
  const render=(n:any,i:number):ReactNode=>{const children=n.children?.map(render);switch(n.type){
    case "root":return children;case "text":return n.value;case "paragraph":return <p key={i}>{children}</p>;
    case "heading":return <strong key={i} className="reference-heading">{children}</strong>;
    case "strong":return <strong key={i}>{children}</strong>;case "emphasis":return <em key={i}>{children}</em>;case "delete":return <del key={i}>{children}</del>;
    case "inlineCode":return <code key={i}>{n.value}</code>;case "code":return <pre key={i}><code>{n.value}</code></pre>;
    case "math":return <MathPreview key={i} text={n.value} display/>;case "inlineMath":return <MathPreview key={i} text={n.value} display={false}/>;
    case "list":return n.ordered?<ol key={i} start={n.start}>{children}</ol>:<ul key={i}>{children}</ul>;
    case "listItem":return <li key={i}>{typeof n.checked==="boolean"?(n.checked?"☑ ":"☐ "):""}{children}</li>;
    case "blockquote":return <blockquote key={i}>{children}</blockquote>;case "break":return <br key={i}/>;
    case "table":return <table key={i}><tbody>{children}</tbody></table>;case "tableRow":return <tr key={i}>{children}</tr>;case "tableCell":return <td key={i}>{children}</td>;
    case "footnoteReference":return <sup key={i}>[{n.identifier}]</sup>;case "footnoteDefinition":return <aside key={i}>[{n.identifier}] {children}</aside>;
    case "image":return <span key={i}>[图片：{n.alt||n.url}]</span>;case "thematicBreak":return <hr key={i}/>;
    case "yaml":case "toml":case "definition":return null;case "html":return <code key={i}>{n.value}</code>;
    default:return children||n.value||null;
  }};
  return <div className="reference-preview">{tree?render(tree,0):source}</div>;
}
