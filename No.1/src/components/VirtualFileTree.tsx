import {memo,useEffect,useMemo,useRef,useState,type MouseEvent} from "react";
import type {FileNode} from "./CustomDialog";
import Icon from "./Icon";
import {flattenTree,visibleRange} from "../utils/virtualTree";
interface Props{
  nodes:FileNode[];currentFile:string|null;selectedFolder:string|null;expandedFolders:Set<string>;favPaths:Set<string>;searchTerm:string;
  onSelect:(node:FileNode,event?:{ctrlKey:boolean})=>void;onToggle:(path:string)=>void;onContext:(event:MouseEvent,node:FileNode)=>void;
}
export default memo(function VirtualFileTree(p:Props){
  const host=useRef<HTMLDivElement>(null),[scroll,setScroll]=useState(0),[height,setHeight]=useState(400),[focus,setFocus]=useState(0);
  const rows=useMemo(()=>flattenTree(p.nodes,p.expandedFolders,!!p.searchTerm),[p.nodes,p.expandedFolders,p.searchTerm]);
  const range=visibleRange(rows.length,scroll,height);
  useEffect(()=>{const el=host.current;if(!el)return;const observer=new ResizeObserver(()=>setHeight(el.clientHeight||400));observer.observe(el);return()=>observer.disconnect();},[]);
  useEffect(()=>{const el=host.current;if(!el)return;const max=Math.max(0,rows.length*32-el.clientHeight);if(el.scrollTop>max){el.scrollTop=max;setScroll(max);}setFocus(v=>Math.min(v,Math.max(0,rows.length-1)));},[rows]);
  const move=(index:number)=>{const el=host.current;if(!el||!rows.length)return;index=Math.max(0,Math.min(rows.length-1,index));setFocus(index);if(index*32<el.scrollTop)el.scrollTop=index*32;else if((index+1)*32>el.scrollTop+el.clientHeight)el.scrollTop=(index+1)*32-el.clientHeight;setScroll(el.scrollTop);requestAnimationFrame(()=>el.querySelector<HTMLElement>(`[data-tree-index="${index}"]`)?.focus());};
  return <div ref={host} role="tree" aria-label="笔记文件树" className="virtual-file-tree" tabIndex={rows.length?-1:0} onScroll={e=>setScroll(e.currentTarget.scrollTop)}>
    <div style={{height:rows.length*32,position:"relative"}}>{rows.slice(range.start,range.end).map(({node,depth},offset)=>{const index=range.start+offset,expanded=p.expandedFolders.has(node.path)||!!p.searchTerm,selected=p.currentFile===node.path||p.selectedFolder===node.path;
      return <div key={node.path} role="treeitem" tabIndex={index===focus?0:-1} aria-level={depth+1} aria-selected={selected} aria-expanded={node.is_dir?expanded:undefined} data-tree-path={node.path} data-tree-index={index}
        className={"file-tree-row"+(selected?" selected":"")} style={{position:"absolute",top:index*32,left:0,right:0,height:32,paddingLeft:depth*14+8,margin:0}}
        onFocus={()=>setFocus(index)} onClick={event=>p.onSelect(node,event)} onContextMenu={event=>p.onContext(event,node)} onKeyDown={e=>{
          if(e.target!==e.currentTarget)return;
          if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();move(index+(e.key==="ArrowDown"?1:-1));}
          else if(e.key==="Home"||e.key==="End"){e.preventDefault();move(e.key==="Home"?0:rows.length-1);}
          else if(e.key==="PageDown"||e.key==="PageUp"){e.preventDefault();move(index+(e.key==="PageDown"?1:-1)*Math.floor(height/32));}
          else if(["Enter"," "].includes(e.key)){e.preventDefault();p.onSelect(node,e);}
          else if(e.key==="ArrowRight"&&node.is_dir&&!expanded){e.preventDefault();p.onToggle(node.path);}
          else if(e.key==="ArrowLeft"){e.preventDefault();if(node.is_dir&&expanded)p.onToggle(node.path);else{const parent=rows.slice(0,index).reverse().find(r=>r.depth===depth-1);if(parent)move(rows.indexOf(parent));}}
        }}>
        <span style={{width:12,visibility:node.is_dir?"visible":"hidden",transform:expanded?"rotate(90deg)":undefined}} onClick={e=>{e.stopPropagation();if(node.is_dir)p.onToggle(node.path);}}><Icon name="right" size={11}/></span>
        <Icon name={node.is_dir?(expanded?"folderOpen":"folder"):"file"}/><span className="file-tree-name">{node.name}</span>{p.favPaths.has(node.path)&&<Icon name="star" size={12}/>}
        <button aria-label={node.name+"的更多操作"} title="更多操作" onClick={e=>{e.stopPropagation();p.onContext(e,node);}}><Icon name="more"/></button>
      </div>;
    })}</div>
  </div>;
});
