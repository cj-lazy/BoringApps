type Name="file"|"folder"|"folderOpen"|"settings"|"left"|"right"|"book"|"search"|"save"|"word"|"print"|"trash"|"storage"|"star"|"more"|"split"|"expand"|"undo"|"redo"|"edit";
const paths:Record<Name,string>={
  file:"M14 3H5v18h14V8z M14 3v5h5 M8 12h8 M8 16h6",
  folder:"M3 7V4h7l2 3h9v13H3z",folderOpen:"M3 10V4h7l2 3h9v3 M3 10h19l-3 10H3z",
  settings:"M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  left:"M15 5l-7 7 7 7",right:"M9 5l7 7-7 7",book:"M12 5C9 3 5 3 3 4v16c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-6-1-9 1v16",
  search:"M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0 M15 15l6 6",save:"M3 3h15l3 3v15H3z M7 3v6h10V3 M7 21v-8h10v8",
  word:"M14 3H5v18h14V8z M14 3v5h5 M7 12l2 5 3-5 3 5 2-5",print:"M7 8V3h10v5 M7 17H3V8h18v9h-4 M7 13h10v8H7z M17 10h1",
  trash:"M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7",storage:"M5 3h14v18H5z M8 7h8 M8 11h8 M8 17h1 M15 17h1",
  star:"M12 3l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z",more:"M5 11h.01 M12 11h.01 M19 11h.01",
  split:"M3 4h18v16H3z M12 4v16",expand:"M3 9V3h6 M15 3h6v6 M21 15v6h-6 M9 21H3v-6",
  undo:"M9 4L3 10l6 6 M3 10h11a6 6 0 0 1 0 12",redo:"M15 4l6 6-6 6 M21 10H10a6 6 0 0 0 0 12",
  edit:"M4 16L16 4l4 4L8 20H4z M14 6l4 4",
};
export default function Icon({name,size=16}:{name:Name;size?:number}) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name==="more"?3:1.7} strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:"middle",flexShrink:0}}><path d={paths[name]}/></svg>;
}
