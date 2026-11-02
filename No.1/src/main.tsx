import React,{lazy,Suspense} from "react";
import ReactDOM from "react-dom/client";
const App=lazy(()=>import("./App"));
const QuickCapture=lazy(()=>import("./components/QuickCapture"));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Suspense fallback={<div role="status">正在打开…</div>}>{new URLSearchParams(location.search).has("capture")?<QuickCapture/>:<App/>}</Suspense>
  </React.StrictMode>,
);
