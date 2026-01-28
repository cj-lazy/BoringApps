import "@blocknote/core/fonts/inter.css";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";

import katex from "katex";
import "katex/dist/katex.min.css"; 
import { BlockNoteSchema, defaultBlockSpecs, defaultProps } from "@blocknote/core";
import { createReactBlockSpec, getDefaultReactSlashMenuItems, SuggestionMenuController } from "@blocknote/react";

// === 🌈 语法高亮 ===
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vs } from 'react-syntax-highlighter/dist/esm/styles/prism';

// === 🛠️ 辅助工具 ===
const filterSuggestionItems = (items: any[], query: string) => {
  return items.filter((item) => 
    item.title.toLowerCase().includes(query.toLowerCase()) || 
    (item.aliases && item.aliases.some((alias: string) => alias.toLowerCase().includes(query.toLowerCase())))
  );
};


// 💻 自定义 Code 代码块 (UI 2.0 锁定版)


const codeBlockSchema = {
  type: "codeBlock" as const,
  propSchema: {
    ...defaultProps,
    text: { default: "" },      
    language: { default: "cpp" },
  },
  content: "none" as const, 
};

const CodeBlock = createReactBlockSpec(codeBlockSchema, {
  render: ({ block, editor }) => {
    const [isEditing, setIsEditing] = useState(false);
    
    // 初始化解码
    const [code, setCode] = useState(() => {
        try { return decodeURIComponent(block.props.text); } 
        catch { return block.props.text; }
    });
    
    const [lang, setLang] = useState(block.props.language);
    const [copyStatus, setCopyStatus] = useState("复制");
    const [isExpanded, setIsExpanded] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // 数据同步
    useEffect(() => {
        try {
            const decoded = decodeURIComponent(block.props.text);
            if (decoded !== code) setCode(decoded);
        } catch {
            if (block.props.text !== code) setCode(block.props.text);
        }
        if (block.props.language !== lang) setLang(block.props.language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [block.props.text, block.props.language]);

    // 自动聚焦
    useEffect(() => {
      if (isEditing && textareaRef.current) {
        textareaRef.current.focus();
      }
    }, [isEditing]);

    const handleSave = () => {
      editor.updateBlock(block, { 
          props: { ...block.props, text: encodeURIComponent(code), language: lang } 
      });
      setIsEditing(false);
    };

    const handleCopy = (e: React.MouseEvent) => {
      e.preventDefault(); e.stopPropagation();
      navigator.clipboard.writeText(code);
      setCopyStatus("已复制");
      setTimeout(() => setCopyStatus("复制"), 2000);
    };

    const toggleExpand = (e: React.MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        setIsExpanded(!isExpanded);
    };

    const languages = [
        { value: "cpp", label: "C++" }, { value: "javascript", label: "JavaScript" }, { value: "typescript", label: "TypeScript" },
        { value: "python", label: "Python" }, { value: "java", label: "Java" }, { value: "go", label: "Go" }, { value: "rust", label: "Rust" },
        { value: "html", label: "HTML" }, { value: "css", label: "CSS" }, { value: "sql", label: "SQL" }, { value: "bash", label: "Bash" },
        { value: "json", label: "JSON" }, { value: "markdown", label: "Markdown" }
    ];

    // UI 2.0 样式
    const containerBg = "#ffffff";
    const headerBg = "#f5f6f7";    
    const borderColor = "#dee0e3"; 
    const codeFontFamily = 'Menlo, Monaco, "Courier New", monospace';
    const paddingVal = "12px";

    const containerStyle = {
        height: (isExpanded) ? "auto" : "300px", 
        minHeight: "100px", 
    };

    const headerBtnStyle = {
        background: "transparent", border: "none", cursor: "pointer", 
        color: "#646a73", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px",
        padding: "4px 6px", borderRadius: "4px", transition: "background 0.2s"
    };

    const Divider = () => <span style={{ color: "#dee0e3", margin: "0 6px" }}>|</span>;

    return (
      <div style={{
          margin: "15px 0", 
          borderRadius: "6px", 
          border: `1px solid ${borderColor}`,
          backgroundColor: containerBg, 
          boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
          fontFamily: codeFontFamily,
          resize: "both",  
          overflow: "hidden", 
          width: "100%", 
          maxWidth: "100%",
          display: "flex", 
          flexDirection: "column",
          position: "relative",
          ...containerStyle
      }} onDoubleClick={(e) => e.stopPropagation()}>

        {/* 顶部栏 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 12px", height: "34px", backgroundColor: headerBg, borderBottom: `1px solid ${borderColor}`, userSelect: "none", fontSize: "12px", color: "#646a73", flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', cursor: "pointer" }} onClick={toggleExpand}>
             <span style={{ marginRight: '6px', fontSize: "12px", transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s" }}>▼</span>
             <span style={{ fontWeight: 600, color: "#333", fontFamily: "sans-serif" }}>代码块</span>
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
             <select value={lang} onChange={(e) => { const newLang = e.target.value; setLang(newLang); editor.updateBlock(block, { props: { ...block.props, language: newLang } }); }} onClick={(e) => e.stopPropagation()} style={{ background: "transparent", border: "none", outline: "none", color: "#646a73", cursor: "pointer", fontWeight: 500, fontSize: "12px", fontFamily: "sans-serif", textAlign: "left" }}>
              {languages.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
            <Divider />
            <button onClick={handleCopy} style={headerBtnStyle}><span>📄</span> <span style={{fontFamily: "sans-serif"}}>{copyStatus}</span></button>
          </div>
        </div>

        {/* 内容区域 */}
        <div style={{ position: "relative", flex: 1, backgroundColor: "#ffffff", cursor: isEditing ? "text" : "default", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {isEditing ? (
            <textarea ref={textareaRef} value={code} onChange={(e) => setCode(e.target.value)} onBlur={handleSave}
              onKeyDown={(e) => {
                if (e.key === 'Tab') { e.preventDefault(); const start = e.currentTarget.selectionStart; const end = e.currentTarget.selectionEnd; const val = e.currentTarget.value; e.currentTarget.value = val.substring(0, start) + "  " + val.substring(end); e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 2; setCode(e.currentTarget.value); }
                if (e.key === 'Escape') handleSave();
              }}
              spellCheck={false}
              style={{ flex: 1, height: "100%", width: "100%", padding: paddingVal, fontFamily: codeFontFamily, fontSize: "13px", lineHeight: "1.5", border: "none", outline: "none", backgroundColor: "#ffffff", color: "#333", resize: "none", whiteSpace: "pre", display: "block", overflow: "auto" }}
            />
          ) : (
            <div onClick={() => setIsEditing(true)} style={{ flex: 1, height: "100%", width: "100%", backgroundColor: "#ffffff", cursor: "text", overflow: "auto" }}>
              <SyntaxHighlighter 
                language={block.props.language} 
                style={vs} 
                PreTag="div"
                customStyle={{ margin: 0, padding: paddingVal, backgroundColor: "transparent", fontFamily: codeFontFamily, fontSize: "13px", lineHeight: "1.5", overflow: "visible", height: "100%", boxSizing: "border-box" }} 
                codeTagProps={{ style: { fontFamily: codeFontFamily, backgroundColor: "transparent" } }} 
                showLineNumbers={true} 
                lineNumberStyle={{ minWidth: "2.5em", paddingRight: "1em", color: "#ccc", textAlign: "right", borderRight: `1px solid #eee`, marginRight: "1em", fontFamily: "Consolas, monospace", fontSize: "12px", lineHeight: "1.5" }}
              >
                {code || " "} 
              </SyntaxHighlighter>
              {!code && <div style={{position:"absolute", top: 12, left: 60, color: "#ccc", pointerEvents:"none", fontFamily:"sans-serif", fontSize:"13px"}}>点击输入代码...</div>}
            </div>
          )}
          {!isExpanded && !isEditing && (
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "60px", background: "linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,1))", pointerEvents: "none", display: "flex", justifyContent: "center", alignItems: "flex-end", paddingBottom: "10px" }}>
                  <div onClick={toggleExpand} style={{pointerEvents:"auto", cursor:"pointer", color:"#3370ff", fontSize:"12px", background:"white", padding:"2px 10px", borderRadius:"12px", border:"1px solid #dee0e3", boxShadow:"0 2px 4px rgba(0,0,0,0.05)"}}>展开更多 ▼</div>
              </div>
          )}
        </div>
      </div>
    );
  }
});

// === 📐 LaTeX ===
const latexBlockSchema = { type: "latex" as const, propSchema: { ...defaultProps, text: { default: "" } }, content: "none" as const };
const LatexBlock = createReactBlockSpec(latexBlockSchema, {
    render: ({ block, editor }) => {
      const divRef = useRef<HTMLDivElement>(null);
      const [isEditing, setIsEditing] = useState(false);
      const [inputValue, setInputValue] = useState(() => { try { return decodeURIComponent(block.props.text); } catch { return block.props.text; } });
      const textAreaRef = useRef<HTMLTextAreaElement>(null);
      useEffect(() => { try { const decoded = decodeURIComponent(block.props.text); if (decoded !== inputValue) setInputValue(decoded); } catch { if (block.props.text !== inputValue) setInputValue(block.props.text); } }, [block.props.text]);
      useEffect(() => { if (isEditing && textAreaRef.current) textAreaRef.current.focus(); }, [isEditing]);
      useEffect(() => { 
          if (!isEditing && divRef.current) { 
              if (!inputValue) {
                  divRef.current.innerText = "点击输入 LaTeX 公式...";
                  divRef.current.style.color = "#ccc";
              } else {
                  try { 
                      katex.render(inputValue, divRef.current, { throwOnError: false, displayMode: true, output: "html" }); 
                      divRef.current.style.color = "inherit";
                  } catch (e) { divRef.current.innerText = "⚠️ 公式错误"; }
              }
          } 
      }, [inputValue, isEditing]);
      const handleSave = () => { editor.updateBlock(block, { props: { ...block.props, text: encodeURIComponent(inputValue) } }); setIsEditing(false); };
      return ( <div style={{ padding: "10px", margin: "5px 0", userSelect: "none" }}> {isEditing ? ( <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}> <textarea ref={textAreaRef} value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSave(); } if (e.key === "Escape") { setIsEditing(false); setInputValue(block.props.text); } }} onBlur={handleSave} placeholder="输入 LaTeX 公式..." style={{ width: "100%", minHeight: "80px", padding: "10px", fontFamily: "Consolas, Monaco, monospace", fontSize: "14px", borderRadius: "6px", border: "2px solid #1890ff", outline: "none", resize: "vertical", backgroundColor: "#f9f9f9" }} /> <div style={{fontSize: "12px", color: "#888"}}>按 Enter 保存</div> </div> ) : ( <div ref={divRef} onClick={() => setIsEditing(true)} style={{ minHeight: "40px", cursor: "pointer", padding: "10px", borderRadius: "6px", textAlign: "center" }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.03)"} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"} title="点击编辑公式" /> )} </div> );
    },
});

