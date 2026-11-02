import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import { refreshKnowledge } from "../services/knowledgeService";
import { emptyFilter, filteredNotes, resolveNoteLink, type Collection, type KnowledgeNote, type NoteFilter } from "../utils/knowledge";
import {sortNotes,propertyChanges,mergeTagChanges,type SortField,type NoteChange} from "../utils/organizeNotes";
import CollectionRows from "./CollectionRows";

export type KnowledgeMode = "search" | "collections" | "relations" | "link";
interface Props {
  mode: KnowledgeMode; current: string | null; recent: string[]; collections: Collection[];
  onCollections: (value: Collection[]) => void; beforeLoad: () => Promise<void>; onClose: () => void;
  onOpen: (path: string, line: number, query: string) => Promise<void>; onInsert: (path: string, heading: string) => Promise<void>;
  onChanges:(changes:NoteChange[])=>Promise<void>;initialId?:string|null;
}
export default function KnowledgeHub(p: Props) {
  const [notes, setNotes] = useState<KnowledgeNote[]>([]), [filter, setFilter] = useState<NoteFilter>(emptyFilter);
  const [busy, setBusy] = useState(true), [error, setError] = useState(""), [view, setView] = useState<"list" | "table">("list");
  const [limit, setLimit] = useState(50), [selected, setSelected] = useState(0), [collectionName, setCollectionName] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [paths,setPaths]=useState(new Set<string>()),[sort,setSort]=useState<SortField>("relevance"),[descending,setDescending]=useState(false),[groupBy,setGroupBy]=useState<"none"|"type"|"status">("none");
  const [bulkType,setBulkType]=useState(""),[bulkStatus,setBulkStatus]=useState(""),[addTags,setAddTags]=useState(""),[removeTags,setRemoveTags]=useState("");
  const [oldTag,setOldTag]=useState(""),[newTag,setNewTag]=useState(""),[message,setMessage]=useState("");
  const pickCollection=(id:string)=>{const c=p.collections.find(c=>c.id===id);setCollectionId(id);setFilter(c?{...c.filter}:emptyFilter());setView(c?.view||"list");setSort(c?.sort||"relevance");setDescending(c?.descending||false);setGroupBy(c?.groupBy||"none");setLimit(50);setSelected(0);setPaths(new Set());};
  useEffect(()=>{if(p.initialId)pickCollection(p.initialId);},[]);
  useEffect(() => { let stopped = false; void (async () => { try { await p.beforeLoad(); const result = await refreshKnowledge(); if (!stopped) setNotes(result); } catch (e) { if (!stopped) setError(String(e)); } finally { if (!stopped) setBusy(false); } })(); return () => { stopped = true; }; }, []);
  const results = useMemo(() => sortNotes(filteredNotes(notes, filter, p.recent),sort,descending), [notes, filter, p.recent,sort,descending]);
  const change = (key: keyof NoteFilter, value: string) => { setFilter(old => ({...old, [key]: value})); setSelected(0); setLimit(50); setCollectionId(""); setPaths(new Set()); };
  const run = async (operation: () => Promise<void>) => { setBusy(true); setError(""); try { await operation(); } catch (e) { setError(String(e)); } finally { setBusy(false); } };
  const apply=async(changes:NoteChange[])=>{setBusy(true);setError("");try{await p.onChanges(changes);setNotes(await refreshKnowledge());setMessage(`已整理 ${changes.length} 篇笔记，原文已保留在历史版本中。`);}catch(e){setError(String(e));throw e;}finally{setBusy(false);}};
  const tags=(text:string)=>text.split(/[,，]/).map(t=>t.trim().replace(/^#/,"")).filter(Boolean);
  const open = (note: KnowledgeNote) => run(async () => {
    const lines = note.source.split(/\r?\n/); const at = filter.query ? lines.findIndex(line => line.toLowerCase().includes(filter.query.toLowerCase())) : -1;
    await p.onOpen(note.path, Math.max(1, at + 1), filter.query); p.onClose();
  });
  const choose = (note: KnowledgeNote, heading = "") => run(async () => { await p.onInsert(note.path, heading); p.onClose(); });
  const title = p.mode === "relations" ? "笔记关联" : p.mode === "link" ? "插入笔记链接" : p.mode === "collections" ? "智能集合" : "快速打开与搜索";
  const current = notes.find(n => n.path === p.current);
  const backlinks = notes.flatMap(n => n.links.flatMap(link => resolveNoteLink(link.target, n.path, notes, link.wiki)?.path === p.current ? [{note: n, link}] : []));
  return <Modal title={title} wide busy={busy} onClose={p.onClose}>
    {error && <p role="alert" className="error-text">{error}</p>}{message&&<p role="status" className="muted">{message}</p>}
    {busy && <p role="status">正在处理…</p>}
    {p.mode === "relations" ? <>
      <p className="muted">{current?.title || "请先打开笔记"} · 引用关系自动从 Markdown 和双方括号链接更新。</p>
      <h3>引用了当前笔记（{backlinks.length}）</h3>
      {!backlinks.length && <p className="muted">还没有其他笔记链接到这里。</p>}
      {backlinks.map(({note, link}, i) => <button className="knowledge-row" key={note.path + ":" + i} disabled={busy} onClick={() => void run(async () => { await p.onOpen(note.path, link.line, link.label); p.onClose(); })}><strong>{note.title}</strong><small>{note.path} · 第 {link.line} 行</small></button>)}
      <h3>当前笔记的链接</h3>
      {current?.links.map((link, i) => { const to = resolveNoteLink(link.target, current.path, notes, link.wiki); if (!to && !link.wiki && !/\.md(?:#|$)/i.test(link.target)) return null;
        return <button key={i} className="knowledge-row" disabled={busy || !to} onClick={() => to && void run(async () => { const n = notes.find(n => n.path === to.path)!; await p.onOpen(to.path, n.headings.find(h => h.text === to.heading)?.line || 1, to.heading); p.onClose(); })}><strong>{link.label || link.target}</strong><small>{to ? to.path + (to.heading ? " → " + to.heading : "") : "链接目标不存在或同名笔记有歧义：" + link.target}</small></button>; })}
    </> : <>
      <div className="search-form"><input aria-label="快速搜索关键词" placeholder={p.mode === "link" ? "搜索要链接的笔记…" : "搜索标题、正文或标签…"} value={filter.query}
        onChange={e => change("query", e.target.value)} onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (["ArrowDown", "ArrowUp"].includes(e.key)) { e.preventDefault(); setSelected(v => Math.max(0, Math.min(Math.min(limit, results.length) - 1, v + (e.key === "ArrowDown" ? 1 : -1)))); } if (e.key === "Enter" && results[selected] && !busy) { e.preventDefault(); void (p.mode === "link" ? choose(results[selected]) : open(results[selected])); } }}/>
        <button disabled={busy} onClick={() => void run(async () => setNotes(await refreshKnowledge(true)))}>刷新索引</button></div>
      <div className="knowledge-filters">
        <label>目录<input aria-label="筛选目录" placeholder="例如：项目" value={filter.folder} onChange={e => change("folder", e.target.value)}/></label>
        <label>标签<input aria-label="筛选标签" list="known-tags" value={filter.tag} onChange={e => change("tag", e.target.value)}/></label>
        <label>类型<input aria-label="筛选类型" list="known-types" value={filter.type} onChange={e => change("type", e.target.value)}/></label>
        <label>状态<input aria-label="筛选状态" list="known-statuses" value={filter.status} onChange={e => change("status", e.target.value)}/></label>
      </div>
      <datalist id="known-tags">{[...new Set(notes.flatMap(n => n.properties.tags))].sort().map(t => <option key={t}>{t}</option>)}</datalist>
      <datalist id="known-types">{[...new Set(notes.map(n => n.properties.type).filter(Boolean))].map(t => <option key={t}>{t}</option>)}</datalist>
      <datalist id="known-statuses">{[...new Set(notes.map(n => n.properties.status).filter(Boolean))].map(t => <option key={t}>{t}</option>)}</datalist>
      <details><summary>日期与智能集合</summary><div className="knowledge-filters">
        <label>修改时间从<input type="date" aria-label="修改时间从" value={filter.after} onChange={e => change("after", e.target.value)}/></label><label>至<input type="date" aria-label="修改时间至" value={filter.before} onChange={e => change("before", e.target.value)}/></label>
      </div><div className="option-row"><input aria-label="集合名称" placeholder="例如：待阅读论文" value={collectionName} onChange={e => setCollectionName(e.target.value)}/><button disabled={!collectionName.trim()} onClick={() => { const id = crypto.randomUUID(); p.onCollections([...p.collections, {id, name: collectionName.trim(), filter: {...filter},view,sort,descending,groupBy,pinned:false}]); setCollectionId(id); setCollectionName(""); }}>保存当前筛选</button></div></details>
      <div className="option-row"><select aria-label="选择智能集合" value={collectionId} onChange={e => pickCollection(e.target.value)}><option value="">全部笔记 / 自定义筛选</option>{p.collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        {collectionId && <button onClick={() => { p.onCollections(p.collections.filter(c => c.id !== collectionId)); setCollectionId(""); }}>移除这个集合</button>}
        {collectionId&&<button onClick={()=>p.onCollections(p.collections.map(c=>c.id===collectionId?{...c,pinned:!c.pinned}:c))}>{p.collections.find(c=>c.id===collectionId)?.pinned?"取消侧边栏固定":"固定到侧边栏"}</button>}
        <button aria-pressed={view === "list"} onClick={() => setView("list")}>列表</button><button aria-pressed={view === "table"} onClick={() => setView("table")}>表格</button><small>{results.length} 篇笔记</small></div>
      <div className="option-row"><label>排序 <select aria-label="笔记排序" value={sort} onChange={e=>setSort(e.target.value as SortField)}>{([ ["relevance","相关程度"],["title","标题"],["modified","修改时间"],["created","创建日期"],["type","类型"],["status","状态"] ] as const).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><button disabled={sort==="relevance"} onClick={()=>setDescending(v=>!v)}>{descending?"降序":"升序"}</button>
        <label>分组 <select aria-label="笔记分组" value={groupBy} onChange={e=>setGroupBy(e.target.value as typeof groupBy)}><option value="none">不分组</option><option value="type">按类型</option><option value="status">按状态</option></select></label>
        {collectionId&&<button onClick={()=>p.onCollections(p.collections.map(c=>c.id===collectionId?{...c,filter:{...filter},view,sort,descending,groupBy}:c))}>保存集合视图</button>}
      </div>
      {p.mode!=="link"&&<details className="batch-tools"><summary>批量整理与标签合并 · 已选 {paths.size} 篇</summary>
        <div className="option-row"><button disabled={busy} onClick={()=>setPaths(new Set(results.slice(0,1000).map(n=>n.path)))}>选择筛选结果（最多 1000 篇）</button><button onClick={()=>setPaths(new Set())}>清空选择</button></div>
        <div className="knowledge-filters"><label>统一类型<input aria-label="批量类型" placeholder="留空保持原值" value={bulkType} onChange={e=>setBulkType(e.target.value)}/></label><label>统一状态<input aria-label="批量状态" placeholder="留空保持原值" value={bulkStatus} onChange={e=>setBulkStatus(e.target.value)}/></label><label>添加标签<input aria-label="批量添加标签" value={addTags} onChange={e=>setAddTags(e.target.value)}/></label><label>移除标签<input aria-label="批量移除标签" value={removeTags} onChange={e=>setRemoveTags(e.target.value)}/></label></div>
        <button disabled={busy||!paths.size||!(bulkType||bulkStatus||addTags||removeTags)} onClick={()=>void run(()=>apply(propertyChanges(notes.filter(n=>paths.has(n.path)),{type:bulkType||undefined,status:bulkStatus||undefined,addTags:tags(addTags),removeTags:tags(removeTags)})))}>应用到所选 {paths.size} 篇笔记</button>
        <div className="option-row"><input aria-label="原标签" list="known-tags" placeholder="原标签" value={oldTag} onChange={e=>setOldTag(e.target.value)}/><input aria-label="合并后的标签" list="known-tags" placeholder="新标签 / 已有目标标签" value={newTag} onChange={e=>setNewTag(e.target.value)}/><button disabled={busy||!oldTag.trim()||!newTag.trim()} onClick={()=>void run(()=>apply(mergeTagChanges(notes,oldTag.trim(),newTag.trim())))}>重命名 / 合并标签</button></div>
        <small className="muted">标签合并作用于整个笔记库。表格中的类型、状态和标签也可以直接编辑，离开单元格或按 Enter 保存。</small>
      </details>}
      <div className="knowledge-results" role="list" aria-label="笔记搜索结果">
        <CollectionRows notes={results} limit={limit} view={view} selected={selected} paths={paths} groupBy={groupBy} busy={busy} query={filter.query} linkMode={p.mode==="link"}
          onSelect={setSelected} onToggle={path=>setPaths(old=>{const next=new Set(old);if(next.has(path))next.delete(path);else if(next.size<1000)next.add(path);return next;})}
          onOpen={note=>void(p.mode==="link"?choose(note):open(note))} onHeading={(note,heading)=>void choose(note,heading)} onApply={apply}/>
        {!results.length && !busy && <p className="empty-state">没有符合条件的笔记。</p>}
      </div>
      {results.length > limit && <button onClick={() => setLimit(v => v + 50)}>再显示 50 篇</button>}
      <p className="muted">方向键选择，Enter 打开。留空时优先显示最近访问的笔记。</p>
    </>}
  </Modal>;
}
