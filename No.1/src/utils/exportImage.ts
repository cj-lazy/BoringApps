// Bound network/image waits so a broken attachment cannot hang an export.
export function loadExportImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const done = (error?: Error) => {
      clearTimeout(timer); image.onload = null; image.onerror = null;
      if (error) { image.src = ""; reject(error); } else resolve(image);
    };
    const timer = setTimeout(() => done(new Error("图片读取超时")), 15000);
    image.onload = () => done();
    image.onerror = () => done(new Error("图片无法读取"));
    image.src = url;
  });
}

export async function svgToPng(svg: string): Promise<string> {
  const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  const viewBox = root.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
  const width = Math.max(1, viewBox?.[2] || Number(root.getAttribute("width")) || 600);
  const height = Math.max(1, viewBox?.[3] || Number(root.getAttribute("height")) || 400);
  const scale = Math.min(2, 8192 / width, 8192 / height);
  root.setAttribute("width", String(width)); root.setAttribute("height", String(height));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(root)], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = await loadExportImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建图表导出画布");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally { URL.revokeObjectURL(url); }
}

export async function rasterBlobToPng(blob: Blob): Promise<string> {
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadExportImage(url);
    const width = Math.max(1, image.naturalWidth), height = Math.max(1, image.naturalHeight);
    const scale = Math.min(2, 8192 / width, 8192 / height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建图片导出画布");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally { URL.revokeObjectURL(url); }
}
