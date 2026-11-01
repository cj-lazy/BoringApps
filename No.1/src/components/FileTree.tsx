import { memo, type MouseEvent } from "react";
import type { FileNode } from "./CustomDialog";
import Icon from "./Icon";
interface Props {
  nodes:FileNode[];currentFile:string|null;selectedFolder:string|null;expandedFolders:Set<string>;favPaths:Set<string>;searchTerm:string;
  onSelect:(node:FileNode,event?:{ctrlKey:boolean})=>void;onToggle:(path:string)=>void;onContext:(event:MouseEvent,node:FileNode)=>void;
}
export default memo(function FileTree(props:Props) {
  const render=(nodes:FileNode[],depth=0)=>nodes.map(node=>{
    const expanded=props.expandedFolders.has(node.path)||!!props.searchTerm;
    const selected=props.currentFile===node.path||props.selectedFolder===node.path;
    return <div key={node.path} role="none">
      <div role="treeitem" tabIndex={0} aria-selected={selected} aria-expanded={node.is_dir?expanded:undefined} data-tree-path={node.path}
        className={"file-tree-row"+(selected?" selected":"")} style={{paddingLeft:depth*14+8}}
        onClick={event=>props.onSelect(node,event)} onContextMenu={event=>props.onContext(event,node)}
        onKeyDown={event=>{
          if(event.target!==event.currentTarget)return;
          if(["Enter"," "].includes(event.key)){event.preventDefault();props.onSelect(node,event);}
          else if(event.key==="ArrowRight"&&node.is_dir&&!expanded){event.preventDefault();props.onToggle(node.path);}
          else if(event.key==="ArrowLeft"&&node.is_dir&&expanded){event.preventDefault();props.onToggle(node.path);}
          else if(event.key==="ArrowDown"||event.key==="ArrowUp"){
            event.preventDefault();const rows=[...event.currentTarget.closest('[role="tree"]')!.querySelectorAll<HTMLElement>('[role="treeitem"]')];
            rows[rows.indexOf(event.currentTarget)+(event.key==="ArrowDown"?1:-1)]?.focus();
          }
        }}>
        <span style={{width:12,visibility:node.is_dir?"visible":"hidden",transform:expanded?"rotate(90deg)":undefined}} onClick={event=>{event.stopPropagation();if(node.is_dir)props.onToggle(node.path);}}><Icon name="right" size={11}/></span>
        <Icon name={node.is_dir?(expanded?"folderOpen":"folder"):"file"}/>
        <span className="file-tree-name">{node.name}</span>{props.favPaths.has(node.path)&&<Icon name="star" size={12}/>}
        <button aria-label={node.name+"的更多操作"} title="更多操作" onClick={event=>{event.stopPropagation();props.onContext(event,node);}}><Icon name="more"/></button>
      </div>
      {node.is_dir&&expanded&&<div role="group">{node.children?.length?render(node.children,depth+1):<div className="empty-folder" style={{paddingLeft:(depth+1)*14+28}}>(空)</div>}</div>}
    </div>;
  });
  return <div role="tree" aria-label="笔记文件树">{render(props.nodes)}</div>;
});
