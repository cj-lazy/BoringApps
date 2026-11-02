import type {TransferState} from "../hooks/useTransfer";
export default function TransferPanel({state,onCancel}:{state:TransferState;onCancel:()=>void}){
  return <aside className="transfer-panel no-print" aria-label="文件传输进度"><strong>{state.title}</strong><small>{state.label}</small><progress aria-label="文件传输完成进度" max={state.total||1} value={state.total?state.completed:undefined}/><div><small>{state.total?Math.min(100,Math.round(state.completed/state.total*100))+"%":"正在准备…"}</small><button disabled={state.cancelling} onClick={onCancel}>{state.cancelling?"正在取消…":"取消"}</button></div></aside>;
}
