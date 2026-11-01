import { loadExportImage, rasterBlobToPng, svgToPng } from "../utils/exportImage";
import { getMermaid } from "../utils/mermaid";
import { portableMarkdown } from "../utils/markdownAssets";
import { resolveAssetPath, resolveAssetUrl } from "../utils/assetLinks";
export async function notePackage(source: string, name: string): Promise<Uint8Array> {
  const [{default: JSZip}, plan] = await Promise.all([import("jszip"), portableMarkdown(source)]);
  if (plan.unresolved.length) throw new Error("部分旧附件链接无法识别，请先运行附件链接检查："+plan.unresolved.join("；"));
  const zip=new JSZip();zip.file(name.replace(/[\\/]/g,"_")+".md",plan.source);
  for(const path of plan.assets){
    const response=await fetch(resolveAssetPath(path),{signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error("附件读取失败，未生成不完整资料包："+path);
    zip.file(path,await response.arrayBuffer());
  }
  zip.file("使用说明.txt","将资料包完整解压。Markdown 与 assets 目录应保留在同一位置。远程网络链接保持原样，需要联网访问。\n");
  return zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
}
export async function wordBytes(snapshot: any[], notePath: string) {
    const dataUrlBytes = (url: string) => {
      const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(url);
      if (!match) return null;
      const raw = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
      return { mime: match[1] || "application/octet-stream", data: Uint8Array.from(raw, character => character.charCodeAt(0)) };
    };
    const toImage = async (url: string) => {
      url=resolveAssetUrl(url);
      const dimensions = await loadExportImage(url);
      const embedded = dataUrlBytes(url);
      let mime = embedded?.mime || "";
      let data = embedded?.data;
      if (!data) {
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error("无法读取导出图片");
        const blob = await response.blob();
        mime = blob.type;
        data = new Uint8Array(await blob.arrayBuffer());
      }
      let type: "png" | "jpg" | "gif" | "bmp" = mime === "image/jpeg" ? "jpg"
        : mime === "image/gif" ? "gif" : mime === "image/bmp" ? "bmp" : "png";
      if (!/image\/(?:png|jpe?g|gif|bmp)/i.test(mime)) {
        const blob = new Blob([data], { type: mime });
        const converted = await rasterBlobToPng(blob);
        data = dataUrlBytes(converted)?.data;
        if (!data) throw new Error("无法转换导出图片");
        type = "png";
      }
      return { data, type, width: dimensions.naturalWidth || 600, height: dimensions.naturalHeight || 400 };
    };
    const { exportWord } = await import("../utils/wordExport");
    const baseName = notePath.split("/").pop()?.replace(/\.md$/i, "") || "笔记";
    const bytes = await exportWord(snapshot, {
      title: baseName,
      image: toImage,
      diagram: async code => {
        const mermaid = await getMermaid();
        const { svg } = await mermaid.render(`word-${crypto.randomUUID()}`, code);
        return toImage(await svgToPng(svg));
      },
    });
  return { bytes, baseName };
}
