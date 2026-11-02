export interface TreeNode {name:string;path:string;is_dir:boolean;children:TreeNode[]}
export function filterTreeNodes<T extends TreeNode>(nodes:T[],term:string):T[]{
  if(!term)return nodes;const query=term.toLowerCase();
  return nodes.flatMap(node=>{if(node.name.toLowerCase().includes(query))return[node];if(node.is_dir){const children=filterTreeNodes(node.children,term);if(children.length)return[{...node,children} as T];}return[];});
}
export function flattenTree<T extends TreeNode>(nodes:T[],expanded:Set<string>,search=false,depth=0):{node:T;depth:number}[]{
  const result:{node:T;depth:number}[]=[];
  for(const node of nodes){result.push({node,depth});if(node.is_dir&&(search||expanded.has(node.path)))result.push(...flattenTree(node.children as T[],expanded,search,depth+1));}
  return result;
}
export function visibleRange(count:number,scroll:number,height:number,rowHeight=32,overscan=6){
  const start=Math.max(0,Math.floor(scroll/rowHeight)-overscan),end=Math.min(count,Math.ceil((scroll+height)/rowHeight)+overscan);
  return{start,end};
}
