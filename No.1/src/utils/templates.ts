export interface NoteTemplate { id: string; name: string; kind: "note" | "snippet"; content: string; sourcePath: string; }
export const builtinTemplates: NoteTemplate[] = [
  {id: "builtin-paper", name: "论文精读", kind: "note", sourcePath: "", content: "---\ntype: 论文\nstatus: 未读\ntags: [论文]\ncreated: '{{date}}'\n---\n\n# {{title}}\n\n## 基本信息\n\n来源：\n\n## 研究问题\n\n## 方法与假设\n\n## 主要证据\n\n## 局限与疑问\n\n## 可以借鉴的地方\n"},
  {id: "builtin-experiment", name: "实验记录", kind: "note", sourcePath: "", content: "---\ntype: 实验\nstatus: 进行中\ntags: [实验]\ncreated: '{{date}}'\n---\n\n# {{title}}\n\n日期：{{date}}\n\n## 目的\n\n## 条件与参数\n\n| 参数 | 数值 |\n| --- | --- |\n| | |\n\n## 操作步骤\n\n1. \n\n## 结果\n\n## 结论与下一步\n"},
  {id: "builtin-meeting", name: "会议纪要", kind: "note", sourcePath: "", content: "---\ntype: 会议\ntags: [会议]\ncreated: '{{date}}'\n---\n\n# {{title}}\n\n时间：{{datetime}}\n\n## 参会人员\n\n## 讨论事项\n\n## 决定\n\n## 待办\n\n- [ ] \n"},
  {id: "builtin-week", name: "周报", kind: "note", sourcePath: "", content: "# {{title}}\n\n日期：{{date}}\n\n## 本周完成\n\n## 遇到的问题\n\n## 下周计划\n"},
  {id: "builtin-check", name: "检查清单", kind: "snippet", sourcePath: "", content: "## 检查清单\n\n- [ ] 检查输入\n- [ ] 核对结果\n- [ ] 保存资料\n"},
];
export function expandTemplate(content: string, title: string, now = new Date()) {
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  const values: Record<string, string> = { title, date, datetime: date + " " + now.toLocaleTimeString("zh-CN", {hour12: false}) };
  return content.replace(/\{\{(title|date|datetime)\}\}/g, (_, key) => values[key]);
}
