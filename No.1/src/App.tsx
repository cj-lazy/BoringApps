import "@blocknote/core/fonts/inter.css";
import { useCreateBlockNote } from "@blocknote/react";
import NoteEditor from "./components/NoteEditor";
import "@blocknote/mantine/style.css";
import { useEffect, useState, useCallback, useRef, useMemo, lazy, Suspense } from "react";
import { invoke, convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

import "katex/dist/katex.min.css";

import { sortFileTree } from "./utils/fileTree";
import { parseNote, serializeNote, blockAtSourceLine } from "./utils/markdownNote";
import { NoteOperationQueue, NoteSession } from "./utils/noteSession";
import { replaceNoteDocument } from "./utils/installNote";
import { DocumentIndex } from "./utils/documentIndex";
import CustomDialog from "./components/CustomDialog";
import type { FileNode, TrashItem } from "./components/CustomDialog";
import { schema } from "./blocks/schema";
import type { StoragePreview, StorageCandidate, CleanupResult } from "./components/StorageDialog";
import "./App.css";
import { configureAssetLinks, resolveAssetUrl, storedAssetUrl } from "./utils/assetLinks";
import { parseWorkspace, type ReadingOptions } from "./utils/workspace";
import { jumpToMatch, clearSearchHighlight } from "./utils/searchHighlight";
import { useDraftProtection } from "./hooks/useDraftProtection";
import InlineSearch from "./components/InlineSearch";
import Icon from "./components/Icon";
import FileTree from "./components/FileTree";
import Toolbar from "./components/Toolbar";
import { waitForPreviews } from "./utils/previewQueue";
import type { Draft } from "./components/RecoveryDialog";
import type { Conflict } from "./components/ConflictDialog";
const SearchPanel = lazy(() => import("./components/SearchPanel"));
const HistoryDialog = lazy(() => import("./components/HistoryDialog"));
const RecoveryDialog = lazy(() => import("./components/RecoveryDialog"));
const ConflictDialog = lazy(() => import("./components/ConflictDialog"));
const PreferencesDialog = lazy(() => import("./components/PreferencesDialog"));
const LibraryDialog = lazy(() => import("./components/LibraryDialog"));
const StorageDialog = lazy(() => import("./components/StorageDialog"));

interface TOCItem {
  id: string;
  text: string;
  level: number;
}

interface Tab { path: string; title: string; isDirty: boolean; }
function App() {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const tabsRef = useRef<Tab[]>([]);
  const leftSession = useRef(new NoteSession()).current;
  const rightSession = useRef(new NoteSession()).current;
  const noteQueue = useRef(new NoteOperationQueue()).current;
  const pendingOperationsRef = useRef(0);
  const [isNoteBusy, setIsNoteBusy] = useState(false);
  const [rightDirty, setRightDirty] = useState(false);
  const [activeTabIndex, setActiveTabIndex] = useState(-1);
  const currentFile = tabs[activeTabIndex]?.path ?? null;
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isResizing, setIsResizing] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [status, setStatus] = useState("就绪");
  const textIndex = useRef(new DocumentIndex()).current;
  const [wordCount, setWordCount] = useState(0);
  const [documentRevision, setDocumentRevision] = useState(0);
  const summaryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rightSummaryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);


  // 🔥 目录状态与开关
  const [toc, setToc] = useState<TOCItem[]>([]);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTarget,setSearchTarget] = useState<{pane:"left"|"right";id:string;query:string}|null>(null);
  const sidebarSearchRef = useRef<HTMLInputElement>(null);
  const [toasts, setToasts] = useState<{id:number; msg:string; type:'success'|'error'|'info'}[]>([]);
  const toastIdRef = useRef(0);
  const addToast = (msg: string, type: 'success'|'error'|'info' = 'info') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, {id, msg, type}]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2800);
  };
  const [inlineSearchOpen, setInlineSearchOpen] = useState(false);
  const [activePane, setActivePane] = useState<"left"|"right">("left");
  const activePaneRef = useRef(activePane); activePaneRef.current = activePane;
  const rightTextIndex = useRef(new DocumentIndex()).current;
  const [sourceViews, setSourceViews] = useState<{left:string|null;right:string|null}>({left:null,right:null});
  const sourceRef = useRef(sourceViews); sourceRef.current = sourceViews;
  const appliedSource = useRef<{left:string|null;right:string|null}>({left:null,right:null});
  const [reading, setReading] = useState<ReadingOptions>({fontSize:16,lineHeight:1.8,width:900});
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [history, setHistory] = useState<{path:string;content:string;pane:"left"|"right"}|null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [conflict, setConflict] = useState<Conflict|null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const scrollPositions = useRef<Record<string,number>>({});
  const workspaceRef = useRef(parseWorkspace({}));
  const workspaceQueue = useRef(new NoteOperationQueue()).current;
  const [scrollRevision,setScrollRevision] = useState(0);
  const scrollTimer = useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const [saveTimes,setSaveTimes] = useState({left:"",right:""});
  const [draftTimes,setDraftTimes] = useState({left:"",right:""});
  const draftIds=useRef({left:crypto.randomUUID(),right:crypto.randomUUID()});
  const failedPane = useRef<"left"|"right"|null>(null);
  const [printing,setPrinting] = useState(false);
  const lastSaveTime = saveTimes[activePane];
  const [favPaths, setFavPaths] = useState<Set<string>>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem("fav_paths") || "[]");
      return new Set(Array.isArray(stored) ? stored.filter((path): path is string => typeof path === "string") : []);
    } catch {
      return new Set();
    }
  });
  const [shortcutPanel, setShortcutPanel] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{x:number;y:number;node:FileNode}|null>(null);
  const [isReadMode, setIsReadMode] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [rightFile, setRightFile] = useState<string | null>(null);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const isLoadingRef = useRef(false);
  const activeFile = activePane==="left"?currentFile:rightFile;
  useEffect(()=>{const show=()=>{const tab=[...document.querySelectorAll<HTMLElement>('.note-tab')].find(el=>el.dataset.path===currentFile);tab?.scrollIntoView({block:"nearest",inline:"nearest",behavior:"instant"});};show();window.addEventListener("resize",show);return()=>window.removeEventListener("resize",show);},[currentFile]);

  const [bgImage, setBgImage] = useState<string | null>(localStorage.getItem("app_bg_image"));
  const [bgOpacity, setBgOpacity] = useState<number>(parseFloat(localStorage.getItem("app_bg_opacity") || "0.5"));
  const [bgBlur, setBgBlur] = useState<number>(parseInt(localStorage.getItem("app_bg_blur") || "0"));

  const [dialogState, setDialogState] = useState<{ 
      isOpen: boolean; type: any; title: string; message?: string; defaultValue?: string; 
      treeData?: FileNode[]; disabledPath?: string; trashItems?: TrashItem[]; 
      resolve: (value: any) => void; 
  }>({ isOpen: false, type: 'confirm', title: '', resolve: () => {} });

  const showDialog = (type: any, title: string, options: any = {}): Promise<any> => {
    return new Promise((resolve) => {
      setDialogState({ 
          isOpen: true, type, title, resolve: (val: any) => { setDialogState(prev => ({ ...prev, isOpen: false })); resolve(val); },
          ...options 
      });
    });
  };

  const updateTabs = (next: Tab[], activePath = leftSession.path) => {
    tabsRef.current = next;
    setTabs(next);
    setActiveTabIndex(next.findIndex(tab => tab.path === activePath));
  };

  const runNoteOperation = <T,>(label: string, operation: () => Promise<T>): Promise<T | undefined> => {
    const focused = document.activeElement;
    if ((focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement)
      && focused.closest("[data-editor-pane]")) focused.blur();
    pendingOperationsRef.current++;
    setIsNoteBusy(true);
    return noteQueue.run(async () => {
      failedPane.current=null;
      try {
        return await operation();
      } catch (error) {
        console.error(error);
        setStatus(label);
        if (failedPane.current && (String(error).includes("已被其他") || String(error).includes("原文件发生变化"))) {
          const pane = failedPane.current || activePaneRef.current;
          const session = pane === "left" ? leftSession : rightSession;
          const target = pane === "left" ? editor : editor2;
          if (session.path) try {
            const disk = await invoke<string>("load_note", {path:session.path});
            const ours = sourceRef.current[pane] ?? await serializeNote(target,structuredClone(target.document));
            setConflict({pane,path:session.path,ours,disk});
          } catch { /* The original error still appears below if a file vanished. */ }
        }
        addToast(label + ": " + error, "error");
        return undefined;
      } finally {
        pendingOperationsRef.current--;
        setIsNoteBusy(pendingOperationsRef.current > 0);
      }
    });
  };

  const uploadForPane = async (file: File, pane: "left" | "right") => {
    const session = pane === "left" ? leftSession : rightSession;
    const notePath = session.path;
    if (!notePath) { addToast("请先打开一个笔记", "info"); return ""; }
    return await runNoteOperation("上传失败", async () => {
      if (session.path !== notePath) throw new Error("笔记已切换，请重新上传");
      const fileName = `${crypto.randomUUID()}_${file.name}`;
      const payload = Array.from(new Uint8Array(await file.arrayBuffer()));
      const path = await invoke<string>("save_image", { fileName, payload, notePath });
      return convertFileSrc(path);
    }) ?? "";
  };
  const uploadFile = (file: File) => uploadForPane(file, "left");
  
  const updateTOC = () => setToc((activePaneRef.current === "left" ? textIndex : rightTextIndex).headings());
  const handleEditorChange = (pane:"left"|"right", context:{getChanges:()=>any[]}) => {
    const session = pane === "left" ? leftSession : rightSession;
    const target = pane === "left" ? editor : editor2;
    const index = pane === "left" ? textIndex : rightTextIndex;
    if (isLoadingRef.current || !session.path) return;
    const path = session.path, changes = context.getChanges();
    index.apply(changes,()=>target.document); session.trackChanges(changes,()=>target.document);
    if(pane === "left") updateTabs(tabsRef.current.map(tab=>tab.path===path?{...tab,isDirty:true}:tab));
    else setRightDirty(true);
    setStatus("● 未保存"); draftProtection.schedule(pane,path);
    const timer = pane === "left" ? summaryTimer : rightSummaryTimer;
    clearTimeout(timer.current);
    timer.current = setTimeout(()=>{
      if(session.path!==path)return;
      const dirty = session.isDirty(target.document);
      if(pane === "left") updateTabs(tabsRef.current.map(tab=>tab.path===path?{...tab,isDirty:dirty}:tab));
      else setRightDirty(dirty);
      setDocumentRevision(value=>value+1);
    },150);
  };
  const onEditorChange = (_editor:any,context:{getChanges:()=>any[]})=>handleEditorChange("left",context);
  const onRightEditorChange = (_editor:any,context:{getChanges:()=>any[]})=>handleEditorChange("right",context);

  const editor = useCreateBlockNote({ schema, uploadFile });
  const editor2 = useCreateBlockNote({ schema, uploadFile: file => uploadForPane(file, "right") });
  useEffect(()=>{
    if(isNoteBusy||searchOpen||!searchTarget)return;
    const frame=requestAnimationFrame(()=>jumpToMatch(searchTarget.pane,searchTarget.id,searchTarget.query));return()=>cancelAnimationFrame(frame);
  },[isNoteBusy,searchOpen,searchTarget]);
  useEffect(()=>{const done=()=>{setPrinting(false);delete document.documentElement.dataset.preparingPrint;};window.addEventListener("afterprint",done);return()=>window.removeEventListener("afterprint",done);},[]);

  useEffect(() => () => {
    clearTimeout(summaryTimer.current);
    clearTimeout(rightSummaryTimer.current);
  }, []);
  useEffect(()=>{ const index=activePane==="left"?textIndex:rightTextIndex;const source=sourceRef.current[activePane];setWordCount(source===null?index.characters:source.replace(/\s/g,"").length);setToc(index.headings()); },[activePane,documentRevision]);
  const draftProtection = useDraftProtection(async(pane,path)=>{
    try { await noteQueue.run(async()=>{
      const session=pane==="left"?leftSession:rightSession;const target=pane==="left"?editor:editor2;
      if(session.path!==path||!paneIsDirty(pane))return;
      const content=sourceRef.current[pane]??await serializeNote(target,structuredClone(target.document));
      await invoke("save_draft",{path,content,baseSource:session.source,draftId:draftIds.current[pane]});
      setDraftTimes(old=>({...old,[pane]:new Date().toLocaleTimeString("zh-CN",{hour12:false})}));
    }); } catch(error){addToast("恢复草稿保存失败："+String(error),"error");}
  });
  const paneIsDirty=(pane:"left"|"right")=>{
    const session=pane==="left"?leftSession:rightSession,target=pane==="left"?editor:editor2;
    return session.isDirty(target.document)||(sourceRef.current[pane]!==null&&sourceRef.current[pane]!==appliedSource.current[pane]);
  };
  const changeSource=(pane:"left"|"right",text:string)=>{
    const next={...sourceRef.current,[pane]:text};sourceRef.current=next;setSourceViews(next);
    const path=(pane==="left"?leftSession:rightSession).path;
    if(path){if(pane==="left")updateTabs(tabsRef.current.map(t=>t.path===path?{...t,isDirty:true}:t));else setRightDirty(true);draftProtection.schedule(pane,path);}
    setDocumentRevision(v=>v+1);setStatus("● 未保存");
  };
  const applySource=async(pane:"left"|"right")=>{
    const source=sourceRef.current[pane];if(source===null||source===appliedSource.current[pane])return;
    const target=pane==="left"?editor:editor2,session=pane==="left"?leftSession:rightSession;
    const blocks=await parseNote(target,source);isLoadingRef.current=true;
    try {replaceNoteDocument(target,blocks);session.replaceDocument(target.document);(pane==="left"?textIndex:rightTextIndex).reset(target.document);appliedSource.current[pane]=source;setDocumentRevision(v=>v+1);}
    finally {isLoadingRef.current=false;}
  };
  const toggleSource=()=>runNoteOperation("切换源码视图失败",async()=>{
    setSearchTarget(null);clearSearchHighlight();
    const pane=activePaneRef.current;const target=pane==="left"?editor:editor2;
    if(sourceRef.current[pane]===null){const source=await serializeNote(target,structuredClone(target.document));appliedSource.current[pane]=source;const next={...sourceRef.current,[pane]:source};sourceRef.current=next;setSourceViews(next);}
    else {await applySource(pane);const next={...sourceRef.current,[pane]:null};sourceRef.current=next;setSourceViews(next);}
  });

  const refreshTree = async () => { try { const tree = await invoke<FileNode[]>("get_file_tree"); setFileTree(tree); } catch (e) { console.error(e); } };

  const toggleFolder = (path: string) => { const newSet = new Set(expandedFolders); if (newSet.has(path)) newSet.delete(path); else newSet.add(path); setExpandedFolders(newSet); };
  
  const handleSelect = (node: FileNode, e?: {ctrlKey:boolean}) => {
    if (node.is_dir) { toggleFolder(node.path); setSelectedFolder(node.path); }
    else {
      if (isSplitMode && e?.ctrlKey) { loadRightNote(node.path); }
      else { loadNote(node.path); const parentPath = node.path.includes("/") ? node.path.substring(0, node.path.lastIndexOf("/")) : null; setSelectedFolder(parentPath); }
    }
  };
  
  const persistPane = async (pane: "left" | "right") => {
    const session = pane === "left" ? leftSession : rightSession;
    const targetEditor = pane === "left" ? editor : editor2;
    await applySource(pane);
    draftProtection.cancel(pane);
    const saved = await session.save(
      targetEditor.document,
      blocks => serializeNote(targetEditor, blocks),
      (path, content, expectedContent) => invoke("save_note", { path, content, expectedContent }).catch(error=>{failedPane.current=pane;throw error;}),
    );
    const isDirty = paneIsDirty(pane);
    if (pane === "left") {
      updateTabs(tabsRef.current.map(tab => tab.path === session.path ? { ...tab, isDirty } : tab));
    } else {
      setRightDirty(isDirty);
    }
    if (isDirty) throw new Error("保存期间有新的修改，已保留在编辑器中，请再次保存");
    if (saved) {
      setSaveTimes(old=>({...old,[pane]:new Date().toLocaleTimeString("zh-CN", { hour12: false })}));
      setStatus("已保存");
    }
    if(session.path && !isDirty) { await invoke("clear_draft",{path:session.path,draftId:draftIds.current[pane]});setDraftTimes(old=>({...old,[pane]:""}));setDrafts(old=>old.filter(d=>d.path!==session.path||d.id!==draftIds.current[pane])); }
    // Removed attachments are retained: undo and other notes may still use them.
  };

  const saveCurrentNote = () => runNoteOperation("保存失败", () => persistPane("left"));
  const saveRightNote = () => runNoteOperation("右侧笔记保存失败", () => persistPane("right"));
  const saveAllNotes = () => runNoteOperation("保存失败", async () => {
    await persistPane("left");
    await persistPane("right");
  });

  const handleOpenStorage = () => runNoteOperation("无法打开容量管理", async () => {
    await persistPane("left"); await persistPane("right"); setStorageOpen(true);
  });
  const scanStorage = () => runNoteOperation("扫描失败", async () => {
    await persistPane("left"); await persistPane("right");
    return invoke<StoragePreview>("inspect_storage");
  });
  const cleanStorage = (selected: StorageCandidate[]) => runNoteOperation("清理失败", async () => {
    await persistPane("left"); await persistPane("right");
    return invoke<CleanupResult>("cleanup_storage", { selected });
  });

  const installDocument = (pane: "left" | "right", path: string | null, content: string, blocks: any[]) => {
    const targetEditor = pane === "left" ? editor : editor2;
    const session = pane === "left" ? leftSession : rightSession;
    draftProtection.cancel(pane);
    const nextSource={...sourceRef.current,[pane]:null};sourceRef.current=nextSource;setSourceViews(nextSource);appliedSource.current[pane]=null;
    setDraftTimes(old=>({...old,[pane]:""}));setSaveTimes(old=>({...old,[pane]:""}));
    clearSearchHighlight();
    setSearchTarget(null);
    isLoadingRef.current = true;
    try {
      replaceNoteDocument(targetEditor, blocks);
      session.open(path, content, targetEditor.document);
      if (pane === "left") {
        const next = [...tabsRef.current];
        if (path && !next.some(tab => tab.path === path)) {
          next.push({ path, title: path.split("/").pop()!, isDirty: false });
        }
        updateTabs(next.map(tab => tab.path === path ? { ...tab, isDirty: false } : tab), path);
        clearTimeout(summaryTimer.current);
        textIndex.reset(editor.document);
        setWordCount(textIndex.characters);
        updateTOC();
        setDocumentRevision(value => value + 1);
        setInlineSearchOpen(false);
        setSaveTimes(old=>({...old,left:""}));
      } else {
        clearTimeout(rightSummaryTimer.current);
        rightTextIndex.reset(targetEditor.document);
        setRightFile(path);
        setRightDirty(false);
        setDocumentRevision(v=>v+1);
      }
    } finally {
      isLoadingRef.current = false;
    }
  };

  const openPane = async (pane: "left" | "right", path: string) => {
    const content = await invoke<string>("load_note", { path });
    const targetEditor = pane === "left" ? editor : editor2;
    const blocks = await parseNote(targetEditor, content);
    if (paneIsDirty(pane)) throw new Error("加载期间有新的修改，已取消切换");
    installDocument(pane, path, content, blocks);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const host=document.querySelector<HTMLElement>(`[data-editor-pane="${pane}"]`);if(host)host.scrollTop=scrollPositions.current[path]||0;
    }));
    setStatus("已加载");
  };

  const loadNote = (path: string) => runNoteOperation("加载失败", async () => {
    setActivePane("left");setSearchTarget(null);clearSearchHighlight();
    if (path === leftSession.path) return;
    await persistPane("left");
    if (rightSession.path === path) {
      await persistPane("right");
      await openPane("left", path);
      installDocument("right", null, "", []);
    } else {
      await openPane("left", path);
    }
  });

  const loadRightNote = (path: string) => runNoteOperation("右侧加载失败", async () => {
    setActivePane("right");setSearchTarget(null);clearSearchHighlight();
    if (path === leftSession.path) throw new Error("该笔记已在左侧打开，请选择另一篇笔记");
    if (path === rightSession.path) return;
    await persistPane("right");
    await openPane("right", path);
  });

  const toggleSplitMode = () => runNoteOperation("切换分屏失败", async () => {
    await persistPane("right");
    setActivePane("left");
    setIsSplitMode(value => !value);
  });

  const handleBackgroundClick = (e: React.MouseEvent) => { if (e.target === e.currentTarget) setSelectedFolder(null); };

  const closeAppRef = useRef<() => Promise<unknown>>(async () => {});
  closeAppRef.current = () => runNoteOperation("关闭失败，笔记仍保留在窗口中", async () => {
    await persistPane("left");
    await persistPane("right");
    await workspaceQueue.run(()=>invoke("save_workspace",{value:workspaceRef.current}));
    await getCurrentWindow().destroy();
  });
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let closing = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested(event => {
      event.preventDefault();
      if (closing) return;
      closing = true;
      void closeAppRef.current().finally(() => { closing = false; });
    }).then(stop => {
      if (disposed) stop(); else unlisten = stop;
    }).catch(error => console.error("无法注册关闭保护", error));
    return () => { disposed = true; unlisten?.(); };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if(e.defaultPrevented || document.querySelector('[role="dialog"]')) return;
      const mod = e.ctrlKey || e.metaKey;
      const target = e.target instanceof HTMLElement ? e.target : null;
      const activeEditor = activePaneRef.current === "right" ? editor2 : editor;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void saveAllNotes(); }
      else if (mod && e.key === 'k') { e.preventDefault(); setIsSidebarOpen(true); setTimeout(() => sidebarSearchRef.current?.focus(), 100); }
      else if (mod && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); setSearchOpen(true); }
      else if (mod && e.key === 'f' && !e.shiftKey) {
        e.preventDefault();
        setSearchTarget(null);setInlineSearchOpen(true);
      }
      else if (mod && e.key.toLowerCase() === 'z' && !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
        if(isReadMode){e.preventDefault();return;}
        if (pendingOperationsRef.current) return;
        e.preventDefault();
        if (e.shiftKey) activeEditor.redo(); else activeEditor.undo();
      }
      else if (mod && e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); setIsFocusMode(prev => !prev); }
      else if (e.key === 'Escape') { setSearchOpen(false); setInlineSearchOpen(false); setSearchTarget(null);clearSearchHighlight(); setShortcutPanel(false); setCtxMenu(null); }
      else if (e.key === '?' && !mod && !target?.isContentEditable && !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) { e.preventDefault(); setShortcutPanel(true); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });
  const silentGC = async () => { try { await invoke("gc_unused_assets"); } catch (e) { console.warn(e); } };
  useEffect(() => {
    let cancelled=false;
    void (async()=>{
      try {
        const root=await invoke<string>("get_library_root");configureAssetLinks(root,convertFileSrc);
        const tree=await invoke<FileNode[]>("get_file_tree");if(cancelled)return;setFileTree(tree);
        let raw:any={};try{raw=await invoke("load_workspace");}catch(error){addToast(String(error),"error");}
        const existing=new Set<string>();const visit=(nodes:FileNode[])=>nodes.forEach(n=>n.is_dir?visit(n.children):existing.add(n.path));visit(tree);
        const workspace=parseWorkspace(raw);scrollPositions.current=workspace.scroll;
        if(!raw || typeof raw!=="object" || !Object.keys(raw).length){workspace.favorites=[...favPaths];workspace.background={url:bgImage,opacity:bgOpacity,blur:bgBlur};}
        setFavPaths(new Set(workspace.favorites.filter(p=>existing.has(p))));setReading(workspace.reading);
        setSidebarWidth(workspace.sidebarWidth);setIsSidebarOpen(workspace.sidebarOpen);setIsTocOpen(workspace.tocOpen);setSplitRatio(workspace.splitRatio);setExpandedFolders(new Set(workspace.expandedFolders));
        setBgImage(workspace.background.url?resolveAssetUrl(workspace.background.url):null);setBgOpacity(workspace.background.opacity);setBgBlur(workspace.background.blur);
        const paths=workspace.tabs.filter(p=>existing.has(p));const active=workspace.activePath&&existing.has(workspace.activePath)?workspace.activePath:paths[0];
        updateTabs(paths.map(path=>({path,title:path.split("/").pop()!,isDirty:false})),null);
        if(active)await openPane("left",active);
        if(workspace.splitMode){setIsSplitMode(true);if(workspace.rightFile&&workspace.rightFile!==active&&existing.has(workspace.rightFile))await openPane("right",workspace.rightFile);}
        const recovered=await invoke<Draft[]>("list_drafts");const pending:Draft[]=[];
        for(const draft of recovered){let current:string|null=null;try{current=await invoke<string>("load_note",{path:draft.path});}catch{/* missing files remain recoverable */}
          if(current===draft.content)await invoke("clear_draft",{path:draft.path,draftId:draft.id});else pending.push(draft);}
        if(!cancelled){setDrafts(pending);setRecoveryOpen(!!pending.length);}
        await silentGC();
      }catch(error){addToast("初始化失败："+String(error),"error");}
      finally{if(!cancelled)setWorkspaceReady(true);}
    })();return()=>{cancelled=true;};
  }, []);
  workspaceRef.current=parseWorkspace({favorites:[...favPaths],tabs:tabs.map(t=>t.path),activePath:currentFile,rightFile,splitMode:isSplitMode,sidebarWidth,sidebarOpen:isSidebarOpen,tocOpen:isTocOpen,splitRatio,expandedFolders:[...expandedFolders],scroll:scrollPositions.current,reading,background:{url:bgImage?storedAssetUrl(bgImage):null,opacity:bgOpacity,blur:bgBlur}});
  useEffect(()=>{
    if(!workspaceReady)return;const timer=setTimeout(()=>{const value=workspaceRef.current;void workspaceQueue.run(()=>invoke("save_workspace",{value})).catch(error=>addToast("工作区设置保存失败："+String(error),"error"));},500);
    return()=>clearTimeout(timer);
  },[workspaceReady,favPaths,tabs,currentFile,rightFile,isSplitMode,sidebarWidth,isSidebarOpen,isTocOpen,splitRatio,expandedFolders,reading,bgImage,bgOpacity,bgBlur,scrollRevision]);
  useEffect(()=>()=>clearTimeout(scrollTimer.current),[]);
  const rememberScroll=(pane:"left"|"right",element:HTMLElement)=>{
    const path=(pane==="left"?leftSession:rightSession).path;if(!path)return;scrollPositions.current[path]=element.scrollTop;
    clearTimeout(scrollTimer.current);scrollTimer.current=setTimeout(()=>setScrollRevision(v=>v+1),300);
  };

  const filterNodes = (nodes: FileNode[], term: string): FileNode[] => {
    if (!term) return nodes;
    return nodes.map(node => {
      if (node.is_dir) { const children = filterNodes(node.children, term); if (children.length > 0 || node.name.toLowerCase().includes(term.toLowerCase())) return { ...node, children }; return null; }
      return node.name.toLowerCase().includes(term.toLowerCase()) ? node : null;
    }).filter(Boolean) as FileNode[];
  };

  const displayedTree = useMemo(() => {
      const filtered = filterNodes(fileTree, searchTerm);
      return sortFileTree(filtered);
  }, [fileTree, searchTerm]);
  
  const startResizing = useCallback(() => setIsResizing(true), []);
  const resize = useCallback((e: MouseEvent) => { if (isResizing) setSidebarWidth(Math.max(150, Math.min(e.clientX, 600))); }, [isResizing]);
  useEffect(() => {
    const stopResizing = () => setIsResizing(false);
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize]);
  useEffect(() => { const close = () => setCtxMenu(null); window.addEventListener("click", close); return () => window.removeEventListener("click", close); }, []);

  const matchesPath = (candidate: string | null, path: string, isDir: boolean) =>
    candidate !== null && (candidate === path || (isDir && candidate.startsWith(path + "/")));

  const openRemainingTab = async (path: string) => {
    if (rightSession.path === path) await persistPane("right");
    await openPane("left", path);
    if (rightSession.path === path) installDocument("right", null, "", []);
  };

  const renameItem = (node: FileNode, newPath: string) => runNoteOperation("移动或重命名失败", async () => {
    await persistPane("left");
    await persistPane("right");
    await invoke("rename_item", { oldPath: node.path, newPath, isDir: node.is_dir });
    const remap = (path: string) => matchesPath(path, node.path, node.is_dir)
      ? newPath + path.slice(node.path.length) : path;
    if (leftSession.path) leftSession.path = remap(leftSession.path);
    if (rightSession.path) {
      rightSession.path = remap(rightSession.path);
      setRightFile(rightSession.path);
    }
    updateTabs(tabsRef.current.map(tab => {
      const path = remap(tab.path);
      return { ...tab, path, title: path.split("/").pop()! };
    }));
    setExpandedFolders(prev => new Set([...prev].map(remap)));
    setSelectedFolder(prev => prev ? remap(prev) : null);
    setFavPaths(prev => {
      const next = new Set([...prev].map(remap));
      localStorage.setItem("fav_paths", JSON.stringify([...next]));
      return next;
    });
    await refreshTree();
  });

  const handleMove = async (e: React.MouseEvent, node: FileNode) => {
    e.stopPropagation();
    const currentParent = node.path.includes("/") ? node.path.substring(0, node.path.lastIndexOf("/")) : "";
    const targetFolder = await showDialog("tree-select", "移动到...", {
      message: "选择「" + node.name + "」的新位置：", defaultValue: currentParent,
      treeData: fileTree, disabledPath: node.is_dir ? node.path : undefined,
    });
    if (targetFolder === null || targetFolder === currentParent) return;
    await renameItem(node, targetFolder ? targetFolder + "/" + node.name : node.name);
  };

  const closeTab = (path: string) => runNoteOperation("关闭笔记失败", async () => {
    const currentTabs = tabsRef.current;
    const idx = currentTabs.findIndex(tab => tab.path === path);
    if (idx < 0) return;
    const isActive = leftSession.path === path;
    if (isActive) await persistPane("left");
    const nextTabs = currentTabs.filter(tab => tab.path !== path);
    if (isActive) {
      const next = nextTabs[Math.min(idx, nextTabs.length - 1)];
      if (next) await openRemainingTab(next.path);
      else installDocument("left", null, "", []);
    }
    updateTabs(tabsRef.current.filter(tab => tab.path !== path));
  });

  const handleDelete = async (e: React.MouseEvent, path: string, isDir: boolean) => {
    e.stopPropagation();
    const confirmed = await showDialog("confirm", "删除", { message: "确认要将「" + path + "」放入回收站吗？" });
    if (!confirmed) return;
    await runNoteOperation("删除失败", async () => {
      const removeLeft = matchesPath(leftSession.path, path, isDir);
      const removeRight = matchesPath(rightSession.path, path, isDir);
      if (removeLeft) await persistPane("left");
      if (removeRight) await persistPane("right");
      await invoke("delete_item", { path, isDir });
      const remaining = tabsRef.current.filter(tab => !matchesPath(tab.path, path, isDir));
      if (removeLeft) installDocument("left", null, "", []);
      if (removeRight) installDocument("right", null, "", []);
      updateTabs(remaining);
      setExpandedFolders(prev => new Set([...prev].filter(p => !matchesPath(p, path, isDir))));
      setSelectedFolder(prev => matchesPath(prev, path, isDir) ? null : prev);
      setFavPaths(prev => {
        const next = new Set([...prev].filter(p => !matchesPath(p, path, isDir)));
        localStorage.setItem("fav_paths", JSON.stringify([...next]));
        return next;
      });
      await refreshTree();
      if (removeLeft && remaining.length) await openRemainingTab(remaining[0].path);
    });
  };

  const handleRename = async (e: React.MouseEvent, node: FileNode) => {
    e.stopPropagation();
    const newName = await showDialog("prompt", "重命名", { defaultValue: node.name });
    if (!newName || newName === node.name) return;
    if (/[\\/]/.test(newName)) { addToast("名称不能包含路径分隔符", "error"); return; }
    const parentDir = node.path.includes("/") ? node.path.substring(0, node.path.lastIndexOf("/")) : "";
    await renameItem(node, parentDir ? parentDir + "/" + newName : newName);
  };

  const handleCreate = async (type: "folder" | "note") => {
    const name = await showDialog("prompt", type === "folder" ? "新建文件夹" : "新建笔记", { message: "请输入名称：" });
    if (!name) return;
    if (/[\\/]/.test(name)) { addToast("名称不能包含路径分隔符", "error"); return; }
    const path = selectedFolder ? selectedFolder + "/" + name : name;
    await runNoteOperation("创建失败", async () => {
      if (type === "folder") await invoke("create_folder", { path });
      else {
        await persistPane("left");
        await invoke("create_note", { path });
        await openPane("left", path);
      }
      await refreshTree();
    });
  };

  const perform=async(label:string,operation:()=>Promise<void>)=>{
    const result=await runNoteOperation(label,async()=>{await operation();return true;});
    if(!result)throw new Error("操作未完成，请先处理提示后重试。");
  };
  const beforeSearch=()=>perform("保存失败",async()=>{await persistPane("left");await persistPane("right");});
  const applyText=async(pane:"left"|"right",content:string)=>{
    const session=pane==="left"?leftSession:rightSession,target=pane==="left"?editor:editor2;
    if(!session.path)throw new Error("未打开笔记");
    const blocks=await parseNote(target,content);
    await invoke("save_note",{path:session.path,content,expectedContent:session.source});
    installDocument(pane,session.path,content,blocks);await invoke("clear_draft",{path:session.path,draftId:draftIds.current[pane]});
  };
  const replaceInNote=(path:string,before:string,after:string)=>perform("替换失败",async()=>{
    await persistPane("left");await persistPane("right");
    const pane=leftSession.path===path?"left":rightSession.path===path?"right":null;
    const target=pane==="right"?editor2:editor;
    const blocks=pane?await parseNote(target,after):null;
    await invoke("save_note",{path,content:after,expectedContent:before});
    if(pane&&blocks)installDocument(pane,path,after,blocks);
    addToast("替换完成，原文已备份","success");
  });
  const openSearchHit=(hit:{path:string;line:number;content:string},query:string)=>perform("打开搜索结果失败",async()=>{
    let pane:"left"|"right"=rightSession.path===hit.path?"right":"left";
    if(pane==="left"&&leftSession.path!==hit.path){await persistPane("left");await openPane("left",hit.path);}
    if(pane==="right")setIsSplitMode(true);setActivePane(pane);
    const target=pane==="left"?editor:editor2,index=pane==="left"?textIndex:rightTextIndex;
    const candidate=blockAtSourceLine(target,hit.line);
    const matches=index.search(query);const id=matches.find(m=>m.blockId===candidate)?.blockId||matches.find(m=>hit.content.includes(m.text))?.blockId||matches[0]?.blockId||candidate;
    if(id)setSearchTarget({pane,id,query});
  });
  const handleHistory=()=>runNoteOperation("打开历史版本失败",async()=>{
    const pane=activePaneRef.current;await persistPane(pane);const session=pane==="left"?leftSession:rightSession;
    if(session.path)setHistory({pane,path:session.path,content:session.source});
  });
  const recoverDraft=async(draft:Draft)=>perform("恢复草稿失败",async()=>{
    await persistPane("left");let disk:string|null=null;try{disk=await invoke<string>("load_note",{path:draft.path});}catch{/* missing note */}
    let path=draft.path;
    if(disk!==draft.base_source){path=draft.path+"（恢复 "+new Date().toISOString().replace(/[:.]/g,"-")+"）";await invoke("create_note",{path});disk="";}
    if(rightSession.path===path){await persistPane("right");installDocument("right",null,"",[]);}
    installDocument("left",path,disk??"",await parseNote(editor,disk??""));
    const blocks=await parseNote(editor,draft.content);isLoadingRef.current=true;
    try {replaceNoteDocument(editor,blocks);leftSession.replaceDocument(editor.document);textIndex.reset(editor.document);setDocumentRevision(v=>v+1);}
    finally {isLoadingRef.current=false;}
    updateTabs(tabsRef.current.map(t=>t.path===path?{...t,isDirty:true}:t));setActivePane("left");
    await invoke("save_draft",{path,content:draft.content,baseSource:disk??"",draftId:draftIds.current.left});
    if(path!==draft.path||draft.id!==draftIds.current.left)await invoke("clear_draft",{path:draft.path,draftId:draft.id});
    setDrafts(old=>old.filter(d=>d.path!==draft.path||d.id!==draft.id));await refreshTree();
  });
  const handleOpenSettings=()=>setPreferencesOpen(true);

  const clearBg = async () => { if (bgImage) { try { await invoke("delete_asset", { url: bgImage }); } catch (e) { console.error("Delete bg failed", e); } } setBgImage(null); localStorage.removeItem("app_bg_image"); };
  const updateBgImage = async (file: File) => { try { const filename = `bg_${new Date().getTime()}_${file.name}`; const payload = Array.from(new Uint8Array(await file.arrayBuffer())); const path = await invoke<string>("save_image", { fileName: filename, payload, notePath: "wallpapers" }); setBgImage(resolveAssetUrl(path)); localStorage.setItem("app_bg_image", path); } catch (e) { addToast("壁纸设置失败: " + e, 'error'); } };
  const handleOpenTrash = async () => { try { const items = await invoke<TrashItem[]>("get_trash_items"); await showDialog('trash', '回收站', { trashItems: items, onEmptyTrash: async () => { const confirmed = await showDialog('confirm', '清空回收站', { message: "确定清空回收站吗？此操作不可恢复。" }); if (confirmed) { await invoke("empty_trash"); } handleOpenTrash(); }, onRestore: async (path: string) => { await invoke("restore_trash_item", { fileName: path }); await refreshTree(); handleOpenTrash(); }, onDeleteForever: async (path: string) => { const confirmed = await showDialog('confirm', '永久删除', { message: `确定要永久删除 "${path}" 吗？此操作不可恢复。` }); if (confirmed) { await invoke("delete_trash_item", { fileName: path }); } handleOpenTrash(); } }); } catch(e) { addToast("打开回收站失败: " + e, 'error'); } };
  const showNodeMenu = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault(); e.stopPropagation();
    const menuW = 170, menuH = 220;
    const x = Math.min(e.clientX, window.innerWidth - menuW);
    const y = Math.min(e.clientY, window.innerHeight - menuH);
    setCtxMenu({ x: Math.max(0, x), y: Math.max(0, y), node });
  };
  const handleShowInfo = async (node: FileNode) => {
    setCtxMenu(null);
    if (node.is_dir) { addToast("文件夹暂无详细信息", 'info'); return; }
    try {
      const info = await invoke<any>("get_note_info", { path: node.path });
      await showDialog('alert', '📋 详细信息', { message: `路径: ${info.path}\n行数: ${info.lines}\n大小: ${(info.size/1024).toFixed(1)} KB\n创建: ${info.created}\n修改: ${info.modified}` });
    } catch { addToast("获取信息失败", 'error'); }
  };
  const toggleFav = (path: string) => {
    setFavPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      localStorage.setItem("fav_paths", JSON.stringify([...next]));
      return next;
    });
    setCtxMenu(null);
  };

  const treeActions=useRef({select:handleSelect,toggle:toggleFolder,context:showNodeMenu});
  treeActions.current={select:handleSelect,toggle:toggleFolder,context:showNodeMenu};
  const treeCallbacks=useMemo(()=>({onSelect:(node:FileNode,event?:{ctrlKey:boolean})=>treeActions.current.select(node,event),onToggle:(path:string)=>treeActions.current.toggle(path),onContext:(event:React.MouseEvent,node:FileNode)=>treeActions.current.context(event,node)}),[]);

  const handleExportPdf = () => runNoteOperation("准备 PDF 失败",async()=>{
    await applySource(activePaneRef.current);document.documentElement.dataset.printPane=activePaneRef.current;document.documentElement.dataset.preparingPrint="true";setPrinting(true);
    const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    await frame();window.dispatchEvent(new Event("prepare-note-print"));await frame();
    let timeout:ReturnType<typeof setTimeout>|undefined;
    try{await Promise.race([waitForPreviews(),new Promise<void>((_,reject)=>{timeout=setTimeout(()=>reject(new Error("附件预览尚未准备完成，请重试")),30000);})]);window.print();}
    finally{clearTimeout(timeout);setPrinting(false);delete document.documentElement.dataset.preparingPrint;}
  });
  const handleExportPackage=()=>runNoteOperation("导出资料包失败",async()=>{
    const pane=activePaneRef.current,session=pane==="left"?leftSession:rightSession,target=pane==="left"?editor:editor2;
    if(!session.path)return;const source=sourceRef.current[pane]??await serializeNote(target,structuredClone(target.document));
    const name=session.path.split("/").pop()!;const path=await save({defaultPath:name+".zip",filters:[{name:"笔记及附件",extensions:["zip"]}]});
    if(!path)return;setStatus("正在打包笔记及附件…");
    const {notePackage}=await import("./services/exportService");const bytes=await notePackage(source,name);
    await writeFile(path,bytes);setStatus("导出成功");addToast("资料包已导出","success");
  });

  // Markdown is the note's storage format. Word receives real OOXML blocks;
  // formulas are editable Office Math (OMML), never screenshots or $$ text.
  const handleExportWord = () => runNoteOperation("导出 Word 失败", async () => {
    const pane=activePaneRef.current;await applySource(pane);
    const notePath = (pane==="left"?leftSession:rightSession).path;
    if (!notePath) return;
    setStatus("正在生成完整 Word 文档...");
    const snapshot = structuredClone((pane==="left"?editor:editor2).document);
    const { wordBytes } = await import("./services/exportService");
    const { bytes, baseName } = await wordBytes(snapshot, notePath);
    const path = await save({
      defaultPath: `${baseName}.docx`,
      filters: [{ name: "Word Document", extensions: ["docx"] }],
    });
    if (!path) { setStatus("已取消导出"); return; }
    await writeFile(path, bytes);
    setStatus("导出成功");
    addToast("已导出完整 Word；公式可在 Word 中继续编辑", "success");
  });
  
  // 🔥 目录点击跳转逻辑
  const jumpToBlock = (id: string) => {
     const element = document.querySelector(`[data-editor-pane="${activePaneRef.current}"] [data-id="${id}"]`);
     if (element) {
         element.scrollIntoView({ behavior: "smooth", block: "center" });
     }
  };

  return (
    <div className="app-shell" style={{ height: "100vh", display: "flex", position: "relative", "--reading-size":`${reading.fontSize}px`,"--reading-line":reading.lineHeight,"--reading-width":`${reading.width}px` } as React.CSSProperties}>
      <style>{`
        button[aria-label*="Download"], button[title*="Download"], [class*="bn-file-block"] [role="button"]:has(svg path[d*="M13 10"]), [class*="bn-image-block"] [role="button"]:has(svg path[d*="M13 10"]), [class*="bn-video-block"] [role="button"]:has(svg path[d*="M13 10"]) { display: none !important; }
        .bn-block-content .bn-block-content { background: transparent !important; padding: 0 !important; }
        [data-content-type="codeBlock"] { background: transparent !important; box-shadow: none !important; }
        pre, code, [class*="language-"] { background: transparent !important; background-color: transparent !important; text-shadow: none !important; }
        .bn-block-content { max-width: 100% !important; }
        .bn-block-content[data-content-type="numberedListItem"]::before, .bn-block-content[data-content-type="bulletListItem"]::before { user-select: none !important; }

        @media print {
          .no-print, .bn-side-menu, .bn-formatting-toolbar, button, .export-exclude { display: none !important; }
          html, body, #root, div[style*="height: 100vh"] {
            height: auto !important;
            overflow: visible !important;
            display: block !important;
          }
          .print-content { 
            position: static !important; 
            width: 100% !important; 
            height: auto !important; 
            overflow: visible !important; 
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }
          .bn-block-content[data-placeholder]::before { display: none !important; }
          body { background: white !important; }
          .raw-markdown-print { display: block !important; }
          .print-content > div, .print-content [data-editor-pane],
          .print-content .editor-layout, .print-content .editor-column,
          .print-content .bn-container, .print-content .bn-editor,
          .print-content .code-block-container, .print-content .code-block-container div,
          .print-content .mermaid-block-wrapper, .print-content .mermaid-block-wrapper > div {
            height: auto !important; overflow: visible !important;
          }
          .print-content [data-editor-pane] { padding: 0 !important; }
          .print-content .bn-file-block-content {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .print-content .bn-file-block-content div,
          .print-content .bn-file-block-content pre {
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
          }
        }
      `}</style>
      
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 0, backgroundImage: bgImage ? `url(${resolveAssetUrl(bgImage)})` : "none", backgroundSize: "cover", backgroundPosition: "center", backgroundColor: "#fff" }} className="no-print" />
      <CustomDialog {...dialogState} onConfirm={(val) => dialogState.resolve(val)} onCancel={() => dialogState.resolve(null)} bgImage={bgImage} bgOpacity={bgOpacity} bgBlur={bgBlur} onClearBg={clearBg} onSetBgImage={updateBgImage} onSetBgOpacity={(v) => { setBgOpacity(v); localStorage.setItem("app_bg_opacity", v.toString()); }} onSetBgBlur={(v) => { setBgBlur(v); localStorage.setItem("app_bg_blur", v.toString()); }} />

      {storageOpen && <Suspense fallback={<div role="status">正在加载容量管理…</div>}><StorageDialog scan={scanStorage} clean={cleanStorage} onClose={() => setStorageOpen(false)} /></Suspense>}

      <Suspense fallback={<div role="status" className="loading-panel">正在加载…</div>}>
        {searchOpen&&<SearchPanel onClose={()=>setSearchOpen(false)} onOpen={openSearchHit} beforeSearch={beforeSearch} onReplace={replaceInNote}/>}
        {history&&<HistoryDialog path={history.path} current={history.content} onClose={()=>setHistory(null)} onRestore={content=>perform("恢复版本失败",async()=>{await persistPane(history.pane);await applyText(history.pane,content);})}/>}
        {recoveryOpen&&<RecoveryDialog drafts={drafts} onClose={()=>setRecoveryOpen(false)} onRecover={recoverDraft} onDiscard={async draft=>{await invoke("clear_draft",{path:draft.path,draftId:draft.id});setDrafts(old=>old.filter(d=>d.path!==draft.path||d.id!==draft.id));}}/>}
        {conflict&&<ConflictDialog conflict={conflict} onClose={()=>setConflict(null)} onReload={()=>perform("载入磁盘版本失败",async()=>{
          await invoke("save_draft",{path:conflict.path,content:conflict.ours,baseSource:conflict.disk,draftId:crypto.randomUUID()});
          const disk=await invoke<string>("load_note",{path:conflict.path});const target=conflict.pane==="left"?editor:editor2;
          installDocument(conflict.pane,conflict.path,disk,await parseNote(target,disk));setActivePane(conflict.pane);
          const remaining=await invoke<Draft[]>("list_drafts");setDrafts(remaining);
        })} onCopy={()=>perform("另存副本失败",async()=>{
          const path=conflict.path+"（副本 "+new Date().toISOString().replace(/[:.]/g,"-")+"）";
          await invoke("create_note",{path});await invoke("save_note",{path,content:conflict.ours,expectedContent:""});
          const disk=await invoke<string>("load_note",{path:conflict.path});const target=conflict.pane==="left"?editor:editor2;
          installDocument(conflict.pane,conflict.path,disk,await parseNote(target,disk));await invoke("clear_draft",{path:conflict.path,draftId:draftIds.current[conflict.pane]});await refreshTree();addToast("已保留副本："+path,"success");
        })}/>}
        {preferencesOpen&&<PreferencesDialog reading={reading} onReading={setReading} opacity={bgOpacity} blur={bgBlur} onOpacity={setBgOpacity} onBlur={setBgBlur} onImage={updateBgImage} onClear={clearBg} hasImage={!!bgImage} onLibrary={()=>setLibraryOpen(true)} onClose={()=>setPreferencesOpen(false)}/>}
        {libraryOpen&&<LibraryDialog beforeScan={beforeSearch} onClose={()=>setLibraryOpen(false)} onApply={items=>perform("迁移附件链接失败",async()=>{
          await persistPane("left");await persistPane("right");
          for(const item of items){await invoke("save_note",{path:item.path,content:item.after,expectedContent:item.before});
            if(leftSession.path===item.path)await openPane("left",item.path);if(rightSession.path===item.path)await openPane("right",item.path);}
        })}/>}
      </Suspense>

      {/* 侧边栏 */}
      {!isFocusMode && <>
      <div className="no-print app-sidebar" onClick={handleBackgroundClick} style={{ width: isSidebarOpen ? sidebarWidth : 0, borderRight: isSidebarOpen ? "1px solid rgba(0,0,0,0.1)" : "none", background: `rgba(249, 249, 249, ${Math.max(0.6, bgOpacity - 0.1)})`, backdropFilter: `blur(${bgBlur}px)`, display: "flex", flexDirection: "column", overflow: "hidden", transition: isResizing ? "none" : "width 0.2s", zIndex: 1 }}>
        <div style={{ padding: "14px 16px", fontWeight: 700, borderBottom: "1px solid #e8eaed", whiteSpace:"nowrap", display:"flex", justifyContent:"space-between", alignItems:"center", background: "#fafbfc", letterSpacing: "-0.3px" }}>
          <span style={{ fontSize: "14px", color: "#1a1a1a" }}><Icon name="folder"/> No.1</span>
          <div style={{ display:"flex", gap:"2px" }}>
            <button onClick={() => setShortcutPanel(true)} title="快捷键 (?)"
              style={{ background:"transparent", border:"none", cursor:"pointer", fontSize:"13px", color:"#999", padding:"4px 7px", borderRadius:"5px", transition:"all 0.15s", fontWeight:600 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#e8eaed"; e.currentTarget.style.color = "#555"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#999"; }}>?</button>
            <button onClick={handleOpenSettings} title="设置"
              style={{ background:"transparent", border:"none", cursor:"pointer", fontSize:"15px", color:"#999", padding:"4px 7px", borderRadius:"5px", transition:"all 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#e8eaed"; e.currentTarget.style.color = "#555"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#999"; }}><Icon name="settings"/></button>
          </div>
        </div>
        {/* Favorites section */}
        {[...favPaths].length > 0 && (
          <div style={{ padding: "4px 8px", borderBottom: "1px solid rgba(0,0,0,0.05)", background: "#fefce8" }}>
            <div style={{ fontSize: "10px", color: "#b45309", fontWeight: 600, marginBottom: "2px", paddingLeft: "4px" }}>⭐ 收藏</div>
            {[...favPaths].map(p => (
              <div key={p} onClick={() => loadNote(p)}
                style={{ padding: "3px 8px", cursor: "pointer", fontSize: "12px", color: "#333", borderRadius: "4px", display: "flex", alignItems: "center", gap: "6px" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#fef3c7"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                <Icon name="file"/><span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p}</span>
                <span onClick={(e) => { e.stopPropagation(); toggleFav(p); }}
                  style={{ marginLeft:"auto", fontSize:"12px", opacity:0.5, cursor:"pointer" }}>✕</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ padding: "0 10px 10px 10px", borderBottom: "1px solid rgba(0,0,0,0.05)" }}><input ref={sidebarSearchRef} type="text" placeholder="🔍 搜索... (Ctrl+K)" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const collectFiles = (ns: FileNode[]): string[] => {
                      let paths: string[] = [];
                      for (const n of ns) {
                        if (!n.is_dir) paths.push(n.path);
                        if (n.children) paths = paths.concat(collectFiles(n.children));
                      }
                      return paths;
                    };
                    const allFiles = collectFiles(fileTree);
                    const q = searchTerm.toLowerCase();
                    const match = allFiles.find(p => p.toLowerCase().includes(q));
                    if (match) loadNote(match);
                  }
                }}
                style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid #ddd", fontSize: "12px", boxSizing: "border-box", background: "rgba(255,255,255,0.8)" }} /></div>
        <div style={{ flex: 1, overflow: "auto", padding: "8px 4px" }} onClick={handleBackgroundClick}>{<FileTree nodes={displayedTree} currentFile={activeFile} selectedFolder={selectedFolder} expandedFolders={expandedFolders} favPaths={favPaths} searchTerm={searchTerm} {...treeCallbacks}/>}</div>
        <div style={{ padding: "8px 16px", cursor:"pointer", borderTop: "1px solid #e8eaed", fontSize:"12px", color:"#888", display:"flex", alignItems:"center", gap:"6px", transition: "all 0.15s" }}
          onMouseEnter={(e) => e.currentTarget.style.background = "#f5f5f5"}
          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          onClick={handleOpenTrash}><Icon name="trash"/><span>回收站</span></div>
        <button onClick={handleOpenStorage} style={{ padding: "10px 16px", border: 0, background: "transparent", textAlign: "left", color: "#666", cursor: "pointer" }}><Icon name="storage"/> 容量管理</button>
        <div style={{ padding: "8px 12px", borderTop: "1px solid #e8eaed", background: "#fafbfc" }}>
          <div style={{ display: "flex", gap: "6px" }}>
            <button onClick={() => handleCreate('folder')}
              style={{ flex: 1, padding: "7px", border: "1px solid #e0e0e0", background: "white", borderRadius: "6px", cursor: "pointer", fontSize: "12px", color: "#666", transition: "all 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#1890ff"; e.currentTarget.style.color = "#1890ff"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e0e0e0"; e.currentTarget.style.color = "#666"; }}>
              + 文件夹
            </button>
            <button onClick={() => handleCreate('note')}
              style={{ flex: 1, padding: "7px", border: "none", background: "#1890ff", color: "white", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: 500, transition: "all 0.15s" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#40a9ff"}
              onMouseLeave={(e) => e.currentTarget.style.background = "#1890ff"}>
              + 笔记</button>
          </div>
        </div>
      </div>

      {isSidebarOpen && <div className="no-print" onMouseDown={startResizing} style={{ width: "4px", cursor: "col-resize", background: "transparent", zIndex: 10, marginLeft: "-2px" }} />}
      </>}
      
      {/* 主内容区域 */}
      <div className="print-content" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", zIndex: 1, position: "relative" }}>
        
        {/* Tab 栏 */}
        {!isFocusMode && tabs.length > 0 && (
          <div className="no-print" style={{ display: "flex", background: "#f8f9fa", borderBottom: "1px solid #e8eaed", flexShrink: 0, alignItems: "center" }}>
            <button onClick={() => { const el = document.getElementById('tab-scroll'); if (el) el.scrollBy({left: -200, behavior: 'smooth'}); }}
              style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "11px", color: "#999", padding: "4px 6px", flexShrink: 0 }}
              onMouseEnter={(e) => e.currentTarget.style.color = "#333"}
              onMouseLeave={(e) => e.currentTarget.style.color = "#999"}>◀</button>
            <div id="tab-scroll" role="tablist" aria-label="已打开的笔记" style={{ display: "flex", overflowX: "auto", flex: 1, minWidth:0, scrollbarWidth: "none" }}>
            {tabs.map((tab, i) => (
              <div key={tab.path} className="note-tab" data-path={tab.path} role="tab" aria-selected={i===activeTabIndex} title={tab.path} tabIndex={i===activeTabIndex?0:-1}
                onKeyDown={e=>{if(e.key==="ArrowRight"||e.key==="ArrowLeft"){e.preventDefault();const next=tabs[(i+(e.key==="ArrowRight"?1:tabs.length-1))%tabs.length];if(next)void loadNote(next.path);}else if(e.key==="Delete"){e.preventDefault();void closeTab(tab.path);}}}
                onClick={() => { if (i !== activeTabIndex) loadNote(tab.path); }}
                style={{
                  padding: "7px 14px", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", gap: "7px",
                  whiteSpace: "nowrap", transition: "all 0.12s",
                  background: i === activeTabIndex ? "#fff" : "transparent",
                  color: i === activeTabIndex ? "#1890ff" : "#5f6368",
                  fontWeight: i === activeTabIndex ? 600 : 400,
                  borderBottom: i === activeTabIndex ? "2px solid #1890ff" : "2px solid transparent",
                  borderRight: "1px solid transparent",
                  borderRadius: "4px 4px 0 0", marginTop: "3px",
                  minWidth: "110px", maxWidth:"200px", flexShrink:0
                }}
                onMouseEnter={(e) => { if (i !== activeTabIndex) { e.currentTarget.style.background = "#eef1f5"; e.currentTarget.style.color = "#333"; } }}
                onMouseLeave={(e) => { if (i !== activeTabIndex) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#5f6368"; } }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: "130px" }}>{tab.title}</span>
                {tab.isDirty && <span style={{ color: "#faad14", fontSize: "11px" }}>●</span>}
                <span onClick={(e) => { e.stopPropagation(); closeTab(tab.path); }}
                  style={{ fontSize: "13px", opacity: 0.35, cursor: "pointer", padding: "0 3px", borderRadius: "3px", lineHeight: 1 }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.8"; e.currentTarget.style.background = "#e0e0e0"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.35"; e.currentTarget.style.background = "transparent"; }}
                  title="关闭">✕</span>
              </div>
            ))}
            </div>
            <button onClick={() => { const el = document.getElementById('tab-scroll'); if (el) el.scrollBy({left: 200, behavior: 'smooth'}); }}
              style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "11px", color: "#999", padding: "4px 6px", flexShrink: 0 }}
              onMouseEnter={(e) => e.currentTarget.style.color = "#333"}
              onMouseLeave={(e) => e.currentTarget.style.color = "#999"}>▶</button>
          </div>
        )}

        {!isFocusMode&&<Toolbar hasFile={!!activeFile} busy={isNoteBusy} dirty={activePane==="right"?rightDirty:!!tabs[activeTabIndex]?.isDirty}
          readMode={isReadMode} splitMode={isSplitMode} sidebarOpen={isSidebarOpen} tocOpen={isTocOpen} sourceMode={sourceViews[activePane]!==null}
          wordCount={wordCount} saveTime={lastSaveTime} draftTime={draftTimes[activePane]} status={status} drafts={drafts.length}
          sidebar={()=>setIsSidebarOpen(v=>!v)} toc={()=>setIsTocOpen(v=>!v)} search={()=>setSearchOpen(true)}
          undo={()=>(activePane==="left"?editor:editor2).undo()} redo={()=>(activePane==="left"?editor:editor2).redo()}
          read={()=>setIsReadMode(v=>!v)} split={()=>void toggleSplitMode()} focus={()=>setIsFocusMode(v=>!v)} save={()=>void saveAllNotes()}
          word={()=>void handleExportWord()} pdf={()=>void handleExportPdf()} source={()=>void toggleSource()} history={()=>void handleHistory()}
          pack={()=>void handleExportPackage()} links={()=>setLibraryOpen(true)} settings={handleOpenSettings}
          recovery={()=>void runNoteOperation("载入草稿失败",async()=>{const all=await invoke<Draft[]>("list_drafts");setDrafts(all);setRecoveryOpen(true);})}/>}

        {/* 纯净模式顶栏 */}
        {isFocusMode && (
          <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 16px", background: "rgba(255,255,255,0.95)", borderBottom: "1px solid #eee", backdropFilter: "blur(8px)", flexShrink: 0 }}>
            <span style={{ fontSize: "12px", color: "#999" }}>纯净模式 · Ctrl+Shift+D 退出</span>
            <button onClick={() => setIsFocusMode(false)}
              style={{ padding: "4px 12px", background: "#f0f0f0", border: "1px solid #e0e0e0", borderRadius: "6px", cursor: "pointer", fontSize: "12px", color: "#666" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#e0e0e0"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#f0f0f0"; }}>✕ 退出纯净</button>
          </div>
        )}

        {/* 内容容器：左侧目录 + 右侧编辑器 */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", background: `rgba(255, 255, 255, ${bgOpacity})`, backdropFilter: `blur(${bgBlur}px)` }}>
            
            {/* 左侧目录栏 (带平滑过渡动画) */}
            <div className="no-print toc-pane" style={{
                width: (activeFile && isTocOpen) ? "200px" : "0px",
                overflow: "hidden", // 隐藏超出内容
                opacity: (activeFile && isTocOpen) ? 1 : 0,
                padding: (activeFile && isTocOpen) ? "20px 10px" : "0px",
                borderRight: (activeFile && isTocOpen) ? "1px solid rgba(0,0,0,0.05)" : "none",
                flexShrink: 0,
                fontSize: "13px",
                color: "#555",
                transition: "width 0.3s ease, padding 0.3s ease, opacity 0.2s ease, border-right 0.3s", // 添加过渡动画
                whiteSpace: "nowrap" // 防止文字换行
            }}>
                <div style={{ fontWeight: "bold", marginBottom: "10px", paddingLeft: "5px", color: "#333", fontSize: "12px" }}>大纲</div>
                {toc.length === 0 ? (
                    <div style={{ paddingLeft: "5px", color: "#999", fontSize: "12px" }}>无标题</div>
                ) : (
                    toc.map((item) => (
                        <div 
                            key={item.id} 
                            onClick={() => jumpToBlock(item.id)}
                            title={item.text}
                            style={{ 
                                padding: "4px 8px", 
                                marginLeft: `${(item.level - 1) * 12}px`, 
                                cursor: "pointer",
                                borderRadius: "4px",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                color: "#666",
                                transition: "background 0.1s"
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.04)"}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                        >
                            {item.text}
                        </div>
                    ))
                )}
            </div>

            {/* 编辑器区域 */}
            <div className="editor-layout" style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            {/* 左侧编辑器 */}
            <div className="editor-column" data-active={activePane==="left"} style={{ display: "flex", flexDirection: "column", flex: isSplitMode ? `${splitRatio*100}%` : 1, minWidth: 0 }}>
              {isSplitMode && currentFile && (
                <div className="no-print" style={{ padding: "4px 12px", fontSize: "11px", color: "#1677ff", fontWeight: 600, background: "#f0f5ff", borderBottom: "1px solid #d6e4ff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>
                  📄 {currentFile.split("/").pop()}
                </div>
              )}
              <div style={{
                flex: 1, overflow: "auto",
                padding: isSplitMode ? "16px 24px" : "40px 60px",
                paddingBottom: isSplitMode ? "30vh" : "50vh",
                transition: "padding 0.3s ease"
              }} className={"note-body "+(activePane==="left"?"active-pane":"")} data-editor-pane="left" onFocusCapture={()=>setActivePane("left")} onPointerDownCapture={()=>setActivePane("left")} onScroll={e=>rememberScroll("left",e.currentTarget)} inert={isNoteBusy||!workspaceReady} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) void saveCurrentNote(); }}>
              {inlineSearchOpen&&activePane==="left"&&<InlineSearch key="left" index={textIndex} revision={documentRevision} source={sourceViews.left} onJump={(id,query)=>jumpToMatch("left",id,query)} onClose={()=>{setInlineSearchOpen(false);clearSearchHighlight();}}/>}
              {currentFile ? (
                 <NoteEditor key={currentFile} editor={editor} onChange={onEditorChange} readOnly={isReadMode} busy={isNoteBusy} showDialog={showDialog}
                   source={printing?null:sourceViews.left} onSourceChange={text => changeSource("left", text)} />
              ) : (<div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>选择或新建一个笔记</div>)}
            </div>
            </div>

            {/* 分屏分割线 + 右侧编辑器 */}
            {isSplitMode && <>
              <div onMouseDown={(e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startRatio = splitRatio;
                const container = e.currentTarget.parentElement;
                const onMove = (ev: MouseEvent) => {
                  if (!container) return;
                  const w = container.offsetWidth;
                  const newRatio = Math.max(0.2, Math.min(0.8, startRatio + (ev.clientX - startX) / w));
                  setSplitRatio(newRatio);
                };
                const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
                style={{ width: "4px", cursor: "col-resize", background: "#e8eaed", flexShrink: 0, transition: "background 0.15s" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#1677ff"}
                onMouseLeave={(e) => e.currentTarget.style.background = "#e8eaed"} />
              <div className="editor-column" data-active={activePane==="right"} style={{ display: "flex", flexDirection: "column", flex: `${(1-splitRatio)*100}%`, minWidth: 0 }}>
                {rightFile && (
                  <div className="no-print" style={{ padding: "4px 12px", fontSize: "11px", color: "#1677ff", fontWeight: 600, background: "#f0f5ff", borderBottom: "1px solid #d6e4ff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>
                    📄 {rightFile.split("/").pop()}{rightDirty ? " ● 未保存" : ""}
                  </div>
                )}
                <div style={{
                  flex: 1, overflow: "auto",
                  padding: "16px 24px",
                  paddingBottom: "30vh"
                }} className={"note-body "+(activePane==="right"?"active-pane":"")} data-editor-pane="right" onFocusCapture={()=>setActivePane("right")} onPointerDownCapture={()=>setActivePane("right")} onScroll={e=>rememberScroll("right",e.currentTarget)} inert={isNoteBusy||!workspaceReady} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) void saveRightNote(); }}>
                {inlineSearchOpen&&activePane==="right"&&<InlineSearch key="right" index={rightTextIndex} revision={documentRevision} source={sourceViews.right} onJump={(id,query)=>jumpToMatch("right",id,query)} onClose={()=>{setInlineSearchOpen(false);clearSearchHighlight();}}/>}
                {rightFile ? (
                  <NoteEditor key={'r'+rightFile} editor={editor2} onChange={onRightEditorChange} readOnly={isReadMode} busy={isNoteBusy} showDialog={showDialog}
                    source={printing?null:sourceViews.right} onSourceChange={text => changeSource("right", text)} />
                ) : (
                  <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#999", gap: "12px" }}>
                    <div style={{ fontSize: "32px" }}>📄</div>
                    <div style={{ fontSize: "14px" }}>Ctrl+点击侧边栏笔记，在右侧打开</div>
                    <div style={{ fontSize: "12px", color: "#ccc" }}>或右键菜单选择「在右侧打开」</div>
                  </div>
                )}
                </div>
              </div>
            </>}
          </div>
        </div>
      </div>
      {ctxMenu && (
        <div className="no-print" style={{ position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 2147483646, background: "white", borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.15)", border: "1px solid #f0f0f0", minWidth: "160px", padding: "4px" }}
          onClick={(e) => e.stopPropagation()}>
          {!ctxMenu.node.is_dir && [
            { label: "📋 详细信息", action: () => handleShowInfo(ctxMenu.node) },
            { label: "⭐ " + (favPaths.has(ctxMenu.node.path)?"取消收藏":"收藏"), action: () => toggleFav(ctxMenu.node.path) },
            ...(isSplitMode ? [{ label: "📂 在右侧打开", action: () => { loadRightNote(ctxMenu.node.path); setCtxMenu(null); } }] : []),
          ].map(item => (
            <div key={item.label} onClick={item.action}
              style={{ padding: "8px 12px", fontSize: "13px", cursor: "pointer", borderRadius: "4px", color: "#333" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#f5f5f5"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>{item.label}</div>
          ))}
          {[
            { label: "✏️ 重命名", action: () => { setCtxMenu(null); handleRename({stopPropagation:()=>{}} as any, ctxMenu.node); } },
            { label: "➜ 移动到...", action: () => { setCtxMenu(null); handleMove({stopPropagation:()=>{}} as any, ctxMenu.node); } },
          ].map(item => (
            <div key={item.label} onClick={item.action}
              style={{ padding: "8px 12px", fontSize: "13px", cursor: "pointer", borderRadius: "4px", color: "#333" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#f5f5f5"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>{item.label}</div>
          ))}
          <div style={{ height: "1px", background: "#f0f0f0", margin: "2px 0" }} />
          <div onClick={() => { setCtxMenu(null); handleDelete({stopPropagation:()=>{}} as any, ctxMenu.node.path, ctxMenu.node.is_dir); }}
            style={{ padding: "8px 12px", fontSize: "13px", cursor: "pointer", borderRadius: "4px", color: "#ff4d4f" }}
            onMouseEnter={(e) => e.currentTarget.style.background = "#fff1f0"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>🗑️ 删除</div>
        </div>
      )}

      {/* Toast notifications */}
      <div className="no-print" style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 2147483647, display: "flex", flexDirection: "column", gap: "8px", pointerEvents: "none" }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding: "10px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 500, pointerEvents: "auto",
            color: "#fff", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", animation: "toastIn 0.2s ease",
            background: t.type === 'error' ? '#ff4d4f' : t.type === 'success' ? '#52c41a' : '#1890ff'
          }}>{t.msg}</div>
        ))}
      </div>

      {/* Shortcut panel (?) */}
      {shortcutPanel && (
        <div className="no-print" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 2147483647 }} onClick={() => setShortcutPanel(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "white", width: "480px", borderRadius: "14px", boxShadow: "0 24px 48px rgba(0,0,0,0.18)", padding: "28px 32px" }}>
            <h3 style={{ margin: "0 0 20px 0", fontSize: "16px" }}>⌨️ 快捷键</h3>
            {[
              ["Ctrl+S", "保存两栏笔记"],
              ["Ctrl+K", "聚焦侧边栏搜索"],
              ["Ctrl+F", "笔记内搜索定位"],
              ["Ctrl+Shift+F", "全局搜索替换"],
              ["Ctrl+Shift+D", "纯净模式"],
              ["Ctrl+Z / Ctrl+Shift+Z", "撤销 / 重做"],
              ["Esc", "关闭当前面板 / 弹窗"],
              ["?", "显示此快捷键面板"],
            ].map(([key, desc]) => (
              <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f5f5f5", fontSize: "13px" }}>
                <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#1890ff", fontSize: "12px" }}>{key}</span>
                <span style={{ color: "#666" }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
