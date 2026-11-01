let running = 0;
const waiting: (() => void)[] = [];
const idleWaiters: (() => void)[] = [];
export async function runPreview<T>(work: () => Promise<T>): Promise<T> {
  if (running >= 2) await new Promise<void>(resolve => waiting.push(resolve));
  else running++;
  try { return await work(); }
  finally { const next=waiting.shift(); if(next)next(); else running--; if(!running)idleWaiters.splice(0).forEach(resolve=>resolve()); }
}
export async function waitForPreviews() { if(running)await new Promise<void>(resolve=>idleWaiters.push(resolve)); }
export async function previewText(response: Response, limit = 65536) {
  if (!response.body) return (await response.text()).slice(0, limit);
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  let text = ""; let read = 0; let truncated = false;
  try {
    while (read < limit) {
      const { done, value } = await reader.read(); if (done) return text + decoder.decode();
      const remaining = limit - read;
      text += decoder.decode(value.subarray(0, remaining), { stream: true }); read += value.byteLength;
      if (value.byteLength >= remaining) { truncated = true; break; }
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  return text + decoder.decode() + (truncated ? "\n\n…预览已截断，请打开原文件查看全文。" : "");
}
