export function parseTabularClipboard(text:string):string[][]|null{
  if(!text.includes("\t")||text.length>2_000_000)return null;
  const rows:string[][]=[],row:string[]=[];let field="",quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'&&(quoted||!field)){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(!quoted&&(c==='\t'||c==='\n'||c==='\r')){row.push(field);field="";if(c!=='\t'){rows.push([...row]);row.length=0;if(c==='\r'&&text[i+1]==='\n')i++;}}
    else field+=c;
  }
  if(quoted)return null;
  if(field||row.length){row.push(field);rows.push(row);}
  if(rows.length<2||rows.length>500||Math.max(...rows.map(r=>r.length))>50)return null;
  const width=Math.max(...rows.map(r=>r.length));if(width<2)return null;
  return rows.map(r=>Array.from({length:width},(_,i)=>r[i]||""));
}
export function foldedBlockIds(blocks:any[],collapsed:Set<string>):string[]{
  const hidden:string[]=[];let level:number|null=null;
  for(const block of blocks){const heading=block.type==="heading"?Number(block.props.level):null;
    if(level!==null&&heading!==null&&heading<=level)level=null;
    if(level!==null)hidden.push(block.id);
    else if(heading!==null&&collapsed.has(block.id))level=heading;
  }
  return hidden;
}
