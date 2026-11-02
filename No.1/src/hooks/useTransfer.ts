import {useRef,useState} from "react";
import {Channel,invoke} from "@tauri-apps/api/core";
import type {TransferProgress} from "../services/transfers";
export interface TransferState extends TransferProgress{title:string;cancelling:boolean}
export function useTransfer(){
  const [state,setState]=useState<TransferState|null>(null),active=useRef<{id:string;controller:AbortController}|null>(null);
  const run=async<T,>(title:string,operation:(context:{id:string;signal:AbortSignal;onProgress:(p:TransferProgress)=>void;channel:Channel<TransferProgress>})=>Promise<T>):Promise<T>=>{
    if(active.current)throw new Error("请等待当前传输完成，或先取消它。");
    const id=crypto.randomUUID(),controller=new AbortController();active.current={id,controller};setState({title,completed:0,total:0,label:"准备中…",cancelling:false});
    const onProgress=(p:TransferProgress)=>setState(old=>old?{...old,...p}:old),channel=new Channel<TransferProgress>();channel.onmessage=onProgress;
    try{return await operation({id,signal:controller.signal,onProgress,channel});}finally{active.current=null;setState(null);}
  };
  const cancel=()=>{if(!active.current)return;active.current.controller.abort(new DOMException("操作已取消","AbortError"));void invoke("cancel_job",{id:active.current.id});setState(old=>old?{...old,cancelling:true,label:"正在停止，请稍候…"}:null);};
  return{state,run,cancel};
}
