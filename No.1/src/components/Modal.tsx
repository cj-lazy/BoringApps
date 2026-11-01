import { useEffect, useRef, type ReactNode } from "react";
export default function Modal({ title, onClose, children, wide = false, busy = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; busy?: boolean }) {
  const host = useRef<HTMLElement>(null); const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const input=host.current?.querySelector<HTMLElement>('input:not([type="checkbox"]):not([type="range"]), textarea');
    (input||host.current)?.focus();
    return () => before?.focus();
  }, []);
  return <div className="modal-backdrop no-print" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}>
    <section ref={host} className={"app-modal"+(wide?" wide":"")} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
      onKeyDown={event=>{
        event.stopPropagation();
        if(event.key==="Escape"&&!busy){event.preventDefault();close.current();}
        if(event.key==="Tab"){
          const items=[...host.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length);
          const first=items[0],last=items[items.length-1];
          if(!first){event.preventDefault();return;}
          if(event.shiftKey&&(document.activeElement===first||document.activeElement===host.current)){event.preventDefault();last?.focus();}
          else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===host.current)){event.preventDefault();first.focus();}
        }
      }}>
      <header><h2>{title}</h2><button disabled={busy} onClick={onClose} aria-label={"关闭"+title}>关闭</button></header>
      {children}
    </section>
  </div>;
}
