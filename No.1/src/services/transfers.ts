import {invoke} from "@tauri-apps/api/core";
export interface TransferProgress{completed:number;total:number;label:string}
export interface ImportedAsset{url:string;reused:boolean;bytes:number}
export async function uploadAsset(file:File,signal:AbortSignal,onProgress:(value:TransferProgress)=>void):Promise<ImportedAsset>{
  const id=await invoke<string>("begin_asset_upload",{name:file.name,size:file.size});let finished=false;
  try{
    for(let offset=0;offset<file.size;offset+=262144){signal.throwIfAborted();const payload=Array.from(new Uint8Array(await file.slice(offset,offset+262144).arrayBuffer()));signal.throwIfAborted();await invoke("append_asset_upload",{id,offset,payload});onProgress({completed:Math.min(file.size,offset+payload.length),total:file.size,label:file.name});}
    signal.throwIfAborted();const result=await invoke<ImportedAsset>("finish_asset_upload",{id});finished=true;return result;
  }finally{if(!finished)await invoke("cancel_asset_upload",{id}).catch(()=>{});}
}
