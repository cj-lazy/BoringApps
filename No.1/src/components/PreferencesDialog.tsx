import Modal from "./Modal";
import type { ReadingOptions } from "../utils/workspace";
export default function PreferencesDialog({reading,onReading,opacity,blur,onOpacity,onBlur,onImage,onClear,hasImage,onLibrary,onClose,autosaveSeconds,onAutosave,onManageLibrary,theme,onTheme}:{
  reading:ReadingOptions;onReading:(value:ReadingOptions)=>void;opacity:number;blur:number;onOpacity:(value:number)=>void;onBlur:(value:number)=>void;
  onImage:(file:File)=>void;onClear:()=>void;hasImage:boolean;onLibrary:()=>void;onClose:()=>void;
  autosaveSeconds:number;onAutosave:(value:number)=>void;onManageLibrary:()=>void;
  theme:"light"|"dark"|"system";onTheme:(value:"light"|"dark"|"system")=>void;
}) {
  return <Modal title="阅读与外观设置" onClose={onClose}>
    <label className="property-field">主题<select aria-label="界面主题" value={theme} onChange={e=>onTheme(e.target.value as typeof theme)}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
    <label className="property-field">自动保存<select aria-label="自动保存间隔" value={autosaveSeconds} onChange={e=>onAutosave(Number(e.target.value))}><option value={0}>仅保护草稿，手动保存</option><option value={5}>停止输入 5 秒后</option><option value={15}>停止输入 15 秒后</option><option value={30}>停止输入 30 秒后</option><option value={60}>停止输入 60 秒后</option></select></label>
    <label className="setting-row">正文字号 <output>{reading.fontSize}px</output><input aria-label="正文字号" type="range" min="12" max="24" value={reading.fontSize} onChange={e=>onReading({...reading,fontSize:Number(e.target.value)})}/></label>
    <label className="setting-row">正文行距 <output>{reading.lineHeight.toFixed(1)}</output><input aria-label="正文行距" type="range" min="1.3" max="2.4" step=".1" value={reading.lineHeight} onChange={e=>onReading({...reading,lineHeight:Number(e.target.value)})}/></label>
    <label className="setting-row">正文最大宽度 <output>{reading.width}px</output><input aria-label="正文最大宽度" type="range" min="520" max="1400" step="20" value={reading.width} onChange={e=>onReading({...reading,width:Number(e.target.value)})}/></label>
    <label className="setting-row">白纸浓度 <output>{Math.round(opacity*100)}%</output><input aria-label="白纸浓度" type="range" min=".05" max="1" step=".05" value={opacity} onChange={e=>onOpacity(Number(e.target.value))}/></label>
    <label className="setting-row">背景模糊 <output>{blur}px</output><input aria-label="背景模糊" type="range" min="0" max="20" value={blur} onChange={e=>onBlur(Number(e.target.value))}/></label>
    <div className="option-row"><label className="file-picker">选择背景图<input type="file" accept="image/*" onChange={e=>{if(e.target.files?.[0])onImage(e.target.files[0]);}}/></label>{hasImage&&<button onClick={onClear}>清除背景</button>}</div>
    <p className="muted">阅读设置、收藏和上次打开的笔记会随 data 文件夹一起保存。</p>
    <footer><button onClick={()=>{onClose();onManageLibrary();}}>笔记库与备份</button><button onClick={()=>{onClose();onLibrary();}}>检查附件链接</button><button className="primary" onClick={onClose}>完成</button></footer>
  </Modal>;
}
