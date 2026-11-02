export const commandDefinitions = [
  ["palette","命令面板","Ctrl+Shift+P"],["save","保存两栏","Ctrl+S"],["quick","快速打开","Ctrl+P"],
  ["capture","快速记录","Ctrl+Shift+N"],["daily","打开今日日记","Ctrl+Alt+D"],["search","全局搜索替换","Ctrl+Shift+F"],
  ["find","当前笔记查找","Ctrl+F"],["sidebar","筛选侧边栏","Ctrl+K"],["focus","纯净模式","Ctrl+Shift+D"],
  ["back","后退","Alt+ArrowLeft"],["forward","前进","Alt+ArrowRight"],["tasks","任务汇总","Ctrl+Shift+T"],
  ["reference","插入段落引用",""],["word","导出 Word",""],["wordLayout","Word 排版模板",""],["pdf","导出 PDF",""],
  ["source","切换 Markdown 源码",""],["templates","模板与内容片段",""],["properties","笔记属性与标签",""],
  ["checklist","插入待办事项",""],["quote","插入引用段落",""],["footnote","插入脚注",""],["math","插入公式",""],
  ["code","插入代码",""],["settings","快捷键与工具栏",""],
] as const;
export type CommandId = typeof commandDefinitions[number][0];
export interface CommandPreferences { bindings:Partial<Record<CommandId,string>>; toolbar:CommandId[]; }
export function parseCommandPreferences(value:any):CommandPreferences {
  const bindings:CommandPreferences["bindings"]={};
  for(const [id] of commandDefinitions) if(typeof value?.bindings?.[id]==="string"&&(value.bindings[id]===""||validChord(value.bindings[id])))bindings[id]=value.bindings[id];
  const ids=new Set(commandDefinitions.map(c=>c[0]));
  return {bindings,toolbar:Array.isArray(value?.toolbar)?[...new Set(value.toolbar.filter((id:any)=>ids.has(id)))].slice(0,8) as CommandId[]:["word","pdf"]};
}
export const bindingFor=(id:CommandId,p:CommandPreferences)=>p.bindings[id]??commandDefinitions.find(c=>c[0]===id)![2];
export const commandForChord=(chord:string,p:CommandPreferences)=>chord?commandDefinitions.find(([id])=>bindingFor(id,p)===chord)?.[0]:undefined;
export function eventChord(e:Pick<KeyboardEvent,"key"|"ctrlKey"|"metaKey"|"shiftKey"|"altKey">){
  if(["Control","Meta","Shift","Alt"].includes(e.key))return "";
  const key=e.key.length===1?e.key.toUpperCase():e.key;
  return [e.ctrlKey||e.metaKey?"Ctrl":"",e.altKey?"Alt":"",e.shiftKey?"Shift":"",key].filter(Boolean).join("+");
}
export function validChord(chord:string){return /^(?:Ctrl\+(?:Alt\+)?(?:Shift\+)?|Alt\+(?:Shift\+)?)(?:[A-Z0-9]|F(?:[1-9]|1[0-2])|Arrow(?:Left|Right|Up|Down))$/.test(chord)&&!new Set(["Alt+F4","Ctrl+C","Ctrl+V","Ctrl+X","Ctrl+A","Ctrl+Z","Ctrl+Shift+Z","Ctrl+Y","Ctrl+Alt+Delete"]).has(chord);}
export function bindingError(id:CommandId,chord:string,p:CommandPreferences){
  if(chord&&!validChord(chord))return "请选择带 Ctrl 或 Alt 的组合键；系统关闭、复制粘贴和撤销键保留。";
  const other=commandDefinitions.find(c=>c[0]!==id&&bindingFor(c[0],p)===chord&&chord);return other?"与“"+other[1]+"”冲突，请先清除该快捷键。":"";
}
