import { invoke } from "@tauri-apps/api/core";
import { indexNote, type KnowledgeNote } from "../utils/knowledge";
let root = "", cache = new Map<string, KnowledgeNote>(), pending: Promise<KnowledgeNote[]> | null = null;
let lastLinkRefresh = 0;
let refreshedAt=0;
export function cachedKnowledge(){return [...cache.values()];}
export async function previewKnowledge(){return cache.size&&Date.now()-refreshedAt<15000?[...cache.values()]:refreshKnowledge();}
export function invalidateKnowledge(){refreshedAt=0;lastLinkRefresh=0;if(typeof window!=="undefined")window.dispatchEvent(new Event("no1:knowledge-changed"));}
export async function linkSuggestions(query: string) {
  if (Date.now() - lastLinkRefresh > 2000 || !cache.size) { await refreshKnowledge(); lastLinkRefresh = Date.now(); }
  const [name, heading] = query.split("#");
  const notes = [...cache.values()].filter(n => (n.title + " " + n.path).toLowerCase().includes(name.toLowerCase()));
  return notes.flatMap(note => heading === undefined ? [{path:note.path,heading:"",title:note.title}] : note.headings.filter(h => h.text.toLowerCase().includes(heading.toLowerCase())).map(h => ({path:note.path,heading:h.text,title:note.title + " → " + h.text}))).slice(0,30);
}
export async function refreshKnowledge(force = false): Promise<KnowledgeNote[]> {
  if (pending && !force) return pending;
  const task = async () => {
    const currentRoot = await invoke<string>("get_library_root");
    if (root !== currentRoot) { root = currentRoot; cache = new Map(); }
    const delta = await invoke<{root: string; notes: {path: string; source: string; stamp: string; modified_ms: number}[]; removed: string[]; warnings: string[]}>("catalog_delta", { known: Object.fromEntries([...cache].map(([p, n]) => [p, n.stamp])), force });
    if (delta.root !== root) throw new Error("笔记库已切换，请重新打开。");
    for (const path of delta.removed) cache.delete(path);
    // Parse only changed notes. Yield between batches so large libraries remain responsive.
    for (let i = 0; i < delta.notes.length; i += 40) {
      const batch = await Promise.all(delta.notes.slice(i, i + 40).map(indexNote));
      for (const note of batch) cache.set(note.path, note);
      if (i + 40 < delta.notes.length) await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (delta.warnings.length) throw new Error("部分笔记无法读取：" + delta.warnings.join("；"));
    refreshedAt=Date.now();return [...cache.values()];
  };
  if (pending) await pending.catch(() => undefined);
  const promise = task(); pending = promise;
  try { return await promise; } finally { if (pending === promise) pending = null; }
}
