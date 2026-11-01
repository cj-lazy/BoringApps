import Icon from "./Icon";
interface Props {
  hasFile:boolean;busy:boolean;dirty:boolean;readMode:boolean;splitMode:boolean;sidebarOpen:boolean;tocOpen:boolean;sourceMode:boolean;
  wordCount:number;saveTime:string;draftTime:string;status:string;drafts:number;
  sidebar:()=>void;toc:()=>void;search:()=>void;undo:()=>void;redo:()=>void;read:()=>void;split:()=>void;focus:()=>void;save:()=>void;
  word:()=>void;pdf:()=>void;source:()=>void;history:()=>void;pack:()=>void;links:()=>void;recovery:()=>void;settings:()=>void;
}
export default function Toolbar(p:Props) {
  return <div className="no-print app-toolbar toolbar">
    <div className="toolbar-navigation">
      <button title="切换侧边栏" aria-label="切换侧边栏" onClick={p.sidebar}><Icon name={p.sidebarOpen?"left":"right"}/></button>
      {p.hasFile&&<button title={p.tocOpen?"收起大纲":"展开大纲"} className={p.tocOpen?"active":""} onClick={p.toc}><Icon name="book"/> 大纲</button>}
      <button title="全局搜索替换 (Ctrl+Shift+F)" onClick={p.search}><Icon name="search"/> 搜索替换</button>
    </div>
    <div className="toolbar-info muted">{p.hasFile?<><span>{p.wordCount} 字</span><span>{p.draftTime?"草稿已保护 "+p.draftTime:p.saveTime?"已保存 "+p.saveTime:""}</span></>:"选择或新建笔记开始编辑"}</div>
    {p.hasFile&&<div className="toolbar-actions">
      <span className={p.dirty?"dirty-status":""}>{["就绪","已加载","已保存"].includes(p.status)?"":p.status}</span>
      <button disabled={p.busy||p.sourceMode||p.readMode} title="撤销 (Ctrl+Z)" onClick={p.undo}><Icon name="undo"/></button>
      <button disabled={p.busy||p.sourceMode||p.readMode} title="重做 (Ctrl+Shift+Z)" onClick={p.redo}><Icon name="redo"/></button>
      <button title={p.readMode?"编辑模式":"阅读模式"} className={p.readMode?"active":""} onClick={p.read}><Icon name={p.readMode?"edit":"book"}/></button>
      <button title={p.splitMode?"退出双栏编辑":"双栏编辑"} className={p.splitMode?"active":""} onClick={p.split}><Icon name="split"/></button>
      <button title="纯净模式 (Ctrl+Shift+D)" onClick={p.focus}><Icon name="expand"/></button>
      <button className="primary" title="保存两栏 (Ctrl+S)" disabled={p.busy} onClick={p.save}><Icon name="save"/> 保存</button>
      <button title="导出为 Word" disabled={p.busy} onClick={p.word}><Icon name="word"/> Word</button>
      <button title="导出为 PDF" disabled={p.busy} onClick={p.pdf}><Icon name="print"/> PDF</button>
      <details className="more-menu" onClick={event=>{if((event.target as HTMLElement).closest("button"))event.currentTarget.open=false;}}>
        <summary aria-label="更多笔记操作">更多</summary><div>
          <button className="compact-export" onClick={p.word}>导出 Word</button><button className="compact-export" onClick={p.pdf}>导出 PDF</button>
          <button onClick={p.source}>{p.sourceMode?"块编辑视图":"Markdown 源码"}</button><button onClick={p.history}>历史版本</button>
          <button onClick={p.pack}>导出笔记及附件包</button><button onClick={p.links}>检查附件链接</button>
          <button onClick={p.recovery}>恢复草稿{p.drafts?` (${p.drafts})`:""}</button><button onClick={p.settings}>阅读与外观设置</button>
        </div>
      </details>
    </div>}
  </div>;
}
