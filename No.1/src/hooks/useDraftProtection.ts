import { useEffect, useRef } from "react";
type Pane="left"|"right";
export function useDraftProtection(write:(pane:Pane,path:string)=>Promise<void>) {
  const writer=useRef(write);writer.current=write;
  const timers=useRef<Partial<Record<Pane,ReturnType<typeof setTimeout>>>>({});
  const cancel=(pane:Pane)=>{clearTimeout(timers.current[pane]);delete timers.current[pane];};
  useEffect(()=>()=>{clearTimeout(timers.current.left);clearTimeout(timers.current.right);},[]);
  return {cancel,schedule:(pane:Pane,path:string)=>{cancel(pane);timers.current[pane]=setTimeout(()=>{delete timers.current[pane];void writer.current(pane,path);},700);}};
}