const schema = BlockNoteSchema.create({ blockSpecs: { ...defaultBlockSpecs, latex: LatexBlock(), codeBlock: CodeBlock() } });

// === 🎨 弹窗组件 ===
interface FileNode { name: string; path: string; is_dir: boolean; children: FileNode[]; }
interface TrashItem { name: string; is_dir: boolean; path: string; }
interface DialogProps { isOpen: boolean; type: 'confirm' | 'prompt' | 'tree-select' | 'settings' | 'alert' | 'save-guard' | 'trash'; title: string; message?: string; defaultValue?: string; treeData?: FileNode[]; disabledPath?: string; trashItems?: TrashItem[]; bgImage?: string | null; bgOpacity?: number; bgBlur?: number; onSetBgImage?: (file: File) => void; onSetBgOpacity?: (val: number) => void; onSetBgBlur?: (val: number) => void; onClearBg?: () => void; onEmptyTrash?: () => void; onRestore?: (name: string) => void; onDeleteForever?: (name: string) => void; onConfirm: (value: any) => void; onCancel: () => void; }
const CustomDialog = (props: DialogProps) => {
  const { isOpen, type, title, message, defaultValue, treeData, disabledPath, trashItems, bgImage, bgOpacity, bgBlur, onConfirm, onCancel, onEmptyTrash, onRestore, onDeleteForever } = props;
  const [inputValue, setInputValue] = useState(defaultValue || "");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  useEffect(() => { if (isOpen) { setInputValue(defaultValue || ""); setExpandedPaths(new Set()); } }, [isOpen, defaultValue]);
  if (!isOpen) return null;
  const renderDialogTree = (nodes: FileNode[], depth = 0) => { return nodes.map(node => { if (!node.is_dir) return null; const isDisabled = disabledPath && (node.path === disabledPath || node.path.startsWith(disabledPath + "/")); const isExpanded = expandedPaths.has(node.path); const isSelected = inputValue === node.path; return ( <div key={node.path}> <div style={{ padding: "6px 8px", paddingLeft: `${depth * 18 + 8}px`, cursor: isDisabled ? "not-allowed" : "pointer", background: isSelected ? "#e6f7ff" : "transparent", color: isDisabled ? "#ccc" : (isSelected ? "#1890ff" : "#333"), borderRadius: "4px", display: "flex", alignItems: "center", marginBottom: "1px", fontSize: "13px" }} onClick={() => { if (isDisabled) return; setInputValue(node.path); }}> <span style={{ marginRight: "6px", width: "12px", display: "inline-block", textAlign: "center", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", cursor: "pointer", color: "#999" }} onClick={(e) => { e.stopPropagation(); const newSet = new Set(expandedPaths); if (newSet.has(node.path)) newSet.delete(node.path); else newSet.add(node.path); setExpandedPaths(newSet); }}>▶</span> <span style={{ marginRight: "4px" }}>{isExpanded ? "📂" : "📁"}</span><span>{node.name}</span> </div> {isExpanded && node.children && <div>{renderDialogTree(node.children, depth + 1)}</div>} </div> ); }); };
  return ( <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0, 0, 0, 0.4)", backdropFilter: "blur(2px)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 2147483647 }} onClick={onCancel}> <div onClick={(e) => e.stopPropagation()} style={{ background: "white", width: (type === 'settings' || type === 'trash') ? "500px" : "350px", borderRadius: "12px", boxShadow: "0 10px 25px rgba(0,0,0,0.1)", padding: "24px", display:"flex", flexDirection:"column", maxHeight:"85vh", animation: "popIn 0.2s ease" }}> <h3 style={{ margin: "0 0 10px 0", fontSize: "18px", color: "#333", borderBottom: "1px solid #eee", paddingBottom: "10px", display:"flex", justifyContent:"space-between" }}> {title} {type === 'trash' && <button onClick={onEmptyTrash} style={{fontSize:"12px", color:"#ff4d4f", background:"transparent", border:"none", cursor:"pointer"}}>🗑️ 清空所有</button>} </h3> {message && <p style={{ margin: "0 0 20px 0", fontSize: "14px", color: "#666", lineHeight: "1.5" }}>{message}</p>} {type === 'trash' && ( <div style={{ flex: 1, overflowY: "auto", minHeight: "300px", border: "1px solid #f0f0f0", borderRadius: "6px", padding: "5px" }}> {trashItems && trashItems.length > 0 ? ( trashItems.map(item => ( <div key={item.path} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px", borderBottom:"1px solid #f9f9f9", fontSize:"13px" }}> <div style={{ display:"flex", alignItems:"center", overflow:"hidden" }}> <span style={{ marginRight:"6px" }}>{item.is_dir ? "📂" : "📄"}</span> <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"250px" }} title={item.name}>{item.name}</span> </div> <div style={{ display:"flex", gap:"8px" }}> <button onClick={() => onRestore && onRestore(item.path)} style={{ color:"#1890ff", background:"transparent", border:"none", cursor:"pointer", fontSize:"12px" }}>还原</button> <button onClick={() => onDeleteForever && onDeleteForever(item.path)} style={{ color:"#999", background:"transparent", border:"none", cursor:"pointer", fontSize:"12px" }}>❌</button> </div> </div> )) ) : (<div style={{ padding:"20px", textAlign:"center", color:"#ccc", fontSize:"13px" }}>回收站是空的</div>)} </div> )} {type === 'settings' && ( <div style={{ display: "flex", flexDirection: "column", gap: "20px", marginBottom: "20px" }}> <div> <label style={{ display:"block", fontSize:"13px", fontWeight:"bold", marginBottom:"8px", color:"#555" }}>自定义背景图</label> <div style={{ display: "flex", gap: "10px", alignItems: "center" }}> {bgImage ? (<div style={{ width: "60px", height: "40px", borderRadius: "4px", background: `url(${convertFileSrc(bgImage)}) center/cover`, border: "1px solid #ddd" }}></div>) : (<div style={{ width: "60px", height: "40px", borderRadius: "4px", background: "#f0f0f0", border: "1px dashed #ccc", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"10px", color:"#999" }}>无</div>)} <input type="file" accept="image/*" id="bg-upload" style={{ display: "none" }} onChange={(e) => { if (e.target.files && e.target.files[0] && props.onSetBgImage) props.onSetBgImage(e.target.files[0]); }} /> <button onClick={() => document.getElementById('bg-upload')?.click()} style={{ padding: "6px 12px", border: "1px solid #ddd", background: "white", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>选择图片...</button> {bgImage && <button onClick={props.onClearBg} style={{ padding: "6px 12px", border: "none", background: "#ff4d4f", color: "white", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>清除</button>} </div> </div> <div><label style={{ fontSize:"13px", fontWeight:"bold", color:"#555" }}>白纸浓度: {Math.round((bgOpacity || 0.5) * 100)}%</label><input type="range" min="0.05" max="1" step="0.05" value={bgOpacity} onChange={(e) => props.onSetBgOpacity && props.onSetBgOpacity(parseFloat(e.target.value))} style={{ width: "100%", accentColor: "#1890ff" }} /></div> <div><label style={{ fontSize:"13px", fontWeight:"bold", color:"#555" }}>毛玻璃模糊: {bgBlur} px</label><input type="range" min="0" max="20" step="1" value={bgBlur} onChange={(e) => props.onSetBgBlur && props.onSetBgBlur(parseInt(e.target.value))} style={{ width: "100%", accentColor: "#1890ff" }} /></div> </div> )} {type === 'prompt' && <input autoFocus type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter') onConfirm(inputValue); }} style={{ width: "100%", padding: "10px", marginBottom: "20px", borderRadius: "6px", border: "1px solid #ddd", fontSize: "14px", outline: "none", boxSizing: "border-box" }} />} {type === 'tree-select' && treeData && (<div style={{ flex: 1, overflowY: "auto", border: "1px solid #eee", borderRadius: "6px", padding: "5px", marginBottom: "20px", minHeight: "200px" }}>{renderDialogTree(treeData)}</div>)} <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}> {type !== 'trash' && <button onClick={onCancel} style={{ padding: "8px 16px", border: "1px solid #ddd", borderRadius: "6px", background: "white", color: "#666", cursor: "pointer", fontSize: "14px" }}>取消</button>} <button onClick={() => onConfirm(type === 'prompt' || type === 'tree-select' ? inputValue : true)} style={{ padding: "8px 16px", border: "none", borderRadius: "6px", background: "#1890ff", color: "white", cursor: "pointer", fontSize: "14px", fontWeight: "500" }}>{type === 'trash' ? "关闭" : "确定"}</button> </div> </div> <style>{`@keyframes popIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style> </div> );
};

// 📦 主程序逻辑

function App() {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isResizing, setIsResizing] = useState(false);
  const [status, setStatus] = useState("就绪");
  
  const isDirtyRef = useRef(false);
  const isLoadingRef = useRef(false);
  const isExitingRef = useRef(false);
  const [initialAssetUrls, setInitialAssetUrls] = useState<Set<string>>(new Set()); 

  const currentFileRef = useRef<string | null>(null);
  useEffect(() => { currentFileRef.current = currentFile; }, [currentFile]);

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

  const getAllAssetUrls = (blocks: any[]): Set<string> => {
    const urls = new Set<string>();
    blocks.forEach((block: any) => {
      if (block.props && block.props.url) urls.add(block.props.url);
      if (block.children) getAllAssetUrls(block.children).forEach(u => urls.add(u));
    });
    return urls;
  };

  const uploadFile = async (file: File) => {
    if (!currentFileRef.current) { await showDialog('alert', '提示', { message: '请先在侧边栏选中一个笔记。' }); return ""; }
    try {
      setStatus("上传中...");
      const filename = `${new Date().getTime()}_${file.name}`;
      const payload = Array.from(new Uint8Array(await file.arrayBuffer()));
      const path = await invoke<string>("save_image", { fileName: filename, payload, notePath: currentFileRef.current });
      const assetUrl = convertFileSrc(path);
      setInitialAssetUrls(prev => new Set([...prev, assetUrl]));
      setStatus("文件已保存");
      return assetUrl;
    } catch (e) { console.error(e); await showDialog('alert', '上传失败', { message: `错误: ${e}` }); return ""; }
  };
  
  const onEditorChange = () => { 
      if (isExitingRef.current || isLoadingRef.current || !currentFileRef.current) return; 
      if (!isDirtyRef.current) { 
          isDirtyRef.current = true; 
          setStatus("● 未保存"); 
      } 
  };

  const editor = useCreateBlockNote({ 
      schema, 
      uploadFile,
  });

  const refreshTree = async () => { try { const tree = await invoke<FileNode[]>("get_file_tree"); setFileTree(tree); } catch (e) { console.error(e); } };

  const toggleFolder = (path: string) => { const newSet = new Set(expandedFolders); if (newSet.has(path)) newSet.delete(path); else newSet.add(path); setExpandedFolders(newSet); };
  const handleSelect = (node: FileNode) => { 
    if (node.is_dir) { toggleFolder(node.path); setSelectedFolder(node.path); } 
    else { loadNote(node.path); const parentPath = node.path.includes("/") ? node.path.substring(0, node.path.lastIndexOf("/")) : null; setSelectedFolder(parentPath); } 
  };
  const handleBackgroundClick = (e: React.MouseEvent) => { if (e.target === e.currentTarget) setSelectedFolder(null); };

  const saveCurrentNote = async () => {
    const fileToSave = currentFileRef.current;
    if (!fileToSave) return;
    setStatus("正在保存...");
    try {
      const currentBlocks = editor.document;
      const currentAssetUrls = getAllAssetUrls(currentBlocks);
      const deletedUrls = Array.from(initialAssetUrls).filter(url => !currentAssetUrls.has(url));
      for (const url of deletedUrls) { try { await invoke("delete_asset", { url }); } catch (err) { console.error(err); } }

      let finalMarkdown = "";
      let standardBlockBuffer: typeof currentBlocks = [];
      for (const block of currentBlocks) {
        if (block.type === "latex") {
            if (standardBlockBuffer.length > 0) { finalMarkdown += await editor.blocksToMarkdownLossy(standardBlockBuffer); standardBlockBuffer = []; }
            let decodedLatex = "";
            try { decodedLatex = decodeURIComponent(block.props.text); } catch { decodedLatex = block.props.text; }
            finalMarkdown += `\n$$\n${decodedLatex}\n$$\n`;
        } 
        else if (block.type === "codeBlock") {
            if (standardBlockBuffer.length > 0) { finalMarkdown += await editor.blocksToMarkdownLossy(standardBlockBuffer); standardBlockBuffer = []; }
            
            // 🔥 保存修复：解码回纯文本，确保 Markdown 可读
            let textToSave = "";
            try { textToSave = decodeURIComponent(block.props.text); } catch { textToSave = block.props.text; }
            
            finalMarkdown += `\n\`\`\`${block.props.language}\n${textToSave}\n\`\`\`\n`;
        }
        else { standardBlockBuffer.push(block); }
      }
      if (standardBlockBuffer.length > 0) finalMarkdown += await editor.blocksToMarkdownLossy(standardBlockBuffer);

      await invoke("save_note", { path: fileToSave, content: finalMarkdown });
      setInitialAssetUrls(currentAssetUrls);
      isDirtyRef.current = false; setStatus("已保存");
    } catch(e) { setStatus("保存失败"); console.error(e); }
  };

  // 🔥 核心逻辑：使用 @@CODE_BLOCK_ID_0@@ 这种无格式文本占位符，避免被 Markdown Parser 解析成加粗
  const loadNote = async (path: string) => { 
    if (isDirtyRef.current) { await saveCurrentNote(); }
    setStatus(`加载 ${path}...`); isLoadingRef.current = true; 
    try { 
      let content = await invoke<string>("load_note", { path }); 
      
      const codeBlockMap = new Map();
      let blockIdCounter = 0;

      // 1. 替换代码块为无格式 Token: @@CODE_BLOCK_ID_0@@
      // 这里的正则要足够强壮，匹配各种换行情况
      content = content.replace(/```(\S*)\s*\n([\s\S]*?)```/g, (_match, lang, code) => {
          const id = `@@CODE_BLOCK_ID_${blockIdCounter++}@@`;
          codeBlockMap.set(id, { kind: "code", lang: lang || "text", code: code.trim() });
          return id; 
      });

      // 2. 替换公式
      content = content.replace(/\$\$\n([\s\S]*?)\n\$\$/g, (_match, formula) => {
          const id = `@@LATEX_ID_${blockIdCounter++}@@`;
          codeBlockMap.set(id, { kind: "latex", code: formula.trim() });
          return id;
      });

      // 3. 解析 (此时 ID 不会被 Markdown 解析器弄脏，因为没有 __ 或 **)
      const rawBlocks = await editor.tryParseMarkdownToBlocks(content); 
      
      // 4. 遍历还原
      const processedBlocks = rawBlocks.map((block: any) => {
          // 检查 paragraph 是否就是那个 Token
          if (block.type === "paragraph" && block.content && block.content.length === 1 && block.content[0].text) {
              const text = block.content[0].text.trim();
              if (codeBlockMap.has(text)) {
                  const data = codeBlockMap.get(text);
                  if (data.kind === "latex") {
                      return {
                          type: "latex",
                          props: { text: encodeURIComponent(data.code) },
                          content: []
                  };
                  } else {
                      return {
                          type: "codeBlock",
                          props: {
                              text: encodeURIComponent(data.code),
                              language: data.lang
                          },
                          content: []
                      };
                  }
              }
          }
          return block;
      });

      editor.replaceBlocks(editor.document, processedBlocks.length === 0 ? [{ type: "paragraph", content: [] }] : processedBlocks); 
      setInitialAssetUrls(getAllAssetUrls(processedBlocks));
      setCurrentFile(path); isDirtyRef.current = false; setStatus("已加载"); 
    } catch (e) { console.error(e); setStatus("加载失败"); } 
    finally { setTimeout(() => { isLoadingRef.current = false; }, 300); }
  };

  useEffect(() => { const handleKeyDown = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveCurrentNote(); } }; window.addEventListener("keydown", handleKeyDown); return () => window.removeEventListener("keydown", handleKeyDown); }, [editor, initialAssetUrls]);
  const silentGC = async () => { try { await invoke("gc_unused_assets"); } catch (e) { console.warn(e); } };
  useEffect(() => { refreshTree(); silentGC(); }, []);

  const filterNodes = (nodes: FileNode[], term: string): FileNode[] => { 
    if (!term) return nodes; 
    return nodes.map(node => { 
      if (node.is_dir) { const children = filterNodes(node.children, term); if (children.length > 0 || node.name.toLowerCase().includes(term.toLowerCase())) return { ...node, children }; return null; } 
      return node.name.toLowerCase().includes(term.toLowerCase()) ? node : null; 
    }).filter(Boolean) as FileNode[]; 
  };
  const displayedTree = useMemo(() => filterNodes(fileTree, searchTerm), [fileTree, searchTerm]);
  const startResizing = useCallback(() => setIsResizing(true), []);
  const resize = useCallback((e: MouseEvent) => { if (isResizing) setSidebarWidth(Math.max(150, Math.min(e.clientX, 600))); }, [isResizing]);
  useEffect(() => { window.addEventListener("mousemove", resize); window.addEventListener("mouseup", () => setIsResizing(false)); return () => { window.removeEventListener("mousemove", resize); window.removeEventListener("mouseup", () => setIsResizing(false)); }; }, [resize]);

  const handleMove = async (e: React.MouseEvent, node: FileNode) => { e.stopPropagation(); const currentParent = node.path.includes("/") ? node.path.substring(0, node.path.lastIndexOf("/")) : ""; const targetFolder = await showDialog('tree-select', '移动到...', { message: `选择 "${node.name}" 的新位置：`, defaultValue: currentParent, treeData: fileTree, disabledPath: node.is_dir ? node.path : undefined }); if (targetFolder === null || targetFolder === currentParent) return; const srcPath = node.path; const newPath = targetFolder ? `${targetFolder}/${node.name}` : node.name; try { await saveCurrentNote(); await invoke("rename_item", { oldPath: srcPath, newPath: newPath, isDir: node.is_dir }); await refreshTree(); if (currentFile === srcPath) setCurrentFile(newPath); } catch (err) { alert("移动失败: " + err); } };
  const handleDelete = async (e: React.MouseEvent, path: string, is_dir: boolean) => { e.stopPropagation(); const confirmed = await showDialog('confirm', `删除`, { message: `确认要将 "${path}" 放入回收站吗？` }); if (!confirmed) return; try { if (currentFile === path || (currentFile && currentFile.startsWith(path + "/"))) { setCurrentFile(null); isDirtyRef.current = false; editor.replaceBlocks(editor.document, []); setInitialAssetUrls(new Set()); } await invoke("delete_item", { path, isDir: is_dir }); await refreshTree(); } catch (err) { alert("删除失败: " + err); } };
  const handleRename = async (e: React.MouseEvent, node: FileNode) => { e.stopPropagation(); const newName = await showDialog('prompt', '重命名', { defaultValue: node.name }); if (!newName || newName === node.name) return; const parentDir = node.path.includes("/") ? node.path.substring(0, node.path.lastIndexOf("/")) : ""; const newPath = parentDir ? `${parentDir}/${newName}` : newName; try { await saveCurrentNote(); await invoke("rename_item", { oldPath: node.path, newPath: newPath, isDir: node.is_dir }); await refreshTree(); if (currentFile === node.path) setCurrentFile(newPath); } catch (err) { alert("重命名失败: " + err); } };
  const handleCreate = async (type: 'folder' | 'note') => { const name = await showDialog('prompt', type === 'folder' ? "新建文件夹" : "新建笔记", { message: "请输入名称：" }); if (!name) return; const basePath = selectedFolder ? `${selectedFolder}/${name}` : name; try { await saveCurrentNote(); if (type === 'folder') await invoke("create_folder", { path: basePath }); else { await invoke("create_note", { path: basePath }); await loadNote(basePath); } await refreshTree(); } catch (e) { alert("创建失败: " + e); } };
  const handleOpenSettings = () => showDialog('settings', '外观设置', { bgImage, bgOpacity, bgBlur, onSetBgImage: updateBgImage, onSetBgOpacity: (v: number) => { setBgOpacity(v); localStorage.setItem("app_bg_opacity", v.toString()); }, onSetBgBlur: (v: number) => { setBgBlur(v); localStorage.setItem("app_bg_blur", v.toString()); }, onClearBg: clearBg });

  const clearBg = async () => {
        if (bgImage) {
            try {
                await invoke("delete_asset", { url: bgImage });
            } catch (e) {
                console.error("Delete bg failed", e);
            }
        }
        setBgImage(null);
        localStorage.removeItem("app_bg_image");
  };
  const updateBgImage = async (file: File) => { try { const filename = `bg_${new Date().getTime()}_${file.name}`; const payload = Array.from(new Uint8Array(await file.arrayBuffer())); const path = await invoke<string>("save_image", { fileName: filename, payload, notePath: "wallpapers" }); setBgImage(path); localStorage.setItem("app_bg_image", path); } catch (e) { alert("壁纸设置失败: " + e); } };
  const handleOpenTrash = async () => { try { const items = await invoke<TrashItem[]>("get_trash_items"); await showDialog('trash', '回收站', { trashItems: items, onEmptyTrash: async () => { const confirmed = await showDialog('confirm', '清空回收站', { message: "确定清空回收站吗？此操作不可恢复。" }); if (confirmed) { await invoke("empty_trash"); } handleOpenTrash(); }, onRestore: async (path: string) => { await invoke("restore_trash_item", { fileName: path }); await refreshTree(); handleOpenTrash(); }, onDeleteForever: async (path: string) => { const confirmed = await showDialog('confirm', '永久删除', { message: `确定要永久删除 "${path}" 吗？此操作不可恢复。` }); if (confirmed) { await invoke("delete_trash_item", { fileName: path }); } handleOpenTrash(); } }); } catch(e) { alert("打开回收站失败: " + e); } };

  const renderTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map(node => {
      const isExpanded = expandedFolders.has(node.path) || searchTerm.length > 0;
      const isSelected = selectedFolder === node.path;
      return (
        <div key={node.path}>
          <div onClick={() => handleSelect(node)} style={{ padding: "6px 10px", paddingLeft: `${depth * 15 + 10}px`, cursor: "pointer", background: (currentFile === node.path) ? "#e6f7ff" : (isSelected && node.is_dir ? "#f0f0f0" : "transparent"), color: currentFile === node.path ? "#1890ff" : "#333", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "14px", borderRadius: "4px", marginBottom: "2px", userSelect: "none" }}>
            <div style={{ display: "flex", alignItems: "center", overflow: "hidden", flex: 1 }}>
              <span style={{ marginRight: "4px", fontSize: "10px", width: "14px", textAlign: "center", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.1s ease", color: "#999", visibility: node.is_dir ? "visible" : "hidden" }} onClick={(e) => { e.stopPropagation(); if (node.is_dir) toggleFolder(node.path); }}>▶</span>
              <span style={{ marginRight: "6px", fontSize: "16px" }}>{node.is_dir ? (isExpanded ? "📂" : "📁") : "📄"}</span>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{node.name}</span>
            </div>
            <div style={{ display: "flex", gap: "2px" }}>
              <button onClick={(e) => handleMove(e, node)} title="移动" style={{ border:"none", background:"transparent", cursor:"pointer", opacity:0.4 }}>➜</button>
              <button onClick={(e) => handleRename(e, node)} title="重命名" style={{ border:"none", background:"transparent", cursor:"pointer", opacity:0.4 }}>✏️</button>
              <button onClick={(e) => handleDelete(e, node.path, node.is_dir)} title="删除" style={{ border:"none", background:"transparent", cursor:"pointer", opacity:0.4 }}>✕</button>
            </div>
          </div>
          {node.is_dir && isExpanded && (<div>{node.children && node.children.length > 0 ? renderTree(node.children, depth + 1) : <div style={{ paddingLeft: `${(depth + 1) * 15 + 30}px`, fontSize: "12px", color: "#ccc", padding: "4px 0" }}>(空)</div>}</div>)}
        </div>
      );
    });
  };

  return (
    <div style={{ height: "100vh", display: "flex", position: "relative" }}>
      {/* 🔥 全局样式: UI 2.0 风格  */}
      <style>{`
        button[aria-label*="Download"], button[title*="Download"], [class*="bn-file-block"] [role="button"]:has(svg path[d*="M13 10"]), [class*="bn-image-block"] [role="button"]:has(svg path[d*="M13 10"]), [class*="bn-video-block"] [role="button"]:has(svg path[d*="M13 10"]) { display: none !important; }
        .bn-block-content .bn-block-content { background: transparent !important; padding: 0 !important; }
        [data-content-type="codeBlock"] { background: transparent !important; box-shadow: none !important; }
        pre, code, [class*="language-"] { background: transparent !important; background-color: transparent !important; text-shadow: none !important; }
        .bn-block-content { max-width: 100% !important; }
      `}</style>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 0, backgroundImage: bgImage ? `url(${convertFileSrc(bgImage)})` : "none", backgroundSize: "cover", backgroundPosition: "center", backgroundColor: "#fff" }} />
      <CustomDialog {...dialogState} onConfirm={(val) => dialogState.resolve(val)} onCancel={() => dialogState.resolve(null)} bgImage={bgImage} bgOpacity={bgOpacity} bgBlur={bgBlur} onClearBg={clearBg} onSetBgImage={updateBgImage} onSetBgOpacity={(v) => { setBgOpacity(v); localStorage.setItem("app_bg_opacity", v.toString()); }} onSetBgBlur={(v) => { setBgBlur(v); localStorage.setItem("app_bg_blur", v.toString()); }} />
      
      <div onClick={handleBackgroundClick} style={{ width: isSidebarOpen ? sidebarWidth : 0, borderRight: isSidebarOpen ? "1px solid rgba(0,0,0,0.1)" : "none", background: `rgba(249, 249, 249, ${Math.max(0.6, bgOpacity - 0.1)})`, backdropFilter: `blur(${bgBlur}px)`, display: "flex", flexDirection: "column", overflow: "hidden", transition: isResizing ? "none" : "width 0.2s", zIndex: 1 }}>
        <div style={{ padding: "15px", fontWeight: "bold", borderBottom: "1px solid rgba(0,0,0,0.05)", whiteSpace:"nowrap", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span>🗂️ 无聊的产品线No.1</span>
          <button onClick={handleOpenSettings} title="设置" style={{ background:"transparent", border:"none", cursor:"pointer", fontSize:"16px", opacity: 0.6 }}>⚙️</button>
        </div>
        <div style={{ padding: "0 10px 10px 10px", borderBottom: "1px solid rgba(0,0,0,0.05)" }}><input type="text" placeholder="🔍 搜索..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid #ddd", fontSize: "12px", boxSizing: "border-box", background: "rgba(255,255,255,0.8)" }} /></div>
        <div style={{ flex: 1, overflow: "auto", padding: "10px 0" }} onClick={handleBackgroundClick}>{renderTree(displayedTree)}</div>
        <div style={{ padding: "10px 15px", cursor:"pointer", borderTop: "1px solid rgba(0,0,0,0.05)", fontSize:"13px", color:"#666", display:"flex", alignItems:"center", gap:"6px" }} onClick={handleOpenTrash}><span>🗑️ 回收站</span></div>
        <div style={{ padding: "10px", borderTop: "1px solid rgba(0,0,0,0.05)", background: "rgba(255,255,255,0.4)" }}>
          <div style={{ display: "flex", gap: "5px", marginBottom: "10px" }}>
            <button onClick={() => handleCreate('folder')} style={{ flex: 1, padding: "8px", border: "1px solid #ddd", background: "rgba(255,255,255,0.8)", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>+ 文件夹</button>
            <button onClick={() => handleCreate('note')} style={{ flex: 1, padding: "8px", border: "none", background: "#1890ff", color: "white", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>+ 笔记</button>
          </div>
        </div>
      </div>

      {isSidebarOpen && <div onMouseDown={startResizing} style={{ width: "4px", cursor: "col-resize", background: "transparent", zIndex: 10, marginLeft: "-2px" }} />}
      
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", zIndex: 1, position: "relative" }}>
        <div style={{ padding: "10px 20px", borderBottom: "1px solid rgba(0,0,0,0.05)", display: "flex", justifyContent: "space-between", background: `rgba(255, 255, 255, ${bgOpacity})`, backdropFilter: `blur(${bgBlur}px)` }}>
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{ border: "none", background: "transparent", cursor: "pointer" }}>{isSidebarOpen ? "◀" : "▶"}</button>
          <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
            <span style={{ fontSize: "12px", color: status === "● 未保存" ? "#faad14" : "#888", fontWeight: status === "● 未保存" ? "bold" : "normal" }}>{status}</span>
            <button onClick={saveCurrentNote} title="保存 (Ctrl+S)" style={{ padding: "4px 10px", border: "1px solid #ddd", background: "white", borderRadius: "4px", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center" }}>💾 保存</button>
          </div>
        </div>
        
        {/* 底部留白 */}
        <div style={{ flex: 1, overflow: "auto", padding: "40px 60px", paddingBottom: "50vh", background: `rgba(255, 255, 255, ${bgOpacity})`, backdropFilter: `blur(${bgBlur}px)` }}>
          {currentFile ? (
             <BlockNoteView key={currentFile} editor={editor} onChange={onEditorChange} theme="light" slashMenu={false}>
                <SuggestionMenuController triggerCharacter={"/"} getItems={async (query) => { 
                    const defaultItems = getDefaultReactSlashMenuItems(editor); 
                    const filteredDefaultItems = defaultItems.filter(i => i.title !== "Code Block");
                    const latexItem = { title: "公式 (Math)", onItemClick: () => { const currentBlock = editor.getTextCursorPosition().block; const latexBlock = { type: "latex" as const, props: { text: "" } }; if (editor.getTextCursorPosition().prevBlock) editor.insertBlocks([latexBlock as any], currentBlock, "after"); else editor.insertBlocks([latexBlock as any], currentBlock, "before"); }, aliases: ["latex", "math", "formula", "gs"], group: "Media", icon: <div style={{fontWeight: "bold", fontSize: "16px"}}>∑</div>, subtext: "插入数学公式" }; 
                    const codeItem = { title: "代码块 (Code)", onItemClick: () => { const currentBlock = editor.getTextCursorPosition().block; const codeBlock = { type: "codeBlock" as const, props: { text: "", language: "cpp" } }; if (editor.getTextCursorPosition().prevBlock) editor.insertBlocks([codeBlock as any], currentBlock, "after"); else editor.insertBlocks([codeBlock as any], currentBlock, "before"); }, aliases: ["code", "c", "js", "ts"], group: "Basic", icon: <div style={{fontWeight: "bold", fontSize: "16px"}}>{`</>`}</div>, subtext: "插入代码块" }; 
                    return filterSuggestionItems([...filteredDefaultItems, latexItem, codeItem], query); 
                }} />
             </BlockNoteView>
          ) : (<div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>选择或新建一个笔记</div>)}
        </div>
      </div>
    </div>
  );
}

export default App;