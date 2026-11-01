// Markdown stores library-relative paths. Only the view knows the current machine path.
let libraryRoot = "";
let fileUrl: (path: string) => string = path => path;
export function configureAssetLinks(root: string, convert: (path: string) => string) {
  libraryRoot = root.replace(/\\/g, "/").replace(/\/$/, "");
  fileUrl = convert;
}
export function portableAssetPath(url: string): string | null {
  let path = url;
  let decodedProtocol = false;
  if (/^(?:https?:\/\/asset\.localhost\/|asset:\/\/(?:localhost\/)?)/i.test(path)) {
    path = path.replace(/^(?:https?:\/\/asset\.localhost\/|asset:\/\/(?:localhost\/)?)/i, "");
    try { path = decodeURIComponent(path); decodedProtocol = true; } catch { return null; }
  } else if (/^[a-z][a-z\d+.-]*:/i.test(path) && !/^[a-z]:[\\/]/i.test(path)) return null;
  path = path.replace(/\\/g, "/");
  if (libraryRoot && path.toLowerCase().startsWith(libraryRoot.toLowerCase() + "/assets/")) path = path.slice(libraryRoot.length + 1);
  else if (!/^\.?\/?assets\//i.test(path)) {
    // Legacy builds stored the old executable's absolute data/assets path.
    const marker = /(?:^|\/)data\/(assets\/.*)$/i.exec(path);
    if (!marker) return null;
    path = marker[1];
  }
  path = path.replace(/^\.\//, "");
  if (!decodedProtocol && !/^[a-z]:[\\/]/i.test(url)) try { path = decodeURIComponent(path); } catch { /* literal percent in a filename */ }
  const parts = path.split("/");
  if (parts[0].toLowerCase() !== "assets" || parts.length < 2 || parts.some(part => !part || part === "." || part === ".." || /[\x00-\x1f<>:"|?*]/.test(part))) return null;
  return "assets/" + parts.slice(1).join("/");
}
export function storedAssetUrl(url: string): string {
  const path = portableAssetPath(url);
  return path ? path.split("/").map(encodeURIComponent).join("/") : url;
}
export function resolveAssetUrl(url: string): string {
  const path = portableAssetPath(url);
  return path && libraryRoot ? resolveAssetPath(path) : url;
}
export function resolveAssetPath(decodedPath: string): string { return fileUrl(libraryRoot + "/" + decodedPath); }
export function resolveBlockAssets(blocks: any[]): any[] {
  for (const block of blocks) {
    if (typeof block.props?.url === "string") block.props.url = resolveAssetUrl(block.props.url);
    if (block.children?.length) resolveBlockAssets(block.children);
  }
  return blocks;
}
