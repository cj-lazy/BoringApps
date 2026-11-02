import {useEffect,useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {getCurrentWindow} from "@tauri-apps/api/window";
import {useTheme,type ThemeChoice} from "../hooks/useTheme";
import "../App.css";
export default function QuickCapture(){
  const [root,setRoot]=useState(""),[mode,setMode]=useState("inbox"),[title,setTitle]=useState(""),[content,setContent]=useState(""),[source,setSource]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[saved,setSaved]=useState<string|null>(null),[ready,setReady]=useState(false);
  const choice=localStorage.getItem("app_theme") as ThemeChoice;useTheme(["dark","light"].includes(choice)?choice:"system");
  useEffect(()=>{void invoke<string>("get_library_root").then(path=>{setRoot(path);try{const draft=JSON.parse(localStorage.getItem("capture:"+path)||"{}");setContent(typeof draft.content==="string"?draft.content:"");setTitle(typeof draft.title==="string"?draft.title:"");setSource(typeof draft.source==="string"?draft.source:"");setMode(draft.mode==="daily"?"daily":"inbox");}catch{/* keep an empty capture */}setReady(true);}).catch(e=>setError(String(e)));},[]);
  useEffect(()=>{if(root&&ready&&!saved)localStorage.setItem("capture:"+root,JSON.stringify({title,content,source,mode}));},[root,ready,title,content,source,mode,saved]);
  const save=async()=>{setBusy(true);setError("");try{const now=new Date(),day=[now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-"),time=now.toLocaleTimeString("zh-CN",{hour12:false});
    const result=await invoke<{path:string}>("save_capture",{expectedRoot:root,value:{mode,title,content,source,day,time}});localStorage.removeItem("capture:"+root);setSaved(result.path);
  }catch(e){setError(String(e));}finally{setBusy(false);}};
  return <main className="capture-window" onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==="Enter"&&!busy&&content.trim()){e.preventDefault();void save();}}}>
    <header><h2>快速记录</h2><small>Ctrl+Enter 保存</small></header>
    <div className="library-location" title={root}>{root||"正在打开笔记库…"}</div>
    {error&&<p role="alert" className="error-text">{error}<button onClick={()=>void invoke<string>("get_library_root").then(setRoot)}>刷新笔记库</button></p>}
    {saved?<><p role="status">已保存到 {saved}</p><button className="primary" onClick={async()=>{await invoke("open_captured_note",{path:saved});await getCurrentWindow().close();}}>在笔记中查看</button><button onClick={()=>{setContent("");setTitle("");setSource("");setSaved(null);}}>继续记录</button></>:<>
      <div className="option-row"><label>保存到 <select aria-label="快速记录保存位置" value={mode} onChange={e=>setMode(e.target.value)}><option value="inbox">收件箱 · 新建记录</option><option value="daily">今日笔记 · 追加内容</option></select></label><button disabled={busy} onClick={async()=>{try{const text=await navigator.clipboard.readText();setContent(old=>old?old+"\n"+text:text);if(/^https?:\/\/\S+$/.test(text.trim())&&!source)setSource(text.trim());}catch{setError("请在正文中使用 Ctrl+V 粘贴。");}}}>粘贴剪贴板</button></div>
      <input aria-label="快速记录标题" placeholder="标题（可选）" value={title} onChange={e=>setTitle(e.target.value)} maxLength={120}/>
      <textarea autoFocus aria-label="快速记录正文" placeholder="先记下来，稍后整理…" value={content} onChange={e=>setContent(e.target.value)} maxLength={100000}/>
      <input aria-label="资料来源链接" placeholder="来源链接（可选）" value={source} onChange={e=>setSource(e.target.value)}/>
      <footer><small>未保存的输入会保留在本机。</small><button className="primary" disabled={busy||!ready||!content.trim()} onClick={()=>void save()}>{busy?"正在保存…":"保存记录"}</button></footer>
    </>}
  </main>;
}
