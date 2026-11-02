import Icon from "./Icon";
import {commandDefinitions,bindingFor,type CommandId,type CommandPreferences} from "../utils/commands";
interface Props {
  commands:CommandPreferences;runCommand:(id:CommandId)=>void;commandEnabled:(id:CommandId)=>boolean;
  hasFile:boolean;busy:boolean;dirty:boolean;readMode:boolean;splitMode:boolean;sidebarOpen:boolean;tocOpen:boolean;sourceMode:boolean;
  wordCount:number;saveTime:string;draftTime:string;status:string;drafts:number;
  sidebar:()=>void;toc:()=>void;search:()=>void;undo:()=>void;redo:()=>void;read:()=>void;split:()=>void;focus:()=>void;save:()=>void;
  word:()=>void;pdf:()=>void;source:()=>void;history:()=>void;pack:()=>void;links:()=>void;recovery:()=>void;settings:()=>void;
  quick:()=>void;properties:()=>void;relations:()=>void;templates:()=>void;collections:()=>void;insertLink:()=>void;back:()=>void;forward:()=>void;canBack:boolean;canForward:boolean;
  importFiles:()=>void;attachments:()=>void;
}
export default function Toolbar(p:Props) {
  return <div className="no-print app-toolbar toolbar">
    <div className="toolbar-navigation">
      <button title="切换侧边栏" aria-label="切换侧边栏" onClick={p.sidebar}><Icon name={p.sidebarOpen?"left":"right"}/></button>
      <button title={"后退 ("+bindingFor("back",p.commands)+")"} aria-label="后退" disabled={p.busy||!p.canBack} onClick={p.back}><Icon name="left"/></button>
      <button title={"前进 ("+bindingFor("forward",p.commands)+")"} aria-label="前进" disabled={p.busy||!p.canForward} onClick={p.forward}><Icon name="right"/></button>
      <button title={"快速打开与搜索 ("+bindingFor("quick",p.commands)+")"} onClick={p.quick}><Icon name="search"/> 快速打开</button>
      {p.hasFile&&<button title={p.tocOpen?"收起大纲":"展开大纲"} className={p.tocOpen?"active":""} onClick={p.toc}><Icon name="book"/> 大纲</button>}
      <button title={"全局搜索替换 ("+bindingFor("search",p.commands)+")"} onClick={p.search}><Icon name="search"/> 搜索替换</button>
      <button title={"命令面板 ("+bindingFor("palette",p.commands)+")"} aria-label="命令面板" onClick={()=>p.runCommand("palette")}>命令</button>
    </div>
    <div className="toolbar-info muted">{p.hasFile?<><span>{p.wordCount} 字</span><span>{p.draftTime?"草稿已保护 "+p.draftTime:p.saveTime?"已保存 "+p.saveTime:""}</span></>:"选择或新建笔记开始编辑"}</div>
    {p.hasFile&&<div className="toolbar-actions">
      <span className={p.dirty?"dirty-status":""}>{["就绪","已加载","已保存"].includes(p.status)?"":p.status}</span>
      <button disabled={p.busy||p.sourceMode||p.readMode} title="撤销 (Ctrl+Z)" onClick={p.undo}><Icon name="undo"/></button>
      <button disabled={p.busy||p.sourceMode||p.readMode} title="重做 (Ctrl+Shift+Z)" onClick={p.redo}><Icon name="redo"/></button>
      <button title={p.readMode?"编辑模式":"阅读模式"} className={p.readMode?"active":""} onClick={p.read}><Icon name={p.readMode?"edit":"book"}/></button>
      <button title={p.splitMode?"退出双栏编辑":"双栏编辑"} className={p.splitMode?"active":""} onClick={p.split}><Icon name="split"/></button>
      <button title={"纯净模式 ("+bindingFor("focus",p.commands)+")"} onClick={p.focus}><Icon name="expand"/></button>
      <button className="primary" title={"保存两栏 ("+bindingFor("save",p.commands)+")"} disabled={p.busy} onClick={p.save}><Icon name="save"/> 保存</button>
      {p.commands.toolbar.map(id=><button key={id} title={id==="word"?"导出为 Word":id==="pdf"?"导出为 PDF":commandDefinitions.find(c=>c[0]===id)![1]} disabled={!p.commandEnabled(id)} onClick={()=>p.runCommand(id)}>{id==="word"?<><Icon name="word"/> Word</>:id==="pdf"?<><Icon name="print"/> PDF</>:commandDefinitions.find(c=>c[0]===id)![1]}</button>)}
      <details className="more-menu" onMouseDown={event=>{if(document.activeElement instanceof HTMLElement&&document.activeElement.isContentEditable)event.preventDefault();}} onClick={event=>{if((event.target as HTMLElement).closest("button"))event.currentTarget.open=false;}}>
        <summary aria-label="更多笔记操作">更多</summary><div>
          <button className={p.commands.toolbar.includes("word")?"compact-export":""} onClick={p.word}>导出 Word</button><button className={p.commands.toolbar.includes("pdf")?"compact-export":""} onClick={p.pdf}>导出 PDF</button>
          <button onClick={()=>p.runCommand("wordLayout")}>Word 排版模板</button><button onClick={()=>p.runCommand("tasks")}>任务汇总</button><button disabled={!p.commandEnabled("reference")} onClick={()=>p.runCommand("reference")}>插入段落引用</button><button onClick={()=>p.runCommand("settings")}>快捷键与工具栏</button>
          <button onClick={p.source}>{p.sourceMode?"块编辑视图":"Markdown 源码"}</button><button onClick={p.history}>历史版本</button>
          <button onClick={p.properties}>笔记属性与标签</button><button onClick={p.relations}>笔记关联</button><button disabled={p.readMode} onClick={p.insertLink}>插入笔记链接</button>
          <button onClick={p.collections}>智能集合</button><button onClick={p.templates}>模板与内容片段</button>
          <button disabled={p.readMode||p.sourceMode||p.busy} onClick={p.importFiles}>批量导入附件</button><button onClick={p.attachments}>附件管理</button>
          <button onClick={p.pack}>导出笔记及附件包</button><button onClick={p.links}>检查附件链接</button>
          <button onClick={p.recovery}>恢复草稿{p.drafts?` (${p.drafts})`:""}</button><button onClick={p.settings}>阅读与外观设置</button>
        </div>
      </details>
    </div>}
  </div>;
}
