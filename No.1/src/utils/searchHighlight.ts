let stopHighlight: (() => void) | undefined;
export function clearSearchHighlight() {
  stopHighlight?.(); stopHighlight=undefined;
  document.querySelectorAll('[data-search-overlay]').forEach(el=>el.remove());
  (globalThis.CSS as any)?.highlights?.delete('note-search');
}
export function jumpToMatch(pane:'left'|'right',id:string,query:string) {
  clearSearchHighlight();
  const root=document.querySelector<HTMLElement>(`[data-editor-pane="${pane}"]`);if(!root)return;
  if(id.startsWith('source:')) {
    const textarea=root.querySelector<HTMLTextAreaElement>('.source-editor');if(!textarea)return;
    const at=Number(id.slice(7));textarea.setSelectionRange(at,at+query.length);
    textarea.scrollTop=Math.max(0,(textarea.value.slice(0,at).split('\n').length-4)*22);return;
  }
  const find=()=>[...root.querySelectorAll<HTMLElement>('[data-id]')].find(el=>el.dataset.id===id);
  const element=find();if(!element)return;
  // Never add classes to ProseMirror's managed DOM: its observer can interpret
  // that as an edit. The outline lives outside the editor and text uses CSS Highlights.
  const overlay=document.createElement('div');overlay.className='search-hit';overlay.dataset.searchOverlay='true';
  overlay.setAttribute('aria-hidden','true');overlay.setAttribute('aria-label',element.innerText);document.body.appendChild(overlay);
  element.scrollIntoView({behavior:'smooth',block:'center'});
  const update=()=>{
    const target=find();if(!target){overlay.style.display='none';return;}
    const rect=target.getBoundingClientRect(),clip=root.getBoundingClientRect();
    const left=Math.max(rect.left,clip.left+2),top=Math.max(rect.top,clip.top+2);
    const width=Math.min(rect.right,clip.right-2)-left,height=Math.min(rect.bottom,clip.bottom-2)-top;
    Object.assign(overlay.style,{position:'fixed',pointerEvents:'none',zIndex:'30',left:left+'px',top:top+'px',width:Math.max(0,width)+'px',height:Math.max(0,height)+'px',display:width>0&&height>0?'block':'none'});
    const ranges:Range[]=[];const walker=document.createTreeWalker(target,NodeFilter.SHOW_TEXT);const needle=query.toLowerCase();let node:Node|null;
    while(needle&&(node=walker.nextNode())&&ranges.length<500){
      if(node.parentElement?.closest('button,select,input,.no-print'))continue;
      const text=node.textContent?.toLowerCase()||'';let at=0;
      while((at=text.indexOf(needle,at))>=0&&ranges.length<500){const range=new Range();range.setStart(node,at);range.setEnd(node,Math.min(node.textContent?.length||0,at+query.length));ranges.push(range);at+=needle.length;}
    }
    const Highlight=(globalThis as any).Highlight;
    if(Highlight&&(globalThis.CSS as any)?.highlights)(globalThis.CSS as any).highlights.set('note-search',new Highlight(...ranges));
  };
  update();window.addEventListener('scroll',update,true);window.addEventListener('resize',update);
  const observer=new MutationObserver(update);observer.observe(root,{childList:true,subtree:true});
  stopHighlight=()=>{window.removeEventListener('scroll',update,true);window.removeEventListener('resize',update);observer.disconnect();overlay.remove();};
}
